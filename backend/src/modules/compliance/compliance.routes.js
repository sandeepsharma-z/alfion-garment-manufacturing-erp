const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const ApiError = require('../../common/utils/api-error');
const { cleanCustom } = require('../../common/utils/custom-fields');
const { authenticate, requireModule, requireFlag } = require('../../common/middleware/auth');
const { plain } = require('../../common/utils/mask');
const { hasFlag } = require('../users/roles');
const { nextSeq, pad } = require('../../common/utils/counters');
const audit = require('../audit/audit.service');
const Doc = require('./compliance.model');
const File = require('../files/file.model');
const User = require('../users/user.model');

const DAY = 864e5;
const settings = async () => (await require('../settings/settings.routes').getCompany()).toObject();

/** Derived expiry state (FR-21.4) */
const stateOf = (d, soonDays) => {
  if (!d.expiryDate) return { state: 'No expiry', daysLeft: null };
  const days = Math.ceil((new Date(d.expiryDate).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / DAY);
  if (days < 0) return { state: 'Expired', daysLeft: days };
  if (days <= soonDays) return { state: 'Expiring', daysLeft: days };
  return { state: 'Valid', daysLeft: days };
};
const present = (doc, user, soonDays = 60) => {
  const d = plain(doc);
  Object.assign(d, stateOf(d, soonDays));
  if (d.renewalInProgress && d.state !== 'Valid') d.state = 'Renewal in progress';
  d.currentVersion = d.versions.length ? d.versions[d.versions.length - 1] : null;
  d.dismissedActive = !!(d.dismissed && d.dismissed.until && new Date(d.dismissed.until) > new Date());
  d.canManage = hasFlag(user, 'compliance.manage');
  return d;
};
const visible = (user) => (hasFlag(user, 'compliance.confidential') ? {} : { $or: [{ confidential: { $ne: true } }, { ownerUid: user.uid }] });

router.use(authenticate, requireModule('compliance'));
router.get('/meta', (req, res) => res.json({ categories: Doc.CATEGORIES }));

router.get('/summary', catchAsync(async (req, res) => {
  const cfg = await settings();
  const soon = Math.max(...(cfg.complianceReminderDays || [60]));
  const docs = (await Doc.find({ status: 'Active', ...visible(req.user) })).map((d) => present(d, req.user, soon));
  res.json({
    total: docs.length, expiringSoon: docs.filter((d) => d.daysLeft !== null && d.daysLeft >= 0 && d.daysLeft <= soon).length, expired: docs.filter((d) => d.daysLeft !== null && d.daysLeft < 0).length,
    renewalInProgress: docs.filter((d) => d.renewalInProgress).length, formats: docs.filter((d) => d.category === 'Format / Template').length,
    next: docs.filter((d) => d.daysLeft !== null && d.daysLeft >= 0).sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 3).map((d) => ({ title: d.title, daysLeft: d.daysLeft, expiryDate: d.expiryDate })),
    reminderDays: cfg.complianceReminderDays || [60, 30, 15, 7, 1],
  });
}));

/** Expiry register — audit-ready (FR-21.4) */
router.get('/register', catchAsync(async (req, res) => {
  const cfg = await settings();
  const soon = Math.max(...(cfg.complianceReminderDays || [60]));
  const docs = (await Doc.find({ status: 'Active', expiryDate: { $ne: null }, ...visible(req.user) }).sort('expiryDate')).map((d) => present(d, req.user, soon));
  res.json({ items: docs.map((d) => ({ id: d.id, docNo: d.docNo, title: d.title, category: d.category, authority: d.authority, number: d.number, issueDate: d.issueDate, expiryDate: d.expiryDate,
    daysLeft: d.daysLeft, state: d.state, ownerName: d.ownerName, reminders: d.reminders.length, lastReminder: d.reminders.length ? d.reminders[d.reminders.length - 1].sentAt : null, confidential: d.confidential })), total: docs.length, company: cfg.legalName });
}));

router.get('/', catchAsync(async (req, res) => {
  const cfg = await settings();
  const soon = Math.max(...(cfg.complianceReminderDays || [60]));
  const f = { ...visible(req.user) };
  if (req.query.category) f.category = req.query.category;
  if (req.query.status) f.status = req.query.status; else f.status = 'Active';
  const rows = (await Doc.find(f).sort('expiryDate title')).map((d) => present(d, req.user, soon));
  const items = req.query.state ? rows.filter((d) => d.state === req.query.state) : rows;
  res.json({ items, total: items.length });
}));

router.get('/:id', catchAsync(async (req, res) => {
  const d = await Doc.findOne({ _id: req.params.id, ...visible(req.user) });
  if (!d) throw ApiError.notFound('Document not found');
  res.json(present(d, req.user, Math.max(...((await settings()).complianceReminderDays || [60]))));
}));

const owner = async (uid, req) => { const u = uid ? await User.findOne({ uid }) : null; return u ? { ownerUid: u.uid, ownerName: u.name } : { ownerUid: req.user.uid, ownerName: req.user.name }; };

router.post('/', requireFlag('compliance.manage'), catchAsync(async (req, res) => {
  const b = req.body || {};
  if (!b.title || !Doc.CATEGORIES.includes(b.category)) throw ApiError.badRequest('Title and a valid category are required');
  const d = await Doc.create({ docNo: `CD-${pad(await nextSeq('compliance'), 4)}`, title: b.title, category: b.category, authority: b.authority || '', number: b.number || '',
    issueDate: b.issueDate ? new Date(b.issueDate) : undefined, expiryDate: b.expiryDate ? new Date(b.expiryDate) : undefined, ...(await owner(b.ownerUid, req)),
    confidential: !!b.confidential, notes: b.notes || '', createdBy: req.user.uid, custom: await cleanCustom('compliance', b.custom) });
  audit.record(req, 'compliance.create', `ComplianceDoc:${d.docNo}`, null, { title: d.title, category: d.category, expiry: d.expiryDate });
  res.status(201).json(present(d, req.user));
}));

