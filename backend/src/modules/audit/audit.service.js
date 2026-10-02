const AuditLog = require('./audit.model');
const logger = require('../../common/logger/logger');
const log = logger.child({ context: 'AuditService' });

/** Fire-and-forget write — auditing must never break the main request. */
const record = (req, action, entity, before, after) => {
  AuditLog.create({
    actorUid: req.user ? req.user.uid : 'anonymous',
    action, entity: entity || '',
    before: before || null, after: after || null,
    ip: req.ip || '',
  }).catch((e) => log.warn(`audit write failed: ${e.message}`));
};

const list = async ({ page = 1, size = 50 }) => {
  const docs = await AuditLog.find().sort({ createdAt: -1 })
    .skip((page - 1) * size).limit(Math.min(size, 200));
  const total = await AuditLog.countDocuments();
  return { items: docs, total, page: +page, size: +size };
};

module.exports = { record, list };
