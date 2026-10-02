const ApiError = require('../../common/utils/api-error');
const crud = require('../../common/utils/crud');
const { plain, buyerLabel } = require('../../common/utils/mask');
const { hasFlag } = require('../users/roles');
const { nextSeq, pad } = require('../../common/utils/counters');
const audit = require('../audit/audit.service');
const logger = require('../../common/logger/logger');
const Sample = require('./sample.model');
const Buyer = require('../buyers/buyer.model');
const Style = require('../styles/style.model');
const File = require('../files/file.model');
const log = logger.child({ context: 'SamplesService' });

const SPEC_RE = /\.(pdf|docx?|xlsx?|png|jpe?g|webp)$/i;
/** Spec sheet attached from the request form (buyer tech pack) → next version of specSheets. */
const specVersion = async (fileId, n, by) => {
  const f = await File.findById(fileId);
  if (!f) throw ApiError.badRequest('Uploaded specification file not found');
  if (!SPEC_RE.test(f.name)) throw ApiError.badRequest('Specification must be PDF, DOC/DOCX, XLS/XLSX or an image');
  return { version: n, kind: 'uploaded', fileId: f._id, fileName: f.name, by };
};

const present = (doc, user) => {
  const s = plain(doc);
  s.buyerName = buyerLabel(user, s.buyerBrand, s.buyerAlias);
  s.specSheet = s.specSheets && s.specSheets.length ? s.specSheets[s.specSheets.length - 1] : null;
  return s;
};

/* denormalise buyer + auto-create the style master so BOM/orders can hang off it */
const enrich = async (body, req) => {
  const data = { ...body };
  if (data.buyerId) {
    const b = await Buyer.findById(data.buyerId);
    if (!b) throw ApiError.badRequest('Buyer not found');
    data.buyerBrand = b.brand; data.buyerAlias = b.alias;
  }
  if (data.styleNo) {
    data.styleNo = String(data.styleNo).toUpperCase().trim();
    let style = await Style.findOne({ styleNo: data.styleNo });
    if (!style) {
      style = await Style.create({ styleNo: data.styleNo, description: data.description || data.styleNo,
        buyerId: data.buyerId, buyerBrand: data.buyerBrand, buyerAlias: data.buyerAlias,
        fabric: data.fabric || '', colour: data.colour || '' });
      log.info(`style auto-created · ${style.styleNo}`);
    }
    data.styleId = style._id;
  }
  if (req && !data.merchandiser) data.merchandiser = req.user.name;
  if (Array.isArray(data.items)) {
    data.items = data.items
      .filter((i) => i && (i.fileId || (Array.isArray(i.photos) && i.photos.length) || String(i.description || '').trim()))
      .map((i) => {
        const photos = (Array.isArray(i.photos) ? i.photos : []).filter((p) => p && p.fileId).map((p) => ({ fileId: p.fileId, fileName: p.fileName || '' }));
        if (!photos.length && i.fileId) photos.push({ fileId: i.fileId, fileName: i.fileName || '' });        // older rows carried a single photo
        return { fileId: photos.length ? photos[0].fileId : undefined, fileName: photos.length ? photos[0].fileName : '', photos,
          description: String(i.description || '').trim(), fabric: String(i.fabric || '').trim(),
          colour: String(i.colour || '').trim(), sizes: String(i.sizes || '').trim(), qty: Math.max(parseInt(i.qty, 10) || 1, 1), notes: String(i.notes || '').trim() };
      });
    if (data.items.length) {
      const uniq = (k) => [...new Set(data.items.map((i) => i[k]).filter(Boolean))];
      data.pieces = data.items.reduce((a, i) => a + i.qty, 0);
      data.colourways = Math.max(uniq('colour').length, 1);
      data.fabric = uniq('fabric').join(' / ');
      data.colour = uniq('colour').join(' / ');
      if (!data.description) data.description = data.items[0].description;
    }
  }
  if (data.courier && typeof data.courier === 'object') {
    data.courier = { method: String(data.courier.method || ''), awb: String(data.courier.awb || ''), receiver: String(data.courier.receiver || ''), notes: String(data.courier.notes || '') };
  }
  return data;
};

