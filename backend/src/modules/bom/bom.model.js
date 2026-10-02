const mongoose = require('mongoose');

/** Bill of Material — one document per style, versioned on every save. */
const bomSchema = new mongoose.Schema(
  {
    styleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Style', required: true, unique: true },
    styleNo: { type: String, default: '' },
    version: { type: Number, default: 1 },
    lines: [{
      materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
      materialCode: String,
      materialName: String,
      uom: String,
      perPc: { type: Number, required: true, min: 0 },     // consumption per piece (average across sizes when perSize is empty)
      wastePct: { type: Number, default: 0, min: 0 },
      note: String,
      part: { type: String, default: '' },                // FAB-A / FAB-B / lining / shell … (client BOM sheet)
      colour: { type: String, default: '' },              // blank = every colourway; else the order colour code / name this line is for
      perSize: { type: mongoose.Schema.Types.Mixed, default: {} },   // { S: 1.15, M: 1.2 } consumption per size (overrides perPc)
      moq: { type: Number, default: 0 },                  // supplier MOQ for this line (0 = material master MOQ)
      requiredDate: { type: Date },                       // in-house-by date
    }],
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true },
);

/**
 * Requirement for one BOM line against an order (client BOM: colour-wise, size-wise consumption on the cutting quantity):
 *   basis    = cut qty of the line's colour (or of the whole order); size-wise when perSize is given
 *   required = ceil(Σ basis × consumption × (1 + waste%))
 * `order` may be a bare { qty } for the planning calculator.
 */
const lineRequired = (l, order) => {
  const extra = 1 + ((order.cutExtraPct === undefined ? 0 : order.cutExtraPct) / 100);
  const cutOf = (qty, cut) => (cut || Math.ceil(qty * extra));
  const colours = Array.isArray(order.colours) ? order.colours : [];
  const col = l.colour ? colours.find((c) => [c.code, c.name].map((x) => String(x || '').toLowerCase()).includes(String(l.colour).toLowerCase())) : null;
  if (l.colour && colours.length && !col) return 0;                        // colour not on this order
  const perSize = l.perSize && typeof l.perSize === 'object' ? Object.entries(l.perSize).filter(([, v]) => +v > 0) : [];
  const waste = 1 + (l.wastePct || 0) / 100;
  if (perSize.length) {
    const grid = col ? col.sizes : (colours.length ? colours.flatMap((c) => c.sizes) : (order.sizes || []));
    const bySize = {}; grid.forEach((s) => { bySize[s.size] = (bySize[s.size] || 0) + cutOf(s.qty || 0, s.cutQty); });
    const known = perSize.reduce((a, [size, v]) => a + (bySize[size] || 0) * +v, 0);
    const covered = perSize.reduce((a, [size]) => a + (bySize[size] || 0), 0);
    const basis = col ? cutOf(col.qty, col.cutQty) : cutOf(order.qty || 0, order.cutQty);
    return Math.ceil((known + Math.max(basis - covered, 0) * (l.perPc || 0)) * waste);   // sizes without a figure fall back to the average
  }
  const basis = col ? cutOf(col.qty, col.cutQty) : cutOf(order.qty || 0, order.cutQty);
  return Math.ceil(basis * (l.perPc || 0) * waste);
};

module.exports = mongoose.model('Bom', bomSchema);
module.exports.lineRequired = lineRequired;
