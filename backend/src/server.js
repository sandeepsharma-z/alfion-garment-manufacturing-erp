const env = require('./config/env');
const app = require('./app');
const { connectDb } = require('./config/db');
const logger = require('./common/logger/logger');
const log = logger.child({ context: 'Bootstrap' });

const WEAK = /change|dummy|secret|example|password|^.{0,31}$/i;
const guardSecrets = () => {
  const weak = ['accessSecret', 'refreshSecret'].filter((k) => WEAK.test(env.jwt[k]));
  if (!weak.length) return;
  if (env.isProd) { log.error(`Refusing to start: weak JWT secret(s) in production — set long random JWT_ACCESS_SECRET / JWT_REFRESH_SECRET (32+ chars)`); process.exit(1); }
  log.warn('JWT secrets look like placeholders — fine for development, replace before go-live');
};

const start = async () => {
  guardSecrets();
  await connectDb();
  const server = app.listen(env.port, () => {
    log.info(`Afion ERP API listening on http://localhost:${env.port} · env=${env.nodeEnv}`);
    log.info(`Modules mounted: P0–P6 (portal at /api/v1/public/track/:token)  ·  base /api/v1${env.serveFrontend ? '  ·  serving frontend/dist' : ''}`);
  });

  /* alert engine: computed rules, re-evaluated every 10 minutes and on demand (M-23) */
  const alerts = require('./modules/alerts/alerts.service');
  setTimeout(() => alerts.compute().catch((e) => log.error(`alert compute failed: ${e.message}`)), 5000);
  setInterval(() => alerts.compute().catch((e) => log.error(`alert compute failed: ${e.message}`)), 10 * 60 * 1000).unref();

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      log.error(`Port ${env.port} is already in use — another backend instance is running.`);
      log.error(`Stop it (or change PORT in backend/.env) and start again.`);
      process.exit(1);
    }
    throw e;
  });

  const shutdown = (signal) => {
    log.warn(`${signal} received — shutting down gracefully`);
    server.close(() => { log.info('HTTP server closed'); process.exit(0); });
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (e) => log.error(`unhandledRejection: ${e && e.stack ? e.stack : e}`));
};

start();
