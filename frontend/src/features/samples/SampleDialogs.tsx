import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/AuthProvider';
import { useList, useSave, useAction, toInputDate, uploadFile } from '@/lib/crud';
import { apiMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, AuthImg } from '@/components/shared';
import { openFile } from '@/lib/crud';
import { useCustomFields, CustomFieldsGrid } from '@/components/CustomFields';
import { Check, Login, Alert, Refresh, Upload, Plus, Trash, FileIcon, Eye } from '@/icons/icons';
import { ColourGrid, SizeSetPicker, useOrdersMeta, rowQty, fmtMoney, type ColourRow } from '@/features/orders/OrderCommercial';
type BuyerOrderLite = { id: string; poNo: string; currency: string; fxRate?: number; terms: string; latestShipment?: string; deliveryDate?: string; salesMonth: string; lines: number };

export type Photo = { fileId: string; fileName?: string };
export type Piece = { fileId?: string; fileName?: string; photos?: Photo[]; description: string; fabric: string; colour: string; sizes: string; qty: number; notes: string };
export type Courier = { method: string; awb: string; receiver: string; notes: string };
export type Sample = {
  id: string; sampleNo: string; styleNo: string; styleId?: string; description: string; buyerId: string; buyerName: string;
  type: string; pieces: number; colourways: number; fabric: string; colour: string; sizeRange: string; accessories: string;
  targetDate?: string; notes: string; priority: string; status: string; round: number; merchandiser: string; swatch: string;
  items?: Piece[]; courier?: Courier; custom?: Record<string, unknown>;
  rounds: { no: number; title: string; type: string; sentOn?: string; awb?: string; courier?: string; comment?: string; result: string; size?: string; measurements?: { code: string; measured?: number; instruction?: string; revised?: number }[]; dueDate?: string; pcsPerColour?: number; actualSentOn?: string; commentsOn?: string }[];
  specSheets: { version: number; kind: string; fileId?: string; fileName: string; by: string; at: string }[];
  specSheet: { version: number; kind: string; fileId?: string; fileName: string } | null;
  approvedAt?: string; approvedBy?: string; orderId?: string; orderNo?: string;
  tracking?: { articleNo?: string; factory?: string; processes?: string; colourQtyOn?: string; bomOn?: string; techPackOn?: string; artworkOn?: string; ccMaterial?: string; remarks?: string };
  costing?: import('./CostingSheet').Costing;
  materials?: import('./MaterialSheet').MatLine[];
  materialPlan?: import('./MaterialSheet').MatPlan;
};
type Buyer = { id: string; displayName: string };

