import * as React from 'react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { fmtN, fmtDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Close, Check, Refresh, Print } from '@/icons/icons';
import type { Dispatch } from './DispatchPage';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const inr = (v?: number) => (v == null ? '—' : `₹${Number(v).toLocaleString('en-IN')}`);
const fx = (v: number | undefined, cur: string) => (v == null ? '—' : `${cur} ${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export type Box = { from: number; to: number; orderId?: string; styleNo: string; colourCode: string; colour: string; sizes: Record<string, number>; pcs: number; grossKg: number; netKg: number; dims: string };
type Shipping = { marksAndNos?: string; placeOfDelivery?: string; cartonDims?: string };
type DocOrder = { id: string; orderNo: string; styleNo: string; description: string; qty: number; sizes: { size: string; qty: number }[]; sizeSet?: string[]; colours?: { code: string; name: string; qty: number; sizes: { size: string; qty: number; barcode?: string }[] }[]; colour: string; fabric: string; packRatio: string; pcsPerCarton: number; buyerPoNo: string; buyerOrderNo: string };

/* ---------- Code 128 (subset B) as inline SVG — carton marks / JAN labels without a barcode library ---------- */
const C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
export function code128Svg(text: string, height = 38) {
  const t = String(text || '').replace(/[^\x20-\x7e]/g, '');
  if (!t) return '';
  const vals = [104, ...[...t].map((c) => c.charCodeAt(0) - 32)];
  const check = vals.reduce((a, v, i) => a + v * (i || 1), 0) % 103;
  const seq = [...vals, check, 106];
  let x = 0; const rects: string[] = [];
  seq.forEach((v) => [...C128[v]].forEach((w, i) => { const wd = +w; if (i % 2 === 0) rects.push(`<rect x="${x}" y="0" width="${wd}" height="${height}"/>`); x += wd; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} ${height + 12}" width="${x * 1.6}" height="${(height + 12) * 1.6}" shape-rendering="crispEdges"><g fill="#000">${rects.join('')}</g><text x="${x / 2}" y="${height + 10}" font-family="monospace" font-size="9" text-anchor="middle">${esc(t)}</text></svg>`;
}

