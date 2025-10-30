const tf = require('@tensorflow/tfjs-node');
const { pool, redis } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const regression = require('ml-regression');
const statistics = require('simple-statistics');

class ForecastingEngine {
  constructor(options = {}) {
    this.modelConfig = {
      lookbackPeriod: options.lookbackPeriod || 30, // days
      forecastHorizon: options.forecastHorizon || 7, // days
      seasonalPeriod: options.seasonalPeriod || 7, // weekly seasonality
      validationSplit: options.validationSplit || 0.2,
      modelTypes: {
        LINEAR: 'linear_regression',
        ARIMA: 'arima',
        LSTM: 'lstm_neural_network',
        EXPONENTIAL: 'exponential_smoothing',
        SEASONAL: 'seasonal_decomposition'
      }
    };

    this.models = new Map();
    this.cache = new Map();
  }

  // Create and train forecasting model
  async createForecastingModel(config) {
    const {
      modelName,
      modelType,
      targetMetric,
      trainingDataQuery,
      parameters = {}
    } = config;

    try {
      console.log(`Creating forecasting model: ${modelName} (${modelType})`);

      // Get training data
      const trainingData = await this.getTrainingData(trainingDataQuery);
      
      if (trainingData.length < this.modelConfig.lookbackPeriod) {
        throw new Error('Insufficient training data');
      }

      // Prepare data for training
      const processedData = this.preprocessData(trainingData);

      // Create model based on type
      let model;
      let accuracyMetrics;

      switch (modelType) {
        case this.modelConfig.modelTypes.LINEAR:
          ({ model, accuracyMetrics } = await this.trainLinearRegression(processedData, parameters));
          break;
        case this.modelConfig.modelTypes.ARIMA:
          ({ model, accuracyMetrics } = await this.trainARIMA(processedData, parameters));
          break;
        case this.modelConfig.modelTypes.LSTM:
          ({ model, accuracyMetrics } = await this.trainLSTM(processedData, parameters));
          break;
        case this.modelConfig.modelTypes.EXPONENTIAL:
          ({ model, accuracyMetrics } = await this.trainExponentialSmoothing(processedData, parameters));
          break;
        case this.modelConfig.modelTypes.SEASONAL:
          ({ model, accuracyMetrics } = await this.trainSeasonalDecomposition(processedData, parameters));
          break;
        default:
          throw new Error(`Unsupported model type: ${modelType}`);
      }

      // Save model to database
      const modelId = await this.saveModelToDatabase({
        modelName,
        modelType,
        targetMetric,
        parameters,
        trainingDataStart: new Date(trainingData[0].date),
        trainingDataEnd: new Date(trainingData[trainingData.length - 1].date),
        accuracyMetrics
      });

      // Cache model
      this.models.set(modelId, {
        model,
        config: { modelName, modelType, targetMetric, parameters },
        accuracyMetrics
      });

      return { modelId, accuracyMetrics };

    } catch (error) {
      console.error('Error creating forecasting model:', error);
      throw error;
    }
  }

  // Linear regression forecasting
  async trainLinearRegression(data, parameters = {}) {
    try {
      const { features, targets } = this.prepareRegressionData(data);
      
      const regression = new regression.SLR(features, targets);
      
      // Calculate accuracy metrics
      const predictions = features.map(x => regression.predict(x));
      const accuracyMetrics = this.calculateAccuracyMetrics(targets, predictions);

      return {
        model: {
          type: 'linear_regression',
          slope: regression.slope,
          intercept: regression.intercept,
          r2: regression.coefficientOfDetermination(features, targets)
        },
        accuracyMetrics
      };

    } catch (error) {
      console.error('Error training linear regression:', error);
      throw error;
    }
  }

