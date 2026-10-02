const logger = require('../logger/logger');
const log = logger.child({ context: 'ExceptionFilter' });

const notFound = (req, res) =>
  res.status(404).json({ code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} does not exist` });

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Mongoose duplicate key → friendly conflict
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({ code: 'CONFLICT', message: `That ${field} already exists`, field });
  }
  if (err && err.name === 'ValidationError') {
    const first = Object.values(err.errors || {})[0];
    return res.status(400).json({ code: 'VALIDATION', message: first ? first.message : 'Invalid data' });
  }
  if (err && err.isOperational) {
    return res.status(err.status).json({ code: err.code, message: err.message });
  }
  // Mongo unreachable (buffering timeout / server selection) → clear 503 instead of a vague 500
  if (err && /buffering timed out|ECONNREFUSED|Server selection timed out/i.test(err.message || '')) {
    return res.status(503).json({
      code: 'DB_UNAVAILABLE',
      message: 'Database is not reachable — check MONGODB_URI in backend/.env',
    });
  }
  log.error(err && err.stack ? err.stack : String(err));
  return res.status(500).json({ code: 'INTERNAL', message: 'Something went wrong on the server' });
};

module.exports = { notFound, errorHandler };