/* ---------- printable export documents (server data → HTML print) ---------- */
export async function printDoc(id: string, type: string) {
  try {
    const { data } = await api.get(`/dispatch/${id}/doc-data/${encodeURIComponent(type)}`);
    const d = data.dispatch as Dispatch, c = data.company, b = data.buyer || {}, orders = (data.orders || []) as DocOrder[], formatNo = data.formatNo || '';
    const cur = d.currency || 'USD';
    const lines = (d.lines || []).length ? d.lines! : [{ orderId: d.orderId, orderNo: d.orderNo, buyerPoNo: d.buyerPoNo, styleNo: d.styleNo, description: d.description, colour: '', hsCode: d.hsnCode, qty: d.qty, unitPrice: undefined, currency: cur, amountFx: undefined, amountInr: d.invoiceValue }];
    const orderOf = (oid: string) => orders.find((o) => o.id === oid);
    const b2 = b as typeof b & { shipping?: Shipping };
    const sh: Shipping = b2.shipping || {};
    const cell = (label: string, value: string, cls = '') => `<div class="fld ${cls}"><span>${esc(label)}</span><b>${value || '&nbsp;'}</b></div>`;
    /* the buyer's format: bordered boxes for the parties, then the transport grid */
    const buyerHead = (title: string) => `<div class="doc-title">${esc(title)}</div>
      <table class="frm"><tr>
        <td width="52%" rowspan="2"><div class="lbl">Manufacturer &amp; Exporter :</div><div class="big">${esc(c.legalName || 'Afion International')}</div><div>${esc(c.address || '').split(',').map((x) => esc(x.trim())).join('<br>')}</div>
          <div>${c.gstin ? 'GST IN: ' + esc(c.gstin) : ''}${c.iec ? ' · IEC: ' + esc(c.iec) : ''}</div>${c.phone ? `<div>TEL: ${esc(c.phone)}</div>` : ''}</td>
        <td width="48%">
          <table class="inner"><tr><th colspan="2">Invoice No &amp; date</th></tr>
            <tr><td>${esc(d.invoiceNo)}</td><td>${esc(fmtDate(d.invoiceDate))}</td></tr>
            <tr><th>Buyer's Order No.</th><th>AD Code</th></tr>
            <tr><td>${esc(d.buyerOrderNo || d.buyerPoNo || '—')}</td><td>${esc(c.adCode || '—')}</td></tr>
            ${title === 'INVOICE' ? `<tr><th>GST IN</th><th>Performa Invoice</th></tr><tr><td>${esc(c.gstin || '—')}</td><td>${esc(d.proformaNo || '—')}</td></tr>` : ''}
          </table></td></tr>
        <tr><td>
          <table class="inner"><tr><th>Country of Origin of goods</th><th>Country of Final Destination</th></tr>
            <tr><td>${esc(d.countryOfOrigin || 'INDIA')}</td><td>${esc(d.finalDestination || b.country || d.portOfDischarge || '—')}</td></tr></table></td></tr>
        <tr><td><div class="lbl">Consignee :</div><div class="big">${esc(d.consignee?.name || b.legalName || b.name || '—')}</div><div>${esc(d.consignee?.address || b.address || '').split(',').map((x) => esc(x.trim())).join('<br>')}</div><div>${esc(d.consignee?.country || b.country || '')}</div></td>
          <td><div class="lbl">Buyer (If other than consignee)</div><div class="big">${esc(d.notifyParty || '" SAME AS CONSIGNEE "')}</div>
            ${title === 'INVOICE' ? `<div class="lbl" style="margin-top:6px">Terms of Delivery And Payment.</div><div><b>${esc(d.incoterm)}</b> · <b>${esc(d.paymentTerms && d.paymentTerms.startsWith(d.paymentMethod) ? d.paymentTerms : [d.paymentMethod, d.paymentTerms].filter(Boolean).join(' · '))}</b>${d.lcNo ? ` · L/C ${esc(d.lcNo)}` : ''}<br>MADE IN INDIA</div>` : ''}</td></tr>
      </table>
      <table class="frm grid4">
        <tr><th>Pre-Carriage by</th><th>Place of Receipt by Pre-Carrier</th></tr>
        <tr><td>${esc(d.preCarriage || (d.mode === 'Air' ? 'BY AIR' : 'BY ROAD'))}</td><td>${esc(d.placeOfReceipt || '—')}</td></tr>
        <tr><th>Vessel/Flight No.</th><th>Port of Loading.</th></tr>
        <tr><td>${esc(d.vesselOrFlight || '—')}</td><td>${esc(d.portOfLoading || '—')}</td></tr>
        <tr><th>Port of Discharge.</th><th>Place of Delivery.</th></tr>
        <tr><td>${esc(d.portOfDischarge || '—')}</td><td>${esc(sh.placeOfDelivery || d.finalDestination || b.country || '—')}</td></tr>
      </table>`;
    const marks = d.marksAndNos || sh.marksAndNos || `${b.name || d.consignee?.name || ''} · ${d.buyerOrderNo || d.buyerPoNo || ''} · C/No. 1–${d.cartons || 1} · MADE IN INDIA`;
    const head = `<div class="head"><div><h1>${esc(c.legalName || 'Afion International')}</h1><small>${esc(c.address)}${c.gstin ? ' · GSTIN ' + esc(c.gstin) : ''}${c.iec ? ' · IEC ' + esc(c.iec) : ''}${c.adCode ? ' · AD code ' + esc(c.adCode) : ''}${c.phone ? ' · ' + esc(c.phone) : ''}${c.email ? ' · ' + esc(c.email) : ''}</small>
      <div style="margin-top:8px;font-size:17px;font-weight:700">${esc(type)}${type === 'Certificate of Origin' ? ' (draft)' : ''} — ${esc(d.invoiceNo)}</div></div>
      <div style="text-align:right"><div><b>Date:</b> ${esc(fmtDate(d.invoiceDate))}</div><div><b>Buyer's order:</b> ${esc(d.buyerOrderNo || d.buyerPoNo || '—')}</div><div><b>Mode:</b> ${esc(d.mode)} · ${esc(d.incoterm)} ${esc(d.portOfLoading)}</div>${formatNo ? `<div><b>Format No.:</b> ${esc(formatNo)}</div>` : ''}</div></div>`;
    const parties = `<div class="box"><div><b>Exporter</b><br>${esc(c.legalName)}<br>${esc(c.address)}${c.iec ? '<br>IEC ' + esc(c.iec) : ''}${c.gstin ? '<br>GSTIN ' + esc(c.gstin) : ''}</div>
      <div><b>Consignee</b><br>${esc(d.consignee?.name || b.legalName || b.name || '—')}${d.consignee?.address || b.address ? '<br>' + esc(d.consignee?.address || b.address) : ''}${d.consignee?.country || b.country ? '<br>' + esc(d.consignee?.country || b.country) : ''}${d.notifyParty ? '<br><b>Notify:</b> ' + esc(d.notifyParty) : ''}</div>
      <div><b>Shipment</b><br>Pre-carriage: ${esc(d.preCarriage || '—')} · Place of receipt: ${esc(d.placeOfReceipt || '—')}<br>${esc(d.vesselOrFlight || (d.mode === 'Air' ? 'Flight —' : 'Vessel —'))}<br>${esc(d.portOfLoading)} → ${esc(d.portOfDischarge)}${d.finalDestination ? ' → ' + esc(d.finalDestination) : ''}<br>Country of origin: ${esc(d.countryOfOrigin || 'India')}${d.blOrAwbNo ? '<br>' + (d.mode === 'Air' ? 'AWB ' : 'B/L ') + esc(d.blOrAwbNo) : ''}${d.containerNo ? '<br>Container ' + esc(d.containerNo) + (d.sealNo ? ' · seal ' + esc(d.sealNo) : '') : ''}</div></div>`;
    const terms = `<p><b>Terms of delivery &amp; payment:</b> ${esc(d.incoterm)} ${esc(d.portOfLoading)} · ${esc(d.paymentMethod)}${d.paymentTerms ? ' · ' + esc(d.paymentTerms) : ''}${d.lcNo ? ` · L/C No. ${esc(d.lcNo)}${d.lcDate ? ' dated ' + fmtDate(d.lcDate) : ''}` : ''}${cur !== 'INR' && d.fxRate ? ` · exchange rate 1 ${esc(cur)} = ₹${d.fxRate}` : ''} · Reverse charge: ${d.reverseCharge ? 'Yes' : 'No'}</p>`;
    let body = '';
    if (type === 'Commercial Invoice') {
      const canFx = lines.some((l) => l.amountFx != null);
      const adv = Number(d.advanceFx || 0);
      const net = Number(d.totalFx || 0) - adv;
      body = `${buyerHead('INVOICE')}
        <table class="frm items"><tr><th>STYLE NO.</th><th>Description of Goods</th><th>HS Code</th><th class="num">Quantity<br>(in Pcs)</th>${canFx ? `<th class="num">Price<br>(${esc(cur)})</th><th class="num">TOTAL AMOUNT ${esc(cur)}</th>` : '<th class="num">Amount (₹)</th>'}</tr>
          ${lines.map((l) => `<tr><td align="center">${esc(l.styleNo)}</td><td>${esc(l.description)}${l.colour ? ' - ' + esc(l.colour) : ''}</td><td align="center">${esc(l.hsCode)}</td><td class="num">${fmtN(l.qty)}</td>${canFx ? `<td class="num">${l.unitPrice != null ? Number(l.unitPrice).toFixed(2) : ''}</td><td class="num">${l.amountFx != null ? Number(l.amountFx).toLocaleString('en-US', { minimumFractionDigits: 2 }) : ''}</td>` : `<td class="num">${inr(l.amountInr)}</td>`}</tr>`).join('')}
          <tr class="tot"><td align="center"><b>TOTAL BOX</b></td><td align="center"><b>${fmtN(d.cartons)}</b></td><td></td><td class="num"><b>${fmtN(d.qty)}</b></td>${canFx ? `<td align="center"><b>${esc(cur)}</b></td><td class="num"><b>${Number(d.totalFx || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</b></td>` : `<td class="num"><b>${inr(d.taxableInr ?? d.invoiceValue)}</b></td>`}</tr>
          ${canFx && adv > 0 ? `<tr><td colspan="4"></td><td align="right">Less - Advance</td><td class="num">${adv.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr class="tot"><td colspan="4"></td><td align="right"><b>Total</b></td><td class="num"><b>${net.toLocaleString('en-US', { minimumFractionDigits: 2 })}</b></td></tr>` : ''}
          ${d.igstPct ? `<tr><td colspan="${canFx ? 4 : 3}"></td><td align="right">IGST @ ${d.igstPct}%</td><td class="num">${inr(d.igstInr)}</td></tr>` : ''}
        </table>
        <p class="words"><b>AMOUNT IN ${esc(cur)} ${esc((d.amountInWordsFx || '').toUpperCase())}${adv > 0 ? ' (before advance)' : ''}</b>${d.amountInWords ? `<br><small>₹ value: ${esc(d.amountInWords)}${cur !== 'INR' && d.fxRate ? ` · 1 ${esc(cur)} = ₹${d.fxRate}` : ''}</small>` : ''}</p>
        <table class="frm"><tr><td width="60%"><div class="lbl">Declaration :</div>We declare that this invoice shows the actual price of goods described and that the all particular are true and correct.
            <div style="margin-top:6px"><b>Packing:</b> ${fmtN(d.cartons)} cartons · gross ${esc(d.grossWeightKg || '—')} kg · net ${esc(d.netWeightKg || '—')} kg${d.cartonDims ? ` · ${esc(d.cartonDims)}` : ''}</div>
            <div><b>Marks &amp; Nos.:</b> ${esc(marks)}</div>
            ${formatNo ? `<div style="margin-top:6px"><b>FORMAT NO.:</b> ${esc(formatNo)}</div>` : ''}</td>
          <td><div class="lbl">Authorised Sign.</div><div style="height:70px"></div><div>For ${esc(c.legalName)}</div></td></tr></table>`;
    } else if (type === 'Packing List') {
      const boxes = (d.boxes || []) as Box[];
      const n0 = (x: Box) => Math.max(x.to - x.from + 1, 1);
      const order0 = orders[0];
      const sizeOrder = [...new Set([...(order0?.sizeSet ?? []), ...orders.flatMap((o) => (o.sizeSet?.length ? o.sizeSet : o.sizes.map((z) => z.size)))])];
      const sizeCols = [...new Set(boxes.flatMap((x) => Object.keys(x.sizes || {})))].sort((x, y) => {
        const ix = sizeOrder.indexOf(x), iy = sizeOrder.indexOf(y);
        return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy) || x.localeCompare(y);
      });
      const rowsOut = boxes.length ? boxes : lines.map((l) => ({ from: 1, to: d.cartons || 1, orderId: l.orderId, styleNo: l.styleNo, colourCode: '', colour: l.colour || '', sizes: {}, pcs: l.qty, grossKg: 0, netKg: 0, dims: '' } as Box));
      const dims = d.cartonDims || [...new Set(boxes.map((x) => x.dims).filter(Boolean))].join(', ');
      body = `${buyerHead('PACKING LIST')}
        <table class="frm items"><tr><th rowspan="2">Box.<br>Nos.</th><th rowspan="2">Style #</th><th rowspan="2">Description of Goods</th>${sizeCols.length ? `<th colspan="${sizeCols.length}">SIZES</th>` : ''}<th rowspan="2" class="num">Quantity<br>(in Pcs)</th><th rowspan="2">REMARKS</th></tr>
          <tr>${sizeCols.map((z) => `<th class="num sz">${esc(z)}</th>`).join('')}</tr>
          ${rowsOut.map((x) => `<tr><td align="center">${x.from === x.to ? x.from : `${x.from} - ${x.to}`}</td><td align="center">${esc(x.styleNo)}</td><td>${esc(orderOf(String(x.orderId || '')) ? orderOf(String(x.orderId || ''))!.description : d.description)}${x.colour ? ' - ' + esc(x.colour) : ''}</td>${sizeCols.map((z) => `<td class="num">${x.sizes?.[z] ? fmtN(x.sizes[z] * n0(x)) : ''}</td>`).join('')}<td class="num">${fmtN(x.pcs * n0(x))}</td><td></td></tr>`).join('')}
          <tr class="tot"><td colspan="3" align="right"><b>Total</b></td>${sizeCols.map((z) => `<td class="num"><b>${fmtN(boxes.reduce((a, x) => a + (x.sizes?.[z] || 0) * n0(x), 0))}</b></td>`).join('')}<td class="num"><b>${fmtN(boxes.length ? boxes.reduce((a, x) => a + x.pcs * n0(x), 0) : d.qty)}</b></td><td></td></tr>
        </table>
        <table class="frm foot"><tr><td width="60%">
            <div><b>READY MADE GARMENT</b></div>
            <div>Number of Carton: <b>${fmtN(d.cartons)}</b></div>
            <div>Total GW: <b>${esc(d.grossWeightKg || '—')} KG</b></div>
            <div>Total NW: <b>${esc(d.netWeightKg || '—')} KG</b></div>
            <div>Measurements/Carton: <b>${esc(dims || '—')}</b></div>
            ${formatNo ? `<div>FORMAT NO.: <b>${esc(formatNo)}</b></div>` : ''}</td>
          <td><div class="lbl">Marks &amp; Nos.</div><div>${esc(marks)}</div>
            <div class="lbl" style="margin-top:10px">Authorised Sign.</div><div style="height:56px"></div><div>For ${esc(c.legalName)}</div></td></tr></table>`;
    } else if (type === 'Carton Marks') {
      const boxes = (d.boxes || []) as Box[];
      if (!boxes.length) throw new Error('Build the box-wise packing list first (Packing → Auto boxes)');
      const jan = (x: Box) => { const o = orderOf(String(x.orderId || '')); const size = Object.keys(x.sizes || {})[0] || ''; return o?.colours?.find((cc) => cc.code === x.colourCode || cc.name === x.colour)?.sizes.find((s) => s.size === size)?.barcode || `${x.styleNo}-${x.colourCode || x.colour}-${size}`.replace(/\s+/g, ''); };
      body = `<div class="marks">${boxes.flatMap((x) => Array.from({ length: Math.max(x.to - x.from + 1, 1) }, (_, i) => x.from + i).map((no) => `<div class="mark"><div class="mk-head">${esc(b.name || d.consignee?.name || '')}</div><table><tr><th>Order / PO</th><td>${esc(d.buyerOrderNo || d.buyerPoNo || '—')}</td></tr><tr><th>Style</th><td>${esc(x.styleNo)}</td></tr><tr><th>Colour</th><td>${esc(x.colourCode)}${x.colourCode && x.colour ? ' · ' : ''}${esc(x.colour)}</td></tr><tr><th>Size · Qty</th><td>${Object.entries(x.sizes || {}).map(([s, q]) => `${esc(s)} × ${q}`).join(', ') || `${x.pcs} pcs`}</td></tr><tr><th>Carton</th><td>C/No. ${no} of ${d.cartons}</td></tr><tr><th>Weight</th><td>G ${x.grossKg || '—'} kg · N ${x.netKg || '—'} kg${x.dims ? ' · ' + esc(x.dims) : ''}</td></tr></table>${code128Svg(jan(x))}<div class="mk-foot">MADE IN INDIA · ${esc(c.legalName)}</div></div>`)).join('')}</div>`;
    } else if (type === 'Delivery Challan') {
      body = `${parties}<table><tr><th>#</th><th>Description</th><th class="num">Cartons</th><th class="num">Quantity</th><th class="num">Gross kg</th><th>Vehicle / Transporter</th></tr>
        ${lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.description)} · ${esc(l.styleNo)} · for export against invoice ${esc(d.invoiceNo)}</td><td class="num">${i === 0 ? esc(d.cartons) : ''}</td><td class="num">${fmtN(l.qty)} pcs</td><td class="num">${i === 0 ? esc(d.grossWeightKg) : ''}</td><td>${i === 0 ? esc(d.transporter || '—') : ''}</td></tr>`).join('')}</table>
        <p><small>Goods moved from factory to ${esc(d.portOfLoading)} for export. Not a tax invoice.</small></p><div class="sign"><div>Dispatched by</div><div>Transporter</div><div>Received at port / CHA</div></div>`;
    } else if (type === 'E-Way Bill') {
      body = `<p>Data sheet for the GST e-way bill portal — enter these values and record the EWB number on the shipment.</p><table>
        ${[['Supplier GSTIN', c.gstin], ['Recipient', (d.consignee?.name || b.name) + (b.country ? ' · ' + b.country : '') + ' (export)'], ['Document', d.invoiceNo + ' · ' + fmtDate(d.invoiceDate)], ['HSN', [...new Set(lines.map((l) => l.hsCode))].join(', ')], ['Description', lines.map((l) => `${l.description} · ${l.styleNo}`).join('; ')], ['Quantity', fmtN(d.qty) + ' pcs · ' + d.cartons + ' cartons'], ['Taxable value (₹)', inr(d.taxableInr ?? d.invoiceValue)], ['IGST', d.igstPct ? `${d.igstPct}% · ${inr(d.igstInr)}` : 'Nil (LUT)'], ['Transporter', d.transporter || '—'], ['From → To', `${c.address} → ${d.portOfLoading}`]].map(([k, v]) => `<tr><th style="width:220px">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;
    } else if (type === 'Certificate of Origin') {
      body = `${parties}<p><b>Country of origin of goods: INDIA</b></p><table><tr><th>Marks &amp; numbers</th><th>Number and kind of packages · description</th><th>HS</th><th class="num">Quantity</th><th class="num">Gross kg</th></tr>
        ${lines.map((l, i) => `<tr><td>${i === 0 ? `${esc(b.name || '')} · ${esc(d.buyerOrderNo || d.buyerPoNo || '')} · C/No. 1–${esc(d.cartons)}` : ''}</td><td>${i === 0 ? esc(d.cartons) + ' cartons · ' : ''}${esc(l.description)} · ${esc(l.styleNo)}</td><td>${esc(l.hsCode)}</td><td class="num">${fmtN(l.qty)} pcs</td><td class="num">${i === 0 ? esc(d.grossWeightKg) : ''}</td></tr>`).join('')}</table>
        <p><small>Draft for the issuing chamber. The undersigned declares that the above goods were produced in India.</small></p><div class="sign"><div>Exporter declaration</div><div>Chamber certification</div></div>`;
    }
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(type)} ${esc(d.invoiceNo)}</title><style>body{font:12.5px/1.45 Arial,sans-serif;color:#1f2430;margin:32px}h1{font-size:19px;margin:0}.head{display:flex;justify-content:space-between;border-bottom:3px solid #f28c4a;padding-bottom:10px}
      table{border-collapse:collapse;width:100%;margin-top:12px}th,td{border:1px solid #d8dbe2;padding:5px 7px;text-align:left;vertical-align:top}th{background:#f5f6f8}.num{text-align:right}small{color:#666}.box{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:12px}.box>div{border:1px solid #d8dbe2;border-radius:6px;padding:8px;font-size:12px}
      .doc-title{text-align:center;font-weight:700;font-size:15px;letter-spacing:.04em;border:1px solid #333;border-bottom:0;padding:4px}
      table.frm{border-collapse:collapse;width:100%;margin:0}table.frm>tbody>tr>td,table.frm>tbody>tr>th{border:1px solid #333;padding:4px 6px;font-size:11px;vertical-align:top}
      table.frm th{background:#fff;font-weight:700;text-align:center}table.inner{border-collapse:collapse;width:100%}table.inner td,table.inner th{border:1px solid #333;padding:2px 5px;font-size:11px;text-align:center}
      .lbl{font-size:10px;font-weight:700}.big{font-weight:700;font-size:12px}.grid4 td,.grid4 th{text-align:center}
      table.items td,table.items th{font-size:11px}table.items .sz{width:34px}table.items .tot td{background:#f3f3f3}
      .words{border:1px solid #333;border-top:0;padding:5px 6px;font-size:11.5px;margin:0}
      table.foot td{font-size:11.5px;line-height:1.7}
      .sign{margin-top:44px;display:flex;gap:40px}.sign div{flex:1;border-top:1px solid #333;padding-top:6px;font-size:11px}.marks{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:12px}.mark{border:2px solid #222;padding:10px;page-break-inside:avoid;text-align:center}.mark table{margin-top:6px;font-size:12px}.mark th{width:90px;text-align:left}.mk-head{font-size:16px;font-weight:700}.mk-foot{margin-top:6px;font-size:11px;font-weight:700;letter-spacing:.08em}.mark svg{margin-top:6px}@media print{body{margin:12mm}}</style></head><body>${['Commercial Invoice', 'Packing List'].includes(type) ? '' : head}${body}<p style="margin-top:14px"><small>Generated by Afion ERP · ${esc(new Date().toLocaleString('en-IN'))}${formatNo ? ' · Format No. ' + esc(formatNo) : ''}</small></p><script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) throw new Error('Pop-up blocked — allow pop-ups to print documents');
    w.document.write(html); w.document.close();
  } catch (e) { toast.error(apiMessage(e)); }
}

/* ---------- box-wise packing editor (dispatch detail) ---------- */
export function BoxesEditor({ d }: { d: Dispatch }) {
  const qc = useQueryClient();
  const [rows, setRows] = React.useState<Box[]>([]);
  const [auto, setAuto] = React.useState({ pcsPerCarton: '', grossKg: '', netKg: '', dims: '' });
  const [dirty, setDirty] = React.useState(false);
  React.useEffect(() => { setRows((d.boxes ?? []).map((x) => ({ ...x, sizes: { ...(x.sizes || {}) } }))); setDirty(false); }, [d.boxes]);
  const inv = () => ['/dispatch', '/orders'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const build = useMutation({ mutationFn: async () => (await api.post(`/dispatch/${d.id}/boxes/auto`, { pcsPerCarton: auto.pcsPerCarton || undefined, grossKg: auto.grossKg || undefined, netKg: auto.netKg || undefined, dims: auto.dims || undefined })).data, onSuccess: (r: Dispatch) => { toast.success(`${r.cartons} cartons built from the colour × size grid`); inv(); }, onError: (e) => toast.error(apiMessage(e)) });
  const save = useMutation({ mutationFn: async () => (await api.put(`/dispatch/${d.id}/boxes`, { boxes: rows })).data, onSuccess: (r: Dispatch) => { toast.success(`Packing saved · ${r.cartons} cartons`); inv(); }, onError: (e) => toast.error(apiMessage(e)) });
  const sizes = [...new Set(rows.flatMap((x) => Object.keys(x.sizes)))];
  const n = (x: Box) => Math.max(x.to - x.from + 1, 1);
  const set = (i: number, patch: Partial<Box>) => { setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x))); setDirty(true); };
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-secondary px-4 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Box-wise packing · {fmtN(rows.reduce((a, x) => a + n(x), 0))} cartons · {fmtN(rows.reduce((a, x) => a + x.pcs * n(x), 0))} pcs</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Input className="h-7 w-24 text-xs" placeholder="pcs/ctn" value={auto.pcsPerCarton} onChange={(e) => setAuto({ ...auto, pcsPerCarton: e.target.value })} />
          <Input className="h-7 w-20 text-xs" placeholder="gross kg" value={auto.grossKg} onChange={(e) => setAuto({ ...auto, grossKg: e.target.value })} />
          <Input className="h-7 w-20 text-xs" placeholder="net kg" value={auto.netKg} onChange={(e) => setAuto({ ...auto, netKg: e.target.value })} />
          <Input className="h-7 w-24 text-xs" placeholder="60×40×40" value={auto.dims} onChange={(e) => setAuto({ ...auto, dims: e.target.value })} />
          <Button size="sm" variant="secondary" disabled={build.isPending} onClick={() => build.mutate()} title="Solid colour / solid size cartons from the order's colour × size grid"><Refresh size={13} /> Auto boxes</Button>
          <Button size="sm" variant="secondary" disabled={!rows.length || dirty} title="One label per carton with a Code 128 barcode (JAN when set on the order's colour × size grid)" onClick={() => printDoc(d.id, 'Carton Marks')}><Print size={13} /> Carton marks</Button>
        </div>
      </div>
      {!rows.length ? <div className="p-4 text-xs text-muted-foreground">No cartons yet — click <b>Auto boxes</b> (uses pcs per carton from the packing plan, or the value typed here) or add rows by hand.</div>
      : <div className="overflow-x-auto"><table className="w-full text-[11.5px]">
        <thead><tr className="text-[10px] font-bold uppercase text-muted-foreground"><th className="px-1 py-1">From</th><th className="px-1">To</th><th className="px-1 text-left">Style</th><th className="px-1 text-left">Code</th><th className="px-1 text-left">Colour</th>{sizes.map((s) => <th key={s} className="px-1">{s}</th>)}<th className="px-1">Pcs/ctn</th><th className="px-1">Gross</th><th className="px-1">Net</th><th className="px-1 text-left">Dims</th><th className="w-6" /></tr></thead>
        <tbody>{rows.map((x, i) => <tr key={i} className="border-t">
          <td className="p-0.5"><input type="number" className="num h-7 w-14 rounded border bg-card px-1 text-xs" value={x.from} onChange={(e) => set(i, { from: +e.target.value })} /></td>
          <td className="p-0.5"><input type="number" className="num h-7 w-14 rounded border bg-card px-1 text-xs" value={x.to} onChange={(e) => set(i, { to: +e.target.value })} /></td>
          <td className="p-0.5"><input className="h-7 w-20 rounded border bg-card px-1 text-xs" value={x.styleNo} onChange={(e) => set(i, { styleNo: e.target.value })} /></td>
          <td className="p-0.5"><input className="h-7 w-16 rounded border bg-card px-1 font-mono text-xs" value={x.colourCode} onChange={(e) => set(i, { colourCode: e.target.value })} /></td>
          <td className="p-0.5"><input className="h-7 w-20 rounded border bg-card px-1 text-xs" value={x.colour} onChange={(e) => set(i, { colour: e.target.value })} /></td>
          {sizes.map((s) => <td key={s} className="p-0.5 text-center"><input type="number" className="num h-7 w-12 rounded border bg-card px-1 text-center text-xs" value={x.sizes[s] ?? ''} onChange={(e) => { const sz = { ...x.sizes }; if (e.target.value === '') delete sz[s]; else sz[s] = +e.target.value; set(i, { sizes: sz, pcs: Object.values(sz).reduce((a, v) => a + (+v || 0), 0) }); }} /></td>)}
          <td className={cn('num px-1 text-center font-semibold')}>{x.pcs}</td>
          <td className="p-0.5"><input type="number" step="0.1" className="num h-7 w-14 rounded border bg-card px-1 text-xs" value={x.grossKg || ''} onChange={(e) => set(i, { grossKg: +e.target.value })} /></td>
          <td className="p-0.5"><input type="number" step="0.1" className="num h-7 w-14 rounded border bg-card px-1 text-xs" value={x.netKg || ''} onChange={(e) => set(i, { netKg: +e.target.value })} /></td>
          <td className="p-0.5"><input className="h-7 w-20 rounded border bg-card px-1 text-xs" value={x.dims} onChange={(e) => set(i, { dims: e.target.value })} /></td>
          <td className="p-0.5"><button type="button" className="text-muted-foreground hover:text-bad" onClick={() => { setRows(rows.filter((_, j) => j !== i)); setDirty(true); }}><Close size={12} /></button></td>
        </tr>)}</tbody>
      </table></div>}
      <div className="flex items-center justify-between border-t bg-secondary/40 px-3 py-1.5">
        <Button size="sm" variant="secondary" type="button" onClick={() => { const last = rows[rows.length - 1]; setRows([...rows, { from: last ? last.to + 1 : 1, to: last ? last.to + 1 : 1, styleNo: last?.styleNo || d.styleNo, colourCode: '', colour: '', sizes: {}, pcs: 0, grossKg: last?.grossKg || 0, netKg: last?.netKg || 0, dims: last?.dims || '' }]); setDirty(true); }}><Plus size={13} /> Add row</Button>
        <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}><Check size={13} /> Save packing</Button>
      </div>
    </div>
  );
}
