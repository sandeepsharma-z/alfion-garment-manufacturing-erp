import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useList, uploadFile, openFile, fmtN, fmtInr, fmtDate, toInputDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { useCustomFields } from '@/components/CustomFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton, Table, THead, TBody, Tr, Th, Td, Badge } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader, KpiTile, Toolbar, Field, StatusPill, EmptyState, OrderLink } from '@/components/shared';
import { AlertStrip } from '@/components/AlertStrip';
import { Ship, Plane, FileIcon, Plus, Eye, Print, Upload, Check, Download, Dispatch as TruckIcon } from '@/icons/icons';
import { printDoc, BoxesEditor, type Box } from './ExportDocs';

export type Dispatch = { id: string; invoiceNo: string; orderId: string; orderNo: string; buyerName: string; buyerPoNo: string; styleNo: string; description: string; invoiceDate: string; mode: string; portOfLoading: string; portOfDischarge: string; route: string; incoterm: string;
  qty: number; cartons: number; grossWeightKg: number; netWeightKg: number; currency: string; invoiceValue?: number; hsnCode: string; paymentMethod: string; paymentTerms: string; status: string; docsPending: string[]; docsDone: number;
  documents: { type: string; status: string; number?: string; fileId?: string; fileName?: string; at?: string; by?: string }[]; tracking: { key: string; title: string; detail?: string; at?: string; done: boolean }[];
  vesselOrFlight: string; blOrAwbNo: string; containerNo: string; sealNo: string; shippingBillNo: string; ewayBillNo: string; transporter: string; eta?: string; remarks: string;
  lines?: { orderId: string; orderNo: string; buyerPoNo: string; styleNo: string; description: string; colour: string; hsCode: string; qty: number; unitPrice?: number; currency: string; amountFx?: number; amountInr?: number }[]; lineCount?: number; boxes?: Box[];
  fxRate?: number; totalFx?: number; taxableInr?: number; igstPct?: number; igstInr?: number; totalInr?: number; amountInWords?: string; amountInWordsFx?: string; buyerOrderNo?: string; consignee?: { name: string; address: string; country: string }; notifyParty?: string;
  preCarriage?: string; placeOfReceipt?: string; finalDestination?: string; countryOfOrigin?: string; lcNo?: string; lcDate?: string; reverseCharge?: boolean;
  advanceFx?: number; proformaNo?: string; cartonDims?: string; marksAndNos?: string };
type Meta = { docTypes: string[]; generated: string[]; statuses: string[]; track: { key: string; title: string }[]; incoterms: string[]; ports: string[]; igstPct?: number; fxRate?: number; defaultCurrency?: string; formatNos?: Record<string, string> };
type Summary = { financialYear: string; shipments: number; air: number; sea: number; airPct: number; docsPending: number; inTransit: number; drafts: string[]; ports: string[] };
type OrderLite = { id: string; orderNo: string; styleNo: string; buyerName: string; qty: number; mode: string; shipDate?: string; pcsPerCarton: number; paymentTerms: string };
const CHIPS = ['All', 'Air', 'Sea', 'Docs In Progress', 'Ready to Ship', 'Shipped On Board', 'In Transit', 'Delivered'];

