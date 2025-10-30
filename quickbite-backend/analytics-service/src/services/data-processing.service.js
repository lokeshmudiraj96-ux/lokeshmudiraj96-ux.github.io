const { pool, redis, mongodb } = require('../config/database');
const EventEmitter = require('events');
const { Transform, Writable } = require('stream');
const { Worker } = require('worker_threads');
const path = require('path');

class DataProcessingService extends EventEmitter {
  constructor() {
    super();
    this.batchSize = 1000;
    this.processingQueue = [];
    this.workers = new Map();
    this.maxWorkers = 4;
    this.processingStats = {
      recordsProcessed: 0,
      errorsEncountered: 0,
      lastProcessedAt: null,
      avgProcessingTime: 0
    };

    this.initializeWorkerPool();
  }

  // Worker Pool Management
  initializeWorkerPool() {
    console.log(`Initializing worker pool with ${this.maxWorkers} workers...`);
    
    for (let i = 0; i < this.maxWorkers; i++) {
      this.createWorker(`worker_${i}`);
    }
  }

  createWorker(workerId) {
    const workerScript = path.join(__dirname, '../workers/data-processor-worker.js');
    
    try {
      const worker = new Worker(workerScript, {
        workerData: { workerId }
      });

      worker.on('message', (message) => {
        this.handleWorkerMessage(workerId, message);
      });

      worker.on('error', (error) => {
        console.error(`Worker ${workerId} error:`, error);
        this.recreateWorker(workerId);
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`Worker ${workerId} stopped with exit code ${code}`);
          this.recreateWorker(workerId);
        }
      });

      this.workers.set(workerId, {
        worker,
        busy: false,
        tasksCompleted: 0,
        lastTaskTime: null
      });

