const mongoose = require('mongoose');

/** Stored file metadata. Bytes live on disk (uploads/) in Phase 1; S3 later — same shape. */
const fileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    mime: { type: String, default: 'application/octet-stream' },
    size: { type: Number, default: 0 },
    storageKey: { type: String, required: true },   // relative path under uploads/
    uploadedBy: { type: String, default: '' },
    refType: { type: String, default: '' },          // e.g. 'sample-spec', 'style-image'
    refId: { type: String, default: '' },
  },
  { timestamps: true },
);

module.exports = mongoose.model('File', fileSchema);