const TYPES = ['Proto Sample', 'Fit Sample', 'Revised Fit Sample', 'Size Set', 'PP Sample', 'Exhibition Sample', 'Salesman Sample', 'Photoshoot Sample', 'SMS (1st of bulk)', 'TOP Sample'];
export const COURIERS = ['DHL Express', 'FedEx', 'UPS', 'Blue Dart', 'Aramex', 'DTDC', 'India Post EMS', 'Hand carry', 'Other'];
const FABRICS = ['Cotton Poplin', 'Cotton Twill', 'Cotton Cambric', 'Chambray', 'Linen', 'Linen Blend', 'Rayon', 'Viscose', 'Modal', 'Denim', 'Corduroy', 'Single Jersey', 'Pique', 'Fleece', 'French Terry', 'Georgette', 'Satin', 'Crepe', 'Polyester', 'Lycra Blend', 'Wool Blend'];
const SIZE_CHIPS = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'F'];   // F = free size
const SIZE_TITLE: Record<string, string> = { F: 'Free size (one size fits all)' };
const C0: Courier = { method: '', awb: '', receiver: '', notes: '' };
const S0 = { buyerId: '', styleNo: '', description: '', type: 'Proto Sample', sizeRange: 'S – 3XL', accessories: '', targetDate: '', priority: 'Normal', notes: '', courier: C0 };
const SPEC_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp';
type SpecDraft = { fileId?: string; name: string; size: number; preview?: string; uploading?: boolean };
const P0: Piece = { description: '', fabric: '', colour: '', sizes: '', qty: 1, notes: '' };
/* local draft of a piece: preview = object URL while the photo is still uploading / just picked */
type Draft = Piece & { key: string; preview?: string; uploading?: boolean; size?: number };
const fmtMb = (n?: number) => (!n ? '' : n < 1048576 ? `${Math.max(Math.round(n / 1024), 1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

/* ---------- round events: sent to buyer / buyer feedback ---------- */
export function RoundDialog({ target, onClose }: { target: { s: Sample; mode: 'sent' | 'feedback' } | null; onClose: () => void }) {
  const [awb, setAwb] = React.useState('');
  const [courier, setCourier] = React.useState('');
  const [sentOn, setSentOn] = React.useState(new Date().toISOString().slice(0, 10));
  const [comment, setComment] = React.useState('');
  const [nextType, setNextType] = React.useState('Fit Sample');
  const act = useAction<Sample>(['/samples'], (s) => { toast.success(`${s.sampleNo} → ${s.status}`); onClose(); });
  React.useEffect(() => { setAwb(target?.s.courier?.awb || ''); setCourier(target?.s.courier?.method || ''); setComment(''); setSentOn(new Date().toISOString().slice(0, 10)); }, [target]);
  if (!target) return null;
  const { s, mode } = target;
  const fire = (action: string) => act.mutate({ url: `/samples/${s.id}/round`, body: { action, awb, sentOn, comment, type: nextType, courier } });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'sent' ? `Round ${s.round} — sent to buyer` : `Round ${s.round} — buyer feedback`}</DialogTitle>
          <DialogDescription>{s.sampleNo} · {s.styleNo} · {s.buyerName}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {mode === 'sent' ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Sent On"><Input type="date" value={sentOn} onChange={(e) => setSentOn(e.target.value)} /></Field>
              <Field label="Courier"><Select value={courier || undefined} onValueChange={setCourier}><SelectTrigger><SelectValue placeholder="Select courier" /></SelectTrigger>
                <SelectContent>{COURIERS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="AWB / tracking no"><Input value={awb} onChange={(e) => setAwb(e.target.value)} placeholder="1234567890" /></Field>
              {s.items?.length ? <p className="text-[11.5px] text-muted-foreground sm:col-span-3">Sending {s.items.length} piece{s.items.length > 1 ? 's' : ''} · {s.pieces} pcs{s.courier?.receiver ? ` · to ${s.courier.receiver}` : ''}</p> : null}
            </div>
          ) : (
            <>
              <Field label="Buyer Comment"><Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. sleeve length +2cm, collar reshape" /></Field>
              {s.status !== 'Rejected' && (
                <Field label="If changes requested — next round sample type"><Select value={nextType} onValueChange={setNextType}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Field>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter className="flex-wrap">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {mode === 'sent' && <Button disabled={act.isPending} onClick={() => fire('sent')}><Login size={16} /> Mark as Sent</Button>}
          {mode === 'feedback' && s.status !== 'Rejected' && <>
            <Button variant="destructive" disabled={act.isPending} onClick={() => fire('rejected')}><Alert size={16} /> Rejected</Button>
            <Button variant="secondary" disabled={act.isPending} onClick={() => fire('changes')}><Refresh size={16} /> Changes → Round {s.round + 1}</Button>
            <Button className="from-teal to-teal text-white" disabled={act.isPending} onClick={() => fire('approved')}><Check size={16} /> Approved</Button>
          </>}
          {mode === 'feedback' && s.status === 'Rejected' && <Button disabled={act.isPending} onClick={() => fire('reopen')}><Refresh size={16} /> Reopen Sampling</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- convert approved sample → order (carried fields locked) ---------- */
const SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'];
export function ConvertDialog({ sample, onClose }: { sample: Sample | null; onClose: () => void }) {
  const nav = useNavigate();
  const { hasFlag } = useAuth();
  const [f, setF] = React.useState({ qty: 12000, cutQty: 12000, buyerPoNo: '', fobRate: 0, shipDate: '', paymentTerms: 'Letter of Credit (LC) — 60 days', mode: 'Sea', priority: 'Normal', instructions: '',
    buyerOrderId: '', currency: 'USD', unitPrice: 0, firstPrice: 0, fxRate: 83, targetShipDate: '', deliveryDate: '', salesMonth: '', cutExtraPct: 5 });
  const [pcts, setPcts] = React.useState([12, 24, 28, 22, 10, 4]);
  const [sizes, setSizes] = React.useState<string[]>(SIZES);
  const [rows, setRows] = React.useState<ColourRow[]>([]);
  const meta = useOrdersMeta(!!sample);
  const bos = useList<BuyerOrderLite>('/buyer-orders', { size: 200, status: 'Open', buyerId: sample?.buyerId }, !!sample);
  const cf = useCustomFields('orders', null, sample?.id ?? 'none');
  const act = useAction<{ id: string; orderNo: string }>(['/samples', '/orders', '/buyer-orders'], (o) => { toast.success(`Order ${o.orderNo} created`); onClose(); nav(`/orders/${o.id}`); });
  React.useEffect(() => { setF((x) => ({ ...x, buyerPoNo: '', instructions: '', buyerOrderId: '' })); setRows([]); }, [sample]);
  React.useEffect(() => { if (meta.data) setF((x) => ({ ...x, currency: meta.data!.defaultCurrency || x.currency, fxRate: meta.data!.fxRate || x.fxRate, cutExtraPct: meta.data!.cutExtraPct ?? x.cutExtraPct })); }, [meta.data]);
  /* the costing sheet already worked out the price per piece — carry it into the order instead of asking again */
  React.useEffect(() => {
    const c = sample?.costing;
    if (!c?.totals?.final) return;
    setF((x) => ({ ...x, currency: c.currency || x.currency, fxRate: c.exchangeRate || x.fxRate, unitPrice: x.unitPrice || c.totals!.finalFx || x.unitPrice, firstPrice: x.firstPrice || c.targetPrice || c.totals!.finalFx || x.firstPrice }));
  }, [sample]);
  const bo = (bos.data?.items ?? []).find((b) => b.id === f.buyerOrderId);
  React.useEffect(() => { if (bo) setF((x) => ({ ...x, buyerPoNo: bo.poNo, currency: bo.currency || x.currency, fxRate: bo.fxRate || x.fxRate, paymentTerms: bo.terms || x.paymentTerms, shipDate: bo.latestShipment ? bo.latestShipment.slice(0, 10) : x.shipDate, deliveryDate: bo.deliveryDate ? bo.deliveryDate.slice(0, 10) : x.deliveryDate, salesMonth: bo.salesMonth || x.salesMonth })); }, [bo]);
  if (!sample) return null;
  const colourQty = rows.reduce((a, r) => a + rowQty(r), 0);
  const qtyFinal = rows.length ? colourQty : f.qty;
  const canRate = hasFlag('rates.view');
  const inrRate = f.currency === 'INR' ? f.unitPrice : f.unitPrice * f.fxRate;
  const carried: [string, string][] = [['Client / Buyer', sample.buyerName], ['Style Number', sample.styleNo], ['Sample Number', sample.sampleNo],
    ['Sample Revision', `Round ${sample.round}`], ['Product', sample.description], ['Fabric', sample.fabric || '—'], ['Colour', sample.colour || '—'],
    ['Size Range', sample.sizeRange], ['Accessories', sample.accessories || '—'],
    ['Specification Sheet', sample.specSheet ? `${sample.specSheet.fileName} · v${sample.specSheet.version}` : 'Not attached yet']];
  const total = pcts.reduce((a, b) => a + b, 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide meta={cf.meta}>
        <DialogHeader>
          <DialogTitle>Convert Sample to Order</DialogTitle>
          <DialogDescription>Carried over from approved sample {sample.sampleNo} — enter only the commercial terms</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          {!sample.specSheet && (
            <div className="rounded-xl border border-gold-vivid/40 bg-gold-soft px-4 py-3 text-[12.5px] text-gold dark:bg-gold-vivid/10 dark:text-gold-vivid">
              <b>No specification sheet yet.</b> You can still create the order and attach the sheet from the sample later — the Control Tower will flag it.
            </div>
          )}
          <div className="overflow-hidden rounded-xl border">
            <div className="border-b bg-secondary px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Carried from sample — locked</div>
            <table className="w-full text-[13px]"><tbody>
              {carried.map(([k, v]) => <tr key={k} className="border-b last:border-0"><td className="w-44 px-4 py-1.5 text-muted-foreground">{k}</td><td className="px-4 py-1.5 font-semibold">{v}</td></tr>)}
            </tbody></table>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Buyer order (purchase note)" hint="optional — groups style lines under one buyer PO"><Select value={f.buyerOrderId || 'none'} onValueChange={(v) => setF({ ...f, buyerOrderId: v === 'none' ? '' : v })}><SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent><SelectItem value="none">None — single style order</SelectItem>{(bos.data?.items ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.poNo} · {b.currency} · {b.lines} line{b.lines === 1 ? '' : 's'}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Buyer PO No"><Input value={f.buyerPoNo} onChange={(e) => setF({ ...f, buyerPoNo: e.target.value })} /></Field>
            <Field label="Sales month"><Input type="month" value={f.salesMonth} onChange={(e) => setF({ ...f, salesMonth: e.target.value })} /></Field>
            {canRate && <Field label="Currency"><Select value={f.currency} onValueChange={(v) => setF({ ...f, currency: v, fxRate: v === 'INR' ? 1 : f.fxRate })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(meta.data?.currencies ?? ['USD', 'INR']).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field>}
            {canRate && <Field label={`Unit price / pc (${f.currency})`} hint={sample?.costing?.totals?.final ? `costing says ${sample.costing.totals.finalFx} ${sample.costing.currency} / pc${f.currency !== 'INR' ? ` · = ₹${inrRate.toFixed(2)} FOB` : ''}` : f.currency !== 'INR' ? `= ₹${inrRate.toFixed(2)} FOB at ${f.fxRate}` : undefined}><Input type="number" step="0.01" value={f.unitPrice || ''} onChange={(e) => setF({ ...f, unitPrice: +e.target.value, firstPrice: f.firstPrice || +e.target.value })} /></Field>}
            {canRate && <Field label="First quoted price" hint="1st price vs final price"><Input type="number" step="0.01" value={f.firstPrice || ''} onChange={(e) => setF({ ...f, firstPrice: +e.target.value })} /></Field>}
            {canRate && f.currency !== 'INR' && <Field label="Exchange rate (₹ per unit)"><Input type="number" step="0.01" value={f.fxRate || ''} onChange={(e) => setF({ ...f, fxRate: +e.target.value })} /></Field>}
            <Field label="Ship Date (contracted)"><Input type="date" value={f.shipDate} onChange={(e) => setF({ ...f, shipDate: e.target.value })} /></Field>
            <Field label="Buyer target (latest shipment)"><Input type="date" value={f.targetShipDate} onChange={(e) => setF({ ...f, targetShipDate: e.target.value })} /></Field>
            <Field label="Delivery date"><Input type="date" value={f.deliveryDate} onChange={(e) => setF({ ...f, deliveryDate: e.target.value })} /></Field>
            <Field label="Payment Terms"><Select value={f.paymentTerms} onValueChange={(v) => setF({ ...f, paymentTerms: v })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{['Letter of Credit (LC) — 60 days', 'LC at sight', 'LC — 90 days', 'T/T — 30% advance', 'T/T — 100% against documents'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Shipment Mode"><Select value={f.mode} onValueChange={(v) => setF({ ...f, mode: v })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="Sea">By Sea</SelectItem><SelectItem value="Air">By Air</SelectItem></SelectContent></Select></Field>
            <Field label="Priority"><Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{['Urgent', 'High', 'Normal', 'Low'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Field>
          </div>
          <div className="space-y-3 rounded-xl border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Colour-wise quantity (buyer colour codes × sizes)</div>
              <Field label="Cutting extra %" className="w-28"><Input type="number" value={f.cutExtraPct} onChange={(e) => setF({ ...f, cutExtraPct: +e.target.value })} /></Field></div>
            <SizeSetPicker value={sizes} onChange={(s) => { setSizes(s); setRows(rows.map((r) => ({ ...r, sizes: s.map((x) => r.sizes.find((y) => y.size === x) ?? { size: x, qty: 0 }) }))); }} sets={meta.data?.sizeSets ?? []} />
            <ColourGrid rows={rows} setRows={setRows} sizes={sizes} cutExtraPct={f.cutExtraPct} />
            <div className="text-[11.5px] text-muted-foreground">{rows.length ? <>Order quantity <b>{colourQty.toLocaleString('en-IN')}</b> pcs from {rows.length} colour{rows.length > 1 ? 's' : ''} · cutting {rows.reduce((a, r) => a + Math.ceil(rowQty(r) * (1 + f.cutExtraPct / 100)), 0).toLocaleString('en-IN')} pcs{canRate ? <> · value {fmtMoney(colourQty * f.unitPrice, f.currency)}</> : null}</> : 'No colour rows — enter a total quantity and size % below instead.'}</div>
          </div>
          {!rows.length && <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Order Quantity (pcs)"><Input type="number" value={f.qty} onChange={(e) => setF({ ...f, qty: +e.target.value, cutQty: Math.ceil(+e.target.value * (1 + f.cutExtraPct / 100)) })} /></Field>
            <Field label="Cutting Quantity (pcs)"><Input type="number" value={f.cutQty} onChange={(e) => setF({ ...f, cutQty: +e.target.value })} /></Field>
          </div>}
          {!rows.length && <Field label={`Size Breakdown % — total ${total}%`} hint={total !== 100 ? 'Percentages should add up to 100' : undefined}>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {SIZES.map((s, i) => (
                <div key={s} className={cn('rounded-lg border bg-secondary p-2 text-center', total !== 100 && 'border-gold-vivid/50')}>
                  <div className="text-[10.5px] font-bold uppercase text-muted-foreground">{s}</div>
                  <input type="number" value={pcts[i]} onChange={(e) => setPcts(pcts.map((p, j) => (j === i ? +e.target.value : p)))}
                    className="num mt-1 w-full bg-transparent text-center font-semibold outline-none" />
                  <div className="text-[10px] text-muted-foreground">{Math.round(f.qty * pcts[i] / (total || 100)).toLocaleString('en-IN')} pcs</div>
                </div>
              ))}
            </div>
          </Field>}
          <Field label="Special Instructions"><Input value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} placeholder="Wash, print, embroidery, packing instructions…" /></Field>
          {cf.node}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={act.isPending || !qtyFinal || !cf.ok} onClick={() => act.mutate({ url: `/samples/${sample.id}/convert`, body: { ...f, custom: cf.value, sizePcts: pcts, sizeSet: sizes, colours: rows.length ? rows : undefined, qty: qtyFinal,
            shipDate: f.shipDate || undefined, targetShipDate: f.targetShipDate || undefined, deliveryDate: f.deliveryDate || undefined, buyerOrderId: f.buyerOrderId || undefined, fobRate: undefined } })}>
            <Check size={16} /> {act.isPending ? 'Creating…' : 'Create Order'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