  // ARIMA time series forecasting
  async trainARIMA(data, parameters = {}) {
    try {
      const { p = 1, d = 1, q = 1 } = parameters;
      const values = data.map(d => d.value);

      // Simple ARIMA implementation (for production, use dedicated ARIMA library)
      const model = this.simpleARIMA(values, { p, d, q });
      
      // Calculate accuracy using last 20% as test set
      const testSize = Math.floor(values.length * 0.2);
      const trainData = values.slice(0, values.length - testSize);
      const testData = values.slice(values.length - testSize);
      
      const testPredictions = this.predictARIMA(model, trainData, testSize);
      const accuracyMetrics = this.calculateAccuracyMetrics(testData, testPredictions);

      return {
        model: {
          type: 'arima',
          parameters: { p, d, q },
          coefficients: model.coefficients,
          residuals: model.residuals
        },
        accuracyMetrics
      };

    } catch (error) {
      console.error('Error training ARIMA:', error);
      throw error;
    }
  }

  // LSTM Neural Network forecasting
  async trainLSTM(data, parameters = {}) {
    try {
      const {
        sequenceLength = 7,
        hiddenUnits = 50,
        epochs = 100,
        batchSize = 32,
        learningRate = 0.001
      } = parameters;

      const values = data.map(d => d.value);
      const { inputs, targets } = this.prepareLSTMData(values, sequenceLength);

      // Create LSTM model
      const model = tf.sequential({
        layers: [
          tf.layers.lstm({
            units: hiddenUnits,
            returnSequences: true,
            inputShape: [sequenceLength, 1]
          }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.lstm({ units: hiddenUnits }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.dense({ units: 1, activation: 'linear' })
        ]
      });

      model.compile({
        optimizer: tf.train.adam(learningRate),
        loss: 'meanSquaredError',
        metrics: ['mae']
      });

      // Train model
      const history = await model.fit(inputs, targets, {
        epochs,
        batchSize,
        validationSplit: this.modelConfig.validationSplit,
        verbose: 0
      });

      // Calculate accuracy metrics
      const predictions = await model.predict(inputs);
      const predictionValues = await predictions.data();
      const targetValues = await targets.data();
      
      const accuracyMetrics = this.calculateAccuracyMetrics(
        Array.from(targetValues),
        Array.from(predictionValues)
      );

      // Clean up tensors
      inputs.dispose();
      targets.dispose();
      predictions.dispose();

      return {
        model: {
          type: 'lstm',
          tensorflowModel: model,
          parameters: { sequenceLength, hiddenUnits, epochs, batchSize, learningRate },
          history: history.history
        },
        accuracyMetrics
      };

    } catch (error) {
      console.error('Error training LSTM:', error);
      throw error;
    }
  }

  // Exponential smoothing forecasting
  async trainExponentialSmoothing(data, parameters = {}) {
    try {
      const { alpha = 0.3, beta = 0.1, gamma = 0.05 } = parameters;
      const values = data.map(d => d.value);

      const model = this.tripleExponentialSmoothing(values, alpha, beta, gamma);
      
      // Calculate accuracy
      const predictions = model.fitted;
      const accuracyMetrics = this.calculateAccuracyMetrics(values, predictions);

      return {
        model: {
          type: 'exponential_smoothing',
          parameters: { alpha, beta, gamma },
          level: model.level,
          trend: model.trend,
          seasonal: model.seasonal
        },
        accuracyMetrics
      };

    } catch (error) {
      console.error('Error training exponential smoothing:', error);
      throw error;
    }
  }

  // Seasonal decomposition forecasting
  async trainSeasonalDecomposition(data, parameters = {}) {
    try {
      const { seasonalPeriod = 7 } = parameters;
      const values = data.map(d => d.value);

      const decomposition = this.seasonalDecompose(values, seasonalPeriod);
      
      // Fit trend using linear regression
      const trendData = decomposition.trend.filter(v => !isNaN(v));
      const trendIndices = trendData.map((_, i) => i);
      const trendRegression = new regression.SLR(trendIndices, trendData);

      const predictions = values.map((_, i) => {
        const trendValue = trendRegression.predict(i);
        const seasonalValue = decomposition.seasonal[i % seasonalPeriod] || 0;
        return trendValue + seasonalValue;
      });

      const accuracyMetrics = this.calculateAccuracyMetrics(values, predictions);

      return {
        model: {
          type: 'seasonal_decomposition',
          parameters: { seasonalPeriod },
          trend: {
            slope: trendRegression.slope,
            intercept: trendRegression.intercept
          },
          seasonal: decomposition.seasonal,
          residual: decomposition.residual
        },
        accuracyMetrics
      };

    } catch (error) {
      console.error('Error training seasonal decomposition:', error);
      throw error;
    }
  }

  // Generate forecasts
  async generateForecasts(modelId, forecastHorizon = null) {
    try {
      const horizon = forecastHorizon || this.modelConfig.forecastHorizon;
      
      // Get model from cache or database
      let modelData = this.models.get(modelId);
      if (!modelData) {
        modelData = await this.loadModelFromDatabase(modelId);
      }

      const { model, config } = modelData;
      const predictions = [];

      // Generate forecasts based on model type
      switch (model.type) {
        case 'linear_regression':
          predictions.push(...this.forecastLinearRegression(model, horizon));
          break;
        case 'arima':
          predictions.push(...this.forecastARIMA(model, horizon));
          break;
        case 'lstm':
          predictions.push(...await this.forecastLSTM(model, horizon));
          break;
        case 'exponential_smoothing':
          predictions.push(...this.forecastExponentialSmoothing(model, horizon));
          break;
        case 'seasonal_decomposition':
          predictions.push(...this.forecastSeasonalDecomposition(model, horizon));
          break;
        default:
          throw new Error(`Unsupported model type for forecasting: ${model.type}`);
      }

      // Save predictions to database
      await this.savePredictionsToDatabase(modelId, predictions, horizon);

      return predictions;

    } catch (error) {
      console.error('Error generating forecasts:', error);
      throw error;
    }
  }

  // Data preprocessing utilities
  preprocessData(data) {
    // Sort by date
    const sorted = data.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Handle missing values
    const filled = this.fillMissingValues(sorted);

    // Remove outliers
    const cleaned = this.removeOutliers(filled);

    // Normalize if needed
    return cleaned;
  }

  fillMissingValues(data) {
    const filled = [...data];
    
    for (let i = 1; i < filled.length - 1; i++) {
      if (filled[i].value === null || filled[i].value === undefined) {
        // Linear interpolation
        const prevValue = filled[i - 1].value;
        const nextValue = filled[i + 1].value;
        filled[i].value = (prevValue + nextValue) / 2;
      }
    }

    return filled;
  }

  removeOutliers(data, threshold = 2) {
    const values = data.map(d => d.value);
    const q1 = statistics.quantile(values, 0.25);
    const q3 = statistics.quantile(values, 0.75);
    const iqr = q3 - q1;
    const lowerBound = q1 - threshold * iqr;
    const upperBound = q3 + threshold * iqr;

    return data.filter(d => d.value >= lowerBound && d.value <= upperBound);
  }

  // LSTM data preparation
  prepareLSTMData(values, sequenceLength) {
    const inputs = [];
    const targets = [];

    for (let i = sequenceLength; i < values.length; i++) {
      inputs.push(values.slice(i - sequenceLength, i));
      targets.push(values[i]);
    }

    return {
      inputs: tf.tensor3d(inputs.map(seq => seq.map(val => [val]))),
      targets: tf.tensor2d(targets.map(val => [val]))
    };
  }

  // Regression data preparation
  prepareRegressionData(data) {
    const features = data.map((_, index) => index);
    const targets = data.map(d => d.value);
    return { features, targets };
  }

  // Simple ARIMA implementation
  simpleARIMA(values, { p, d, q }) {
    // Difference the series d times
    let differenced = [...values];
    for (let i = 0; i < d; i++) {
      differenced = differenced.slice(1).map((val, idx) => val - differenced[idx]);
    }

    // Fit AR model (simplified)
    const coefficients = [];
    for (let lag = 1; lag <= p; lag++) {
      const x = differenced.slice(0, -lag);
      const y = differenced.slice(lag);
      if (x.length > 0 && y.length > 0) {
        const correlation = statistics.sampleCorrelation(x, y);
        coefficients.push(correlation * 0.1); // Simplified coefficient
      }
    }

    return { coefficients, residuals: [] };
  }

  // Triple exponential smoothing (Holt-Winters)
  tripleExponentialSmoothing(values, alpha, beta, gamma) {
    const seasonalPeriod = this.modelConfig.seasonalPeriod;
    const level = [];
    const trend = [];
    const seasonal = new Array(seasonalPeriod).fill(0);
    const fitted = [];

    // Initialize
    level[0] = values[0];
    trend[0] = 0;

    // Initialize seasonal factors
    for (let i = 0; i < seasonalPeriod && i < values.length; i++) {
      seasonal[i] = values[i] / level[0];
    }

    // Calculate fitted values
    for (let i = 0; i < values.length; i++) {
      if (i === 0) {
        fitted[i] = level[0];
        continue;
      }

      const seasonalIdx = i % seasonalPeriod;
      
      // Update components
      const prevLevel = level[i - 1] || level[0];
      const prevTrend = trend[i - 1] || 0;
      const prevSeasonal = seasonal[seasonalIdx];

      level[i] = alpha * (values[i] / prevSeasonal) + (1 - alpha) * (prevLevel + prevTrend);
      trend[i] = beta * (level[i] - prevLevel) + (1 - beta) * prevTrend;
      seasonal[seasonalIdx] = gamma * (values[i] / level[i]) + (1 - gamma) * prevSeasonal;

      fitted[i] = (level[i] + trend[i]) * seasonal[seasonalIdx];
    }

    return { level, trend, seasonal, fitted };
  }

  // Seasonal decomposition
  seasonalDecompose(values, period) {
    const trend = [];
    const seasonal = new Array(period).fill(0);
    const residual = [];

    // Calculate trend using moving average
    const halfPeriod = Math.floor(period / 2);
    for (let i = 0; i < values.length; i++) {
      if (i < halfPeriod || i >= values.length - halfPeriod) {
        trend[i] = NaN;
      } else {
        const sum = values.slice(i - halfPeriod, i + halfPeriod + 1)
          .reduce((acc, val) => acc + val, 0);
        trend[i] = sum / period;
      }
    }

    // Calculate seasonal factors
    const seasonalSums = new Array(period).fill(0);
    const seasonalCounts = new Array(period).fill(0);

    for (let i = 0; i < values.length; i++) {
      if (!isNaN(trend[i])) {
        const seasonalIdx = i % period;
        seasonalSums[seasonalIdx] += values[i] - trend[i];
        seasonalCounts[seasonalIdx]++;
      }
    }

    for (let i = 0; i < period; i++) {
      seasonal[i] = seasonalCounts[i] > 0 ? seasonalSums[i] / seasonalCounts[i] : 0;
    }

    // Calculate residuals
    for (let i = 0; i < values.length; i++) {
      const seasonalIdx = i % period;
      if (!isNaN(trend[i])) {
        residual[i] = values[i] - trend[i] - seasonal[seasonalIdx];
      } else {
        residual[i] = NaN;
      }
    }

    return { trend, seasonal, residual };
  }

  // Accuracy metrics calculation
  calculateAccuracyMetrics(actual, predicted) {
    const n = actual.length;
    let sumSquaredError = 0;
    let sumAbsoluteError = 0;
    let sumActual = 0;
    let sumSquaredActual = 0;

    for (let i = 0; i < n; i++) {
      const error = actual[i] - predicted[i];
      sumSquaredError += error * error;
      sumAbsoluteError += Math.abs(error);
      sumActual += actual[i];
      sumSquaredActual += actual[i] * actual[i];
    }

    const mse = sumSquaredError / n;
    const rmse = Math.sqrt(mse);
    const mae = sumAbsoluteError / n;
    const meanActual = sumActual / n;
    const totalSumSquares = sumSquaredActual - n * meanActual * meanActual;
    const r2 = 1 - (sumSquaredError / totalSumSquares);

    // Calculate MAPE (Mean Absolute Percentage Error)
    let mape = 0;
    let mapeCount = 0;
    for (let i = 0; i < n; i++) {
      if (actual[i] !== 0) {
        mape += Math.abs((actual[i] - predicted[i]) / actual[i]);
        mapeCount++;
      }
    }
    mape = mapeCount > 0 ? (mape / mapeCount) * 100 : 0;

    return { mse, rmse, mae, r2, mape };
  }

  // Forecasting methods
  forecastLinearRegression(model, horizon) {
    const predictions = [];
    const lastIndex = model.lastTrainingIndex || 0;

    for (let i = 1; i <= horizon; i++) {
      const prediction = {
        date: this.addDays(new Date(), i),
        predictedValue: model.slope * (lastIndex + i) + model.intercept,
        confidenceIntervalLower: null,
        confidenceIntervalUpper: null
      };
      predictions.push(prediction);
    }

    return predictions;
  }

  forecastARIMA(model, horizon) {
    // Simplified ARIMA forecasting
    const predictions = [];
    const lastValue = model.lastValue || 0;

    for (let i = 1; i <= horizon; i++) {
      const prediction = {
        date: this.addDays(new Date(), i),
        predictedValue: lastValue * (1 + (model.coefficients[0] || 0) * 0.1),
        confidenceIntervalLower: null,
        confidenceIntervalUpper: null
      };
      predictions.push(prediction);
    }

    return predictions;
  }

  async forecastLSTM(model, horizon) {
    const predictions = [];
    // LSTM forecasting would use the trained TensorFlow model
    // This is a simplified version
    
    for (let i = 1; i <= horizon; i++) {
      const prediction = {
        date: this.addDays(new Date(), i),
        predictedValue: Math.random() * 100, // Placeholder
        confidenceIntervalLower: null,
        confidenceIntervalUpper: null
      };
      predictions.push(prediction);
    }

    return predictions;
  }

  forecastExponentialSmoothing(model, horizon) {
    const predictions = [];
    const lastLevel = model.level[model.level.length - 1] || 0;
    const lastTrend = model.trend[model.trend.length - 1] || 0;

    for (let i = 1; i <= horizon; i++) {
      const seasonalIdx = (model.seasonal.length - 1 + i) % model.seasonal.length;
      const seasonalFactor = model.seasonal[seasonalIdx] || 1;
      
      const prediction = {
        date: this.addDays(new Date(), i),
        predictedValue: (lastLevel + i * lastTrend) * seasonalFactor,
        confidenceIntervalLower: null,
        confidenceIntervalUpper: null
      };
      predictions.push(prediction);
    }

    return predictions;
  }

  forecastSeasonalDecomposition(model, horizon) {
    const predictions = [];

    for (let i = 1; i <= horizon; i++) {
      const trendValue = model.trend.slope * i + model.trend.intercept;
      const seasonalIdx = (i - 1) % model.seasonal.length;
      const seasonalValue = model.seasonal[seasonalIdx] || 0;

      const prediction = {
        date: this.addDays(new Date(), i),
        predictedValue: trendValue + seasonalValue,
        confidenceIntervalLower: null,
        confidenceIntervalUpper: null
      };
      predictions.push(prediction);
    }

    return predictions;
  }

  // Database operations
  async getTrainingData(query) {
    try {
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error getting training data:', error);
      throw error;
    }
  }

  async saveModelToDatabase(modelData) {
    try {
      const modelId = uuidv4();
      
      const query = `
        INSERT INTO forecasting_models (
          id, model_name, model_type, target_metric, model_parameters,
          training_data_start, training_data_end, accuracy_metrics,
          is_active, last_trained
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `;

      const values = [
        modelId,
        modelData.modelName,
        modelData.modelType,
        modelData.targetMetric,
        JSON.stringify(modelData.parameters),
        modelData.trainingDataStart,
        modelData.trainingDataEnd,
        JSON.stringify(modelData.accuracyMetrics),
        true,
        new Date()
      ];

      const result = await pool.query(query, values);
      return result.rows[0].id;

    } catch (error) {
      console.error('Error saving model to database:', error);
      throw error;
    }
  }

  async savePredictionsToDatabase(modelId, predictions, horizon) {
    try {
      for (const prediction of predictions) {
        const query = `
          INSERT INTO forecasting_predictions (
            model_id, prediction_date, predicted_value, 
            confidence_interval_lower, confidence_interval_upper, 
            prediction_horizon
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `;

        const values = [
          modelId,
          prediction.date,
          prediction.predictedValue,
          prediction.confidenceIntervalLower,
          prediction.confidenceIntervalUpper,
          horizon
        ];

        await pool.query(query, values);
      }

    } catch (error) {
      console.error('Error saving predictions to database:', error);
      throw error;
    }
  }

  // Utility functions
  addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}

module.exports = ForecastingEngine;