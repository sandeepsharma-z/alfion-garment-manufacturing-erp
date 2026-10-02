const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const catchAsync = require('../../common/utils/catch-async');
const { authenticate } = require('../../common/middleware/auth');
const service = require('./auth.service');
const env = require('../../config/env');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: env.isProd ? 30 : 1000,   // brute-force guard in production; relaxed for dev / e2e suites
  standardHeaders: true, legacyHeaders: false,
  message: { code: 'RATE_LIMIT', message: 'Too many attempts — try again later' },
});

router.post('/login', loginLimiter, catchAsync(async (req, res) => {
  const { uid, password } = req.body || {};
  res.json(await service.login(req, uid, password));
}));

router.post('/refresh', catchAsync(async (req, res) => {
  res.json(await service.refresh((req.body || {}).refreshToken));
}));

router.post('/logout', authenticate, catchAsync(async (req, res) => {
  await service.logout(req, (req.body || {}).refreshToken);
  res.json({ ok: true });
}));

router.post('/change-password', authenticate, catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  await service.changePassword(req, currentPassword, newPassword);
  res.json({ ok: true });
}));

router.get('/me', authenticate, (req, res) => res.json({ user: req.user.toSafeJSON() }));

module.exports = router;
