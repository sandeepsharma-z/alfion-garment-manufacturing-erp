require('dotenv').config();

const required = (key, fallback) => {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${key}`);
  return v;
};

module.exports = {
  nodeEnv: required('NODE_ENV', 'development'),
  isProd: process.env.NODE_ENV === 'production',
  port: parseInt(required('PORT', '5000'), 10),
  mongoUri: required('MONGODB_URI'),
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessExpires: required('JWT_ACCESS_EXPIRES', '15m'),
    refreshExpires: required('JWT_REFRESH_EXPIRES', '7d'),
  },
  serveFrontend: process.env.SERVE_FRONTEND === 'true',
  serveFrontend: process.env.SERVE_FRONTEND === 'true',
  serveFrontend: process.env.SERVE_FRONTEND === 'true',
  corsOrigins: required('CORS_ORIGINS', 'http://localhost:5173')
    .split(',').map((s) => s.trim()).filter(Boolean),
  seed: {
    adminUid: required('SEED_ADMIN_UID', 'vikram'),
    adminPassword: required('SEED_ADMIN_PASSWORD', 'Afion@123'),
  },
};
