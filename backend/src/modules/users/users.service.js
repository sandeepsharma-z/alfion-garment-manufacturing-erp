const User = require('./user.model');
const ApiError = require('../../common/utils/api-error');
const { cleanCustom } = require('../../common/utils/custom-fields');
const { MODULES, ROLE_TEMPLATES, FLAGS } = require('./roles');
const audit = require('../audit/audit.service');
const logger = require('../../common/logger/logger');
const log = logger.child({ context: 'UsersService' });

const normalizeFlags = (flags) =>
  Array.isArray(flags) ? flags.filter((f) => FLAGS.some((x) => x.key === f)) : [];

const normalizeModules = (role, modules) => {
  if (role === 'Admin') return ['*'];
  const list = Array.isArray(modules) ? modules.filter((m) => MODULES.includes(m)) : [];
  return list.length === MODULES.length ? ['*'] : list;
};

const list = async ({ q = '', status = '', page = 1, size = 25 }) => {
  const filter = {};
  if (q) filter.$or = [
    { name: { $regex: q, $options: 'i' } },
    { uid: { $regex: q, $options: 'i' } },
    { role: { $regex: q, $options: 'i' } },
  ];
  if (status) filter.status = status;
  const items = await User.find(filter).sort({ createdAt: 1 })
    .skip((page - 1) * size).limit(Math.min(+size, 100));
  const total = await User.countDocuments(filter);
  return { items: items.map((u) => u.toSafeJSON()), total, page: +page, size: +size };
};

const create = async (req, body) => {
  const { name, uid, password, role = 'Custom', modules = [], flags = [], email = '', phone = '', status = 'Active' } = body || {};
  if (!name || !uid) throw ApiError.badRequest('Name and User ID are both required');
  if (!password || password.length < 6) throw ApiError.badRequest('Password must be at least 6 characters');
  if (!ROLE_TEMPLATES[role]) throw ApiError.badRequest('Unknown role');
  const user = await User.create({
    name, uid, email, phone, role, status,
    modules: normalizeModules(role, modules),
    flags: normalizeFlags(flags),
    passwordHash: await User.hashPassword(password),
    mustChangePassword: true,
    custom: await cleanCustom('users', (body || {}).custom),
  });
  audit.record(req, 'user.create', `User:${user.uid}`, null, user.toSafeJSON());
  log.info(`user created · uid=${user.uid} · role=${role}`);
  return user.toSafeJSON();
};

const update = async (req, id, body) => {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  const before = user.toSafeJSON();
  const { name, role, modules, flags, email, phone, status, password } = body || {};
  if (flags !== undefined) user.flags = normalizeFlags(flags);
  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;
  if (phone !== undefined) user.phone = phone;
  if (role !== undefined) {
    if (!ROLE_TEMPLATES[role]) throw ApiError.badRequest('Unknown role');
    user.role = role;
  }
  if (modules !== undefined || role !== undefined) {
    user.modules = normalizeModules(user.role, modules !== undefined ? modules : user.modules);
  }
  if (status !== undefined) user.status = status;
  if ((body || {}).custom !== undefined) { user.custom = await cleanCustom('users', body.custom, user.custom || {}); user.markModified('custom'); }
  if (password) {
    if (password.length < 6) throw ApiError.badRequest('Password must be at least 6 characters');
    user.passwordHash = await User.hashPassword(password);
    user.mustChangePassword = true;
  }
  await user.save();
  audit.record(req, 'user.update', `User:${user.uid}`, before, user.toSafeJSON());
  return user.toSafeJSON();
};

const toggleStatus = async (req, id) => {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  if (user.uid === req.user.uid) throw ApiError.badRequest('You cannot disable your own account');
  const before = user.status;
  user.status = user.status === 'Disabled' ? 'Active' : 'Disabled';
  if (user.status === 'Disabled') user.refreshTokenHashes = []; // kill sessions
  await user.save();
  audit.record(req, 'user.toggle-status', `User:${user.uid}`, { status: before }, { status: user.status });
  return user.toSafeJSON();
};

const meta = () => ({ modules: MODULES, roleTemplates: ROLE_TEMPLATES, flags: FLAGS });

module.exports = { list, create, update, toggleStatus, meta };