const base = crud(Sample, {
  label: 'sample',
  form: 'samples',
  search: ['sampleNo', 'styleNo', 'description', 'buyerBrand', 'buyerAlias'],
  filters: ['status', 'buyerId', 'priority'],
  present,
  beforeCreate: async (body, req) => {
    const data = await enrich(body, req);
    data.sampleNo = `SMP-${pad(await nextSeq('sample', 318), 3)}`;
    if (data.specSheetFileId) data.specSheets = [await specVersion(data.specSheetFileId, 1, req.user.name)];
    delete data.specSheetFileId;
    data.round = 1;
    data.rounds = [{ no: 1, title: `Round 1 · ${data.type || 'Proto Sample'}`, type: data.type || 'Proto Sample',
      result: 'pending', by: req.user.name }];
    return data;
  },
  beforeUpdate: async (body, req, doc) => {
    const { sampleNo, rounds, specSheets, orderId, orderNo, specSheetFileId, ...rest } = body;   // protected fields
    const data = await enrich(rest, req);
    if (specSheetFileId) data.specSheets = [...doc.specSheets.map((v) => v.toObject()), await specVersion(specSheetFileId, doc.specSheets.length + 1, req.user.name)];
    return data;
  },
});

/** Log a round event: sent to buyer / buyer said approve / changes / rejected. */
const logRound = async (req, id, body) => {
  const s = await Sample.findById(id);
  if (!s) throw ApiError.notFound('Sample not found');
  if (s.status === 'Approved' && s.orderId) throw ApiError.badRequest('Sample is already converted to an order');
  const { action, comment = '', awb = '', sentOn, type, courier = '' } = body || {};
  const cur = s.rounds[s.rounds.length - 1];
  const before = { status: s.status, round: s.round };

  if (action === 'sent') {
    cur.sentOn = sentOn ? new Date(sentOn) : new Date(); cur.awb = awb; cur.courier = courier || (s.courier && s.courier.method) || ''; cur.result = 'sent';
    s.courier = { ...(s.courier ? s.courier.toObject() : {}), method: cur.courier, awb: awb || (s.courier && s.courier.awb) || '' };
    s.status = 'Client Review';
  } else if (action === 'changes') {
    cur.comment = comment; cur.result = 'changes';
    s.round += 1; s.status = 'Revision';
    s.rounds.push({ no: s.round, title: `Round ${s.round} · ${type || cur.type || 'Revision'}`,
      type: type || cur.type, result: 'pending', by: req.user.name });
  } else if (action === 'approved') {
    cur.comment = comment; cur.result = 'approved';
    s.status = 'Approved'; s.approvedAt = new Date(); s.approvedBy = req.user.name;
  } else if (action === 'rejected') {
    cur.comment = comment; cur.result = 'rejected'; s.status = 'Rejected';
  } else if (action === 'reopen') {
    s.status = 'In Sampling';
  } else {
    throw ApiError.badRequest('Unknown action');
  }
  cur.by = req.user.name;
  await s.save();
  audit.record(req, `sample.${action}`, `Sample:${s.sampleNo}`, before, { status: s.status, round: s.round });
  log.info(`${s.sampleNo} · ${action} · now ${s.status}`);
  return present(s, req.user);
};

