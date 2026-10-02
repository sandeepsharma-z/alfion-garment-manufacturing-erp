const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../common/logger/logger');
const log = logger.child({ context: 'Mongoose' });

/** Connect with retry — server stays up (health endpoint) while DB is unreachable. */
const connectDb = async () => {
  mongoose.set('bufferTimeoutMS', 3000); // fail fast with a clear 503 when DB is down
  mongoose.connection.on('connected', () => log.info(`connected · ${env.mongoUri.replace(/\/\/.*@/, '//***@')}`));
  mongoose.connection.on('disconnected', () => log.warn('disconnected'));
  const tryConnect = async (attempt = 1) => {
    try {
      await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
    } catch (e) {
      const wait = Math.min(30, attempt * 5);
      log.error(`connection failed (attempt ${attempt}): ${e.message} — retrying in ${wait}s`);
      setTimeout(() => tryConnect(attempt + 1), wait * 1000);
    }
  };
  await tryConnect();
};

module.exports = { connectDb };