router.patch('/:id', requireFlag('compliance.manage'), catchAsync(async (req, res) => {
  const d = await Doc.findById(req.params.id);
  if (!d) throw ApiError.notFound('Document not found');
  const before = d.toObject();
  const b = req.body || {};
  ['title', 'authority', 'number', 'notes', 'status'].forEach((k) => { if (b[k] !== undefined) d.set(k, b[k]); });
  if (b.category && Doc.CATEGORIES.includes(b.category)) d.category = b.category;
  if (b.issueDate !== undefined) d.issueDate = b.issueDate ? new Date(b.issueDate) : undefined;
  if (b.expiryDate !== undefined) { d.expiryDate = b.expiryDate ? new Date(b.expiryDate) : undefined; if (b.expiryDate) { d.reminders = []; d.dismissed = undefined; } }
  if (b.confidential !== undefined) d.confidential = !!b.confidential;
  if (b.renewalInProgress !== undefined) d.renewalInProgress = !!b.renewalInProgress;
  if (b.custom !== undefined) { d.custom = await cleanCustom('compliance', b.custom, d.custom || {}); d.markModified('custom'); }
  if (b.ownerUid !== undefined) Object.assign(d, await owner(b.ownerUid, req));
  await d.save();
  audit.record(req, 'compliance.update', `ComplianceDoc:${d.docNo}`, before, d.toObject());
  res.json(present(d, req.user));
}));

/** New version = renewal when it carries a new expiry: reminders reset, dismissal cleared (FR-21.3) */
router.post('/:id/version', requireFlag('compliance.manage'), catchAsync(async (req, res) => {
  const d = await Doc.findById(req.params.id);
  if (!d) throw ApiError.notFound('Document not found');
  const b = req.body || {};
  const f = await File.findById(b.fileId);
  if (!f) throw ApiError.badRequest('Upload the file first');
  const exp = b.expiryDate ? new Date(b.expiryDate) : undefined;
  d.versions.push({ version: d.versions.length + 1, fileId: f._id, fileName: f.name, note: b.note || '', expiryDate: exp, by: req.user.name });
  if (exp) { d.expiryDate = exp; d.reminders = []; d.dismissed = undefined; d.renewalInProgress = false; if (b.issueDate) d.issueDate = new Date(b.issueDate); if (b.number) d.number = b.number; }
  await d.save();
  audit.record(req, 'compliance.version', `ComplianceDoc:${d.docNo}`, null, { version: d.versions.length, file: f.name, renewedTo: exp });
  res.json(present(d, req.user));
}));

/** Supporting files (annexures, receipts, audit photos) — any number, no renewal semantics. */
router.post('/:id/attachments', requireFlag('compliance.manage'), catchAsync(async (req, res) => {
  const d = await Doc.findById(req.params.id);
  if (!d) throw ApiError.notFound('Document not found');
  const ids = Array.isArray(req.body?.fileIds) ? req.body.fileIds : (req.body?.fileId ? [req.body.fileId] : []);
  if (!ids.length) throw ApiError.badRequest('Upload the files first');
  const files = await File.find({ _id: { $in: ids } });
  if (!files.length) throw ApiError.badRequest('Files not found');
  files.forEach((f) => { if (!d.attachments.some((a) => String(a.fileId) === String(f._id))) d.attachments.push({ fileId: f._id, fileName: f.name, size: f.size, by: req.user.name }); });
  await d.save();
  audit.record(req, 'compliance.attach', `ComplianceDoc:${d.docNo}`, null, { files: files.map((f) => f.name) });
  res.json(present(d, req.user));
}));
router.delete('/:id/attachments/:fileId', requireFlag('compliance.manage'), catchAsync(async (req, res) => {
  const d = await Doc.findById(req.params.id);
  if (!d) throw ApiError.notFound('Document not found');
  const before = d.attachments.length;
  d.attachments = d.attachments.filter((a) => String(a.fileId) !== String(req.params.fileId));
  if (d.attachments.length === before) throw ApiError.notFound('Attachment not found');
  await d.save();
  audit.record(req, 'compliance.detach', `ComplianceDoc:${d.docNo}`, null, { fileId: req.params.fileId });
  res.json(present(d, req.user));
}));

/** Dismiss reminders for a while — with a reason (FR-21.3) */
router.post('/:id/dismiss', requireFlag('compliance.manage'), catchAsync(async (req, res) => {
  const d = await Doc.findById(req.params.id);
  if (!d) throw ApiError.notFound('Document not found');
  const b = req.body || {};
  if (!b.reason) throw ApiError.badRequest('A reason is required to dismiss reminders');
  const days = Math.min(Math.max(+b.days || 7, 1), 90);
  d.dismissed = { until: new Date(Date.now() + days * DAY), reason: b.reason, by: req.user.name, at: new Date() };
  await d.save();
  audit.record(req, 'compliance.dismiss', `ComplianceDoc:${d.docNo}`, null, { days, reason: b.reason });
  res.json(present(d, req.user));
}));

module.exports = router;
module.exports.present = present;
module.exports.stateOf = stateOf;
