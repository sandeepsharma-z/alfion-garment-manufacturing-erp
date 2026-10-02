import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSave, useItem, fmtN, fmtInr, fmtDate, toInputDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, THead, TBody, Tr, Th, Td, Badge } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, StatusPill, OrderLink } from '@/components/shared';
import { Plus, Close, Check, Edit } from '@/icons/icons';
import type { Order } from './OrdersPage';

export type ColourRow = { code: string; name: string; qty?: number; cutQty?: number; sizes: { size: string; qty: number; cutQty?: number; barcode?: string }[] };
export type OrdersMeta = { stages: string[]; sizes: string[]; currencies: string[]; sizeSets: { name: string; sizes: string[] }[]; cutExtraPct: number; defaultCurrency: string; fxRate: number };
export const useOrdersMeta = (enabled = true) => useQuery<OrdersMeta>({ queryKey: ['/orders', 'meta'], queryFn: async () => (await api.get('/orders/meta')).data, enabled, staleTime: 60_000 });
export const fmtMoney = (v: number | undefined, cur: string) => (v == null ? '—' : cur === 'INR' ? fmtInr(v) : `${cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : cur === 'JPY' ? '¥' : cur + ' '}${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const rowQty = (r: ColourRow) => (r.sizes.length ? r.sizes.reduce((a, s) => a + (+s.qty || 0), 0) : +(r.qty || 0));

/** Colour × size matrix editor — buyer colour code, colour name, qty per size; totals per row / column; barcode per cell on demand. */
export function ColourGrid({ rows, setRows, sizes, cutExtraPct = 0, barcodes = false }: { rows: ColourRow[]; setRows: (r: ColourRow[]) => void; sizes: string[]; cutExtraPct?: number; barcodes?: boolean }) {
  const cell = (r: ColourRow, size: string) => r.sizes.find((s) => s.size === size);
  const setCell = (i: number, size: string, patch: Partial<{ qty: number; barcode: string }>) => setRows(rows.map((r, j) => {
    if (j !== i) return r;
    const has = r.sizes.some((s) => s.size === size);
    const next = has ? r.sizes.map((s) => (s.size === size ? { ...s, ...patch } : s)) : [...r.sizes, { size, qty: 0, ...patch }];
    return { ...r, sizes: sizes.map((s) => next.find((x) => x.size === s) ?? { size: s, qty: 0 }) };
  }));
  const total = rows.reduce((a, r) => a + rowQty(r), 0);
  const colTotal = (size: string) => rows.reduce((a, r) => a + (+(cell(r, size)?.qty || 0)), 0);
  const up = 1 + cutExtraPct / 100;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-[12.5px]">
        <thead><tr className="bg-secondary text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
          <th className="px-2 py-2 text-left">Colour code</th><th className="px-2 py-2 text-left">Colour name</th>
          {sizes.map((s) => <th key={s} className="px-1 py-2 text-center">{s}</th>)}
          <th className="px-2 py-2 text-right">Total</th><th className="px-2 py-2 text-right" title={`+${cutExtraPct}% cutting extra`}>Cut</th><th className="w-8" />
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="p-1"><Input className="h-8 w-24 font-mono text-xs" value={r.code} placeholder="B-01" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} /></td>
              <td className="p-1"><Input className="h-8 w-32 text-xs" value={r.name} placeholder="Navy" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></td>
              {sizes.map((s) => <td key={s} className="p-1 text-center">
                <input type="number" min={0} className="num h-8 w-14 rounded-md border bg-card px-1 text-center text-xs outline-none focus:border-brand" value={cell(r, s)?.qty || ''} placeholder="0" onChange={(e) => setCell(i, s, { qty: +e.target.value || 0 })} />
                {barcodes && <input className="mt-0.5 h-6 w-14 rounded border bg-card px-1 font-mono text-[9.5px] outline-none" placeholder="JAN" title="JAN / barcode for this style-colour-size" value={cell(r, s)?.barcode || ''} onChange={(e) => setCell(i, s, { barcode: e.target.value })} />}
              </td>)}
              <td className="num px-2 text-right font-semibold">{fmtN(rowQty(r))}</td>
              <td className="num px-2 text-right text-muted-foreground">{fmtN(Math.ceil(rowQty(r) * up))}</td>
              <td className="p-1"><button type="button" className="text-muted-foreground hover:text-bad" title="Remove colour" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Close size={14} /></button></td>
            </tr>))}
          <tr className="border-t bg-secondary/60 font-semibold"><td className="px-2 py-1.5" colSpan={2}>Total</td>
            {sizes.map((s) => <td key={s} className="num px-1 text-center">{fmtN(colTotal(s))}</td>)}
            <td className="num px-2 text-right">{fmtN(total)}</td><td className="num px-2 text-right text-muted-foreground">{fmtN(rows.reduce((a, r) => a + Math.ceil(rowQty(r) * up), 0))}</td><td /></tr>
        </tbody>
      </table>
      <div className="flex items-center justify-between border-t bg-secondary/40 px-2 py-1.5">
        <Button size="sm" variant="secondary" type="button" onClick={() => setRows([...rows, { code: '', name: '', sizes: sizes.map((s) => ({ size: s, qty: 0 })) }])}><Plus size={13} /> Add colour</Button>
        <span className="text-[11px] text-muted-foreground">Sizes come from the size set above · qty per colour = Σ sizes · cut qty = qty + {cutExtraPct}%</span>
      </div>
    </div>
  );
}

/** Size set picker: a named set from Settings or custom comma-separated sizes. */
export function SizeSetPicker({ value, onChange, sets }: { value: string[]; onChange: (s: string[]) => void; sets: { name: string; sizes: string[] }[] }) {
  const match = sets.find((s) => s.sizes.join(',') === value.join(','));
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="Size set" className="min-w-[180px]">
        <Select value={match ? match.name : 'custom'} onValueChange={(v) => { const s = sets.find((x) => x.name === v); if (s) onChange(s.sizes); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{sets.map((s) => <SelectItem key={s.name} value={s.name}>{s.name} · {s.sizes.join(' ')}</SelectItem>)}<SelectItem value="custom">Custom…</SelectItem></SelectContent>
        </Select>
      </Field>
      <Field label="Sizes (comma separated)" className="min-w-[240px] flex-1"><Input value={value.join(', ')} onChange={(e) => onChange(e.target.value.split(/[,/]/).map((s) => s.trim()).filter(Boolean))} placeholder="S, M, L, XL" /></Field>
    </div>
  );
}

/** Read-only colour × size matrix for the order page. */
export function ColourMatrixCard({ o, onEdit }: { o: Order; onEdit?: () => void }) {
  const sizes = o.sizeSet?.length ? o.sizeSet : o.sizes.map((s) => s.size);
  const rows = o.colours ?? [];
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div><CardTitle>Colour × Size Breakdown</CardTitle><p className="text-xs text-muted-foreground">{rows.length ? `${rows.length} colourway${rows.length > 1 ? 's' : ''} · buyer colour codes` : 'Size percentages from the order form'} · cutting +{o.cutExtraPct ?? 0}%</p></div>
        {onEdit && o.status === 'Open' && <Button size="sm" variant="secondary" onClick={onEdit}><Edit size={13} /> Revise</Button>}
      </CardHeader>
      <CardContent className="p-0">
        {!rows.length ? <div className="grid grid-cols-3 gap-2 p-4">{o.sizes.map((s) => <div key={s.size} className="rounded-lg border bg-secondary p-2 text-center"><div className="text-[10.5px] font-bold uppercase text-muted-foreground">{s.size}</div><div className="num font-semibold">{fmtN(s.qty)}</div><div className="text-[10px] text-muted-foreground">{s.pct}%</div></div>)}</div>
        : <Table>
          <THead><Tr className="hover:bg-transparent"><Th>Code</Th><Th>Colour</Th>{sizes.map((s) => <Th key={s} className="text-center">{s}</Th>)}<Th className="text-right">Qty</Th><Th className="text-right">Cut</Th></Tr></THead>
          <TBody>{rows.map((r, i) => <Tr key={i}><Td className="font-mono text-xs font-bold">{r.code || '—'}</Td><Td className="text-xs font-semibold">{r.name}</Td>
            {sizes.map((s) => { const c = r.sizes.find((x) => x.size === s); return <Td key={s} className="num text-center text-xs">{c?.qty ? fmtN(c.qty) : '·'}{c?.barcode && <div className="font-mono text-[9px] text-muted-foreground">{c.barcode}</div>}</Td>; })}
            <Td className="num text-right font-semibold">{fmtN(r.qty)}</Td><Td className="num text-right text-muted-foreground">{fmtN(r.cutQty)}</Td></Tr>)}
            <Tr className="bg-secondary/60 font-semibold hover:bg-secondary/60"><Td colSpan={2}>Total</Td>{sizes.map((s) => <Td key={s} className="num text-center text-xs">{fmtN(o.sizes.find((x) => x.size === s)?.qty || 0)}</Td>)}<Td className="num text-right">{fmtN(o.qty)}</Td><Td className="num text-right">{fmtN(o.cutQty)}</Td></Tr>
          </TBody>
        </Table>}
      </CardContent>
    </Card>
  );
}

/** Revise order: colour grid / price / dates / cancelled qty with a reason → revision entry on the order. */
export function RevisionDialog({ o, onClose }: { o: Order | null; onClose: () => void }) {
  const { hasFlag } = useAuth();
  const meta = useOrdersMeta(!!o);
  const [sizes, setSizes] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<ColourRow[]>([]);
  const [f, setF] = React.useState({ unitPrice: 0, fxRate: 1, shipDate: '', targetShipDate: '', deliveryDate: '', cancelledQty: 0, reason: '', qty: 0 });
  const save = useSave<Order>('/orders', ['/orders', `/orders/${o?.id}`, '/production', '/tna', '/buyer-orders'], (r) => { toast.success(`${r.orderNo} · revision ${r.revision}`); onClose(); });
  React.useEffect(() => {
    if (!o) return;
    setSizes(o.sizeSet?.length ? o.sizeSet : o.sizes.map((s) => s.size));
    setRows((o.colours ?? []).map((c) => ({ code: c.code, name: c.name, qty: c.qty, sizes: c.sizes.map((s) => ({ size: s.size, qty: s.qty, barcode: s.barcode })) })));
    setF({ unitPrice: o.unitPrice ?? 0, fxRate: o.fxRate ?? 1, shipDate: toInputDate(o.shipDate), targetShipDate: toInputDate(o.targetShipDate), deliveryDate: toInputDate(o.deliveryDate), cancelledQty: o.cancelledQty ?? 0, reason: '', qty: o.qty });
  }, [o]);
  if (!o) return null;
  const canRate = hasFlag('rates.view');
  const total = rows.reduce((a, r) => a + rowQty(r), 0);
  const submit = () => save.mutate({ id: o.id, body: {
    sizeSet: sizes, colours: rows.length ? rows : undefined, qty: rows.length ? undefined : f.qty, revisionReason: f.reason, cancelledQty: f.cancelledQty,
    shipDate: f.shipDate || undefined, targetShipDate: f.targetShipDate || undefined, deliveryDate: f.deliveryDate || undefined,
    ...(canRate ? { unitPrice: f.unitPrice, fxRate: f.fxRate } : {}),
  } });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent wide>
        <DialogHeader><DialogTitle>Revise {o.orderNo} · {o.styleNo}</DialogTitle><DialogDescription>Every change to quantity, colours, price or dates is logged as revision {(o.revision ?? 0) + 1} with your reason — the buyer's purchase-note revisions stay traceable.</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <SizeSetPicker value={sizes} onChange={(s) => { setSizes(s); setRows(rows.map((r) => ({ ...r, sizes: s.map((x) => r.sizes.find((y) => y.size === x) ?? { size: x, qty: 0 }) }))); }} sets={meta.data?.sizeSets ?? []} />
          <ColourGrid rows={rows} setRows={setRows} sizes={sizes} cutExtraPct={o.cutExtraPct ?? 0} barcodes />
          {!rows.length && <Field label="Order quantity (pcs)" hint="No colour rows — the order keeps its % size grid"><Input type="number" value={f.qty || ''} onChange={(e) => setF({ ...f, qty: +e.target.value })} /></Field>}
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {canRate && <Field label={`Unit price (${o.currency})`}><Input type="number" step="0.01" value={f.unitPrice || ''} onChange={(e) => setF({ ...f, unitPrice: +e.target.value })} /></Field>}
            {canRate && o.currency !== 'INR' && <Field label="Exchange rate (₹)"><Input type="number" step="0.01" value={f.fxRate || ''} onChange={(e) => setF({ ...f, fxRate: +e.target.value })} /></Field>}
            <Field label="Contracted ship date"><Input type="date" value={f.shipDate} onChange={(e) => setF({ ...f, shipDate: e.target.value })} /></Field>
            <Field label="Buyer target (latest shipment)"><Input type="date" value={f.targetShipDate} onChange={(e) => setF({ ...f, targetShipDate: e.target.value })} /></Field>
            <Field label="Delivery date"><Input type="date" value={f.deliveryDate} onChange={(e) => setF({ ...f, deliveryDate: e.target.value })} /></Field>
            <Field label="Cancelled / short-shipped (pcs)"><Input type="number" value={f.cancelledQty || ''} onChange={(e) => setF({ ...f, cancelledQty: +e.target.value })} /></Field>
          </div>
          <Field label="Reason for revision" hint="Written into the revision history and the order activity"><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Buyer revised colour split on 12 Sep · qty +200 in Navy" /></Field>
          <div className="rounded-lg border bg-secondary/60 px-3 py-2 text-[12px]">New total <b>{fmtN(rows.length ? total : f.qty)}</b> pcs{canRate ? <> · value <b>{fmtMoney((rows.length ? total : f.qty) * f.unitPrice, o.currency)}</b>{o.currency !== 'INR' && <> = <b>{fmtInr(Math.round((rows.length ? total : f.qty) * f.unitPrice * f.fxRate))}</b></>}</> : null}</div>
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={save.isPending || (rows.length ? total < 1 : f.qty < 1)} onClick={submit}><Check size={15} /> Save revision</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type Shipment = { no: number; dispatchId: string; invoiceNo: string; invoiceDate: string; qty: number; awb: string; mode: string; status: string; shippedAt?: string; cartons: number };
export type ShipTrack = { orderId: string; orderNo: string; styleNo: string; buyerOrderNo: string; buyerPoNo: string; qty: number; shipments: Shipment[]; shippedQty: number; cancelledQty: number; balanceQty: number; shortQty: number;
  shipDate?: string; targetShipDate?: string; lastShippedAt?: string | null; onTime: boolean | null; balanceValueFx?: number; currency: string; order?: Order };

/** Ship-1…n per order line with balance — same columns as the client's Shipping Track sheet. */
export function ShippingTrackTable({ rows, showOrder = true }: { rows: ShipTrack[]; showOrder?: boolean }) {
  const maxShip = Math.max(1, ...rows.map((r) => r.shipments.length));
  const cols = Array.from({ length: Math.min(maxShip, 6) }, (_, i) => i + 1);
  return (
    <Table>
      <THead><Tr className="hover:bg-transparent">{showOrder && <Th>Order line</Th>}<Th>Buyer PO</Th><Th className="text-right">Order qty</Th><Th>Contracted · Target</Th>
        {cols.map((n) => <Th key={n} className="text-right">Ship {n}</Th>)}<Th className="text-right">Shipped</Th><Th className="text-right">Cancelled</Th><Th className="text-right">Balance</Th><Th>On time</Th></Tr></THead>
      <TBody>{rows.map((r) => (
        <Tr key={r.orderId}>
          {showOrder && <Td><OrderLink id={r.orderId} className="font-mono text-xs font-bold text-brand hover:underline">{r.orderNo}</OrderLink><div className="text-[11px] text-muted-foreground">{r.styleNo}</div></Td>}
          <Td className="text-xs">{r.buyerOrderNo || r.buyerPoNo || '—'}</Td>
          <Td className="num text-right font-semibold">{fmtN(r.qty)}</Td>
          <Td className="text-xs">{fmtDate(r.shipDate)}{r.targetShipDate ? <div className="text-[10.5px] text-muted-foreground">target {fmtDate(r.targetShipDate)}</div> : null}</Td>
          {cols.map((n) => { const s = r.shipments[n - 1]; return <Td key={n} className="text-right text-xs">{s ? <><div className="num font-semibold">{fmtN(s.qty)}</div><div className="font-mono text-[10px] text-muted-foreground" title={`${s.invoiceNo} · ${s.status}`}>{s.invoiceNo.split('/').pop()}{s.awb ? ` · ${s.awb}` : ''}</div></> : '·'}</Td>; })}
          <Td className="num text-right font-semibold text-teal">{fmtN(r.shippedQty)}</Td>
          <Td className={cn('num text-right', r.cancelledQty && 'text-bad')}>{r.cancelledQty ? fmtN(r.cancelledQty) : '—'}</Td>
          <Td className={cn('num text-right font-semibold', r.balanceQty ? 'text-brand' : 'text-muted-foreground')}>{fmtN(r.balanceQty)}{r.balanceValueFx != null && r.balanceQty > 0 && <div className="text-[10px] font-normal text-muted-foreground">{fmtMoney(r.balanceValueFx, r.currency)}</div>}</Td>
          <Td>{r.onTime == null ? <Badge tone="mute">{r.balanceQty ? 'Open' : '—'}</Badge> : <Badge tone={r.onTime ? 'ok' : 'bad'}>{r.onTime ? 'On time' : 'Late'}</Badge>}</Td>
        </Tr>))}</TBody>
    </Table>
  );
}

/** Revision history card */
export function RevisionsCard({ o }: { o: Order }) {
  const revs = [...(o.revisions ?? [])].reverse();
  return (
    <Card>
      <CardHeader><CardTitle>Order Revisions · Rev {o.revision ?? 0}</CardTitle></CardHeader>
      <CardContent>
        {!revs.length ? <div className="text-sm text-muted-foreground">No revisions — the order is as confirmed.</div>
        : <div className="space-y-2">{revs.map((r) => <div key={r.no} className="rounded-lg border bg-secondary/60 p-2.5 text-[12px]">
          <div className="flex items-center justify-between"><b>Revision {r.no}</b><span className="text-[11px] text-muted-foreground">{r.by} · {fmtDate(r.at)}</span></div>
          {r.reason && <div className="mt-0.5 text-muted-foreground">{r.reason}</div>}
          <ul className="mt-1 space-y-0.5">{r.changes.map((c, i) => <li key={i}><span className="font-mono text-[10.5px] uppercase text-muted-foreground">{c.field}</span> {c.from || '—'} → <b>{c.to || '—'}</b></li>)}</ul>
        </div>)}</div>}
      </CardContent>
    </Card>
  );
}

type WipRow = { materialId: string; code: string; name: string; uom: string; part: string; colour: string; required: number; ordered: number; received: number; rejected: number; usable: number; balance: number;
  pos: { poNo: string; qty: number; received: number; eta?: string; status: string; supplier: string }[]; lots: { lotNo: string; colour: string; thans: number; tagLength: number; actualLength: number; tagWidth: number; actualWidth: number; gsm: number; grnNo: string; date: string; supplier: string }[];
  holds: { inspNo: string; lot: string; qty: number; result: string; hold: boolean }[] };

/** Fabric WIP — dyeing lots per fabric line: required → ordered → received (lot-wise) → rejected / on hold → balance. */
export function FabricWipCard({ orderId }: { orderId: string }) {
  const { data } = useItem<{ hasBom: boolean; rows: WipRow[] }>(`/orders/${orderId}/fabric-wip`);
  const [open, setOpen] = React.useState<string | null>(null);
  if (!data?.hasBom || !data.rows.length) return null;
  return (
    <Card>
      <CardHeader><div><CardTitle>Fabric WIP — Dyeing Lots</CardTitle><p className="text-xs text-muted-foreground">Per fabric line: required (colour / size-wise on cut qty) · ordered · received lot-wise with on-tag vs actual · rejected or on hold · balance</p></div></CardHeader>
      <CardContent className="p-0">
        <Table>
          <THead><Tr className="hover:bg-transparent"><Th>Fabric</Th><Th>Part · Colour</Th><Th className="text-right">Required</Th><Th className="text-right">Ordered</Th><Th className="text-right">Received</Th><Th className="text-right">Rejected / hold</Th><Th className="text-right">Balance</Th><Th>Lots</Th></Tr></THead>
          <TBody>{data.rows.map((r) => <React.Fragment key={`${r.materialId}-${r.colour}`}>
            <Tr className="cursor-pointer" onClick={() => setOpen(open === r.code + r.colour ? null : r.code + r.colour)}>
              <Td><div className="text-xs font-semibold">{r.name}</div><div className="font-mono text-[11px] text-muted-foreground">{r.code}</div></Td>
              <Td className="text-xs">{r.part || '—'}{r.colour ? ` · ${r.colour}` : ' · all colours'}</Td>
              <Td className="num text-right font-semibold">{fmtN(r.required)} <span className="text-[10px] text-muted-foreground">{r.uom}</span></Td>
              <Td className="num text-right">{fmtN(r.ordered)}</Td><Td className="num text-right text-teal">{fmtN(r.received)}</Td>
              <Td className={cn('num text-right', r.rejected && 'text-bad')}>{r.rejected ? fmtN(r.rejected) : '—'}</Td>
              <Td className={cn('num text-right font-semibold', r.balance ? 'text-bad' : 'text-teal')}>{r.balance ? fmtN(r.balance) : 'Complete'}</Td>
              <Td className="text-xs">{r.lots.length} lot{r.lots.length === 1 ? '' : 's'} · {r.pos.length} PO</Td>
            </Tr>
            {open === r.code + r.colour && <Tr className="hover:bg-transparent"><Td colSpan={8} className="bg-secondary/50 p-3">
              {!r.lots.length ? <div className="text-xs text-muted-foreground">Nothing received yet.{r.pos.length ? ` POs: ${r.pos.map((p) => `${p.poNo} ${fmtN(p.qty)} (${p.status})`).join(', ')}` : ''}</div>
              : <table className="w-full text-[11.5px]"><thead><tr className="text-[10px] uppercase text-muted-foreground"><th className="text-left">GRN · Lot</th><th className="text-left">Colour</th><th className="text-right">Thans</th><th className="text-right">Tag length</th><th className="text-right">Actual</th><th className="text-right">Tag width</th><th className="text-right">Actual</th><th className="text-right">GSM</th><th className="text-left">Supplier · date</th></tr></thead>
                <tbody>{r.lots.map((l, i) => <tr key={i} className="border-t"><td className="font-mono">{l.grnNo}{l.lotNo && l.lotNo !== l.grnNo ? ` · ${l.lotNo}` : ''}</td><td>{l.colour || '—'}</td><td className="num text-right">{l.thans || '—'}</td><td className="num text-right">{l.tagLength || '—'}</td><td className={cn('num text-right font-semibold', l.tagLength && l.actualLength < l.tagLength && 'text-bad')}>{l.actualLength}</td><td className="num text-right">{l.tagWidth || '—'}</td><td className={cn('num text-right', l.tagWidth && l.actualWidth < l.tagWidth && 'text-bad')}>{l.actualWidth || '—'}</td><td className="num text-right">{l.gsm || '—'}</td><td>{l.supplier} · {fmtDate(l.date)}</td></tr>)}</tbody></table>}
              {r.holds.length > 0 && <div className="mt-2 text-[11.5px] text-bad">On hold / failed: {r.holds.map((h) => `${h.inspNo}${h.lot ? ` lot ${h.lot}` : ''} ${fmtN(h.qty)} ${r.uom} (${h.result}${h.hold ? ', hold' : ''})`).join(' · ')}</div>}
            </Td></Tr>}
          </React.Fragment>)}</TBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function ShipmentStatus({ s }: { s: Shipment }) { return <StatusPill value={s.status} />; }
