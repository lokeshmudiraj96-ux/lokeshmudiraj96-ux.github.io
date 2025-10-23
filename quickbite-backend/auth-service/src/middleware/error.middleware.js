const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Default error
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';

  // PostgreSQL errors
  if (err.code === '23505') {
    statusCode = 400;
    message = 'Duplicate entry. This record already exists.';
  }

  if (err.code === '23503') {
    statusCode = 400;
    message = 'Referenced record does not exist.';
  }

  if (err.code === '22P02') {
    statusCode = 400;
    message = 'Invalid input format.';
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = err.message;
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = { errorHandler };