export default function DispatchPage() {
  const { hasFlag } = useAuth();
  const showValue = hasFlag('rates.view');
  const [q, setQ] = React.useState('');
  const [chip, setChip] = React.useState('All');
  const [sp, setSp] = useSearchParams();
  const presetOrder = sp.get('order') || '';
  const [creating, setCreating] = React.useState(!!presetOrder);
  React.useEffect(() => { if (presetOrder) setCreating(true); }, [presetOrder]);
  const [view, setView] = React.useState<Dispatch | null>(null);
  const list = useList<Dispatch>('/dispatch', { size: 500 });
  const sum = useQuery<Summary>({ queryKey: ['/dispatch', 'summary'], queryFn: async () => (await api.get('/dispatch/summary')).data });
  const all = list.data?.items ?? [];
  const rows = all.filter((d) => (!q || `${d.invoiceNo} ${d.orderNo} ${d.buyerName} ${d.route}`.toLowerCase().includes(q.toLowerCase())) && (chip === 'All' || d.mode === chip || d.status === chip));
  const s = sum.data;
  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Dispatch & Export Documents" sub="Export invoice, packing list, e-way bill, delivery challan, certificate of origin and the carrier document — generated or attached per shipment — with an Air / Sea tracking timeline.">
        <Button onClick={() => setCreating(true)}><Plus size={17} /> Create Invoice</Button>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={Ship} label={`Shipments FY ${s?.financialYear ?? ''}`} value={s?.shipments ?? '—'} tone="brand" foot={`${s?.sea ?? 0} sea · ${s?.air ?? 0} air`} />
        <KpiTile icon={Plane} label="By Air" value={s ? `${s.airPct}%` : '—'} tone="info" foot="urgent replenishment" />
        <KpiTile icon={TruckIcon} label="In Transit" value={s?.inTransit ?? '—'} tone="gold" foot={s?.ports.slice(0, 2).join(' · ') || 'shipped, not yet delivered'} />
        <KpiTile icon={FileIcon} label="Docs Pending" value={s?.docsPending ?? '—'} tone={s?.docsPending ? 'bad' : 'teal'} foot={s?.drafts.slice(0, 2).join(' · ') || 'all documents ready'} />
      </div>
      <AlertStrip module="dispatch" />
      <Card>
        <Toolbar q={q} setQ={setQ} placeholder="Search invoice, order, buyer, route…" chips={CHIPS} chip={chip} setChip={setChip} />
        {list.isLoading ? <div className="space-y-3 p-5">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
        : !rows.length ? <EmptyState title="No shipments" text="Create an export invoice for an order whose final inspection has passed." action={<Button onClick={() => setCreating(true)}><Plus size={15} /> Create Invoice</Button>} />
        : <Table>
          <THead><Tr className="hover:bg-transparent"><Th>Invoice No</Th><Th>Order / Buyer</Th><Th>Mode</Th><Th>Route</Th><Th className="text-right">Cartons</Th><Th className="text-right">Gross Wt</Th>{showValue && <Th className="text-right">Invoice Value</Th>}<Th>Date</Th><Th>Documents</Th><Th>Status</Th><Th /></Tr></THead>
          <TBody>{rows.map((d) => (
            <Tr key={d.id} className="cursor-pointer" onClick={() => setView(d)}>
              <Td className="font-mono text-xs font-bold">{d.invoiceNo}</Td>
              <Td><OrderLink id={d.orderId} className="font-mono text-xs font-semibold text-brand hover:underline" onClick={(e) => e.stopPropagation()}>{d.orderNo}</OrderLink><div className="text-[11px] text-muted-foreground">{d.buyerName} · {d.styleNo}</div></Td>
              <Td><Badge tone={d.mode === 'Air' ? 'info' : 'brand'}>{d.mode}</Badge></Td>
              <Td className="text-xs">{d.route}</Td><Td className="num text-right">{fmtN(d.cartons)}</Td><Td className="num text-right text-xs">{fmtN(d.grossWeightKg)} kg</Td>
              {showValue && <Td className="num text-right">{fmtInr(d.invoiceValue)}</Td>}<Td className="text-xs">{fmtDate(d.invoiceDate)}</Td>
              <Td><div className="flex flex-wrap gap-1">{d.documents.map((x) => <span key={x.type} className={cn('rounded px-1.5 py-0.5 text-[9.5px] font-semibold', x.status === 'Pending' ? 'bg-secondary text-muted-foreground' : 'bg-teal-soft text-teal dark:bg-teal/15')} title={`${x.type} · ${x.status}`}>{x.type.split(' ').map((w) => w[0]).join('')}</span>)}</div></Td>
              <Td><StatusPill value={d.status} /></Td><Td><Button size="sm" variant="secondary"><Eye size={13} /></Button></Td>
            </Tr>))}</TBody>
        </Table>}
      </Card>
      <CreateInvoiceDialog open={creating} presetOrder={presetOrder} onClose={() => { setCreating(false); if (presetOrder) setSp({}); }} />
      <DispatchDetail d={view ? all.find((x) => x.id === view.id) ?? view : null} onClose={() => setView(null)} />
    </div>
  );
}

