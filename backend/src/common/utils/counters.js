const mongoose = require('mongoose');
const Counter = mongoose.models.Counter || mongoose.model('Counter',
  new mongoose.Schema({ key: { type: String, unique: true }, seq: { type: Number, default: 0 } }));

/** Atomic per-key sequence. nextSeq('sample', 318) → 319, 320, … */
const nextSeq = async (key, start = 0) => {
  const doc = await Counter.findOneAndUpdate(
    { key }, { $inc: { seq: 1 }, $setOnInsert: { key } }, { new: true, upsert: true });
  return doc.seq + start;
};
const pad = (n, w) => String(n).padStart(w, '0');

module.exports = { nextSeq, pad };
