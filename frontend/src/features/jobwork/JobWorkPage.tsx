import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { MaterialNameInput } from '@/components/MaterialCatalog';
import { useList, useAction, fmtN, fmtDate, fmtInr } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { useCustomFields } from '@/components/CustomFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton, Table, THead, TBody, Tr, Th, Td, Badge } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertStrip } from '@/components/AlertStrip';
import { PageHeader, KpiTile, Toolbar, Field, StatusPill, EmptyState, Bar, MaskedNote, OrderLink, useOrderContext, OrderFacts } from '@/components/shared';
import { DueChip, PayDialog, useLedger } from '@/features/vendors/PartyLedger';
import { Jobwork as JwIcon, Plus, Gate as GateIcon, Eye, Print, Power, Check, Alert, Clock, Refresh, Payments } from '@/icons/icons';

export type JobWork = {
  id: string; challanNo: string; orderId: string; orderNo: string; styleNo: string; vendorId: string; vendorAlias: string; vendorName?: string; vendorLabel: string;
  process: string; processDesc: string; processLabel: string; op: string; itemDesc: string; materialId?: string; materialCode: string; uom: string;
  sentQty: number; returnedQty: number; rejectedQty: number; pendingQty: number; completionPct: number; rate?: number; outDate: string; dueDate?: string;
  instructions: string; priority: string; status: string; displayStatus: string; overdue: boolean; location: { label: string; detail: string; pending: number };
  returns: { grnNo: string; qty: number; rejectedQty: number; vendorChallanNo: string; date: string; by: string }[]; createdBy: string;
  billed?: number; paid?: number; balance?: number; inProgress?: number;   // what this challan is worth and what is still to pay
};
type Summary = { outside: number; vendorsOut: number; receivedBackPct: number; overdue: string[]; fullyReturned: number; avgTurnaroundDays: number | null;
  payable?: { count: number; billed: number; paid: number; outstanding: number; overdue: number; inProgress: number } };
type Vendor = { id: string; alias: string; category: string; displayName: string; status: string };
type OrderLite = { id: string; orderNo: string; styleNo: string; buyerName: string; status: string };
type Material = { id: string; code: string; name: string; uom: string; physicalQty: number };

export const LOC_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'info' | 'brand' | 'mute'> = { 'IN-HOUSE': 'ok', 'PARTIALLY IN-HOUSE': 'warn', OUTSOURCED: 'brand' };
const CHIPS = ['All', 'In Process', 'Overdue', 'Received', 'Cancelled'];

