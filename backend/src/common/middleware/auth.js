const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const ApiError = require('../utils/api-error');
const User = require('../../modules/users/user.model');
const { hasModule, hasFlag } = require('../../modules/users/roles');

/** Verifies the Bearer access token and attaches the live user to req.user. */
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw ApiError.unauthorized();
    let payload;
    try { payload = jwt.verify(token, env.jwt.accessSecret); }
    catch { throw ApiError.unauthorized('Session expired — please log in again'); }
    const user = await User.findById(payload.sub);
    if (!user || user.status === 'Disabled') throw ApiError.unauthorized('Account is disabled');
    req.user = user;
    next();
  } catch (e) { next(e); }
};

/** Route guard: user must have this module ticked (SRS SEC-2). Admin ('*') passes everything. */
const requireModule = (moduleKey) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!hasModule(req.user, moduleKey)) {
    return next(ApiError.forbidden(`This account does not have access to the "${moduleKey}" module`));
  }
  next();
};

/** Route guard for confidential data / extra permissions (SEC-3). */
const requireFlag = (flag) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!hasFlag(req.user, flag)) return next(ApiError.forbidden('This account does not have permission for this data'));
  next();
};

module.exports = { authenticate, requireModule, requireFlag };