/** Measurements for a round (POM spec from the style, measured value + buyer instruction per POM) — the sample comment sheet. */
const setMeasurements = async (req, id, body) => {
  const s = await Sample.findById(id);
  if (!s) throw ApiError.notFound('Sample not found');
  const no = parseInt(body.round, 10) || s.round;
  const r = s.rounds.find((x) => x.no === no);
  if (!r) throw ApiError.badRequest(`Round ${no} not found`);
  r.size = String(body.size || r.size || '');
  const num = (v) => (v === '' || v === undefined || v === null || Number.isNaN(+v) ? undefined : Math.round(+v * 100) / 100);
  r.measurements = (Array.isArray(body.rows) ? body.rows : []).filter((m) => m && m.code).map((m) => ({ code: String(m.code), measured: num(m.measured), instruction: String(m.instruction || ''), revised: num(m.revised) }));
  /* updated spec → style POM for every size: the same +/- shift the merchandiser typed for the measured size is applied across the size set */
  if (body.applyToStyle && s.styleId && r.size) {
    const style = await Style.findById(s.styleId);
    if (style) {
      let changed = 0;
      style.pom.forEach((p) => {
        const m = r.measurements.find((x) => x.code === p.code);
        const cur = p.spec && p.spec[r.size];
        if (!m || m.revised === undefined || cur === undefined) return;
        const delta = Math.round((m.revised - cur) * 100) / 100;
        if (!delta) return;
        p.spec = Object.fromEntries(Object.entries(p.spec).map(([z, v]) => [z, Math.round((+v + delta) * 100) / 100]));
        changed += 1;
      });
      if (changed) { style.markModified('pom'); await style.save(); audit.record(req, 'style.pom.revise', `Style:${style.styleNo}`, null, { round: no, size: r.size, changed }); }
    }
  }
  ['dueDate', 'actualSentOn', 'commentsOn'].forEach((k) => { if (body[k] !== undefined) r[k] = body[k] ? new Date(body[k]) : undefined; });
  if (body.pcsPerColour !== undefined) r.pcsPerColour = Math.max(parseInt(body.pcsPerColour, 10) || 0, 0);
  await s.save();
  audit.record(req, 'sample.measure', `Sample:${s.sampleNo}`, null, { round: no, size: r.size, rows: r.measurements.length });
  return present(s, req.user);
};

/** Attach a specification sheet version (uploaded file or generated marker). */
const addSpec = async (req, id, { fileId, kind = 'uploaded' }) => {
  const s = await Sample.findById(id);
  if (!s) throw ApiError.notFound('Sample not found');
  if (s.status !== 'Approved') throw ApiError.badRequest('Specification sheet can only be added to an approved sample');
  let fileName = `Specification-${s.styleNo}-v${s.specSheets.length + 1}.html`;
  if (fileId) {
    const f = await File.findById(fileId);
    if (!f) throw ApiError.badRequest('Uploaded file not found');
    if (!/\.(pdf|docx?)$/i.test(f.name)) throw ApiError.badRequest('Specification must be PDF, DOC or DOCX');
    fileName = f.name;
  }
  s.specSheets.push({ version: s.specSheets.length + 1, kind, fileId: fileId || undefined, fileName, by: req.user.name });
  await s.save();
  audit.record(req, 'sample.spec', `Sample:${s.sampleNo}`, null, { version: s.specSheets.length, kind, fileName });
  if (s.orderId) await require('../tna/tna.service').markEvent(s.orderId, 'spec', new Date(), `spec v${s.specSheets.length}`);
  return present(s, req.user);
};

/** Data the specification sheet is generated from (frontend renders + prints). */
/* ---------- style-wise material requirement sheet → stock analysis → BOM ---------- */
const Material = require('../materials/material.model');
const Supplier = require('../suppliers/supplier.model');
const { stockMapping } = require('../../common/utils/material-catalog');
const q4 = (v) => (Number.isFinite(+v) ? Math.round(+v * 10000) / 10000 : 0);
/** Consumption per piece with wastage — the sheet's "average consumption". */
const avgConsumption = (l) => q4(q4(l.perPc) * (1 + q4(l.wastePct) / 100));