export default function JobWorkPage() {
  const nav = useNavigate();
  const { hasFlag, hasModule } = useAuth();
  const [q, setQ] = React.useState('');
  const [chip, setChip] = React.useState('All');
  const [creating, setCreating] = React.useState(false);
  const [viewing, setViewing] = React.useState<JobWork | null>(null);
  const { data, isLoading } = useList<JobWork>('/jobwork', { size: 500 });
  const sum = useQuery<Summary>({ queryKey: ['/jobwork', 'summary'], queryFn: async () => (await api.get('/jobwork/summary')).data });
  const [payFor, setPayFor] = React.useState<JobWork | null>(null);
  const payLedger = useLedger('vendor', payFor?.vendorId);
  const all = data?.items ?? [];
  const rows = all.filter((j) => {
    const t = `${j.challanNo} ${j.orderNo} ${j.vendorLabel} ${j.process} ${j.itemDesc}`.toLowerCase();
    const c = chip === 'All' || (chip === 'In Process' ? ['Sent to Vendor', 'Partially Received'].includes(j.status) && !j.overdue : chip === 'Overdue' ? j.overdue : j.status === chip);
    return (!q || t.includes(q.toLowerCase())) && c;
  });
  const s = sum.data;

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Job Work / Outsourcing" sub="Material leaves on a GST job-work challan and comes back only through Gate Entry. Location is calculated from quantities — never typed in.">
        {hasModule('gate') && <Button variant="secondary" onClick={() => nav('/gate')}><GateIcon size={17} /> Receive Back</Button>}
        <Button onClick={() => setCreating(true)}><Plus size={17} /> New Job Work Challan</Button>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={JwIcon} label="Material Outside" value={fmtN(s?.outside)} tone="brand" foot={`with ${s?.vendorsOut ?? 0} vendor${s?.vendorsOut === 1 ? '' : 's'} · live from open challans`} />
        <KpiTile icon={Check} label="Received Back" value={s ? `${s.receivedBackPct}%` : '—'} tone="teal" foot={`${s?.fullyReturned ?? 0} challans fully returned`} />
        <KpiTile icon={Alert} label="Overdue Challans" value={s?.overdue.length ?? '—'} tone={s?.overdue.length ? 'bad' : 'teal'} foot={s?.overdue.slice(0, 3).join(' · ') || 'none past due date'} />
        {s?.payable ? <KpiTile icon={Payments} label="Still to Pay Vendors" value={fmtInr(s.payable.outstanding)} tone={s.payable.outstanding ? 'bad' : 'teal'} foot={`billed ${fmtInr(s.payable.billed)} · paid ${fmtInr(s.payable.paid)}${s.payable.overdue ? ` · ${fmtInr(s.payable.overdue)} overdue` : ''}`} />
          : <KpiTile icon={Clock} label="Avg Turnaround" value={s?.avgTurnaroundDays == null ? '—' : `${s.avgTurnaroundDays} d`} tone="gold" foot="issue → last return · target 9 d" />}
      </div>
      {!hasFlag('vendor.confidential') && <MaskedNote what="Vendor names, rates and contact details" />}
      <div className="rounded-xl border bg-secondary px-4 py-3 text-[12.5px] text-muted-foreground">
        <b className="text-foreground">Non-sale challan flow:</b> issue → vendor processes → inward receipt at the gate adds the quantity back against the same order.
        <b className="text-foreground"> Vendor pending = sent − Σ returns</b> · 0 back = OUTSOURCED · some back = PARTIALLY IN-HOUSE · all back = IN-HOUSE.
      </div>

      <AlertStrip module="jobwork" />
      <Card>
        <Toolbar q={q} setQ={setQ} placeholder="Search challan, order, vendor, process, item…" chips={CHIPS} chip={chip} setChip={setChip} />
        {isLoading ? <div className="space-y-3 p-5">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
        : !rows.length ? <EmptyState title="No job-work challans" text="Issue a challan to send fabric, panels or garments to a process vendor." action={<Button onClick={() => setCreating(true)}><Plus size={16} /> New Challan</Button>} />
        : <Table>
          <THead><Tr className="hover:bg-transparent">
            <Th>Challan</Th><Th>Order</Th><Th>Vendor · process</Th><Th>Item issued</Th><Th className="text-right">Sent → back</Th>
            <Th className="w-24">Completion</Th><Th className="text-right">Work value</Th><Th className="text-right">Still to pay</Th><Th>Status</Th><Th className="text-right">Actions</Th>
          </Tr></THead>
          <TBody>{rows.map((j) => {
            const open = ['Sent to Vendor', 'Partially Received'].includes(j.status);
            return (
              <Tr key={j.id} className={j.status === 'Cancelled' ? 'opacity-50' : ''}>
                <Td><div className="font-mono text-[12.5px] font-bold">{j.challanNo}</div><div className="text-[10.5px] text-muted-foreground">{fmtDate(j.outDate)} → <span className={cn(j.overdue && 'font-semibold text-bad')}>{fmtDate(j.dueDate)}</span></div>{j.priority !== 'Normal' && <StatusPill value={j.priority} className="mt-1" />}</Td>
                <Td><OrderLink id={j.orderId} className="font-mono text-xs font-semibold text-brand hover:underline">{j.orderNo}</OrderLink><div className="text-[11px] text-muted-foreground">{j.styleNo}</div></Td>
                <Td className="text-xs"><div className="font-semibold">{j.vendorLabel}</div><Badge tone="brand" className="mt-0.5">{j.processLabel}</Badge>{j.op && <span className="ml-1 text-[10px] text-muted-foreground">→ {j.op}</span>}</Td>
                <Td className="max-w-[150px] truncate text-xs" title={j.itemDesc}>{j.itemDesc}{j.materialCode && <div className="font-mono text-[10.5px] text-muted-foreground">{j.materialCode}</div>}</Td>
                <Td className="num text-right"><span className="font-semibold">{fmtN(j.sentQty)}</span> <span className="text-[10px] font-normal text-muted-foreground">{j.uom}</span><div className="text-[11px]"><span className="text-teal">{fmtN(j.returnedQty)} back</span>{j.pendingQty ? <span className="text-brand"> · {fmtN(j.pendingQty)} out</span> : null}</div></Td>
                <Td><Bar pct={j.completionPct} tone={j.completionPct >= 100 ? 'ok' : j.overdue ? 'bad' : 'brand'} /><div className="mt-0.5 truncate text-[10.5px] text-muted-foreground" title={j.location.detail}>{j.location.label}</div></Td>
                <Td className="num text-right">{j.billed != null ? <>{fmtInr(j.billed)}<div className="text-[10.5px] font-normal text-muted-foreground">{j.rate ? `@ ${fmtInr(j.rate)} / ${j.uom}` : 'rate not set'}{j.inProgress ? ` · ${fmtInr(j.inProgress)} running` : ''}</div></> : <span className="text-muted-foreground">—</span>}</Td>
                <Td className="text-right"><DueChip amount={j.balance} />{j.paid ? <div className="text-[10.5px] text-muted-foreground">paid {fmtInr(j.paid)}</div> : null}</Td>
                <Td><StatusPill value={j.displayStatus} /></Td>
                <Td><div className="flex justify-end gap-1.5">
                  {open && hasModule('gate') && <Button size="sm" title="Receive back at the gate" onClick={() => nav(`/gate?jw=${j.id}`)}><GateIcon size={14} /></Button>}
                  {(j.balance ?? 0) > 0 && <Button size="sm" variant="secondary" title="Pay this challan" onClick={() => setPayFor(j)}><Payments size={14} /></Button>}
                  <Button size="sm" variant="secondary" onClick={() => setViewing(j)}><Eye size={14} /></Button>
                </div></Td>
              </Tr>);
          })}</TBody>
        </Table>}
      </Card>
      <NewChallanDialog open={creating} onClose={() => setCreating(false)} />
      <ChallanDetailDialog jw={viewing ? all.find((x) => x.id === viewing.id) ?? viewing : null} onClose={() => setViewing(null)} />
      {payFor && payLedger.data && <PayDialog ledger={payLedger.data} preset={payFor.id} onClose={() => setPayFor(null)} />}
    </div>
  );
}

