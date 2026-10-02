const mongoose = require('mongoose');

/** Append-only audit trail (SRS NFR-5). Never updated, never deleted. */
const auditSchema = new mongoose.Schema(
  {
    actorUid: { type: String, required: true },
    action: { type: String, required: true },       // e.g. user.create, auth.login
    entity: { type: String, default: '' },          // e.g. User:rakesh
    before: { type: Object, default: null },
    after: { type: Object, default: null },
    ip: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditSchema.index({ createdAt: -1 });
auditSchema.index({ actorUid: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditSchema);
