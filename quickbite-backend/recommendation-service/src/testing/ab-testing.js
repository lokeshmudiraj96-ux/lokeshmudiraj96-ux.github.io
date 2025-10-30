const { pool, redis } = require('../config/database');
const crypto = require('crypto');

class ABTestingFramework {
  constructor(options = {}) {
    this.config = {
      defaultTrafficSplit: options.defaultTrafficSplit || 0.5,
      minSampleSize: options.minSampleSize || 100,
      significanceLevel: options.significanceLevel || 0.05,
      testDuration: options.testDuration || 14, // days
      cooldownPeriod: options.cooldownPeriod || 3 // days
    };

    this.activeExperiments = new Map();
    this.cacheTimeout = options.cacheTimeout || 3600; // 1 hour
  }

  // Create new A/B test experiment
  async createExperiment(experimentConfig) {
    const {
      name,
      description,
      controlAlgorithm,
      treatmentAlgorithm,
      trafficSplit = this.config.defaultTrafficSplit,
      targetMetrics = ['ctr', 'conversion_rate', 'user_engagement'],
      segmentFilters = {},
      duration = this.config.testDuration
    } = experimentConfig;

    try {
      // Validate experiment configuration
      if (!name || !controlAlgorithm || !treatmentAlgorithm) {
        throw new Error('Missing required experiment parameters');
      }

      // Check for conflicting experiments
      const existingExperiment = await this.getActiveExperimentByName(name);
      if (existingExperiment) {
        throw new Error('Experiment with this name already exists');
      }

      const experimentId = this.generateExperimentId();
      const startDate = new Date();
      const endDate = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);

      // Create experiment record
      const experiment = {
        id: experimentId,
        name,
        description,
        controlAlgorithm,
        treatmentAlgorithm,
        trafficSplit,
        targetMetrics,
        segmentFilters,
        status: 'active',
        startDate,
        endDate,
        createdAt: new Date(),
        sampleSizes: { control: 0, treatment: 0 },
        metrics: { control: {}, treatment: {} },
        statisticalSignificance: null
      };

      // Save to database
      await pool.query(`
        INSERT INTO recommendation_experiments (
          experiment_id, name, description, control_algorithm, treatment_algorithm,
          traffic_split, target_metrics, segment_filters, status, start_date, 
          end_date, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        experimentId, name, description, controlAlgorithm, treatmentAlgorithm,
        trafficSplit, JSON.stringify(targetMetrics), JSON.stringify(segmentFilters),
        'active', startDate, endDate, new Date()
      ]);

      // Cache experiment
      await redis.setex(
        `experiment:${experimentId}`, 
        this.cacheTimeout, 
        JSON.stringify(experiment)
      );

      this.activeExperiments.set(experimentId, experiment);
      
      console.log(`Created A/B test experiment: ${name} (${experimentId})`);
      return experimentId;

    } catch (error) {
      console.error('Error creating experiment:', error);
      throw error;
    }
  }

  // Assign user to experiment variant
  async assignUserToExperiment(userId, experimentId) {
    try {
      // Get experiment configuration
      const experiment = await this.getExperiment(experimentId);
      if (!experiment || experiment.status !== 'active') {
        return null;
      }

      // Check if user is already assigned
      const existingAssignment = await this.getUserAssignment(userId, experimentId);
      if (existingAssignment) {
        return existingAssignment;
      }

      // Check if user meets segment criteria
      if (!await this.userMatchesSegment(userId, experiment.segmentFilters)) {
        return null;
      }

      // Determine variant using consistent hashing
      const variant = this.determineVariant(userId, experimentId, experiment.trafficSplit);
      
      if (!variant) {
        return null; // User not included in experiment
      }

      // Record assignment
      const assignment = {
        userId,
        experimentId,
        variant,
        assignedAt: new Date(),
        algorithm: variant === 'control' ? experiment.controlAlgorithm : experiment.treatmentAlgorithm
      };

      await pool.query(`
        INSERT INTO experiment_assignments (
          user_id, experiment_id, variant, assigned_at, algorithm
        ) VALUES ($1, $2, $3, $4, $5)
      `, [userId, experimentId, variant, assignment.assignedAt, assignment.algorithm]);

      // Update sample size
      await this.incrementSampleSize(experimentId, variant);

      // Cache assignment
      await redis.setex(
        `assignment:${userId}:${experimentId}`,
        this.cacheTimeout,
        JSON.stringify(assignment)
      );

      return assignment;

    } catch (error) {
      console.error('Error assigning user to experiment:', error);
      return null;
    }
  }

  // Get user's algorithm assignment for recommendations
  async getUserAlgorithm(userId, defaultAlgorithm = 'hybrid') {
    try {
      // Get all active experiments for user
      const activeExperiments = await this.getActiveExperiments();
      
      for (const experiment of activeExperiments) {
        const assignment = await this.assignUserToExperiment(userId, experiment.id);
        
        if (assignment) {
          return {
            algorithm: assignment.algorithm,
            experimentId: experiment.id,
            variant: assignment.variant,
            isExperiment: true
          };
        }
      }

      // No experiment assignment, use default
      return {
        algorithm: defaultAlgorithm,
        experimentId: null,
        variant: null,
        isExperiment: false
      };

    } catch (error) {
      console.error('Error getting user algorithm:', error);
      return {
        algorithm: defaultAlgorithm,
        experimentId: null,
        variant: null,
        isExperiment: false
      };
    }
  }

  // Track user interaction for experiment analysis
  async trackInteraction(userId, itemId, interactionType, experimentContext = null) {
    try {
      if (!experimentContext || !experimentContext.experimentId) {
        return; // No experiment context
      }

      const { experimentId, variant, algorithm } = experimentContext;

      // Record interaction for experiment analysis
      await pool.query(`
        INSERT INTO experiment_interactions (
          user_id, item_id, experiment_id, variant, algorithm, 
          interaction_type, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        userId, itemId, experimentId, variant, algorithm, 
        interactionType, new Date()
      ]);

      // Update real-time metrics
      await this.updateExperimentMetrics(experimentId, variant, interactionType);

    } catch (error) {
      console.error('Error tracking experiment interaction:', error);
    }
  }

  // Calculate experiment results and statistical significance
  async analyzeExperiment(experimentId) {
    try {
      const experiment = await this.getExperiment(experimentId);
      if (!experiment) {
        throw new Error('Experiment not found');
      }

      console.log(`Analyzing experiment: ${experiment.name}`);

      // Calculate metrics for both variants
      const [controlMetrics, treatmentMetrics] = await Promise.all([
        this.calculateVariantMetrics(experimentId, 'control'),
        this.calculateVariantMetrics(experimentId, 'treatment')
      ]);

      // Calculate statistical significance for each target metric
      const significanceResults = {};
      
      for (const metric of experiment.targetMetrics) {
        const significance = await this.calculateStatisticalSignificance(
          controlMetrics[metric],
          treatmentMetrics[metric],
          controlMetrics.sampleSize,
          treatmentMetrics.sampleSize
        );
        
        significanceResults[metric] = significance;
      }

      // Determine overall experiment result
      const overallResult = this.determineExperimentResult(significanceResults);

      // Update experiment with results
      const results = {
        control: controlMetrics,
        treatment: treatmentMetrics,
        significance: significanceResults,
        overallResult,
        analyzedAt: new Date()
      };

      await this.updateExperimentResults(experimentId, results);

      return results;

    } catch (error) {
      console.error('Error analyzing experiment:', error);
      throw error;
    }
  }

  // Calculate metrics for a specific variant
  async calculateVariantMetrics(experimentId, variant) {
    try {
      // Get sample size
      const sampleSizeQuery = `
        SELECT COUNT(DISTINCT user_id) as sample_size
        FROM experiment_assignments
        WHERE experiment_id = $1 AND variant = $2
      `;
      
      const sampleResult = await pool.query(sampleSizeQuery, [experimentId, variant]);
      const sampleSize = sampleResult.rows[0].sample_size;

      // Calculate interaction metrics
      const metricsQuery = `
        SELECT 
          COUNT(*) as total_interactions,
          COUNT(DISTINCT user_id) as active_users,
          COUNT(DISTINCT item_id) as unique_items,
          
          -- Click-through rate
          SUM(CASE WHEN interaction_type = 'click' THEN 1 ELSE 0 END) as clicks,
          
          -- Conversion rate (purchases)
          SUM(CASE WHEN interaction_type = 'purchase' THEN 1 ELSE 0 END) as conversions,
          
          -- Engagement metrics
          SUM(CASE WHEN interaction_type = 'view' THEN 1 ELSE 0 END) as views,
          SUM(CASE WHEN interaction_type = 'favorite' THEN 1 ELSE 0 END) as favorites,
          SUM(CASE WHEN interaction_type = 'share' THEN 1 ELSE 0 END) as shares,
          
          -- Average session metrics
          COUNT(*) / COUNT(DISTINCT user_id) as interactions_per_user,
          COUNT(DISTINCT item_id) / COUNT(DISTINCT user_id) as items_per_user
          
        FROM experiment_interactions
        WHERE experiment_id = $1 AND variant = $2
      `;

      const metricsResult = await pool.query(metricsQuery, [experimentId, variant]);
      const rawMetrics = metricsResult.rows[0];

      // Calculate derived metrics
      const recommendationsShown = await this.getRecommendationsShown(experimentId, variant);
      
      const metrics = {
        sampleSize,
        totalInteractions: parseInt(rawMetrics.total_interactions),
        activeUsers: parseInt(rawMetrics.active_users),
        uniqueItems: parseInt(rawMetrics.unique_items),
        
        // Rates
        ctr: recommendationsShown > 0 ? rawMetrics.clicks / recommendationsShown : 0,
        conversion_rate: rawMetrics.clicks > 0 ? rawMetrics.conversions / rawMetrics.clicks : 0,
        engagement_rate: sampleSize > 0 ? rawMetrics.active_users / sampleSize : 0,
        
        // Per-user metrics
        interactions_per_user: parseFloat(rawMetrics.interactions_per_user || 0),
        items_per_user: parseFloat(rawMetrics.items_per_user || 0),
        
        // Raw counts
        clicks: parseInt(rawMetrics.clicks),
        conversions: parseInt(rawMetrics.conversions),
        views: parseInt(rawMetrics.views),
        favorites: parseInt(rawMetrics.favorites),
        shares: parseInt(rawMetrics.shares),
        recommendationsShown
      };

      return metrics;

    } catch (error) {
      console.error('Error calculating variant metrics:', error);
      return {};
    }
  }

  // Calculate statistical significance using two-proportion z-test
  async calculateStatisticalSignificance(controlMetric, treatmentMetric, controlSize, treatmentSize) {
    try {
      if (!controlMetric || !treatmentMetric || controlSize < 30 || treatmentSize < 30) {
        return {
          isSignificant: false,
          pValue: null,
          confidenceInterval: null,
          reason: 'Insufficient sample size'
        };
      }

      // Two-proportion z-test
      const p1 = controlMetric.rate || controlMetric.value || 0;
      const p2 = treatmentMetric.rate || treatmentMetric.value || 0;
      const n1 = controlSize;
      const n2 = treatmentSize;

      // Pooled proportion
      const pooledP = (p1 * n1 + p2 * n2) / (n1 + n2);
      
      // Standard error
      const se = Math.sqrt(pooledP * (1 - pooledP) * (1/n1 + 1/n2));
      
      if (se === 0) {
        return {
          isSignificant: false,
          pValue: null,
          confidenceInterval: null,
          reason: 'No variation in data'
        };
      }

      // Z-score
      const z = Math.abs(p2 - p1) / se;
      
      // P-value (two-tailed test)
      const pValue = 2 * (1 - this.normalCDF(z));
      
      // Confidence interval for difference
      const diff = p2 - p1;
      const seDiff = Math.sqrt(p1*(1-p1)/n1 + p2*(1-p2)/n2);
      const margin = 1.96 * seDiff; // 95% confidence
      
      return {
        isSignificant: pValue < this.config.significanceLevel,
        pValue: pValue,
        zScore: z,
        effect: diff,
        confidenceInterval: {
          lower: diff - margin,
          upper: diff + margin
        },
        improvement: p1 > 0 ? (diff / p1) * 100 : null // % improvement
      };

    } catch (error) {
      console.error('Error calculating statistical significance:', error);
      return {
        isSignificant: false,
        pValue: null,
        confidenceInterval: null,
        reason: 'Calculation error'
      };
    }
  }

  // Determine overall experiment result
  determineExperimentResult(significanceResults) {
    const significantMetrics = Object.keys(significanceResults).filter(
      metric => significanceResults[metric].isSignificant
    );

    if (significantMetrics.length === 0) {
      return {
        decision: 'inconclusive',
        reason: 'No statistically significant differences found',
        recommendedAction: 'continue_control'
      };
    }

    // Check if treatment is better for majority of significant metrics
    const positiveImprovements = significantMetrics.filter(
      metric => significanceResults[metric].improvement > 0
    );

    if (positiveImprovements.length > significantMetrics.length / 2) {
      return {
        decision: 'treatment_wins',
        reason: `Treatment shows significant improvement in ${positiveImprovements.join(', ')}`,
        recommendedAction: 'adopt_treatment',
        significantMetrics: positiveImprovements
      };
    } else {
      return {
        decision: 'control_wins',
        reason: `Control performs better or treatment shows negative impact`,
        recommendedAction: 'keep_control',
        significantMetrics: significantMetrics
      };
    }
  }

  // Utility methods
  generateExperimentId() {
    return crypto.randomBytes(8).toString('hex');
  }

  determineVariant(userId, experimentId, trafficSplit) {
    // Use consistent hashing to assign users to variants
    const hash = crypto.createHash('md5')
      .update(`${userId}:${experimentId}`)
      .digest('hex');
    
    const hashValue = parseInt(hash.substring(0, 8), 16);
    const ratio = hashValue / 0xffffffff;

    if (ratio < trafficSplit) {
      return 'treatment';
    } else if (ratio < trafficSplit * 2) {
      return 'control';
    } else {
      return null; // User not included in experiment
    }
  }

  async userMatchesSegment(userId, segmentFilters) {
    if (!segmentFilters || Object.keys(segmentFilters).length === 0) {
      return true; // No filters, all users qualify
    }

    try {
      // Build dynamic query based on segment filters
      let query = 'SELECT 1 FROM user_preferences up WHERE up.user_id = $1';
      const params = [userId];
      let paramCount = 1;

      if (segmentFilters.minInteractions) {
        query += ` AND (
          SELECT COUNT(*) FROM user_interactions ui 
          WHERE ui.user_id = up.user_id
        ) >= $${++paramCount}`;
        params.push(segmentFilters.minInteractions);
      }

      if (segmentFilters.preferredCategories) {
        query += ` AND up.preferred_categories && $${++paramCount}`;
        params.push(segmentFilters.preferredCategories);
      }

      if (segmentFilters.registrationDaysAgo) {
        query += ` AND up.created_at <= CURRENT_TIMESTAMP - INTERVAL '${segmentFilters.registrationDaysAgo} days'`;
      }

      const result = await pool.query(query, params);
      return result.rows.length > 0;

    } catch (error) {
      console.error('Error checking user segment match:', error);
      return false;
    }
  }

  async getExperiment(experimentId) {
    try {
      // Check cache first
      const cached = await redis.get(`experiment:${experimentId}`);
      if (cached) {
        return JSON.parse(cached);
      }

      // Get from database
      const result = await pool.query(
        'SELECT * FROM recommendation_experiments WHERE experiment_id = $1',
        [experimentId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const experiment = {
        id: result.rows[0].experiment_id,
        name: result.rows[0].name,
        description: result.rows[0].description,
        controlAlgorithm: result.rows[0].control_algorithm,
        treatmentAlgorithm: result.rows[0].treatment_algorithm,
        trafficSplit: result.rows[0].traffic_split,
        targetMetrics: result.rows[0].target_metrics,
        segmentFilters: result.rows[0].segment_filters,
        status: result.rows[0].status,
        startDate: result.rows[0].start_date,
        endDate: result.rows[0].end_date,
        createdAt: result.rows[0].created_at
      };

      // Cache it
      await redis.setex(
        `experiment:${experimentId}`,
        this.cacheTimeout,
        JSON.stringify(experiment)
      );

      return experiment;

    } catch (error) {
      console.error('Error getting experiment:', error);
      return null;
    }
  }

  async getUserAssignment(userId, experimentId) {
    try {
      // Check cache first
      const cacheKey = `assignment:${userId}:${experimentId}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      // Get from database
      const result = await pool.query(
        'SELECT * FROM experiment_assignments WHERE user_id = $1 AND experiment_id = $2',
        [userId, experimentId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const assignment = {
        userId: result.rows[0].user_id,
        experimentId: result.rows[0].experiment_id,
        variant: result.rows[0].variant,
        assignedAt: result.rows[0].assigned_at,
        algorithm: result.rows[0].algorithm
      };

      // Cache it
      await redis.setex(cacheKey, this.cacheTimeout, JSON.stringify(assignment));

      return assignment;

    } catch (error) {
      console.error('Error getting user assignment:', error);
      return null;
    }
  }

  async getActiveExperiments() {
    try {
      const result = await pool.query(`
        SELECT experiment_id FROM recommendation_experiments 
        WHERE status = 'active' 
          AND start_date <= CURRENT_TIMESTAMP 
          AND end_date > CURRENT_TIMESTAMP
      `);

      const experiments = [];
      for (const row of result.rows) {
        const experiment = await this.getExperiment(row.experiment_id);
        if (experiment) {
          experiments.push(experiment);
        }
      }

      return experiments;

    } catch (error) {
      console.error('Error getting active experiments:', error);
      return [];
    }
  }

  async getActiveExperimentByName(name) {
    try {
      const result = await pool.query(
        'SELECT experiment_id FROM recommendation_experiments WHERE name = $1 AND status = $2',
        [name, 'active']
      );

      if (result.rows.length === 0) {
        return null;
      }

      return await this.getExperiment(result.rows[0].experiment_id);

    } catch (error) {
      console.error('Error getting experiment by name:', error);
      return null;
    }
  }

  async incrementSampleSize(experimentId, variant) {
    try {
      await redis.incr(`sample_size:${experimentId}:${variant}`);
    } catch (error) {
      console.error('Error incrementing sample size:', error);
    }
  }

  async updateExperimentMetrics(experimentId, variant, interactionType) {
    try {
      const key = `metrics:${experimentId}:${variant}:${interactionType}`;
      await redis.incr(key);
      await redis.expire(key, this.cacheTimeout * 24); // 24 hour expiry
    } catch (error) {
      console.error('Error updating experiment metrics:', error);
    }
  }

  async getRecommendationsShown(experimentId, variant) {
    try {
      const result = await redis.get(`metrics:${experimentId}:${variant}:recommendations_shown`);
      return parseInt(result) || 0;
    } catch (error) {
      console.error('Error getting recommendations shown:', error);
      return 0;
    }
  }

  async updateExperimentResults(experimentId, results) {
    try {
      await pool.query(`
        UPDATE recommendation_experiments 
        SET results = $1, analyzed_at = $2 
        WHERE experiment_id = $3
      `, [JSON.stringify(results), new Date(), experimentId]);

      // Invalidate cache
      await redis.del(`experiment:${experimentId}`);

    } catch (error) {
      console.error('Error updating experiment results:', error);
    }
  }

  // Normal CDF approximation for z-test
  normalCDF(z) {
    return 0.5 * (1 + this.erf(z / Math.sqrt(2)));
  }

  // Error function approximation
  erf(x) {
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  // Management methods
  async stopExperiment(experimentId) {
    try {
      await pool.query(
        'UPDATE recommendation_experiments SET status = $1 WHERE experiment_id = $2',
        ['stopped', experimentId]
      );

      await redis.del(`experiment:${experimentId}`);
      console.log(`Stopped experiment: ${experimentId}`);

    } catch (error) {
      console.error('Error stopping experiment:', error);
    }
  }

  async getExperimentSummary(experimentId) {
    try {
      const experiment = await this.getExperiment(experimentId);
      if (!experiment) {
        return null;
      }

      const [controlMetrics, treatmentMetrics] = await Promise.all([
        this.calculateVariantMetrics(experimentId, 'control'),
        this.calculateVariantMetrics(experimentId, 'treatment')
      ]);

      return {
        experiment,
        control: controlMetrics,
        treatment: treatmentMetrics,
        status: experiment.status
      };

    } catch (error) {
      console.error('Error getting experiment summary:', error);
      return null;
    }
  }
}

module.exports = ABTestingFramework;