const setMaterials = async (req, id, body) => {
  const s = await Sample.findById(id);
  if (!s) throw ApiError.notFound('Sample not found');
  const lines = (Array.isArray(body.lines) ? body.lines : []).filter((l) => l && (String(l.item || '').trim() || l.perPc));
  const matIds = lines.map((l) => l.materialId).filter(Boolean);
  const mats = matIds.length ? await Material.find({ _id: { $in: matIds } }) : [];
  const byId = Object.fromEntries(mats.map((m) => [String(m._id), m]));
  const supIds = lines.map((l) => l.supplierId).filter(Boolean);
  const sups = supIds.length ? await Supplier.find({ _id: { $in: supIds } }) : [];
  const supById = Object.fromEntries(sups.map((x) => [String(x._id), x]));
  s.materials = lines.map((l) => {
    const m = l.materialId ? byId[String(l.materialId)] : null;
    const sup = l.supplierId ? supById[String(l.supplierId)] : null;
    return { group: String(l.group || ''), item: String(l.item || '').trim(), description: String(l.description || '').trim(),
      unit: String(l.unit || (m ? m.uom : '')).trim(), perPc: q4(l.perPc), wastePct: q4(l.wastePct),
      materialId: m ? m._id : undefined, materialCode: m ? m.code : '',
      supplierId: sup ? sup._id : (m ? m.supplierId : undefined), supplierName: sup ? sup.name : (m ? m.supplierName : ''),
      moq: Math.max(+l.moq || 0, 0), requiredDate: l.requiredDate ? new Date(l.requiredDate) : undefined, remarks: String(l.remarks || '') };
  });
  const p = body.plan || {};
  s.materialPlan = { qty: Math.max(parseInt(p.qty, 10) || 0, 0), garmentType: String(p.garmentType || ''), sizeRatio: String(p.sizeRatio || ''),
    colour: String(p.colour || ''), deliveryDate: p.deliveryDate ? new Date(p.deliveryDate) : undefined, remarks: String(p.remarks || ''),
    updatedBy: req.user.name, updatedAt: new Date() };
  await s.save();
  audit.record(req, 'sample.materials', `Sample:${s.sampleNo}`, null, { lines: s.materials.length, qty: s.materialPlan.qty });
  log.info(`${s.sampleNo} material sheet · ${s.materials.length} lines on ${s.materialPlan.qty} pcs`);
  return present(s, req.user);
};

/**
 * Requirement + stock position of every sheet line (the client's columns):
 *   average consumption = per pc × (1 + wastage %) · final required = average × order qty
 *   available = physical − reserved · shortage = required − available · final order qty = max(shortage − on order, MOQ)
 */