      console.log(`Worker ${workerId} created successfully`);

    } catch (error) {
      console.error(`Failed to create worker ${workerId}:`, error);
    }
  }

  recreateWorker(workerId) {
    const workerData = this.workers.get(workerId);
    if (workerData) {
      workerData.worker.terminate();
      this.workers.delete(workerId);
    }
    
    setTimeout(() => {
      this.createWorker(workerId);
    }, 1000);
  }

  handleWorkerMessage(workerId, message) {
    const workerData = this.workers.get(workerId);
    if (!workerData) return;

    switch (message.type) {
      case 'task_completed':
        workerData.busy = false;
        workerData.tasksCompleted++;
        workerData.lastTaskTime = Date.now();
        this.processingStats.recordsProcessed += message.recordsProcessed || 0;
        this.emit('processing_update', {
          workerId,
          recordsProcessed: message.recordsProcessed,
          processingTime: message.processingTime
        });
        this.processNextTask();
        break;

      case 'task_error':
        workerData.busy = false;
        this.processingStats.errorsEncountered++;
        console.error(`Worker ${workerId} task error:`, message.error);
        this.processNextTask();
        break;

      case 'progress_update':
        this.emit('processing_progress', {
          workerId,
          progress: message.progress
        });
        break;
    }
  }

  // Batch Data Processing
  async processBulkAnalyticsData(dataSource, processingOptions = {}) {
    try {
      console.log(`Starting bulk analytics data processing for source: ${dataSource}`);
      
      const {
        batchSize = this.batchSize,
        processingType = 'aggregation',
        timeRange = '24h',
        outputFormat = 'database',
        filters = {}
      } = processingOptions;

      const startTime = Date.now();

      // Get data in batches
      const dataStream = await this.createDataStream(dataSource, {
        batchSize,
        timeRange,
        filters
      });

      // Process data in parallel using workers
      const processingResults = await this.processDataStream(dataStream, {
        processingType,
        outputFormat,
        batchSize
      });

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      console.log(`Bulk processing completed in ${processingTime}ms`);
      
      return {
        recordsProcessed: processingResults.totalRecords,
        processingTime,
        outputLocation: processingResults.outputLocation,
        summary: processingResults.summary
      };

    } catch (error) {
      console.error('Error in bulk analytics data processing:', error);
      throw error;
    }
  }

  async createDataStream(dataSource, options) {
    const { batchSize, timeRange, filters } = options;

    return new Promise((resolve, reject) => {
      let query;
      let params = [];

      switch (dataSource) {
        case 'analytics_events':
          query = this.buildAnalyticsEventsQuery(timeRange, filters);
          break;
        case 'user_behavior':
          query = this.buildUserBehaviorQuery(timeRange, filters);
          break;
        case 'restaurant_performance':
          query = this.buildRestaurantPerformanceQuery(timeRange, filters);
          break;
        case 'sales_data':
          query = this.buildSalesDataQuery(timeRange, filters);
          break;
        default:
          return reject(new Error(`Unknown data source: ${dataSource}`));
      }

      // Create PostgreSQL cursor for large datasets
      pool.connect((err, client, done) => {
        if (err) return reject(err);

        const cursorName = `cursor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        client.query(`DECLARE ${cursorName} CURSOR FOR ${query}`, params, (err) => {
          if (err) {
            done();
            return reject(err);
          }

          const dataStream = new Transform({
            objectMode: true,
            transform: async function(chunk, encoding, callback) {
              try {
                // Process chunk of data
                const processedChunk = await this.processDataChunk(chunk);
                this.push(processedChunk);
                callback();
              } catch (error) {
                callback(error);
              }
            }.bind(this)
          });

          // Function to fetch next batch
          const fetchBatch = () => {
            client.query(`FETCH ${batchSize} FROM ${cursorName}`, (err, result) => {
              if (err) {
                done();
                return dataStream.destroy(err);
              }

              if (result.rows.length === 0) {
                // No more data
                client.query(`CLOSE ${cursorName}`, () => {
                  done();
                  dataStream.end();
                });
                return;
              }

              // Write batch to stream
              dataStream.write(result.rows);
              
              // Fetch next batch
              setImmediate(fetchBatch);
            });
          };

          // Start fetching
          fetchBatch();

          resolve(dataStream);
        });
      });
    });
  }

  async processDataStream(dataStream, options) {
    return new Promise((resolve, reject) => {
      const { processingType, outputFormat, batchSize } = options;
      let totalRecords = 0;
      const results = [];

      const processingStream = new Writable({
        objectMode: true,
        write: async (chunk, encoding, callback) => {
          try {
            // Queue batch for worker processing
            await this.queueBatchForProcessing({
              data: chunk,
              processingType,
              outputFormat,
              batchId: `batch_${totalRecords}_${Date.now()}`
            });

            totalRecords += chunk.length;
            
            this.emit('stream_progress', {
              recordsProcessed: totalRecords,
              timestamp: new Date()
            });

            callback();
          } catch (error) {
            callback(error);
          }
        }
      });

      processingStream.on('finish', () => {
        // Wait for all queued tasks to complete
        this.waitForQueueCompletion().then(() => {
          resolve({
            totalRecords,
            outputLocation: this.getOutputLocation(outputFormat),
            summary: this.generateProcessingSummary()
          });
        }).catch(reject);
      });

      processingStream.on('error', reject);

      // Pipe data through processing stream
      dataStream.pipe(processingStream);
    });
  }

  async queueBatchForProcessing(batchTask) {
    return new Promise((resolve) => {
      batchTask.resolve = resolve;
      this.processingQueue.push(batchTask);
      this.processNextTask();
    });
  }

  processNextTask() {
    if (this.processingQueue.length === 0) return;

    // Find available worker
    const availableWorker = Array.from(this.workers.entries())
      .find(([_, workerData]) => !workerData.busy);

    if (!availableWorker) return; // No workers available

    const [workerId, workerData] = availableWorker;
    const task = this.processingQueue.shift();

    if (!task) return;

    workerData.busy = true;

    // Send task to worker
    workerData.worker.postMessage({
      type: 'process_batch',
      data: task
    });

    // Resolve the batch promise
    task.resolve();
  }

  async waitForQueueCompletion() {
    return new Promise((resolve) => {
      const checkCompletion = () => {
        const busyWorkers = Array.from(this.workers.values())
          .filter(workerData => workerData.busy);

        if (this.processingQueue.length === 0 && busyWorkers.length === 0) {
          resolve();
        } else {
          setTimeout(checkCompletion, 100);
        }
      };

      checkCompletion();
    });
  }

  // Data Aggregation Services
  async performRealTimeAggregation(aggregationType, parameters = {}) {
    try {
      console.log(`Performing real-time aggregation: ${aggregationType}`);

      const {
        timeWindow = '1h',
        groupBy = [],
        metrics = [],
        filters = {}
      } = parameters;

      let result;

      switch (aggregationType) {
        case 'order_metrics':
          result = await this.aggregateOrderMetrics(timeWindow, groupBy, metrics, filters);
          break;
        case 'revenue_metrics':
          result = await this.aggregateRevenueMetrics(timeWindow, groupBy, metrics, filters);
          break;
        case 'user_activity':
          result = await this.aggregateUserActivity(timeWindow, groupBy, metrics, filters);
          break;
        case 'restaurant_performance':
          result = await this.aggregateRestaurantPerformance(timeWindow, groupBy, metrics, filters);
          break;
        case 'delivery_analytics':
          result = await this.aggregateDeliveryAnalytics(timeWindow, groupBy, metrics, filters);
          break;
        default:
          throw new Error(`Unknown aggregation type: ${aggregationType}`);
      }

      // Cache aggregated results
      await this.cacheAggregationResults(aggregationType, parameters, result);

      return result;

    } catch (error) {
      console.error('Error performing real-time aggregation:', error);
      throw error;
    }
  }

  async aggregateOrderMetrics(timeWindow, groupBy, metrics, filters) {
    const timeCondition = this.getTimeWindowCondition(timeWindow);
    const groupByClause = this.buildGroupByClause(groupBy);
    const filterClause = this.buildFilterClause(filters);

    const query = `
      SELECT 
        ${groupByClause ? groupByClause + ',' : ''}
        COUNT(CASE WHEN event_type = 'order_placed' THEN 1 END) as total_orders,
        SUM(CASE WHEN event_type = 'order_placed' 
            THEN (event_data->>'total_amount')::numeric ELSE 0 END) as total_revenue,
        AVG(CASE WHEN event_type = 'order_placed' 
            THEN (event_data->>'total_amount')::numeric END) as avg_order_value,
        COUNT(DISTINCT user_id) as unique_customers,
        COUNT(DISTINCT restaurant_id) as active_restaurants,
        COUNT(CASE WHEN event_type = 'order_cancelled' THEN 1 END) as cancelled_orders
      FROM analytics_events
      WHERE 1=1
      ${timeCondition}
      ${filterClause}
      ${groupByClause ? 'GROUP BY ' + groupByClause : ''}
      ORDER BY ${groupByClause || 'total_orders DESC'}
    `;

    const result = await pool.query(query);
    return this.formatAggregationResults(result.rows, groupBy);
  }

  async aggregateRevenueMetrics(timeWindow, groupBy, metrics, filters) {
    const timeCondition = this.getTimeWindowCondition(timeWindow);
    const groupByClause = this.buildGroupByClause(groupBy);
    const filterClause = this.buildFilterClause(filters);

    const query = `
      WITH revenue_data AS (
        SELECT 
          ${groupByClause ? groupByClause + ',' : ''}
          DATE_TRUNC('hour', created_at) as hour,
          SUM((event_data->>'total_amount')::numeric) as hourly_revenue,
          COUNT(*) as hourly_orders
        FROM analytics_events
        WHERE event_type = 'order_placed'
        ${timeCondition}
        ${filterClause}
        GROUP BY ${groupByClause ? groupByClause + ',' : ''} DATE_TRUNC('hour', created_at)
      )
      SELECT 
        ${groupByClause ? groupByClause + ',' : ''}
        SUM(hourly_revenue) as total_revenue,
        AVG(hourly_revenue) as avg_hourly_revenue,
        MAX(hourly_revenue) as peak_hourly_revenue,
        MIN(hourly_revenue) as min_hourly_revenue,
        STDDEV(hourly_revenue) as revenue_volatility,
        COUNT(DISTINCT hour) as active_hours
      FROM revenue_data
      ${groupByClause ? 'GROUP BY ' + groupByClause : ''}
    `;

    const result = await pool.query(query);
    return this.formatAggregationResults(result.rows, groupBy);
  }

  // Data Export Services
  async exportAnalyticsData(exportConfig) {
    try {
      console.log('Starting analytics data export...');

      const {
        dataSource,
        format = 'json',
        timeRange = '24h',
        filters = {},
        includeMetadata = true,
        compression = false
      } = exportConfig;

      // Generate export data
      const exportData = await this.generateExportData(dataSource, {
        timeRange,
        filters,
        includeMetadata
      });

      // Format data according to specified format
      const formattedData = await this.formatExportData(exportData, format);

      // Compress if requested
      const finalData = compression ? 
        await this.compressData(formattedData) : formattedData;

      // Generate export metadata
      const exportMetadata = {
        exportId: `export_${Date.now()}`,
        dataSource,
        format,
        timeRange,
        recordCount: exportData.length,
        exportedAt: new Date(),
        fileSize: Buffer.byteLength(finalData, 'utf8'),
        compression
      };

      return {
        data: finalData,
        metadata: exportMetadata,
        downloadUrl: await this.generateDownloadUrl(exportMetadata.exportId, finalData)
      };

    } catch (error) {
      console.error('Error exporting analytics data:', error);
      throw error;
    }
  }

  // Data Quality & Monitoring
  async performDataQualityCheck(dataSource) {
    try {
      console.log(`Performing data quality check for: ${dataSource}`);

      const qualityReport = {
        dataSource,
        checkedAt: new Date(),
        issues: [],
        summary: {},
        score: 0
      };

      // Check for missing values
      const missingValuesCheck = await this.checkMissingValues(dataSource);
      qualityReport.issues.push(...missingValuesCheck);

      // Check for data consistency
      const consistencyCheck = await this.checkDataConsistency(dataSource);
      qualityReport.issues.push(...consistencyCheck);

      // Check for duplicates
      const duplicatesCheck = await this.checkDuplicates(dataSource);
      qualityReport.issues.push(...duplicatesCheck);

      // Check for outliers
      const outliersCheck = await this.checkOutliers(dataSource);
      qualityReport.issues.push(...outliersCheck);

      // Calculate quality score
      qualityReport.score = this.calculateDataQualityScore(qualityReport.issues);

      // Generate summary
      qualityReport.summary = this.generateQualitySummary(qualityReport.issues);

      // Store quality report
      await this.storeQualityReport(qualityReport);

      return qualityReport;

    } catch (error) {
      console.error('Error performing data quality check:', error);
      throw error;
    }
  }

  // Utility Methods
  buildAnalyticsEventsQuery(timeRange, filters) {
    let query = `
      SELECT * FROM analytics_events 
      WHERE 1=1
    `;

    // Add time range condition
    query += this.getTimeWindowCondition(timeRange);

    // Add filters
    query += this.buildFilterClause(filters);

    query += ' ORDER BY created_at DESC';

    return query;
  }

  getTimeWindowCondition(timeWindow) {
    const now = new Date();
    let startTime;

    switch (timeWindow) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    return ` AND created_at >= '${startTime.toISOString()}'`;
  }

  buildGroupByClause(groupBy) {
    if (!groupBy || groupBy.length === 0) return '';

    const validGroupByFields = {
      'hour': "DATE_TRUNC('hour', created_at)",
      'day': "DATE_TRUNC('day', created_at)", 
      'restaurant_id': 'restaurant_id',
      'user_id': 'user_id',
      'event_type': 'event_type'
    };

    const clauses = groupBy
      .filter(field => validGroupByFields[field])
      .map(field => validGroupByFields[field]);

    return clauses.join(', ');
  }

  buildFilterClause(filters) {
    if (!filters || Object.keys(filters).length === 0) return '';

    const conditions = [];

    if (filters.restaurant_id) {
      conditions.push(`restaurant_id = '${filters.restaurant_id}'`);
    }

    if (filters.user_id) {
      conditions.push(`user_id = '${filters.user_id}'`);
    }

    if (filters.event_type) {
      if (Array.isArray(filters.event_type)) {
        conditions.push(`event_type IN (${filters.event_type.map(t => `'${t}'`).join(', ')})`);
      } else {
        conditions.push(`event_type = '${filters.event_type}'`);
      }
    }

    return conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : '';
  }

  formatAggregationResults(rows, groupBy) {
    if (!groupBy || groupBy.length === 0) {
      return rows.length > 0 ? rows[0] : {};
    }

    return rows;
  }

  getOutputLocation(outputFormat) {
    switch (outputFormat) {
      case 'database':
        return 'PostgreSQL analytics tables';
      case 'redis':
        return 'Redis cache';
      case 'mongodb':
        return 'MongoDB analytics collection';
      case 'file':
        return 'Local file system';
      default:
        return 'Unknown output location';
    }
  }

  generateProcessingSummary() {
    return {
      totalRecordsProcessed: this.processingStats.recordsProcessed,
      errorsEncountered: this.processingStats.errorsEncountered,
      successRate: ((this.processingStats.recordsProcessed - this.processingStats.errorsEncountered) / 
                   Math.max(this.processingStats.recordsProcessed, 1)) * 100,
      avgProcessingTime: this.processingStats.avgProcessingTime,
      workersUsed: this.workers.size
    };
  }

  calculateDataQualityScore(issues) {
    const severityWeights = {
      'critical': 10,
      'high': 5,
      'medium': 3,
      'low': 1
    };

    const totalDeductions = issues.reduce((sum, issue) => {
      return sum + (severityWeights[issue.severity] || 1);
    }, 0);

    return Math.max(0, 100 - totalDeductions);
  }

  async processDataChunk(chunk) {
    // Transform and clean data chunk
    return chunk.map(record => {
      // Perform any necessary data transformations
      if (record.event_data && typeof record.event_data === 'string') {
        try {
          record.event_data = JSON.parse(record.event_data);
        } catch (e) {
          // Keep as string if parsing fails
        }
      }

      // Add processing timestamp
      record.processed_at = new Date();

      return record;
    });
  }
}

module.exports = DataProcessingService;