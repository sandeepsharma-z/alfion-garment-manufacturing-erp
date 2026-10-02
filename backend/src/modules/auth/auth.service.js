const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../../config/env');
const ApiError = require('../../common/utils/api-error');
const User = require('../users/user.model');
const audit = require('../audit/audit.service');
const logger = require('../../common/logger/logger');
const log = logger.child({ context: 'AuthService' });

/* simple in-memory lockout: 5 failures → 15 min (SEC-1) */
const failures = new Map(); // uid -> {count, until}
const LOCK_AFTER = 5, LOCK_MS = 15 * 60 * 1000;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const signAccess = (user) =>
  jwt.sign({ sub: user._id.toString(), uid: user.uid, role: user.role },
    env.jwt.accessSecret, { expiresIn: env.jwt.accessExpires });

const signRefresh = (user) =>
  jwt.sign({ sub: user._id.toString(), type: 'refresh' },
    env.jwt.refreshSecret, { expiresIn: env.jwt.refreshExpires });

const login = async (req, uid, password) => {
  uid = String(uid || '').toLowerCase().trim();
  if (!uid || !password) throw ApiError.badRequest('User ID and password are required');

  const f = failures.get(uid);
  if (f && f.count >= LOCK_AFTER && Date.now() < f.until) {
    const mins = Math.ceil((f.until - Date.now()) / 60000);
    throw ApiError.forbidden(`Account locked after failed attempts — try again in ${mins} min`);
  }

  const user = await User.findOne({ uid }).select('+passwordHash +refreshTokenHashes');
  const ok = user && (await user.comparePassword(password));
  if (!ok) {
    const cur = failures.get(uid) || { count: 0, until: 0 };
    cur.count += 1; cur.until = Date.now() + LOCK_MS;
    failures.set(uid, cur);
    log.warn(`login failed · uid=${uid} · attempt ${cur.count}`);
    throw ApiError.unauthorized('Invalid User ID or password');
  }
  if (user.status === 'Disabled') throw ApiError.forbidden('This account has been disabled');
  failures.delete(uid);

  const accessToken = signAccess(user);
  const refreshToken = signRefresh(user);
  // multi-device: keep the last 5 sessions instead of kicking the other device out
  user.refreshTokenHashes = [...(user.refreshTokenHashes || []).slice(-4), sha256(refreshToken)];
  user.lastLoginAt = new Date();
  if (user.status === 'Invited') user.status = 'Active';
  await user.save();

  audit.record({ user, ip: req.ip }, 'auth.login', `User:${user.uid}`);
  log.info(`login ok · uid=${user.uid} · role=${user.role}`);
  return { accessToken, refreshToken, user: user.toSafeJSON() };
};

const refresh = async (refreshToken) => {
  if (!refreshToken) throw ApiError.unauthorized();
  let payload;
  try { payload = jwt.verify(refreshToken, env.jwt.refreshSecret); }
  catch { throw ApiError.unauthorized('Session expired — please log in again'); }
  const user = await User.findById(payload.sub).select('+refreshTokenHashes');
  if (!user || user.status === 'Disabled') throw ApiError.unauthorized();
  const idx = (user.refreshTokenHashes || []).indexOf(sha256(refreshToken));
  if (idx < 0) throw ApiError.unauthorized('Session was revoked — please log in again');
  const accessToken = signAccess(user);
  const newRefresh = signRefresh(user);            // rotation (SEC-1) — replaces only this device's token
  user.refreshTokenHashes.splice(idx, 1, sha256(newRefresh));
  await user.save();
  return { accessToken, refreshToken: newRefresh, user: user.toSafeJSON() };
};

const logout = async (req, refreshToken) => {
  const user = await User.findById(req.user._id).select('+refreshTokenHashes');
  const h = refreshToken ? sha256(refreshToken) : null;
  user.refreshTokenHashes = h ? user.refreshTokenHashes.filter((x) => x !== h) : []; // no token → sign out everywhere
  await user.save();
  audit.record(req, 'auth.logout', `User:${req.user.uid}`);
};

const changePassword = async (req, currentPassword, newPassword) => {
  if (!newPassword || newPassword.length < 6) {
    throw ApiError.badRequest('New password must be at least 6 characters');
  }
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await user.comparePassword(currentPassword || ''))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  user.passwordHash = await User.hashPassword(newPassword);
  user.mustChangePassword = false;
  await user.save();
  audit.record(req, 'auth.change-password', `User:${user.uid}`);
};

module.exports = { login, refresh, logout, changePassword };
