const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const env = require('./config/env');
const requestLogger = require('./common/middleware/request-logger');
const { notFound, errorHandler } = require('./common/middleware/error-handler');
const sanitize = require('./common/middleware/sanitize');

const app = express();
app.set('trust proxy', 1);

app.use(helmet());

app.use(cors({
  credentials: true,
  origin: (origin, cb) => {
    if (
      !origin ||
      env.corsOrigins.includes(origin) ||
      (!env.isProd &&
        (
          /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) ||
          /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):\d+$/.test(origin)   // any private LAN address in dev
        ))
    ) {
      return cb(null, true);
    }

    return cb(new Error(`CORS: origin ${origin} not allowed`));
  },
}));


app.use(express.json({ limit: '2mb' }));
app.use(sanitize);   // strip $-prefixed keys → no operator injection through JSON bodies / query
app.use(requestLogger);

/* ---- module routes (one line per module — mirrors folder structure) ---- */
app.use('/api/v1/health', require('./modules/health/health.routes'));
app.use('/api/v1/auth',   require('./modules/auth/auth.routes'));
app.use('/api/v1/users',  require('./modules/users/users.routes'));
app.use('/api/v1/audit',  require('./modules/audit/audit.routes'));
app.use('/api/v1/files',     require('./modules/files/files.routes'));
app.use('/api/v1/settings',  require('./modules/settings/settings.routes'));
/* ---- P1 · core trade ---- */
app.use('/api/v1/buyers',    require('./modules/buyers/buyers.routes'));
app.use('/api/v1/vendors',   require('./modules/vendors/vendors.routes'));
app.use('/api/v1/suppliers', require('./modules/suppliers/suppliers.routes'));
app.use('/api/v1/materials', require('./modules/materials/materials.routes'));
app.use('/api/v1/styles',    require('./modules/styles/styles.routes'));
app.use('/api/v1/bom',       require('./modules/bom/bom.routes'));
app.use('/api/v1/samples',   require('./modules/samples/samples.routes'));
app.use('/api/v1/orders',    require('./modules/orders/orders.routes'));
app.use('/api/v1/buyer-orders', require('./modules/orders/buyer-orders.routes'));
/* ---- P2 · material truth ---- */
app.use('/api/v1/stock',       require('./modules/stock/stock.routes'));
app.use('/api/v1/po',          require('./modules/po/po.routes'));
app.use('/api/v1/gate',        require('./modules/gate/gate.routes'));
app.use('/api/v1/accessories', require('./modules/accessory/accessory.routes'));
/* ---- P3 · outside & floor ---- */
app.use('/api/v1/jobwork',    require('./modules/jobwork/jobwork.routes'));
app.use('/api/v1/production', require('./modules/production/production.routes'));
app.use('/api/v1/packing',    require('./modules/packing/packing.routes'));
/* ---- P4 · client's new modules ---- */
app.use('/api/v1/tna',      require('./modules/tna/tna.routes'));
app.use('/api/v1/patterns', require('./modules/pattern/pattern.routes'));
app.use('/api/v1/quality',  require('./modules/quality/quality.routes'));
app.use('/api/v1/alerts',   require('./modules/alerts/alerts.routes'));
app.use('/api/v1/mywork',   require('./modules/mywork/mywork.routes'));
/* ---- P5 · outward & money ---- */
app.use('/api/v1/dispatch',   require('./modules/dispatch/dispatch.routes'));
app.use('/api/v1/payments',   require('./modules/payments/payments.routes'));
app.use('/api/v1/compliance', require('./modules/compliance/compliance.routes'));
app.use('/api/v1/reports',    require('./modules/reports/reports.routes'));
app.use('/api/v1/dashboard',  require('./modules/dashboard/dashboard.routes'));
app.use('/api/v1/payables',   require('./modules/payables/payables.routes'));
/* ---- P6 · buyer tracking portal (M-22): internal issue/revoke + public rate-limited read-only view ---- */
const portal = require('./modules/portal/portal.routes');
app.use('/api/v1/tracking', portal.internal);
app.use('/api/v1/public',   portal.publicRouter);

/* ---- production: serve the built frontend from the same origin (SERVE_FRONTEND=true) ---- */
if (env.serveFrontend) {
  const path = require('path');
  const dist = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
