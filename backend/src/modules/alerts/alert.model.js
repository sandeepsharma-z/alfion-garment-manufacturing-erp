const mongoose = require('mongoose');

/** Computed alert (M-23) — never created by hand; auto-resolves when the rule stops matching. */
const alertSchema = new mongoose.Schema(
  {
    ruleKey: { type: String, required: true },              // e.g. po.overdue
    entityKey: { type: String, required: true },            // ruleKey + entity id — unique while open
    severity: { type: String, enum: ['red', 'amber', 'info'], default: 'amber' },
    module: { type: String, default: '' },                  // sidebar module key the alert belongs to
    entityType: { type: String, default: '' },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    entityNo: { type: String, default: '' },
    message: { type: String, required: true },
    link: { type: String, default: '' },                    // frontend path (FR-23.4)
    assigned: [{ type: String }],                           // uids
    acknowledgedBy: { type: String, default: '' },
    acknowledgedAt: { type: Date },
    resolvedAt: { type: Date },
    escalatedAt: { type: Date },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
alertSchema.index({ entityKey: 1, resolvedAt: 1 });
alertSchema.index({ assigned: 1, resolvedAt: 1 });

module.exports = mongoose.model('Alert', alertSchema);
