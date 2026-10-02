const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const catchAsync = require('../../common/utils/catch-async');
const ApiError = require('../../common/utils/api-error');
const { authenticate } = require('../../common/middleware/auth');
const File = require('./file.model');
const audit = require('../audit/audit.service');

const UPLOAD_ROOT = path.join(__dirname, '../../../uploads');
const ALLOWED = /\.(pdf|doc|docx|xls|xlsx|png|jpe?g|webp|dxf|plt|csv|txt)$/i;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_ROOT, String(new Date().getFullYear()));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_').slice(-80);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    ALLOWED.test(file.originalname) ? cb(null, true)
      : cb(ApiError.badRequest('File type not allowed (PDF, DOC/X, XLS/X, images, DXF/PLT, CSV, TXT)')),
});

router.use(authenticate);

/** POST /files/upload  (multipart field "file"; optional refType/refId) */
router.post('/upload', upload.single('file'), catchAsync(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('No file received');
  const doc = await File.create({
    name: req.file.originalname, mime: req.file.mimetype, size: req.file.size,
    storageKey: path.relative(UPLOAD_ROOT, req.file.path).replace(/\\/g, '/'),
    uploadedBy: req.user.uid, refType: req.body.refType || '', refId: req.body.refId || '',
  });
  audit.record(req, 'file.upload', `File:${doc._id}`, null, { name: doc.name, size: doc.size });
  res.status(201).json({ id: doc._id, name: doc.name, mime: doc.mime, size: doc.size, createdAt: doc.createdAt });
}));

/** GET /files/:id/meta */
router.get('/:id/meta', catchAsync(async (req, res) => {
  const doc = await File.findById(req.params.id);
  if (!doc) throw ApiError.notFound('File not found');
  res.json({ id: doc._id, name: doc.name, mime: doc.mime, size: doc.size, uploadedBy: doc.uploadedBy, createdAt: doc.createdAt });
}));

/** GET /files/:id  (stream; ?download=1 forces attachment) */
router.get('/:id', catchAsync(async (req, res) => {
  const doc = await File.findById(req.params.id);
  if (!doc) throw ApiError.notFound('File not found');
  const abs = path.join(UPLOAD_ROOT, doc.storageKey);
  if (!fs.existsSync(abs)) throw ApiError.notFound('File is missing on disk');
  res.setHeader('Content-Type', doc.mime);
  res.setHeader('Content-Disposition',
    `${req.query.download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(doc.name)}"`);
  fs.createReadStream(abs).pipe(res);
}));

module.exports = router;