/* ---------- issue challan ---------- */
export function NewChallanDialog({ open, orderId, onClose }: { open: boolean; orderId?: string; onClose: () => void }) {
  const { hasFlag } = useAuth();
  const canRate = hasFlag('vendor.confidential');
  const [f, setF] = React.useState({ orderId: orderId || '', process: 'Printing', processDesc: '', vendorId: '', rate: 0, materialId: '', itemDesc: '', uom: 'pcs', sentQty: 0,
    outDate: new Date().toISOString().slice(0, 10), dueDate: '', instructions: '', priority: 'Normal' });
  const meta = useQuery<{ processes: string[] }>({ queryKey: ['/jobwork/meta'], queryFn: async () => (await api.get('/jobwork/meta')).data, enabled: open });
  const cf = useCustomFields('jobwork', null, open);
  const orders = useList<OrderLite>('/orders', { size: 200, status: 'Open' }, open);
  const vendors = useList<Vendor>('/vendors', { size: 200, status: 'Active' }, open);
  const mats = useList<Material>('/materials', { size: 500, status: 'Active' }, open);
  const act = useAction<JobWork>(['/jobwork', '/orders', '/materials', '/stock', '/gate', '/production'], (j) => { toast.success(`Challan ${j.challanNo} issued · material marked outside factory`); onClose(); });
  React.useEffect(() => { if (open) setF((x) => ({ ...x, orderId: orderId || '', vendorId: '', materialId: '', itemDesc: '', sentQty: 0, dueDate: new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10) })); }, [open, orderId]);
  const vlist = (vendors.data?.items ?? []).filter((v) => v.category === f.process || f.process === 'Other');
  const m = (mats.data?.items ?? []).find((x) => x.id === f.materialId);
  React.useEffect(() => { if (m) setF((x) => ({ ...x, uom: m.uom, itemDesc: x.itemDesc || m.name })); }, [m]);
  const ctx = useOrderContext(open ? f.orderId : null).data;
  const OP_OF: Record<string, string> = { Cutting: 'Cutting', Stitching: 'Stitching', Finishing: 'Finishing' };
  const opInfo = ctx?.ops?.[OP_OF[f.process] || ''];
  /* stock items offered first = this style's BOM lines; garment operations prefill the pending pieces and a description */
  const bomIds = new Set((ctx?.bom ?? []).map((l) => l.materialId));
  const matChoices = [...(mats.data?.items ?? [])].sort((a, b) => Number(bomIds.has(b.id)) - Number(bomIds.has(a.id)));
  React.useEffect(() => {
    if (!ctx) return;
    setF((x) => ({ ...x, itemDesc: x.itemDesc || (opInfo ? `${f.process === 'Cutting' ? 'Fabric for cutting' : f.process === 'Stitching' ? 'Cut panels' : 'Stitched garments'} — ${ctx.order.styleNo} ${ctx.order.description}` : x.itemDesc), sentQty: x.sentQty || (opInfo ? opInfo.pending : 0), priority: ctx.order.priority || x.priority }));
  }, [ctx, opInfo, f.process]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide meta={cf.meta}>
        <DialogHeader><DialogTitle>New Job Work Challan</DialogTitle>
          <DialogDescription>GST non-sale challan. If a stock material is issued it leaves physical stock now; anything else (cut panels, garments) is tracked by quantity only.</DialogDescription></DialogHeader>
        <DialogBody><div className="grid gap-4 sm:grid-cols-3">
          <Field label="Against Order" className="sm:col-span-2"><Select value={f.orderId} onValueChange={(v) => setF({ ...f, orderId: v, itemDesc: '', sentQty: 0 })}><SelectTrigger><SelectValue placeholder="Select order…" /></SelectTrigger>
            <SelectContent>{(orders.data?.items ?? []).map((o) => <SelectItem key={o.id} value={o.id}>{o.orderNo} · {o.styleNo} · {o.buyerName}</SelectItem>)}</SelectContent></Select></Field>
          {ctx && <div className="sm:col-span-3"><OrderFacts ctx={ctx} op={OP_OF[f.process]} /></div>}
          <Field label="Process"><Select value={f.process} onValueChange={(v) => setF({ ...f, process: v, vendorId: '' })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{(meta.data?.processes ?? [f.process]).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></Field>
          {f.process === 'Other' && <Field label="Describe the process" className="sm:col-span-3"><Input value={f.processDesc} onChange={(e) => setF({ ...f, processDesc: e.target.value })} placeholder="e.g. Hang-tag printing, button dyeing" /></Field>}
          <Field label="Vendor" className="sm:col-span-2" hint={vlist.length ? undefined : 'no active vendor for this process — add one under Vendors'}>
            <Select value={f.vendorId} onValueChange={(v) => setF({ ...f, vendorId: v })}><SelectTrigger><SelectValue placeholder="Select vendor…" /></SelectTrigger>
              <SelectContent>{vlist.map((v) => <SelectItem key={v.id} value={v.id}>{v.displayName}</SelectItem>)}</SelectContent></Select></Field>
          {canRate ? <Field label="Rate (₹ / unit)"><Input type="number" step="0.01" value={f.rate} onChange={(e) => setF({ ...f, rate: +e.target.value })} /></Field>
            : <Field label="Rate" hint="vendor rates are confidential"><Input value="restricted" readOnly /></Field>}
          <Field label="Material Issued (from stock)" className="sm:col-span-2"><Select value={f.materialId || 'none'} onValueChange={(v) => setF({ ...f, materialId: v === 'none' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">— not a stock item (panels / garments) —</SelectItem>{matChoices.map((x) => <SelectItem key={x.id} value={x.id}>{bomIds.has(x.id) ? '★ ' : ''}{x.code} · {x.name} · {fmtN(x.physicalQty)} {x.uom} in stock</SelectItem>)}</SelectContent></Select></Field>
          <Field label="UOM"><Select value={f.uom} onValueChange={(v) => setF({ ...f, uom: v })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{['pcs', 'mtr', 'kg', 'set'].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Item Description" className="sm:col-span-2" hint="pick a material from the client list or type what is going out">
            <MaterialNameInput value={f.itemDesc} onChange={(v) => setF({ ...f, itemDesc: v })} placeholder="Cut panels — Men Oxford Shirt / Rayon greige / Stitched garments" /></Field>
          <Field label="Issue Quantity" hint={opInfo ? `${fmtN(opInfo.pending)} pcs pending for ${OP_OF[f.process]}` : undefined}><Input type="number" value={f.sentQty || ''} placeholder={opInfo ? String(opInfo.pending) : ''} onChange={(e) => setF({ ...f, sentQty: +e.target.value })} /></Field>
          <Field label="Issue Date"><Input type="date" value={f.outDate} onChange={(e) => setF({ ...f, outDate: e.target.value })} /></Field>
          <Field label="Expected Return"><Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
          <Field label="Priority"><Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{['Urgent', 'High', 'Normal', 'Low'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Process Instructions" className="sm:col-span-3"><Input value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} placeholder="Shade reference, print repeat, wash standard…" /></Field>
        </div>{cf.node}</DialogBody>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={act.isPending || !f.orderId || !f.vendorId || !(f.sentQty > 0) || !f.itemDesc || (f.process === 'Other' && !f.processDesc) || !cf.ok}
            onClick={() => act.mutate({ url: '/jobwork/issue', body: { ...f, custom: cf.value, materialId: f.materialId || undefined, rate: canRate ? f.rate : undefined } })}><Check size={16} /> Issue Challan</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- challan detail: return history with running balance + print ---------- */
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
export async function printChallan(id: string) {
  try {
    const { data: d } = await api.get(`/jobwork/${id}/challan-data`);
    const j = d.jobwork, c = d.company, v = d.vendor || {}, o = d.order || {};
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Job Work Challan ${esc(j.challanNo)}</title>
<style>body{font:13px/1.45 Arial,sans-serif;color:#1f2430;margin:32px}h1{font-size:20px;margin:0}.head{display:flex;justify-content:space-between;border-bottom:3px solid #f28c4a;padding-bottom:12px}
table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border:1px solid #d8dbe2;padding:6px 8px;text-align:left}th{background:#f5f6f8;font-weight:600}.num{text-align:right}
.box{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}.box div{border:1px solid #d8dbe2;padding:10px;border-radius:6px}small{color:#666}
.sign{margin-top:48px;display:flex;gap:40px}.sign div{flex:1;border-top:1px solid #333;padding-top:6px;font-size:11px}@media print{body{margin:14mm}}</style></head><body>
<div class="head"><div><h1>${esc(c.legalName || 'Afion International')}</h1><small>${esc(c.address)}${c.gstin ? ' · GSTIN ' + esc(c.gstin) : ''}${c.phone ? ' · ' + esc(c.phone) : ''}</small>
<div style="margin-top:8px;font-size:16px;font-weight:700">Delivery Challan for Job Work (non-sale) — ${esc(j.challanNo)}</div><small>Under Section 143 CGST Act · goods sent for ${esc(j.processLabel)} · not for sale</small></div>
<div style="text-align:right"><div><b>Date:</b> ${esc(new Date(j.outDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }))}</div><div><b>Expected return:</b> ${j.dueDate ? esc(new Date(j.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })) : '—'}</div><div><b>Order:</b> ${esc(o.orderNo)} · ${esc(o.styleNo)}</div></div></div>
<div class="box"><div><b>Job worker (consignee)</b><br>${esc(v.name)}${v.gstin ? '<br>GSTIN ' + esc(v.gstin) : ''}${v.location ? '<br>' + esc(v.location) : ''}${v.contact ? '<br>' + esc(v.contact.name) + ' · ' + esc(v.contact.phone) : ''}</div>
<div><b>Process</b><br>${esc(j.processLabel)}<br><small>${esc(j.instructions || 'No special instructions')}</small></div></div>
<table><tr><th>#</th><th>Description of goods</th><th>HSN</th><th class="num">Quantity</th><th>UOM</th>${j.rate ? '<th class="num">Job rate (₹)</th>' : ''}</tr>
<tr><td>1</td><td>${esc(j.itemDesc)}${j.materialCode ? ' · ' + esc(j.materialCode) : ''}<br><small>${esc(o.description || '')}</small></td><td>—</td><td class="num">${esc(Number(j.sentQty).toLocaleString('en-IN'))}</td><td>${esc(j.uom)}</td>${j.rate ? '<td class="num">' + esc(j.rate) + '</td>' : ''}</tr></table>
<p><small>Goods to be returned within 1 year (inputs) / 3 years (capital goods) as per Section 143. Returns are received only through Afion gate entry with a GRN.</small></p>
<div class="sign"><div>Issued by (Afion)</div><div>Received by (job worker)</div><div>Vehicle / driver</div></div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) throw new Error('Pop-up blocked — allow pop-ups to print the challan');
    w.document.write(html); w.document.close();
  } catch (e) { toast.error(apiMessage(e)); }
}

export function ChallanDetailDialog({ jw, onClose }: { jw: JobWork | null; onClose: () => void }) {
  const nav = useNavigate();
  const { hasModule } = useAuth();
  const act = useAction<JobWork>(['/jobwork', '/materials', '/stock', '/orders', '/gate'], (j) => toast.success(`${j.challanNo} · ${j.status}`));
  if (!jw) return null;
  const open = ['Sent to Vendor', 'Partially Received'].includes(jw.status);
  let running = jw.sentQty;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">{jw.challanNo} <StatusPill value={jw.displayStatus} /> <Badge tone={LOC_TONE[jw.location.label] || 'mute'}>{jw.location.label}</Badge></DialogTitle>
          <DialogDescription>{jw.itemDesc} · {jw.processLabel} · {jw.vendorLabel} · for {jw.orderNo}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {[['Sent', `${fmtN(jw.sentQty)} ${jw.uom}`], ['Returned', `${fmtN(jw.returnedQty)} ${jw.uom}`], ['With Vendor', `${fmtN(jw.pendingQty)} ${jw.uom}`], ['Rejected', `${fmtN(jw.rejectedQty)} ${jw.uom}`]].map(([k, v]) => (
              <div key={k} className="rounded-xl border bg-secondary p-3"><div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">{k}</div><div className="num mt-0.5 font-slab text-lg font-bold">{v}</div></div>))}
          </div>
          {jw.billed != null && <div className="grid gap-3 sm:grid-cols-3">
            {[['Work value', fmtInr(jw.billed), `${fmtN(jw.returnedQty)} ${jw.uom} back x ${fmtInr(jw.rate)}`, ''],
              ['Paid', fmtInr(jw.paid), jw.paid ? 'against this challan' : 'nothing paid yet', 'text-teal'],
              ['Still to pay', fmtInr(jw.balance), jw.inProgress ? `${fmtInr(jw.inProgress)} still running (not billed)` : 'billed on what came back', (jw.balance ?? 0) > 0 ? 'text-bad' : 'text-teal']].map(([k, v, sub, cls]) => (
              <div key={k} className={cn('rounded-xl border p-3', k === 'Still to pay' && ((jw.balance ?? 0) > 0 ? 'border-bad/40 bg-bad-soft/50 dark:bg-bad/10' : 'border-teal/40 bg-teal-soft/40 dark:bg-teal/10'))}>
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">{k}</div>
                <div className={cn('num mt-0.5 font-slab text-lg font-bold', cls)}>{v}</div>
                <div className="text-[10.5px] text-muted-foreground">{sub}</div></div>))}
          </div>}
          <div className={cn('rounded-xl border p-3 text-[12.5px]', jw.location.label === 'IN-HOUSE' ? 'border-teal/40 bg-teal-soft dark:bg-teal/10' : jw.location.label === 'OUTSOURCED' ? 'border-brand/40 bg-brand-soft dark:bg-accent' : 'border-gold-vivid/40 bg-gold-soft dark:bg-gold-vivid/10')}>
            <b>Location:</b> {jw.location.detail} <span className="text-muted-foreground">· derived from sent − Σ returns</span>
          </div>
          <div className="grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
            {[['Issued', fmtDate(jw.outDate)], ['Expected return', fmtDate(jw.dueDate)], ['Priority', jw.priority], ['Issued by', jw.createdBy], ['Material code', jw.materialCode || '— (not a stock item)'],
              jw.rate !== undefined ? ['Rate', `₹${jw.rate} / ${jw.uom}`] : ['Rate', 'confidential'], ['Instructions', jw.instructions || '—']].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b py-1"><span className="text-muted-foreground">{k}</span><span className="text-right font-semibold">{v}</span></div>))}
          </div>
          <div className="overflow-hidden rounded-xl border">
            <div className="border-b bg-secondary px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Return history — running balance with vendor</div>
            {!jw.returns.length ? <div className="px-4 py-5 text-center text-sm text-muted-foreground">Nothing returned yet — {fmtN(jw.sentQty)} {jw.uom} with the vendor.</div>
            : <Table><THead><Tr className="hover:bg-transparent"><Th>GRN</Th><Th>Date</Th><Th className="text-right">Returned</Th><Th className="text-right">Rejected</Th><Th className="text-right">Still with vendor</Th>{jw.rate != null && <Th className="text-right">Value</Th>}<Th>Vendor challan</Th><Th>By</Th></Tr></THead>
              <TBody>{jw.returns.map((r) => { running -= r.qty; return (
                <Tr key={r.grnNo}><Td className="font-mono text-xs font-semibold">{r.grnNo}</Td><Td className="text-xs">{fmtDate(r.date)}</Td><Td className="num text-right font-semibold text-teal">+{fmtN(r.qty)}</Td>
                  <Td className="num text-right">{r.rejectedQty || '—'}</Td><Td className={cn('num text-right font-semibold', running > 0 ? 'text-brand' : 'text-muted-foreground')}>{fmtN(Math.max(running, 0))}</Td>
                  {jw.rate != null && <Td className="num text-right">{fmtInr(r.qty * (jw.rate || 0))}</Td>}<Td className="text-xs">{r.vendorChallanNo || '—'}</Td><Td className="text-xs">{r.by}</Td></Tr>); })}</TBody></Table>}
          </div>
        </DialogBody>
        <DialogFooter className="flex-wrap">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button variant="secondary" asChild><Link to={`/orders/${jw.orderId}`}>{jw.orderNo}</Link></Button>
          <Button variant="secondary" onClick={() => printChallan(jw.id)}><Print size={16} /> Print Challan</Button>
          {open && !jw.returnedQty && <Button variant="destructive" onClick={() => act.mutate({ url: `/jobwork/${jw.id}/cancel` })}><Power size={16} /> Cancel Challan</Button>}
          {open && hasModule('gate') && <Button onClick={() => { onClose(); nav(`/gate?jw=${jw.id}`); }}><GateIcon size={16} /> Receive at Gate</Button>}
          {!open && jw.status === 'Received' && <Badge tone="ok"><Refresh size={12} /> fully returned</Badge>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
