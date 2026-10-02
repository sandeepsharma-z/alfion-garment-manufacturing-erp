import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { fmtN, fmtDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton, Table, THead, TBody, Tr, Th, Td, Badge } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertStrip } from '@/components/AlertStrip';
import { PageHeader, KpiTile, Field, StatusPill, EmptyState, OrderLink, Bar } from '@/components/shared';
import { Packing as PackIcon, Alert, Dispatch as Ship, Check, Po as PoIcon, Print, Edit } from '@/icons/icons';
import { NewPoDialog, type PoPrefill } from '@/features/po/PoDialogs';
import { printDoc } from '@/features/dispatch/ExportDocs';
import type { Dispatch } from '@/features/dispatch/DispatchPage';
import { useList } from '@/lib/crud';

type Item = { id: string; code: string; name: string; uom: string; physicalQty: number; reservedQty: number; freeQty: number; required: number; balance: number; onOrder: number; status: string; supplierName: string; reorderLevel: number };
type Plan = { orderId: string; orderNo: string; styleNo: string; buyerName: string; qty: number; shipDate?: string; priority: string; packRatio: string; pcsPerCarton: number; cartons: number; packed: number; toPack: number; status: string; shortLines: string[]; packingLines: number; colours?: string[]; sizeSet?: string[] };
type Overview = { items: Item[]; plans: Plan[]; kpi: { cartonsInStock: number; cartonsReserved: number; shortfalls: string[]; cartonsToBuild: number; packedToday: number; packedTodayOrders: string[] } };
const RATIOS = ['Solid size, solid colour', 'Solid colour, assorted size', 'Ratio pack 1-2-2-1', 'Ratio pack 2-2-1', 'Ratio pack 1-2-3-2-1-1'];
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export default function PackingPage() {
  const { hasModule } = useAuth();
  const [po, setPo] = React.useState<PoPrefill | null>(null);
  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [logFor, setLogFor] = React.useState<Plan | null>(null);
  const q = useQuery<Overview>({ queryKey: ['/packing', 'overview'], queryFn: async () => (await api.get('/packing/overview')).data });
  /* the shipment of an order — its cartons and the buyer-format packing list live there */
  const ships = useList<Dispatch>('/dispatch', { size: 500 });
  const shipOf = (orderId: string) => (ships.data?.items ?? []).find((x) => x.orderId === orderId || (x.lines || []).some((l) => l.orderId === orderId));
  const d = q.data;
  const k = d?.kpi;

  const printList = async (p: Plan) => {
    try {
      const { data } = await api.get(`/packing/list-data/${p.orderId}`);
      const o = data.order, c = data.company;
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Packing List ${esc(o.orderNo)}</title>
<style>body{font:13px/1.45 Arial,sans-serif;color:#1f2430;margin:32px}h1{font-size:20px;margin:0}.head{display:flex;justify-content:space-between;border-bottom:3px solid #f28c4a;padding-bottom:12px}
table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border:1px solid #d8dbe2;padding:6px 8px;text-align:left}th{background:#f5f6f8}.num{text-align:right}small{color:#666}@media print{body{margin:14mm}}</style></head><body>
<div class="head"><div><h1>${esc(c.legalName || 'Afion International')}</h1><small>${esc(c.address)}${c.iec ? ' · IEC ' + esc(c.iec) : ''}</small><div style="margin-top:8px;font-size:16px;font-weight:700">Packing List — ${esc(o.orderNo)} · ${esc(o.styleNo)}</div></div>
<div style="text-align:right"><div><b>Buyer:</b> ${esc(o.buyerName)}</div><div><b>Buyer PO:</b> ${esc(o.buyerPoNo || '—')}</div><div><b>Ship:</b> ${o.shipDate ? esc(new Date(o.shipDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })) : '—'} · by ${esc(o.mode)}</div></div></div>
<p><b>${esc(o.description)}</b> · ${esc(o.colour || '')} · ${esc(Number(o.qty).toLocaleString('en-IN'))} pcs · ${esc(o.packRatio || 'pack ratio not set')} · ${esc(o.pcsPerCarton)} pcs/carton · <b>${esc(o.cartons)} cartons</b></p>
<table><tr><th>Size</th>${o.sizes.map((s: { size: string }) => `<th class="num">${esc(s.size)}</th>`).join('')}<th class="num">Total</th></tr>
<tr><td>Order quantity</td>${o.sizes.map((s: { qty: number }) => `<td class="num">${esc(Number(s.qty).toLocaleString('en-IN'))}</td>`).join('')}<td class="num"><b>${esc(Number(o.qty).toLocaleString('en-IN'))}</b></td></tr>
<tr><td>Per carton (${esc(o.pcsPerCarton)} pcs)</td>${data.perCarton.map((s: { qty: number }) => `<td class="num">${esc(s.qty)}</td>`).join('')}<td class="num"><b>${esc(o.pcsPerCarton)}</b></td></tr></table>
<p><small>Carton-wise assortment, gross/net weights and dimensions are finalised at dispatch (Phase 5). Generated by Afion ERP.</small></p>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`;
      const w = window.open('', '_blank');
      if (!w) throw new Error('Pop-up blocked — allow pop-ups to print the packing list');
      w.document.write(html); w.document.close();
    } catch (e) { toast.error(apiMessage(e)); }
  };

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Packing & Cartons" sub="Packing material is checked before an order enters the packing stage. A negative balance blocks Packing on the Control Tower until the material arrives through the gate.">
        {hasModule('po') && <Button variant="secondary" onClick={() => setPo({})}><PoIcon size={17} /> Order Packing Material</Button>}
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={PackIcon} label="Cartons In Stock" value={fmtN(k?.cartonsInStock)} tone="teal" foot={`${fmtN(k?.cartonsReserved)} reserved`} />
        <KpiTile icon={Alert} label="Packing Shortfall" value={k?.shortfalls.length ?? '—'} tone={k?.shortfalls.length ? 'bad' : 'teal'} foot={k?.shortfalls[0] || 'all packing material sufficient'} />
        <KpiTile icon={Ship} label="Cartons To Build" value={fmtN(k?.cartonsToBuild)} tone="info" foot="for orders still to pack" />
        <KpiTile icon={Check} label="Packed Today" value={fmtN(k?.packedToday)} tone="brand" foot={k?.packedTodayOrders.length ? k.packedTodayOrders.join(' · ') : 'pcs · from packing logs'} />
      </div>

      <AlertStrip module="packing" />

      {/* carton plan per order — plan · progress · material · actions, one panel per open order */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0"><div><CardTitle>Carton Plan by Order</CardTitle><p className="text-xs text-muted-foreground">Pack ratio · pcs per carton · cartons = ceil(qty ÷ pcs per carton) · packed pieces are logged here — the production floor only shows the numbers</p></div><Badge tone="plain">{d?.plans.length ?? 0} open orders</Badge></CardHeader>
        <CardContent className="p-0">
          {q.isLoading ? <div className="space-y-2 p-5"><Skeleton className="h-9" /></div>
          : !d?.plans.length ? <EmptyState title="No open orders" />
          : <div className="divide-y">{d.plans.map((p) => { const pct = p.qty ? Math.min(Math.round(p.packed * 100 / p.qty), 100) : 0; const built = p.pcsPerCarton ? Math.floor(p.packed / p.pcsPerCarton) : 0; return (
            <div key={p.orderId} className="grid gap-4 px-4 py-4 lg:grid-cols-[240px_1fr_1fr_auto]">
              <div><OrderLink id={p.orderId} className="font-mono text-[13px] font-bold text-brand hover:underline">{p.orderNo}</OrderLink>{p.priority !== 'Normal' && <Badge tone={p.priority === 'Urgent' ? 'bad' : 'warn'} className="ml-1.5 text-[9px]">{p.priority}</Badge>}<div className="text-[11.5px] text-muted-foreground">{p.styleNo} · {p.buyerName}</div><div className="text-[11.5px] text-muted-foreground">{fmtN(p.qty)} pcs · ship {fmtDate(p.shipDate)}</div><div className="mt-1.5"><StatusPill value={p.status} /></div></div>
              <div className="grid grid-cols-3 gap-2">
                {[['Pack ratio', p.packRatio || '—', p.packRatio ? '' : 'not set'], ['Pcs / carton', p.pcsPerCarton ? String(p.pcsPerCarton) : '—', ''], ['Cartons', p.cartons ? fmtN(p.cartons) : '—', p.cartons ? `${fmtN(built)} built` : '']].map(([k, v, f]) => <div key={k} className="rounded-lg border bg-secondary/60 px-3 py-2"><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{k}</div><div className={cn('truncate font-bold', k === 'Pack ratio' ? 'text-[12px]' : 'num text-[15px]')} title={v}>{v}</div>{f && <div className="text-[10.5px] text-muted-foreground">{f}</div>}</div>)}
              </div>
              <div className="flex flex-col justify-center">
                <div className="mb-1 flex items-center justify-between text-[11.5px]"><span className="font-semibold">Packed <span className="num">{fmtN(p.packed)}</span> of <span className="num">{fmtN(p.qty)}</span></span><span className={cn('text-[10.5px] font-semibold', pct >= 100 ? 'text-teal' : 'text-muted-foreground')}>{pct >= 100 ? 'ready for final AQL' : 'packing'}</span></div>
                <Bar pct={pct} tone={pct >= 100 ? 'ok' : 'brand'} />
                <div className="mt-1.5 text-[11px] text-muted-foreground">{p.toPack ? `${fmtN(p.toPack)} pcs to pack` : 'fully packed'}{p.shortLines.length > 0 && <span className="text-bad"> · short: {p.shortLines.join(', ')}</span>}{!p.packingLines && <span> · no packing lines in the BOM</span>}</div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 lg:flex-col lg:items-stretch">
                <Button size="sm" variant={p.pcsPerCarton ? 'secondary' : 'default'} onClick={() => setPlan(p)}><Edit size={14} /> {p.pcsPerCarton ? 'Edit plan' : 'Set plan'}</Button>
                <Button size="sm" variant={p.toPack > 0 && p.pcsPerCarton ? 'default' : 'secondary'} disabled={!p.toPack} onClick={() => setLogFor(p)}><PackIcon size={14} /> Log packing</Button>
                {(() => { const sp = shipOf(p.orderId); return sp
                  ? <>
                    <Button size="sm" variant="secondary" onClick={() => printDoc(sp.id, 'Packing List')} title={`Buyer format · ${sp.invoiceNo} · ${sp.cartons} cartons`}><Print size={14} /> Packing list</Button>
                    <Button size="sm" variant="secondary" asChild><Link to="/dispatch"><Ship size={14} /> {sp.invoiceNo}</Link></Button>
                  </>
                  : <>
                    <Button size="sm" variant="secondary" disabled={!p.pcsPerCarton} onClick={() => printList(p)} title="Carton plan of this order — the buyer's packing list comes from the shipment"><Print size={14} /> Carton plan</Button>
                    {hasModule('dispatch') && <Button size="sm" variant="secondary" disabled={p.packed <= 0} asChild><Link to={`/dispatch?order=${p.orderId}`}><Ship size={14} /> Ship / invoice</Link></Button>}
                  </>; })()}
              </div>
            </div>); })}</div>}
        </CardContent>
      </Card>

      {/* packing material — full width */}
      <Card>
        <CardHeader><div><CardTitle>Packing Material Check</CardTitle><p className="text-xs text-muted-foreground">Required = cartons and trims for every order not yet packed (BOM × quantity to pack) · Balance = free stock − required</p></div></CardHeader>
        <CardContent className="p-0">
          {q.isLoading ? <div className="space-y-2 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
          : !d?.items.length ? <EmptyState title="No packing material" text="Add cartons, poly bags and stickers under Stock & Inventory (category Packing)." />
          : <Table>
            <THead><Tr className="hover:bg-transparent"><Th>Packing Material</Th><Th>Supplier</Th><Th className="text-right">Free Stock</Th><Th className="text-right">Required</Th><Th className="w-40">Coverage</Th><Th className="text-right">Balance</Th><Th className="text-right">On Order</Th><Th>Status</Th>{hasModule('po') && <Th className="text-right">Action</Th>}</Tr></THead>
            <TBody>{(d?.items ?? []).map((m) => { const cov = m.required ? Math.min(Math.round(m.freeQty * 100 / m.required), 100) : 100; return (
              <Tr key={m.id}>
                <Td><div className="font-semibold">{m.name}</div><div className="font-mono text-[11px] text-muted-foreground">{m.code}</div></Td>
                <Td className="text-xs text-muted-foreground">{m.supplierName || '—'}</Td>
                <Td className="num text-right">{fmtN(m.freeQty)} <span className="text-[10px] text-muted-foreground">{m.uom}</span></Td>
                <Td className="num text-right">{m.required ? fmtN(m.required) : '—'}</Td>
                <Td><Bar pct={cov} tone={cov >= 100 ? 'ok' : cov >= 60 ? 'warn' : 'bad'} /></Td>
                <Td className={cn('num text-right font-semibold', m.balance < 0 && 'text-bad')}>{fmtN(m.balance)}</Td>
                <Td className="num text-right">{m.onOrder ? <span className="text-info">{fmtN(m.onOrder)}</span> : '—'}</Td>
                <Td><Badge tone={m.balance < 0 ? 'bad' : 'ok'}>{m.status}</Badge></Td>
                {hasModule('po') && <Td className="text-right">{m.balance < 0 ? <Button size="sm" onClick={() => setPo({ materialId: m.id, qty: Math.max(-m.balance - m.onOrder, 0) })}><PoIcon size={14} /> Reorder</Button> : <Button size="sm" variant="secondary" onClick={() => setPo({ materialId: m.id })}><PoIcon size={14} /> PO</Button>}</Td>}
              </Tr>); })}</TBody>
          </Table>}
        </CardContent>
      </Card>
      <PlanDialog plan={plan} onClose={() => setPlan(null)} />
      <LogPackingDialog p={logFor} onClose={() => setLogFor(null)} />
      <NewPoDialog open={!!po} prefill={po ?? undefined} onClose={() => setPo(null)} />
    </div>
  );
}

function PlanDialog({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState({ packRatio: '', pcsPerCarton: 0 });
  React.useEffect(() => { if (plan) setF({ packRatio: plan.packRatio || RATIOS[0], pcsPerCarton: plan.pcsPerCarton || 50 }); }, [plan]);
  const save = useMutation({
    mutationFn: async () => (await api.put(`/packing/plan/${plan!.orderId}`, f)).data,
    onSuccess: (d: { orderNo: string; cartons: number }) => { toast.success(`${d.orderNo} · ${fmtN(d.cartons)} cartons planned`); qc.invalidateQueries({ queryKey: ['/packing'] }); onClose(); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  if (!plan) return null;
  const cartons = f.pcsPerCarton ? Math.ceil(plan.qty / f.pcsPerCarton) : 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Carton Plan — {plan.orderNo}</DialogTitle><DialogDescription>{plan.styleNo} · {fmtN(plan.qty)} pcs</DialogDescription></DialogHeader>
        <DialogBody><div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pack Ratio" className="sm:col-span-2"><Select value={f.packRatio} onValueChange={(v) => setF({ ...f, packRatio: v })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{[...new Set([...RATIOS, f.packRatio].filter(Boolean))].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Pcs per Carton" hint="type or pick below"><Input type="number" min={1} value={f.pcsPerCarton || ''} onChange={(e) => setF({ ...f, pcsPerCarton: Math.max(+e.target.value || 0, 0) })} /></Field>
          <Field label="Cartons" hint={f.pcsPerCarton ? `calculated · ceil(${fmtN(plan.qty)} ÷ ${f.pcsPerCarton})` : 'set pcs per carton first'}>
            <Input readOnly tabIndex={-1} className="bg-secondary font-semibold" value={cartons ? fmtN(cartons) : '—'} /></Field>
          <div className="sm:col-span-2">
            <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Common pack sizes</div>
            <div className="flex flex-wrap gap-1.5">{[100, 120, 150, 200, 250, 300, 400, 500].map((n) => (
              <button key={n} type="button" onClick={() => setF({ ...f, pcsPerCarton: n })}
                className={cn('rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold', f.pcsPerCarton === n ? 'border-brand bg-brand-soft text-brand dark:bg-accent' : 'text-muted-foreground hover:border-brand')}>
                {n} pcs <span className="font-normal">· {fmtN(Math.ceil(plan.qty / n))} ctn</span></button>))}</div>
          </div>
        </div></DialogBody>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={save.isPending || !(f.pcsPerCarton > 0)} onClick={() => save.mutate()}><Check size={16} /> Save Plan</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- log packed pieces (packing is owned by this page, not the floor) ---------- */
function LogPackingDialog({ p, onClose }: { p: Plan | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState({ output: '', colour: '', note: '' });
  React.useEffect(() => { if (p) setF({ output: String(p.toPack || ''), colour: (p.colours || []).length === 1 ? p.colours![0] : '', note: '' }); }, [p]);
  const remaining = p ? p.toPack : 0;
  const over = +f.output > remaining;
  const post = useMutation({
    mutationFn: async () => (await api.post(`/packing/log/${p!.orderId}`, { output: +f.output || 0, colour: f.colour || undefined, note: f.note || undefined })).data,
    onSuccess: () => { toast.success(`${fmtN(+f.output)} pcs packed · ${p!.orderNo}`); ['/packing', '/production', '/orders', '/tna', '/dispatch'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onClose(); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  if (!p) return null;
  const per = p.pcsPerCarton || 0;
  const ctn = per && +f.output ? Math.ceil(+f.output / per) : 0;
  const colours = p.colours && p.colours.length ? p.colours : [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Log packing · {p.orderNo}</DialogTitle>
          <DialogDescription>{p.styleNo} · {p.buyerName} · {fmtN(p.packed)} of {fmtN(p.qty)} pcs packed so far{per ? ` · ${per} pcs / carton` : ' · pack plan not set'}</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Pieces packed" hint={`${fmtN(remaining)} pcs still to pack${per ? ` · ${per} pcs / carton` : ''}`}>
              <Input type="number" min={1} max={remaining || undefined} value={f.output}
                onChange={(e) => setF({ ...f, output: e.target.value === '' ? '' : String(Math.min(Math.max(+e.target.value || 0, 0), remaining)) })} />
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {[0.25, 0.5, 1].map((x) => { const n = Math.round(remaining * x); return n > 0 ? (
                  <button key={x} type="button" onClick={() => setF({ ...f, output: String(n) })}
                    className={cn('rounded-md border px-2 py-0.5 text-[10.5px] font-semibold', +f.output === n ? 'border-brand bg-brand-soft text-brand dark:bg-accent' : 'text-muted-foreground hover:border-brand')}>
                    {x === 1 ? `all ${fmtN(n)}` : fmtN(n)}</button>) : null; })}
                {ctn ? <span className="text-[10.5px] text-muted-foreground">= {fmtN(ctn)} carton{ctn === 1 ? '' : 's'}{p.cartons ? ` of ${fmtN(p.cartons)} planned` : ''}</span> : null}
              </div>
            </Field>
            <Field label="Colour" hint={colours.length > 1 ? 'colours of this order' : colours.length ? 'the only colour on this order' : 'no colour grid on this order'}>
              {colours.length > 1
                ? <Select value={f.colour || 'all'} onValueChange={(v) => setF({ ...f, colour: v === 'all' ? '' : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="all">— all colours —</SelectItem>{colours.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                : <Input value={f.colour} onChange={(e) => setF({ ...f, colour: e.target.value })} placeholder={colours[0] || 'White / Black'} />}
            </Field>
            <Field label="Note" className="sm:col-span-2"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="poly bagged + hangtag, ready for final AQL" /></Field>
          </div>
          <p className="text-[11.5px] text-muted-foreground">This closes the Packing activity on the T&amp;A plan by itself once every piece is packed, and the order becomes ready for the final AQL and the invoice.</p>
        </DialogBody>
        <DialogFooter>
          {over && <span className="mr-auto text-[11.5px] font-semibold text-bad">Only {fmtN(remaining)} pcs are left to pack</span>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={post.isPending || !(+f.output > 0) || over} onClick={() => post.mutate()}><Check size={16} /> Log packing</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