const requirement = async (req, id, query = {}) => {
  const s = await Sample.findById(id);
  if (!s) throw ApiError.notFound('Sample not found');
  const order = s.orderId ? await require('../orders/order.model').findById(s.orderId) : null;
  const qty = Math.max(parseInt(query.qty, 10) || 0, 0) || (order ? (order.cutQty || order.qty) : 0) || s.materialPlan?.qty || 0;
  const ids = s.materials.map((l) => l.materialId).filter(Boolean);
  const mats = ids.length ? await Material.find({ _id: { $in: ids } }) : [];
  const byId = Object.fromEntries(mats.map((m) => [String(m._id), m]));
  const onOrder = ids.length ? await require('../stock/stock.service').onOrderMap({ materialId: { $in: ids } }) : {};
  const showRate = hasFlag(req.user, 'rates.view');
  const rows = s.materials.map((l, i) => {
    const m = l.materialId ? byId[String(l.materialId)] : null;
    const avg = avgConsumption(l);
    const required = Math.ceil(avg * qty);
    const free = m ? Math.max(m.physicalQty - m.reservedQty, 0) : 0;
    const available = Math.min(free, required || free);
    const shortage = Math.max(required - free, 0);
    const oo = (l.materialId && onOrder[String(l.materialId)]) || { qty: 0, count: 0, nos: [] };
    const moq = l.moq || (m ? m.moq : 0) || 0;
    const toOrder = Math.max(shortage - oo.qty, 0);
    const orderQty = toOrder > 0 ? Math.max(toOrder, moq) : 0;
    return {
      no: i + 1, group: l.group, item: l.item, description: l.description, unit: l.unit || (m ? m.uom : ''),
      perPc: l.perPc, wastePct: l.wastePct, avgConsumption: avg, orderQty: qty, required,
      materialId: l.materialId ? String(l.materialId) : '', materialCode: m ? m.code : l.materialCode, materialName: m ? m.name : '',
      free, available, shortage, onOrder: oo.qty, openPos: oo.count, poNos: oo.nos || [], moq, toOrder, finalOrderQty: orderQty,
      supplierId: l.supplierId ? String(l.supplierId) : '', supplierName: l.supplierName || (m ? m.supplierName : ''),
      rate: showRate && m ? m.rate : undefined, buyCost: showRate && m ? Math.round(orderQty * (m.rate || 0)) : undefined,
      requiredDate: l.requiredDate, remarks: l.remarks,
      status: !l.materialId ? 'Not in stock' : shortage === 0 ? 'In Stock' : toOrder === 0 ? 'On Order' : free > 0 ? 'Short' : 'Out of Stock',
    };
  });
  return {
    sampleNo: s.sampleNo, styleNo: s.styleNo, styleId: s.styleId, buyerName: buyerLabel(req.user, s.buyerBrand, s.buyerAlias),
    orderNo: order ? order.orderNo : '', orderId: order ? String(order._id) : '', merchandiser: s.merchandiser,
    plan: { ...(s.materialPlan ? s.materialPlan.toObject() : {}), qty },
    rows, totals: { lines: rows.length, inStock: rows.filter((r) => r.status === 'In Stock').length, short: rows.filter((r) => ['Short', 'Out of Stock'].includes(r.status)).length,
      unlinked: rows.filter((r) => !r.materialId).length, onOrder: rows.filter((r) => r.status === 'On Order').length,
      buyCost: showRate ? rows.reduce((a, r) => a + (r.buyCost || 0), 0) : undefined },
  };
};

/* ---------- costing sheet (client Excel format) ---------- */
const num = (v) => (Number.isFinite(+v) ? Math.round(+v * 10000) / 10000 : 0);
const money = (v) => Math.round(num(v) * 100) / 100;
/** Same arithmetic as the client's sheet: act yard = yardage × (1 + shrink%), then wastage %, sending charges, profit %. */
const computeCosting = (c = {}) => {
  const fabrics = (Array.isArray(c.fabrics) ? c.fabrics : []).filter((l) => l && (l.item || l.description || l.yardage || l.rate)).map((l) => {
    const yardage = num(l.yardage), shrinkPct = num(l.shrinkPct), rate = num(l.rate);
    const actYard = num(l.actYard) || num(yardage * (1 + shrinkPct / 100));   // keep full precision like the sheet; only money amounts round to 2
    return { item: String(l.item || '').trim(), description: String(l.description || '').trim(), yardage, shrinkPct, actYard, rate, amount: money(actYard * rate), party: String(l.party || '').trim(), note: String(l.note || '').trim() };
  });
  const trims = (Array.isArray(c.trims) ? c.trims : []).filter((l) => l && (l.item || l.rate || l.qty)).map((l) => {
    const qty = num(l.qty) || 1, rate = num(l.rate);
    return { item: String(l.item || '').trim(), description: String(l.description || '').trim(), qty, unit: String(l.unit || '').trim(), rate, amount: money(qty * rate), party: String(l.party || '').trim(), note: String(l.note || '').trim() };
  });
  const lineList = (arr) => (Array.isArray(arr) ? arr : []).filter((l) => l && (l.item || l.rate)).map((l) => {
    const qty = num(l.qty) || 1, rate = num(l.rate);
    return { item: String(l.item || '').trim(), qty, rate, amount: money(qty * rate), note: String(l.note || '').trim() };
  });
  const processes = lineList(c.processes), charges = lineList(c.charges);
  const sum = (arr) => money(arr.reduce((a, l) => a + l.amount, 0));
  const material = sum(fabrics) + sum(trims), process = sum(processes), sub = money(material + process);
  const wastagePct = num(c.wastagePct), profitPct = num(c.profitPct);
  const wastage = money(sub * wastagePct / 100), afterWastage = money(sub + wastage);
  const chargesTotal = sum(charges), afterCharges = money(afterWastage + chargesTotal);
  const profit = money(afterCharges * profitPct / 100), final = money(afterCharges + profit);
  const exchangeRate = num(c.exchangeRate);
  return { currency: String(c.currency || 'USD'), exchangeRate, targetPrice: num(c.targetPrice), fabrics, trims, processes, charges, wastagePct, profitPct,
    totals: { material: money(material), process, sub, wastage, afterWastage, charges: chargesTotal, afterCharges, profit, final, finalFx: exchangeRate ? money(final / exchangeRate) : 0 },
    notes: String(c.notes || '') };
};
const setCosting = async (req, id, body) => {
  const s = await Sample.findById(id);
  if (!s) throw ApiError.notFound('Sample not found');
  s.costing = { ...computeCosting(body), updatedBy: req.user.name, updatedAt: new Date() };
  await s.save();
  audit.record(req, 'sample.costing', `Sample:${s.sampleNo}`, null, { final: s.costing.totals.final, currency: s.costing.currency });
  log.info(`${s.sampleNo} costing · ${s.costing.totals.final} (${s.costing.totals.finalFx} ${s.costing.currency})`);
  return present(s, req.user);
};

