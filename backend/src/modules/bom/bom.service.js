const ApiError = require('../../common/utils/api-error');
const { nextSeq, pad } = require('../../common/utils/counters');
const { stockMapping, CODE_PREFIX } = require('../../common/utils/material-catalog');
const audit = require('../audit/audit.service');
const logger = require('../../common/logger/logger');
const Bom = require('./bom.model');
const Style = require('../styles/style.model');
const Material = require('../materials/material.model');

const log = logger.child({ context: 'BomService' });

/**
 * Build (or refresh) a style's BOM from the sample's material requirement sheet — the one place that turns
 * "what one piece needs" into stock-linked BOM lines. Lines with no stock item are created in the master first.
 * Used by POST /bom/from-sample and automatically when a sample becomes an order.
 */
const buildFromSample = async (req, sample, opts = {}) => {
  if (!sample) throw ApiError.notFound('Sample not found');
  if (!sample.styleId) throw ApiError.badRequest('This sample has no style');
  if (!sample.materials || !sample.materials.length) throw ApiError.badRequest('Fill the material sheet on the sample first');
  const style = await Style.findById(sample.styleId);
  if (!style) throw ApiError.notFound('Style not found');
  const createMissing = opts.createMissing !== false;
  const by = (req && req.user) || { uid: 'system', name: 'system' };
  const created = [], skipped = [], lines = [];
  for (const l of sample.materials) {
    if (!l.perPc) { skipped.push({ item: l.item, why: 'no consumption per piece' }); continue; }
    let m = l.materialId ? await Material.findById(l.materialId) : null;
    if (!m && l.item) {                                            // same name / code already in the master? reuse it
      const rx = new RegExp(`^${String(l.item).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      m = await Material.findOne({ $or: [{ name: rx }, { code: String(l.materialCode || '').toUpperCase() }] });
    }
    if (!m) {
      if (!createMissing) { skipped.push({ item: l.item, why: 'not in the stock master' }); continue; }
      const map = stockMapping(l.group);
      const code = `${CODE_PREFIX[map.category] || 'ACC'}-${pad(await nextSeq('material-auto', 9000), 4)}`;
      m = await Material.create({ code, name: l.description ? `${l.item} — ${l.description}` : l.item, category: map.category, itemType: map.itemType,
        uom: l.unit || map.unit || 'pcs', spec: l.description || '', supplierId: l.supplierId, supplierName: l.supplierName || '',
        moq: l.moq || 0, reorderLevel: 0, rate: 0, status: 'Active' });
      created.push({ code: m.code, name: m.name });
    }
    lines.push({ materialId: m._id, materialCode: m.code, materialName: m.name, uom: m.uom, perPc: l.perPc, wastePct: l.wastePct || 0,
      part: l.group === 'Fabric' ? 'FAB-A' : '', colour: '', perSize: {}, moq: l.moq || m.moq || 0,
      requiredDate: l.requiredDate, note: [l.description, l.remarks].filter(Boolean).join(' · ') });
  }
  if (!lines.length) throw ApiError.badRequest('Nothing to put in the BOM — every line is missing a consumption per piece or a stock item');
  const before = await Bom.findOne({ styleId: style._id });
  const bom = await Bom.findOneAndUpdate({ styleId: style._id },
    { $set: { styleNo: style.styleNo, lines, updatedBy: by.uid }, $inc: { version: 1 } }, { new: true, upsert: true });
  if (req) audit.record(req, 'bom.from-sample', `Style:${style.styleNo}`, before ? before.toObject() : null, { lines: lines.length, created: created.length, sample: sample.sampleNo });
  log.info(`BOM v${bom.version} for ${style.styleNo} from ${sample.sampleNo} · ${lines.length} lines · ${created.length} new stock items`);
  return { bom: bom.toObject(), created, skipped, from: sample.sampleNo };
};

module.exports = { buildFromSample };