/* ---------- create export invoice: many style lines of one buyer, buyer-currency prices, INR taxable + IGST ---------- */
type OrderLine = OrderLite & { buyerId: string; balanceQty?: number; unitPrice?: number; currency?: string; fxRate?: number; colour?: string; description: string; buyerPoNo: string; buyerOrderNo?: string };
function CreateInvoiceDialog({ open, onClose, presetOrder }: { open: boolean; onClose: () => void; presetOrder?: string }) {
  const qc = useQueryClient();
  const { hasFlag } = useAuth();
  const canRate = hasFlag('rates.view');
  const meta = useQuery<Meta>({ queryKey: ['/dispatch/meta'], queryFn: async () => (await api.get('/dispatch/meta')).data, enabled: open });
  const orders = useList<OrderLine>('/orders', { size: 300, status: 'Open' }, open);
  const [buyerId, setBuyerId] = React.useState('');
  const [picked, setPicked] = React.useState<Record<string, { qty: string; unitPrice: string; hsCode: string }>>({});
  const [f, setF] = React.useState({ invoiceDate: new Date().toISOString().slice(0, 10), mode: 'Sea', portOfLoading: 'Nhava Sheva (INNSA1)', portOfDischarge: '', incoterm: 'FOB', cartons: 0, grossWeightKg: 0, netWeightKg: 0, paymentMethod: 'LC', transporter: '', remarks: '',
    fxRate: '', igstPct: '', lcNo: '', lcDate: '', consigneeName: '', consigneeAddress: '', consigneeCountry: '', notifyParty: '', preCarriage: 'By road', placeOfReceipt: '', finalDestination: '', reverseCharge: false,
    advanceFx: '', proformaNo: '', cartonDims: '', marksAndNos: '' });
  /* the buyer's standing shipping details (Buyers → Shipping & documents) fill this form, so nothing is typed twice */
  const buyerDoc = useQuery<{ shipping?: Record<string, string | number>; legalName?: string; address?: string; country?: string }>({
    queryKey: ['/buyers', buyerId], queryFn: async () => (await api.get(`/buyers/${buyerId}`)).data, enabled: open && !!buyerId });
  const sh = buyerDoc.data?.shipping || {};
  const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
  React.useEffect(() => {
    if (!buyerDoc.data) return;
    setF((x) => ({ ...x,
      consigneeName: x.consigneeName || str(sh.consigneeName) || str(buyerDoc.data?.legalName),
      consigneeAddress: x.consigneeAddress || str(sh.consigneeAddress) || str(buyerDoc.data?.address),
      consigneeCountry: x.consigneeCountry || str(sh.consigneeCountry) || str(buyerDoc.data?.country),
      notifyParty: x.notifyParty || str(sh.notifyParty),
      preCarriage: str(sh.preCarriage) || x.preCarriage, placeOfReceipt: x.placeOfReceipt || str(sh.placeOfReceipt),
      portOfLoading: str(sh.portOfLoading) || x.portOfLoading, portOfDischarge: x.portOfDischarge || str(sh.portOfDischarge),
      finalDestination: x.finalDestination || str(sh.finalDestination) || str(buyerDoc.data?.country),
      mode: str(sh.mode) || x.mode, incoterm: str(sh.incoterm) || x.incoterm, paymentMethod: str(sh.paymentMethod) || x.paymentMethod,
      cartonDims: x.cartonDims || str(sh.cartonDims), marksAndNos: x.marksAndNos || str(sh.marksAndNos) }));
  }, [buyerDoc.data]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [docs, setDocs] = React.useState<string[]>(['Commercial Invoice', 'Packing List', 'E-Way Bill', 'Delivery Challan']);
  const cf = useCustomFields('dispatch', null, open);
  React.useEffect(() => { if (meta.data) setF((x) => ({ ...x, igstPct: x.igstPct === '' ? String(meta.data!.igstPct ?? 0) : x.igstPct, fxRate: x.fxRate === '' ? String(meta.data!.fxRate ?? '') : x.fxRate })); }, [meta.data]);
  const all = orders.data?.items ?? [];
  const buyers = [...new Map(all.map((o) => [o.buyerId, o.buyerName])).entries()];
  /* arrived from Packing → the order is already picked, its buyer's other open orders can be added */
  React.useEffect(() => {
    if (!open || !presetOrder) return;
    const o = all.find((x) => x.id === presetOrder);
    if (!o) return;
    setBuyerId(o.buyerId);
    setPicked((p) => (p[o.id] ? p : { ...p, [o.id]: { qty: String(o.balanceQty ?? o.qty), unitPrice: o.unitPrice != null ? String(o.unitPrice) : '', hsCode: '' } }));
  }, [open, presetOrder, all.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  const mine = all.filter((o) => o.buyerId === buyerId);
  const lines = mine.filter((o) => picked[o.id]).map((o) => ({ orderId: o.id, qty: +picked[o.id].qty || 0, unitPrice: picked[o.id].unitPrice === '' ? undefined : +picked[o.id].unitPrice, hsCode: picked[o.id].hsCode || undefined }));
  const first = mine.find((o) => picked[o.id]);
  const cur = first?.currency || meta.data?.defaultCurrency || 'USD';
  const fxv = cur === 'INR' ? 1 : (+f.fxRate || first?.fxRate || 1);
  const totalFx = lines.reduce((a, l) => a + l.qty * (l.unitPrice ?? mine.find((o) => o.id === l.orderId)?.unitPrice ?? 0), 0);
  const totalQty = lines.reduce((a, l) => a + l.qty, 0);
  const toggle = (o: OrderLine) => setPicked((p) => { const n = { ...p }; if (n[o.id]) delete n[o.id]; else n[o.id] = { qty: String(o.balanceQty ?? o.qty), unitPrice: o.unitPrice != null ? String(o.unitPrice) : '', hsCode: str(sh.hsCode) }; return n; });
  React.useEffect(() => {
    if (!first) return;
    const per = first.pcsPerCarton || Number(sh.pcsPerCarton) || 0;
    const ctn = per ? Math.ceil(totalQty / per) : 0;
    setF((x) => ({ ...x, mode: str(sh.mode) || first.mode || x.mode, paymentMethod: str(sh.paymentMethod) || (/LC|Letter/i.test(first.paymentTerms) ? 'LC' : 'T/T'),
      cartons: ctn || x.cartons,
      grossWeightKg: x.grossWeightKg || (ctn && Number(sh.grossPerCartonKg) ? Math.round(ctn * Number(sh.grossPerCartonKg) * 100) / 100 : 0),
      netWeightKg: x.netWeightKg || (ctn && Number(sh.netPerCartonKg) ? Math.round(ctn * Number(sh.netPerCartonKg) * 100) / 100 : 0) }));
  }, [first, totalQty, buyerDoc.data]);   // eslint-disable-line react-hooks/exhaustive-deps
  const post = useMutation({ mutationFn: async () => (await api.post('/dispatch', { ...f, lines, orderId: lines[0]?.orderId, custom: cf.value, documents: docs, lcDate: f.lcDate || undefined, fxRate: f.fxRate || undefined, igstPct: f.igstPct === '' ? undefined : f.igstPct, advanceFx: f.advanceFx === '' ? undefined : f.advanceFx,
      consignee: { name: f.consigneeName, address: f.consigneeAddress, country: f.consigneeCountry } })).data,
    onSuccess: (d: Dispatch) => { toast.success(`Invoice ${d.invoiceNo} · ${d.lineCount ?? 1} line(s) · ${d.documents.length} documents to prepare`); ['/dispatch', '/payments', '/orders', '/alerts', '/buyer-orders'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onClose(); setPicked({}); }, onError: (e) => toast.error(apiMessage(e)) });
  const selectable = (meta.data?.docTypes ?? []).filter((t) => !['Bill of Lading', 'Airway Bill'].includes(t));
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent wide meta={cf.meta}>
        <DialogHeader><DialogTitle>Create Export Invoice</DialogTitle><DialogDescription>Pick the buyer, then tick every order going in this shipment — one invoice can carry many orders. Partial quantities are allowed and the balance stays open. Consignee, ports, terms, carton size and weights come from the buyer master; change them only when this shipment differs.</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Buyer" className="sm:col-span-2"><Select value={buyerId} onValueChange={(v) => { setBuyerId(v); setPicked({}); }}><SelectTrigger><SelectValue placeholder="Buyers with open orders…" /></SelectTrigger><SelectContent>{buyers.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Invoice date"><Input type="date" value={f.invoiceDate} onChange={(e) => setF({ ...f, invoiceDate: e.target.value })} /></Field>
            <Field label="Shipment mode"><Select value={f.mode} onValueChange={(v) => setF({ ...f, mode: v, portOfLoading: v === 'Air' ? 'Delhi Air Cargo (INDEL4)' : 'Nhava Sheva (INNSA1)' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Sea">Sea</SelectItem><SelectItem value="Air">Air</SelectItem></SelectContent></Select></Field>
          </div>
          {buyerId && <div className="overflow-hidden rounded-xl border">
            <div className="border-b bg-secondary px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Style lines on this invoice · {lines.length} of {mine.length}</div>
            <table className="w-full text-[12px]"><thead><tr className="text-[10px] font-bold uppercase text-muted-foreground"><th className="w-8" /><th className="px-2 py-1 text-left">Order · style</th><th className="px-2 text-left">Buyer PO</th><th className="px-2 text-right">Balance</th><th className="px-2 text-right">Ship qty</th>{canRate && <th className="px-2 text-right">Unit price ({cur})</th>}<th className="px-2 text-left">HS code</th>{canRate && <th className="px-2 text-right">Amount</th>}</tr></thead>
              <tbody>{mine.map((o) => { const p = picked[o.id]; return <tr key={o.id} className={cn('border-t', p && 'bg-brand-soft/30')}>
                <td className="px-2 text-center"><input type="checkbox" checked={!!p} onChange={() => toggle(o)} /></td>
                <td className="px-2 py-1"><span className="font-mono font-semibold">{o.orderNo}</span> · {o.styleNo}<div className="text-[10.5px] text-muted-foreground">{o.description}{o.colour ? ` · ${o.colour}` : ''}</div></td>
                <td className="px-2 text-xs">{o.buyerOrderNo || o.buyerPoNo || '—'}</td>
                <td className="num px-2 text-right">{fmtN(o.balanceQty ?? o.qty)}</td>
                <td className="p-1"><input type="number" disabled={!p} className="num h-7 w-20 rounded border bg-card px-1 text-right text-xs disabled:opacity-40" value={p?.qty ?? ''} onChange={(e) => setPicked({ ...picked, [o.id]: { ...p, qty: e.target.value } })} /></td>
                {canRate && <td className="p-1"><input type="number" step="0.01" disabled={!p} className="num h-7 w-20 rounded border bg-card px-1 text-right text-xs disabled:opacity-40" value={p?.unitPrice ?? ''} onChange={(e) => setPicked({ ...picked, [o.id]: { ...p, unitPrice: e.target.value } })} /></td>}
                <td className="p-1"><input disabled={!p} className="h-7 w-20 rounded border bg-card px-1 font-mono text-xs disabled:opacity-40" placeholder="6205" value={p?.hsCode ?? ''} onChange={(e) => setPicked({ ...picked, [o.id]: { ...p, hsCode: e.target.value } })} /></td>
                {canRate && <td className="num px-2 text-right text-xs">{p ? (+p.qty * (+p.unitPrice || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</td>}
              </tr>; })}</tbody></table>
            {canRate && lines.length > 0 && <div className="border-t bg-secondary/40 px-3 py-1.5 text-[12px]">Total <b>{fmtN(totalQty)}</b> pcs · <b>{cur} {totalFx.toLocaleString('en-US', { minimumFractionDigits: 2 })}</b>{cur !== 'INR' && <> = <b>{fmtInr(Math.round(totalFx * fxv))}</b> at ₹{fxv}</>}{+f.igstPct ? <> · IGST {f.igstPct}% = {fmtInr(Math.round(totalFx * fxv * +f.igstPct / 100))} · total <b>{fmtInr(Math.round(totalFx * fxv * (1 + +f.igstPct / 100)))}</b></> : ' · IGST nil (LUT)'}</div>}
          </div>}
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Port of loading" className="sm:col-span-2"><Select value={f.portOfLoading} onValueChange={(v) => setF({ ...f, portOfLoading: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[...new Set([...(meta.data?.ports ?? []), f.portOfLoading])].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Port of discharge"><Input value={f.portOfDischarge} onChange={(e) => setF({ ...f, portOfDischarge: e.target.value })} placeholder="Tokyo (JPTYO)" /></Field>
            <Field label="Final destination"><Input value={f.finalDestination} onChange={(e) => setF({ ...f, finalDestination: e.target.value })} /></Field>
            <Field label="Incoterm"><Select value={f.incoterm} onValueChange={(v) => setF({ ...f, incoterm: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(meta.data?.incoterms ?? ['FOB']).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Pre-carriage by"><Input value={f.preCarriage} onChange={(e) => setF({ ...f, preCarriage: e.target.value })} /></Field>
            <Field label="Place of receipt"><Input value={f.placeOfReceipt} onChange={(e) => setF({ ...f, placeOfReceipt: e.target.value })} placeholder="Gurgaon" /></Field>
            <Field label="Payment method"><Select value={f.paymentMethod} onValueChange={(v) => setF({ ...f, paymentMethod: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['LC', 'T/T', 'Advance'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="L/C no"><Input value={f.lcNo} onChange={(e) => setF({ ...f, lcNo: e.target.value })} /></Field>
            <Field label="L/C date"><Input type="date" value={f.lcDate} onChange={(e) => setF({ ...f, lcDate: e.target.value })} /></Field>
            {canRate && cur !== 'INR' && <Field label={`Exchange rate (₹ per ${cur})`}><Input type="number" step="0.01" value={f.fxRate} onChange={(e) => setF({ ...f, fxRate: e.target.value })} /></Field>}
            {canRate && <Field label="IGST %" hint="0 = under LUT"><Input type="number" step="0.5" value={f.igstPct} onChange={(e) => setF({ ...f, igstPct: e.target.value })} /></Field>}
            <Field label="Cartons"><Input type="number" value={f.cartons || ''} onChange={(e) => setF({ ...f, cartons: +e.target.value })} /></Field>
            <Field label="Gross weight (kg)"><Input type="number" value={f.grossWeightKg || ''} onChange={(e) => setF({ ...f, grossWeightKg: +e.target.value })} /></Field>
            <Field label="Net weight (kg)"><Input type="number" value={f.netWeightKg || ''} onChange={(e) => setF({ ...f, netWeightKg: +e.target.value })} /></Field>
            <Field label="Transporter / CHA"><Input value={f.transporter} onChange={(e) => setF({ ...f, transporter: e.target.value })} /></Field>
            <Field label="Consignee name" hint="blank = buyer's legal name"><Input value={f.consigneeName} onChange={(e) => setF({ ...f, consigneeName: e.target.value })} /></Field>
            <Field label="Consignee address" className="sm:col-span-2"><Input value={f.consigneeAddress} onChange={(e) => setF({ ...f, consigneeAddress: e.target.value })} /></Field>
            <Field label="Consignee country"><Input value={f.consigneeCountry} onChange={(e) => setF({ ...f, consigneeCountry: e.target.value })} /></Field>
            <Field label="Notify party" className="sm:col-span-3"><Input value={f.notifyParty} onChange={(e) => setF({ ...f, notifyParty: e.target.value })} /></Field>
            <Field label="Reverse charge"><label className="flex h-10 items-center gap-2 text-[12.5px]"><input type="checkbox" checked={f.reverseCharge} onChange={(e) => setF({ ...f, reverseCharge: e.target.checked })} /> Applicable</label></Field>
            {canRate && <Field label={`Less – advance (${cur})`} hint="already received against these orders"><Input type="number" step="0.01" value={f.advanceFx} onChange={(e) => setF({ ...f, advanceFx: e.target.value })} /></Field>}
            <Field label="Proforma invoice no"><Input value={f.proformaNo} onChange={(e) => setF({ ...f, proformaNo: e.target.value })} placeholder="AFN/044A/25-26" /></Field>
            <Field label="Measurements / carton"><Input value={f.cartonDims} onChange={(e) => setF({ ...f, cartonDims: e.target.value })} placeholder="60X40X30" /></Field>
            <Field label="Marks &amp; nos" className="sm:col-span-2"><Input value={f.marksAndNos} onChange={(e) => setF({ ...f, marksAndNos: e.target.value })} placeholder="buyer · order no · C/No. 1–105 · MADE IN INDIA" /></Field>
          </div>
          <div><div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Documents to prepare</div>
            <div className="flex flex-wrap gap-1.5">{selectable.map((t) => <button key={t} type="button" onClick={() => setDocs(docs.includes(t) ? docs.filter((x) => x !== t) : [...docs, t])} className={cn('rounded-lg border px-3 py-1.5 text-xs font-semibold', docs.includes(t) ? 'border-brand bg-brand-soft text-brand' : 'text-muted-foreground')}>{t}</button>)}
              <span className="rounded-lg border border-dashed px-3 py-1.5 text-xs text-muted-foreground">+ {f.mode === 'Air' ? 'Airway Bill' : 'Bill of Lading'} (carrier)</span></div></div>
          {cf.node}
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!lines.length || lines.some((l) => l.qty <= 0) || !(f.cartons > 0) || post.isPending || !cf.ok} onClick={() => post.mutate()}><Check size={15} /> Generate Invoice</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { printDoc };

/* ---------- shipment detail: document checklist + tracking timeline ---------- */
export function DispatchDetail({ d, onClose }: { d: Dispatch | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { hasFlag } = useAuth();
  const meta = useQuery<Meta>({ queryKey: ['/dispatch/meta'], queryFn: async () => (await api.get('/dispatch/meta')).data, enabled: !!d });
  const [numbers, setNumbers] = React.useState<Record<string, string>>({});
  const [ev, setEv] = React.useState({ key: '', detail: '', at: new Date().toISOString().slice(0, 10), vesselOrFlight: '', blOrAwbNo: '', sealNo: '', shippingBillNo: '', eta: '' });
  const [edit, setEdit] = React.useState({ vesselOrFlight: '', containerNo: '', sealNo: '', shippingBillNo: '', transporter: '', eta: '', lcNo: '', lcDate: '', preCarriage: '', placeOfReceipt: '', finalDestination: '', notifyParty: '' });
  const fileRef = React.useRef<HTMLInputElement>(null);
  const uploadFor = React.useRef('');
  const inv = () => ['/dispatch', '/orders', '/payments', '/alerts', '/tna'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const act = useMutation({ mutationFn: async ({ url, body }: { url: string; body?: unknown }) => (await api.post(url, body ?? {})).data, onSuccess: (r: Dispatch) => { toast.success(`${r.invoiceNo} · ${r.status}`); inv(); }, onError: (e) => toast.error(apiMessage(e)) });
  const save = useMutation({ mutationFn: async () => (await api.patch(`/dispatch/${d!.id}`, { ...edit, eta: edit.eta || undefined, lcDate: edit.lcDate || undefined })).data, onSuccess: () => { toast.success('Shipment updated'); inv(); }, onError: (e) => toast.error(apiMessage(e)) });
  React.useEffect(() => { if (d) { setEdit({ vesselOrFlight: d.vesselOrFlight, containerNo: d.containerNo, sealNo: d.sealNo, shippingBillNo: d.shippingBillNo, transporter: d.transporter, eta: toInputDate(d.eta), lcNo: d.lcNo || '', lcDate: toInputDate(d.lcDate), preCarriage: d.preCarriage || '', placeOfReceipt: d.placeOfReceipt || '', finalDestination: d.finalDestination || '', notifyParty: d.notifyParty || '' }); setEv((x) => ({ ...x, key: d.tracking.find((t) => !t.done)?.key || '' })); } }, [d]);
  const upload = async (file?: File) => { if (!file || !d) return; try { const r = await uploadFile(file, 'dispatch', d.id); act.mutate({ url: `/dispatch/${d.id}/docs/${encodeURIComponent(uploadFor.current)}/upload`, body: { fileId: r.id } }); } catch (e) { toast.error(apiMessage(e)); } finally { if (fileRef.current) fileRef.current.value = ''; } };
  if (!d) return null;
  const generated = meta.data?.generated ?? [];
  const canValue = hasFlag('rates.view');
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent wide>
        <DialogHeader><DialogTitle className="flex flex-wrap items-center gap-2">{d.invoiceNo} <StatusPill value={d.status} /><Badge tone={d.mode === 'Air' ? 'info' : 'brand'}>{d.mode}</Badge></DialogTitle>
          <DialogDescription>{d.orderNo} · {d.buyerName} · {d.description} · {d.route} · {d.incoterm} · {fmtN(d.cartons)} cartons · {fmtN(d.grossWeightKg)} kg{canValue ? ` · ${fmtInr(d.invoiceValue)}` : ''} · {d.paymentMethod}</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="overflow-hidden rounded-xl border">
              <div className="border-b bg-secondary px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Document checklist · {d.docsDone}/{d.documents.length}</div>
              {d.documents.map((x) => (
                <div key={x.type} className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-[12.5px] last:border-0">
                  <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold', x.status === 'Pending' ? 'bg-secondary text-muted-foreground' : 'bg-teal text-white')}>{x.status === 'Pending' ? '·' : '✓'}</span>
                  <div className="min-w-0 flex-1"><div className="font-semibold">{x.type}{x.number && <span className="ml-1 font-mono text-[11px] text-muted-foreground">· {x.number}</span>}</div><div className="text-[10.5px] text-muted-foreground">{x.status}{x.fileName ? ` · ${x.fileName}` : ''}{x.by ? ` · ${x.by} ${fmtDate(x.at)}` : ''}</div></div>
                  {generated.includes(x.type) && (!['Commercial Invoice', 'E-Way Bill'].includes(x.type) || canValue) && <Button size="sm" variant="secondary" onClick={async () => { await printDoc(d.id, x.type); if (x.status === 'Pending') act.mutate({ url: `/dispatch/${d.id}/docs/${encodeURIComponent(x.type)}/generate` }); }}><Print size={13} /> {x.status === 'Pending' ? 'Generate' : 'Re-print'}</Button>}
                  {x.fileId && <><Button size="sm" variant="secondary" onClick={() => openFile(x.fileId!, x.fileName || x.type)}><Eye size={13} /></Button><Button size="sm" variant="secondary" onClick={() => openFile(x.fileId!, x.fileName || x.type, true)}><Download size={13} /></Button></>}
                  <Button size="sm" variant="secondary" onClick={() => { uploadFor.current = x.type; fileRef.current?.click(); }}><Upload size={13} /></Button>
                  {['E-Way Bill', 'Bill of Lading', 'Airway Bill', 'Certificate of Origin', 'GSP Form A'].includes(x.type) && <div className="flex items-center gap-1"><Input className="h-7 w-32 text-xs" placeholder="number" value={numbers[x.type] ?? x.number ?? ''} onChange={(e) => setNumbers({ ...numbers, [x.type]: e.target.value })} /><Button size="sm" className="h-7" disabled={!(numbers[x.type] ?? '').trim()} onClick={() => act.mutate({ url: `/dispatch/${d.id}/docs/${encodeURIComponent(x.type)}/number`, body: { number: numbers[x.type] } })}><Check size={12} /></Button></div>}
                </div>))}
              <input ref={fileRef} type="file" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" hidden onChange={(e) => upload(e.target.files?.[0])} />
            </div>
            <div className="overflow-hidden rounded-xl border">
              <div className="border-b bg-secondary px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Shipment tracking · {d.mode}</div>
              <div className="relative m-4 pl-6 before:absolute before:bottom-1 before:left-2 before:top-1 before:w-0.5 before:bg-border">
                {d.tracking.map((t, i) => (
                  <div key={t.key} className="relative pb-3.5 last:pb-0">
                    <span className={cn('absolute -left-[22px] top-1 h-[11px] w-[11px] rounded-full border-2 bg-card', t.done ? 'border-teal bg-teal' : d.tracking.findIndex((x) => !x.done) === i ? 'border-brand bg-brand ring-4 ring-brand/15' : 'border-border')} />
                    <div className={cn('text-[12.5px] font-semibold', !t.done && 'text-muted-foreground')}>{t.title}{t.done && <span className="ml-1 text-[10.5px] font-normal text-muted-foreground">· {fmtDate(t.at)}</span>}</div>
                    {t.detail && <div className="text-[11px] text-muted-foreground">{t.detail}</div>}
                  </div>))}
              </div>
              {d.status !== 'Delivered' && <div className="space-y-2 border-t bg-secondary/60 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <Select value={ev.key} onValueChange={(v) => setEv({ ...ev, key: v })}><SelectTrigger className="h-8"><SelectValue placeholder="event" /></SelectTrigger><SelectContent>{d.tracking.filter((t) => !t.done).map((t) => <SelectItem key={t.key} value={t.key}>{t.title}</SelectItem>)}</SelectContent></Select>
                  <Input type="date" className="h-8" value={ev.at} onChange={(e) => setEv({ ...ev, at: e.target.value })} />
                  <Input className="h-8 col-span-2" value={ev.detail} onChange={(e) => setEv({ ...ev, detail: e.target.value })} placeholder="detail — 200 cartons · seal MSCU7741 · shipping bill 4471209 · MV Ever Ace…" />
                  {ev.key === 'stuffing' && <Input className="h-8" value={ev.sealNo} onChange={(e) => setEv({ ...ev, sealNo: e.target.value })} placeholder="seal no" />}
                  {ev.key === 'customs' && <Input className="h-8" value={ev.shippingBillNo} onChange={(e) => setEv({ ...ev, shippingBillNo: e.target.value })} placeholder="shipping bill no" />}
                  {ev.key === 'onboard' && <><Input className="h-8" value={ev.vesselOrFlight} onChange={(e) => setEv({ ...ev, vesselOrFlight: e.target.value })} placeholder={d.mode === 'Air' ? 'flight' : 'vessel'} /><Input className="h-8" value={ev.blOrAwbNo} onChange={(e) => setEv({ ...ev, blOrAwbNo: e.target.value })} placeholder={d.mode === 'Air' ? 'AWB no' : 'B/L no'} /></>}
                  {(ev.key === 'onboard' || ev.key === 'transit') && <Input type="date" className="h-8" value={ev.eta} onChange={(e) => setEv({ ...ev, eta: e.target.value })} placeholder="ETA" />}
                </div>
                <Button size="sm" disabled={!ev.key || act.isPending} onClick={() => act.mutate({ url: `/dispatch/${d.id}/track`, body: { ...ev, eta: ev.eta || undefined } })}><Check size={13} /> Record event</Button>
              </div>}
            </div>
          </div>
          <div className="grid gap-3 rounded-xl border bg-secondary/60 p-3 sm:grid-cols-3 lg:grid-cols-6">
            {[['vesselOrFlight', d.mode === 'Air' ? 'Flight' : 'Vessel'], ['containerNo', 'Container'], ['sealNo', 'Seal'], ['shippingBillNo', 'Shipping bill'], ['transporter', 'Transporter / CHA']].map(([k, l]) => (
              <Field key={k} label={l}><Input className="h-8" value={(edit as Record<string, string>)[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></Field>))}
            <Field label="ETA"><Input type="date" className="h-8" value={edit.eta} onChange={(e) => setEdit({ ...edit, eta: e.target.value })} /></Field>
            {[['lcNo', 'L/C no'], ['preCarriage', 'Pre-carriage'], ['placeOfReceipt', 'Place of receipt'], ['finalDestination', 'Final destination'], ['notifyParty', 'Notify party']].map(([k, l]) => (
              <Field key={k} label={l}><Input className="h-8" value={(edit as Record<string, string>)[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></Field>))}
            <Field label="L/C date"><Input type="date" className="h-8" value={edit.lcDate} onChange={(e) => setEdit({ ...edit, lcDate: e.target.value })} /></Field>
          </div>
          {(d.lines?.length ?? 0) > 0 && <div className="overflow-hidden rounded-xl border"><div className="border-b bg-secondary px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Invoice lines · {d.lines!.length}</div>
            <Table><THead><Tr className="hover:bg-transparent"><Th>Order · style</Th><Th>Buyer PO</Th><Th>HS</Th><Th className="text-right">Qty</Th>{canValue && <><Th className="text-right">Price ({d.currency})</Th><Th className="text-right">Amount ({d.currency})</Th><Th className="text-right">Amount (₹)</Th></>}</Tr></THead>
              <TBody>{d.lines!.map((l, i) => <Tr key={i}><Td><OrderLink id={l.orderId} className="font-mono text-xs font-bold text-brand hover:underline">{l.orderNo}</OrderLink> <span className="text-xs">· {l.styleNo}{l.colour ? ` · ${l.colour}` : ''}</span></Td><Td className="text-xs">{l.buyerPoNo || '—'}</Td><Td className="font-mono text-xs">{l.hsCode}</Td><Td className="num text-right font-semibold">{fmtN(l.qty)}</Td>
                {canValue && <><Td className="num text-right text-xs">{l.unitPrice?.toFixed(2)}</Td><Td className="num text-right text-xs">{l.amountFx?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Td><Td className="num text-right text-xs">{fmtInr(l.amountInr)}</Td></>}</Tr>)}
                {canValue && <Tr className="bg-secondary/60 font-semibold hover:bg-secondary/60"><Td colSpan={3}>Total{d.igstPct ? ` · IGST ${d.igstPct}% ${fmtInr(d.igstInr)}` : ' · IGST nil (LUT)'}</Td><Td className="num text-right">{fmtN(d.qty)}</Td><Td /><Td className="num text-right">{d.totalFx?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Td><Td className="num text-right">{fmtInr(d.totalInr)}</Td></Tr>}</TBody></Table>
            {canValue && d.amountInWords && <div className="border-t px-4 py-2 text-[11.5px] text-muted-foreground">{d.amountInWordsFx ? `${d.amountInWordsFx} · ` : ''}{d.amountInWords}</div>}</div>}
          <BoxesEditor d={d} />
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Close</Button><Button variant="secondary" asChild><Link to={`/orders/${d.orderId}`}>{d.orderNo}</Link></Button><Button disabled={save.isPending} onClick={() => save.mutate()}><Check size={15} /> Save details</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
