const { buyerLabel } = require('../../common/utils/mask');
const { TnaTask } = require('./tna.model');
const Order = require('../orders/order.model');
const Sample = require('../samples/sample.model');
const svc = require('./tna.service');

/**
 * The buyer's T&A sheet as Excel: the style block on the left, then one column per activity
 * grouped by stage, with a Planned row and an Actual row per order — the client's own layout.
 * Written as an Excel-readable HTML workbook (no extra dependency).
 */
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dt = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '');
const fmt = (n) => (n || n === 0 ? Number(n).toLocaleString('en-IN') : '');
/** Local calendar day — planned dates are stored at local midnight, actuals carry a clock time. */
const day = (v) => { const d = new Date(v); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const LEFT = ['Sample No', 'Article / Style No', 'Style Description', 'Processes', 'Fabric', 'P.O No.', 'P.O wise qty', 'Colors', 'Color wise qty', 'Ship date', 'Planned / Actual'];

/** One row set per order: the style block, the dates by activity key, and the remarks. */
const dataFor = async (req, orderId) => {
  const orders = orderId ? await Order.find({ _id: orderId }) : await Order.find({ status: 'Open' }).sort('shipDate');
  const tasks = await TnaTask.find({ orderId: { $in: orders.map((o) => o._id) } }).sort('seq plannedEnd');
  const samples = await Sample.find({ _id: { $in: orders.map((o) => o.sampleId).filter(Boolean) } });
  const names = await svc.stageNames();
  const sampleOf = Object.fromEntries(samples.map((s) => [String(s._id), s]));
  const byOrder = {};
  tasks.forEach((t) => { (byOrder[String(t.orderId)] = byOrder[String(t.orderId)] || []).push(t); });

  /* activity columns = union across the exported orders, in pipeline then template order */
  const seen = new Map();
  tasks.forEach((t) => {
    const k = t.key || t.activity;
    const cur = seen.get(k);
    if (!cur || t.seq < cur.seq) seen.set(k, { key: k, activity: t.activity, stage: t.stage, seq: t.seq });
  });
  const cols = [...seen.values()].sort((a, b) => {
    const ai = names.indexOf(a.stage), bi = names.indexOf(b.stage);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.seq - b.seq;
  });

  const rows = orders.map((o) => {
    const ts = byOrder[String(o._id)] || [];
    const s = o.sampleId ? sampleOf[String(o.sampleId)] : null;
    const byKey = Object.fromEntries(ts.map((t) => [t.key || t.activity, t]));
    const replans = ts.filter((t) => t.replanCount > 0);
    return {
      orderNo: o.orderNo, buyer: buyerLabel(req.user, o.buyerBrand, o.buyerAlias),
      sampleNo: o.sampleNo || (s ? s.sampleNo : ''), styleNo: o.styleNo, description: o.description,
      processes: (s && s.tracking && s.tracking.processes) || o.accessories || '', fabric: o.fabric || '',
      poNo: o.buyerPoNo || o.buyerOrderNo || '', qty: o.qty,
      colours: (o.colours && o.colours.length ? o.colours : (o.colour ? [{ code: '', name: o.colour, qty: o.qty }] : [])).map((c) => ({ name: c.name || c.code || '', qty: c.qty || 0 })),
      shipDate: o.shipDate, mode: o.mode, remarks: [o.instructions, replans.length ? `${replans.length} replanned: ${replans.map((t) => `${t.activity} — ${(t.replans[t.replans.length - 1] || {}).reason || ''}`).join('; ')}` : ''].filter(Boolean).join(' · '),
      done: ts.filter((t) => t.status === 'Done').length, total: ts.length,
      cells: cols.map(({ key }) => {
        const t = byKey[key];
        if (!t) return null;
        const late = t.actualEnd && day(t.actualEnd) > day(t.plannedEnd);
        return { planned: t.plannedEnd, actual: t.actualEnd || null, status: t.status, late: !!late,
          auto: /^Auto-completed/i.test(t.remark || ''), overdue: t.status !== 'Done' && day(t.plannedEnd) < day(new Date()) };
      }),
    };
  });
  return { cols, rows, stages: names };
};

const excel = async (req, orderId) => {
  const { cols, rows } = await dataFor(req, orderId);
  const company = (await require('../settings/settings.routes').getCompany()).toObject();
  const groups = [];
  cols.forEach((c) => { const last = groups[groups.length - 1]; if (last && last.stage === c.stage) last.n += 1; else groups.push({ stage: c.stage, n: 1 }); });
  const title = orderId && rows[0] ? `T&A plan — ${rows[0].orderNo}` : 'T&A plan — all live orders';
  const head = `<tr><td colspan="${LEFT.length + cols.length + 1}" style="font-size:15px;font-weight:bold">${esc(company.legalName)} · ${esc(title)}</td></tr>
    <tr><td colspan="${LEFT.length + cols.length + 1}">Exported ${dt(new Date())} · planned vs actual · green = done on time, red = late or overdue, "auto" = filled by the system when the step happened</td></tr>
    <tr></tr>`;
  const cell = (c, kind) => {
    if (!c) return '<td></td>';
    if (kind === 'planned') return `<td align="center"${c.overdue ? ' bgcolor="#FFE2E2"' : ''}>${dt(c.planned)}</td>`;
    const bg = c.actual ? (c.late ? ' bgcolor="#FFE2E2"' : ' bgcolor="#DEF7EC"') : '';
    return `<td align="center"${bg}>${c.actual ? dt(c.actual) + (c.auto ? ' (auto)' : '') : ''}</td>`;
  };
  const body = rows.map((r) => {
    const left = (rowspan) => `
      <td rowspan="${rowspan}">${esc(r.sampleNo)}</td><td rowspan="${rowspan}">${esc(r.styleNo)}</td><td rowspan="${rowspan}">${esc(r.description)}</td>
      <td rowspan="${rowspan}">${esc(r.processes)}</td><td rowspan="${rowspan}">${esc(r.fabric)}</td><td rowspan="${rowspan}">${esc(r.poNo)}</td>
      <td rowspan="${rowspan}" align="right">${fmt(r.qty)}</td>
      <td rowspan="${rowspan}">${r.colours.map((c) => esc(c.name)).join('<br/>') || '—'}</td>
      <td rowspan="${rowspan}" align="right">${r.colours.map((c) => fmt(c.qty)).join('<br/>') || fmt(r.qty)}</td>
      <td rowspan="${rowspan}" align="center">${dt(r.shipDate)}<br/>${esc(r.mode || '')}</td>`;
    return `<tr><td rowspan="2" align="center">${esc(r.orderNo)}<br/><small>${esc(r.buyer)}</small></td>${left(2)}
      <td bgcolor="#EFEAFE"><b>Planned</b></td>${r.cells.map((c) => cell(c, 'planned')).join('')}<td rowspan="2">${esc(r.remarks)}</td></tr>
      <tr><td bgcolor="#E6FAF6"><b>Actual</b> (${r.done}/${r.total})</td>${r.cells.map((c) => cell(c, 'actual')).join('')}</tr>`;
  }).join('');
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8" />
    <style>td,th{border:0.5pt solid #999;font-family:Calibri;font-size:11px;vertical-align:middle} th{background:#F3F0FF;font-weight:bold}</style></head>
    <body><table border="1" cellspacing="0">${head}
      <tr><th rowspan="2">Order</th>${LEFT.map((h) => `<th rowspan="2">${esc(h)}</th>`).join('')}${groups.map((g) => `<th colspan="${g.n}">${esc(g.stage)}</th>`).join('')}<th rowspan="2">Remarks</th></tr>
      <tr>${cols.map((c) => `<th>${esc(c.activity)}</th>`).join('')}</tr>
      ${body || `<tr><td colspan="${LEFT.length + cols.length + 2}">No TNA planned yet — generate a plan first.</td></tr>`}
    </table></body></html>`;
  const name = `TNA-${orderId && rows[0] ? rows[0].orderNo : 'all-orders'}-${new Date().toISOString().slice(0, 10)}.xls`;
  return { html, name, orders: rows.length, activities: cols.length };
};

module.exports = { excel, dataFor };