/** Sample-status-sheet fields that belong to the whole sample (per-round dates stay on the rounds). */
const setTracking = async (req, id, body) => {
  const s = await Sample.findById(id);
  if (!s) throw ApiError.notFound('Sample not found');
  const d = (v) => (v ? new Date(v) : undefined);
  s.tracking = { articleNo: String(body.articleNo || ''), factory: String(body.factory || ''), processes: String(body.processes || ''),
    colourQtyOn: d(body.colourQtyOn), bomOn: d(body.bomOn), techPackOn: d(body.techPackOn), artworkOn: d(body.artworkOn),
    ccMaterial: String(body.ccMaterial || ''), remarks: String(body.remarks || '') };
  await s.save();
  audit.record(req, 'sample.tracking', `Sample:${s.sampleNo}`, null, { articleNo: s.tracking.articleNo });
  return present(s, req.user);
};

/** Everything about one sample in one payload — the printable dossier (request, pieces, POM, rounds, costing, approvals, tech pack). */
const dossier = async (req, id) => {
  const s = await Sample.findById(id);
  if (!s) throw ApiError.notFound('Sample not found');
  const style = s.styleId ? await Style.findById(s.styleId) : null;
  const company = (await require('../settings/settings.routes').getCompany()).toObject();
  return {
    sample: present(s, req.user),
    style: style ? plain(style) : null,
    buyerName: buyerLabel(req.user, s.buyerBrand, s.buyerAlias),
    company: { legalName: company.legalName, address: company.address, phone: company.phone, email: company.email, gstin: company.gstin, iec: company.iec, letterheadFileId: company.letterheadFileId },
    generatedAt: new Date(), generatedBy: req.user.name,
  };
};

const specData = async (req, id) => {
  const s = await Sample.findById(id);
  if (!s) throw ApiError.notFound('Sample not found');
  const style = s.styleId ? await Style.findById(s.styleId) : null;
  return {
    sample: present(s, req.user),
    style: style ? plain(style) : null,
    buyerBrand: buyerLabel(req.user, s.buyerBrand, s.buyerAlias),
  };
};

module.exports = { ...base, present, logRound, addSpec, specData, setMeasurements, setCosting, setTracking, dossier, computeCosting, setMaterials, requirement, avgConsumption };
