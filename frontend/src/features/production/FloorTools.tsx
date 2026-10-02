import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useList, fmtN, fmtDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { useCustomFields } from '@/components/CustomFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton, Table, THead, TBody, Tr, Th, Td, Badge } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, EmptyState, OrderLink, useOrderContext, OrderFacts, opBalance } from '@/components/shared';
import { Plus, Check, Print, Trash } from '@/icons/icons';
import { openPrint, companyHead } from '@/features/samples/StyleTools';

type OrderLite = { id: string; orderNo: string; styleNo: string; buyerName: string; colours?: { code: string; name: string; qty: number; cutQty: number }[]; sizeSet?: string[]; sizes: { size: string; qty: number }[]; cutQty: number; qty: number };
type MaterialLite = { id: string; code: string; name: string; uom: string; category: string };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const useOpenOrders = (enabled = true) => useList<OrderLite>('/orders', { size: 200, status: 'Open' }, enabled);
const colourNames = (o?: OrderLite) => (o?.colours ?? []).map((c) => c.name || c.code).filter(Boolean);

/* ============================ shared filter: order + period (kept in the URL so stage cells / TNA links can deep-link) ============================ */
export type FloorFilter = { orderId: string; period: 'today' | 'week' | 'month' | 'all' | 'custom'; from: string; to: string };
const day = (d: string | Date) => new Date(d).toISOString().slice(0, 10);
export const periodRange = (f: FloorFilter): { from?: string; to?: string } => {
  const t = new Date(); const today = day(t);
  if (f.period === 'today') return { from: today, to: today };
  if (f.period === 'week') { const m = new Date(t); m.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return { from: day(m), to: today }; }
  if (f.period === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  if (f.period === 'custom') return { from: f.from || undefined, to: f.to || undefined };
  return {};
};
export function useFloorFilter(): [FloorFilter, (patch: Partial<FloorFilter>) => void] {
  const [sp, setSp] = useSearchParams();
  const f: FloorFilter = { orderId: sp.get('order') || '', period: (['today', 'week', 'month', 'all', 'custom'].includes(sp.get('period') || '') ? sp.get('period') : 'week') as FloorFilter['period'], from: sp.get('from') || '', to: sp.get('to') || '' };
  const set = (patch: Partial<FloorFilter>) => { const n = { ...f, ...patch }; const next = new URLSearchParams(sp); ['order', 'period', 'from', 'to'].forEach((k) => next.delete(k)); if (n.orderId) next.set('order', n.orderId); if (n.period !== 'week') next.set('period', n.period); if (n.period === 'custom') { if (n.from) next.set('from', n.from); if (n.to) next.set('to', n.to); } setSp(next, { replace: true }); };
  return [f, set];
}
export function FloorFilterBar({ filter, onChange, hint }: { filter: FloorFilter; onChange: (p: Partial<FloorFilter>) => void; hint?: string }) {
  const orders = useOpenOrders();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-card">
      <Select value={filter.orderId || 'all'} onValueChange={(v) => onChange({ orderId: v === 'all' ? '' : v })}><SelectTrigger className="h-8 w-64"><SelectValue placeholder="All orders" /></SelectTrigger><SelectContent><SelectItem value="all">All open orders</SelectItem>{(orders.data?.items ?? []).map((o) => <SelectItem key={o.id} value={o.id}>{o.orderNo} · {o.styleNo} · {o.buyerName}</SelectItem>)}</SelectContent></Select>
      <div className="flex rounded-lg border bg-secondary p-0.5 text-[12px] font-semibold">{([['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['all', 'All time'], ['custom', 'Custom']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => onChange({ period: k })} className={cn('rounded-md px-2.5 py-1', filter.period === k ? 'bg-card shadow-card' : 'text-muted-foreground')}>{l}</button>)}</div>
      {filter.period === 'custom' && <><Input type="date" className="h-8 w-36" value={filter.from} onChange={(e) => onChange({ from: e.target.value })} /><span className="text-muted-foreground">→</span><Input type="date" className="h-8 w-36" value={filter.to} onChange={(e) => onChange({ to: e.target.value })} /></>}
      {filter.orderId && <button type="button" className="text-[12px] font-semibold text-brand hover:underline" onClick={() => onChange({ orderId: '' })}>× all orders</button>}
      {hint && <span className="ml-auto text-[11.5px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

/* ============================ Daily Cutting Report (AFN/11) ============================ */
type Cut = { id: string; cutNo: string; date: string; orderNo: string; styleNo: string; colour: string; materialCode: string; materialName: string; lotNo: string; thans: number; widthInches: number; layers: number; totalMeters: number; consumedMeters: number; endBitsMeters: number; sizes: Record<string, number>; cutPcs: number; avgPerPc: number; table: string; cutter: string; remarks: string; by: string };

export function CuttingPanel({ lines, filter }: { lines: string[]; filter: FloorFilter }) {
  const [adding, setAdding] = React.useState(false);
  const range = periodRange(filter);
  const list = useList<Cut>('/production/cutting', { size: 500, orderId: filter.orderId || undefined, ...range });
  const rows = list.data?.items ?? [];
  const print = async () => {
    const head = await companyHead('Daily Cutting Report', 'cuttingReport');
    const sizes = [...new Set(rows.flatMap((r) => Object.keys(r.sizes)))];
    openPrint('Daily Cutting Report', head + `<table><tr><th>Date</th><th>Cut no</th><th>Order · style</th><th>Colour</th><th>Fabric · lot</th><th class="num">Thans</th><th class="num">Width</th><th class="num">Layers</th><th class="num">Issued m</th><th class="num">Consumed m</th>${sizes.map((s) => `<th class="num">${esc(s)}</th>`).join('')}<th class="num">Cut pcs</th><th class="num">Avg m/pc</th><th>Table · cutter</th></tr>${rows.map((r) => `<tr><td>${fmtDate(r.date)}</td><td>${esc(r.cutNo)}</td><td>${esc(r.orderNo)} · ${esc(r.styleNo)}</td><td>${esc(r.colour)}</td><td>${esc(r.materialCode)} ${esc(r.lotNo)}</td><td class="num">${r.thans || ''}</td><td class="num">${r.widthInches || ''}</td><td class="num">${r.layers || ''}</td><td class="num">${r.totalMeters || ''}</td><td class="num">${r.consumedMeters || ''}</td>${sizes.map((s) => `<td class="num">${r.sizes[s] ?? ''}</td>`).join('')}<td class="num"><b>${r.cutPcs}</b></td><td class="num">${r.avgPerPc || ''}</td><td>${esc(r.table)} ${esc(r.cutter)}</td></tr>`).join('')}</table><div class="sign"><div>Cutting master</div><div>Production manager</div></div>`);
  };
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div><CardTitle>Daily Cutting Report</CardTitle><p className="text-xs text-muted-foreground">Fabric lot → lay → size-wise cut pieces. Each report posts a Cutting log for the order and issues the consumed fabric from stock.</p></div>
        <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={print} disabled={!rows.length}><Print size={14} /> Print AFN/11</Button><Button size="sm" onClick={() => setAdding(true)}><Plus size={14} /> Cutting report</Button></div>
      </CardHeader>
      <CardContent className="p-0">
        {list.isLoading ? <div className="space-y-2 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
        : !rows.length ? <EmptyState title="No cutting reports" text="Record the day's lays here — the order's Cutting operation advances automatically." action={<Button onClick={() => setAdding(true)}><Plus size={15} /> Cutting report</Button>} />
        : <Table>
          <THead><Tr className="hover:bg-transparent"><Th>Cut no</Th><Th>Date</Th><Th>Order · style</Th><Th>Colour</Th><Th>Fabric · lot</Th><Th className="text-right">Layers</Th><Th className="text-right">Fabric (m)</Th><Th>Sizes</Th><Th className="text-right">Cut pcs</Th><Th className="text-right">Avg m/pc</Th><Th>Table</Th></Tr></THead>
          <TBody>{rows.map((r) => <Tr key={r.id}>
            <Td className="font-mono text-xs font-bold">{r.cutNo}</Td><Td className="text-xs">{fmtDate(r.date)}</Td>
            <Td className="text-xs"><span className="font-mono font-semibold">{r.orderNo}</span> · {r.styleNo}</Td><Td className="text-xs">{r.colour || '—'}</Td>
            <Td className="text-xs">{r.materialCode || r.materialName || '—'}{r.lotNo ? <div className="text-[10.5px] text-muted-foreground">lot {r.lotNo}{r.thans ? ` · ${r.thans} thans` : ''}{r.widthInches ? ` · ${r.widthInches}"` : ''}</div> : null}</Td>
            <Td className="num text-right">{r.layers || '—'}</Td><Td className="num text-right">{r.consumedMeters || r.totalMeters || '—'}{r.endBitsMeters ? <div className="text-[10px] text-muted-foreground">ends {r.endBitsMeters}</div> : null}</Td>
            <Td className="text-[11px]">{Object.entries(r.sizes).map(([s, n]) => `${s}:${n}`).join(' ')}</Td>
            <Td className="num text-right font-semibold text-teal">{fmtN(r.cutPcs)}</Td><Td className="num text-right text-xs">{r.avgPerPc || '—'}</Td><Td className="text-xs">{r.table || '—'}{r.cutter ? ` · ${r.cutter}` : ''}</Td>
          </Tr>)}
            <Tr className="bg-secondary/60 font-semibold hover:bg-secondary/60"><Td colSpan={6}>Total · {rows.length} report{rows.length === 1 ? '' : 's'}</Td><Td className="num text-right">{fmtN(Math.round(rows.reduce((a, r) => a + (r.consumedMeters || r.totalMeters || 0), 0) * 10) / 10)}</Td><Td /><Td className="num text-right text-teal">{fmtN(rows.reduce((a, r) => a + r.cutPcs, 0))}</Td><Td colSpan={2} /></Tr></TBody>
        </Table>}
      </CardContent>
      <CuttingDialog open={adding} lines={lines} orderId={filter.orderId || undefined} onClose={() => setAdding(false)} />
    </Card>
  );
}

export function CuttingDialog({ open, lines, onClose, orderId }: { open: boolean; lines: string[]; onClose: () => void; orderId?: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const orders = useOpenOrders(open);
  const mats = useList<MaterialLite>('/materials', { size: 500, status: 'Active', category: 'Fabric' }, open);
  const [f, setF] = React.useState({ orderId: orderId || '', colour: '', materialId: '', lotNo: '', thans: '', widthInches: '', layers: '', totalMeters: '', consumedMeters: '', endBitsMeters: '', table: '', cutter: '', remarks: '', date: new Date().toISOString().slice(0, 10) });
  const [sizes, setSizes] = React.useState<Record<string, string>>({});
  const cf = useCustomFields('cutting', null, open ? 'open' : 'closed', 3);
  const o = (orders.data?.items ?? []).find((x) => x.id === f.orderId);
  const sizeList = o ? (o.sizeSet?.length ? o.sizeSet : o.sizes.map((s) => s.size)) : [];
  const ctx = useOrderContext(open ? f.orderId : null).data;
  /* fabric choices = this style's BOM fabrics (all fabrics only when the BOM has none); one fabric → picked for you */
  const bomFabrics = (ctx?.bom ?? []).filter((l) => l.category === 'Fabric' && (!f.colour || !l.colour || l.colour.toLowerCase() === f.colour.toLowerCase()));
  const fabricChoices = bomFabrics.length ? bomFabrics.map((l) => ({ id: l.materialId, code: l.code, name: l.name, uom: l.uom, category: 'Fabric', extra: `${l.part ? l.part + ' · ' : ''}${fmtN(l.inStock)} ${l.uom} in stock` })) : (mats.data?.items ?? []).map((m) => ({ ...m, extra: '' }));
  React.useEffect(() => { if (bomFabrics.length === 1 && !f.materialId) setF((x) => ({ ...x, materialId: bomFabrics[0].materialId })); }, [bomFabrics.length, f.materialId]);   // eslint-disable-line react-hooks/exhaustive-deps
  const lots = (ctx?.fabricLots ?? []).filter((l) => l.lotNo && (!f.materialId || l.materialId === f.materialId));
  const pickLot = (lotNo: string) => { const l = lots.find((x) => x.lotNo === lotNo); setF((x) => ({ ...x, lotNo, thans: l && l.thans ? String(l.thans) : x.thans, widthInches: l && l.actualWidth ? String(l.actualWidth) : x.widthInches, materialId: l ? l.materialId : x.materialId })); };
  /* size-wise plan for the chosen colour (or the whole order) and what the cutting reports have already cut */
  const planFor = (s: string) => { const cols = f.colour ? (ctx?.order.colours ?? []).filter((c) => c.name === f.colour || c.code === f.colour) : (ctx?.order.colours ?? []); const fromColours = cols.reduce((a, c) => a + (c.sizes.find((z) => z.size === s)?.cutQty || c.sizes.find((z) => z.size === s)?.qty || 0), 0); return fromColours || (f.colour ? 0 : (ctx?.order.sizes.find((z) => z.size === s)?.qty || 0)); };
  const cutFor = (s: string) => (f.colour ? (ctx?.cutBySize[f.colour]?.[s] || 0) : Object.values(ctx?.cutBySize ?? {}).reduce((a, m) => a + (m[s] || 0), 0));
  const fillBalance = () => setSizes(Object.fromEntries(sizeList.map((s) => [s, String(Math.max(planFor(s) - cutFor(s), 0) || '')])));
  React.useEffect(() => { if (open) { setF((x) => ({ ...x, orderId: orderId || x.orderId, cutter: user?.name || '' })); setSizes({}); } }, [open, orderId, user]);
  const post = useMutation({ mutationFn: async () => (await api.post('/production/cutting', { ...f, sizes, custom: cf.value })).data,
    onSuccess: (d: Cut) => { toast.success(`${d.cutNo} · ${fmtN(d.cutPcs)} pcs cut`); ['/production', '/orders', '/stock', '/materials', '/tna'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onClose(); }, onError: (e) => toast.error(apiMessage(e)) });
  const cutPcs = Object.values(sizes).reduce((a, v) => a + (+v || 0), 0);
  const consumed = +f.consumedMeters || +f.totalMeters || 0;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent wide meta={cf.meta}>
        <DialogHeader><DialogTitle>Daily Cutting Report</DialogTitle><DialogDescription>Lot, thans, width and layers of the lay; size-wise cut pieces. Consumed metres are issued from stock against the order.</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Field label="Order" className="lg:col-span-2"><Select value={f.orderId} onValueChange={(v) => { setF({ ...f, orderId: v, colour: '' }); setSizes({}); }}><SelectTrigger><SelectValue placeholder="Open orders…" /></SelectTrigger><SelectContent>{(orders.data?.items ?? []).map((x) => <SelectItem key={x.id} value={x.id}>{x.orderNo} · {x.styleNo} · {x.buyerName}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Colour">{colourNames(o).length ? <Select value={f.colour || 'none'} onValueChange={(v) => setF({ ...f, colour: v === 'none' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">—</SelectItem>{colourNames(o).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select> : <Input value={f.colour} onChange={(e) => setF({ ...f, colour: e.target.value })} />}</Field>
            <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            {ctx && <div className="sm:col-span-3 lg:col-span-4"><OrderFacts ctx={ctx} op="Cutting" colour={f.colour || undefined} /></div>}
            <Field label="Fabric" className="lg:col-span-2" hint={bomFabrics.length ? `from the BOM of ${ctx?.order.styleNo}` : ctx ? 'no fabric line in the BOM — all fabrics shown' : undefined}><Select value={f.materialId || 'none'} onValueChange={(v) => setF({ ...f, materialId: v === 'none' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">— not from stock —</SelectItem>{fabricChoices.map((m) => <SelectItem key={m.id} value={m.id}>{m.code} · {m.name}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Lot no" hint={lots.length ? 'lots received at the gate for this fabric' : undefined}>{lots.length ? <Select value={f.lotNo || 'none'} onValueChange={(v) => (v === 'none' ? setF({ ...f, lotNo: '' }) : v === 'other' ? setF({ ...f, lotNo: '' }) : pickLot(v))}><SelectTrigger><SelectValue placeholder="lot" /></SelectTrigger><SelectContent><SelectItem value="none">—</SelectItem>{lots.map((l) => <SelectItem key={`${l.grnNo}-${l.lotNo}`} value={l.lotNo}>{l.lotNo} · {l.colour || l.materialCode} · {fmtN(l.actualLength)} m · {l.grnNo}</SelectItem>)}</SelectContent></Select> : <Input value={f.lotNo} onChange={(e) => setF({ ...f, lotNo: e.target.value })} />}</Field>
            <Field label="Thans"><Input type="number" value={f.thans} onChange={(e) => setF({ ...f, thans: e.target.value })} /></Field>
            <Field label="Width (inches)"><Input type="number" value={f.widthInches} onChange={(e) => setF({ ...f, widthInches: e.target.value })} /></Field>
            <Field label="Layers (plies)"><Input type="number" value={f.layers} onChange={(e) => setF({ ...f, layers: e.target.value })} /></Field>
            <Field label="Fabric issued (m)"><Input type="number" step="0.1" value={f.totalMeters} onChange={(e) => setF({ ...f, totalMeters: e.target.value })} /></Field>
            <Field label="Fabric consumed (m)" hint="issued from stock"><Input type="number" step="0.1" value={f.consumedMeters} onChange={(e) => setF({ ...f, consumedMeters: e.target.value })} /></Field>
            <Field label="End bits (m)"><Input type="number" step="0.1" value={f.endBitsMeters} onChange={(e) => setF({ ...f, endBitsMeters: e.target.value })} /></Field>
            <Field label="Cutting table"><Select value={f.table || 'none'} onValueChange={(v) => setF({ ...f, table: v === 'none' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">—</SelectItem>{lines.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Cutter"><Input value={f.cutter} onChange={(e) => setF({ ...f, cutter: e.target.value })} /></Field>
            <Field label="Remarks" className="sm:col-span-3 lg:col-span-4"><Input value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} /></Field>
          </div>
          {o && <div className="rounded-xl border p-3">
            <div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Size-wise cut pieces{f.colour ? ` · ${f.colour}` : ' · all colours'}</span>{ctx && <button type="button" className="text-[11px] font-semibold text-brand hover:underline" onClick={fillBalance}>Fill balance</button>}</div>
            <div className="flex flex-wrap gap-2">{sizeList.map((s) => { const plan = planFor(s), cut = cutFor(s), bal = Math.max(plan - cut, 0); return <label key={s} className={cn('flex min-w-[88px] flex-col items-center rounded-lg border bg-secondary px-2 py-1', plan > 0 && bal === 0 && 'border-teal/40 bg-teal-soft/40')}><span className="text-[10.5px] font-bold uppercase text-muted-foreground">{s}</span><input type="number" className="num h-8 w-20 bg-transparent text-center font-semibold outline-none" placeholder={ctx && plan ? String(bal) : ''} value={sizes[s] ?? ''} onChange={(e) => { const v = e.target.value.replace(/^0+(?=\d)/, ''); setSizes({ ...sizes, [s]: v }); }} />{ctx && plan > 0 ? <span className="text-[9.5px] leading-tight text-muted-foreground">plan {fmtN(plan)}<br />cut {fmtN(cut)} · bal {fmtN(bal)}</span> : ctx ? <span className="text-[9.5px] text-muted-foreground">no plan</span> : null}</label>; })}</div>
            <div className="mt-2 text-[12px]">Total cut <b>{fmtN(cutPcs)}</b> pcs{consumed && cutPcs ? <> · average <b>{(consumed / cutPcs).toFixed(3)}</b> m/pc</> : null}</div>
          </div>}
          {cf.node}
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={post.isPending || !f.orderId || cutPcs <= 0 || !cf.ok} onClick={() => post.mutate()}><Check size={15} /> Save report</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ Stitching WIP (AFN/14) ============================ */
type WipRow = { orderId: string; orderNo: string; styleNo: string; buyerName: string; colour: string; orderQty: number; cutQty: number; cut: number; loaded: number; output: number; rejected: number; wip: number; cuttingInStock: number; finishing: number; balanceToStitch: number; lines: string[]; shipDate?: string };

export function WipPanel({ filter }: { filter: FloorFilter }) {
  const to = filter.period === 'custom' ? filter.to : '';
  const { data, isLoading } = useQuery<{ items: WipRow[]; asOf: string }>({ queryKey: ['/production', 'wip', to, filter.orderId], queryFn: async () => (await api.get('/production/wip', { params: { ...(to ? { to } : {}), ...(filter.orderId ? { orderId: filter.orderId } : {}) } })).data, refetchInterval: 30_000 });
  const rows = data?.items ?? [];
  const print = async () => {
    const head = await companyHead(`Stitching WIP — as on ${fmtDate(data?.asOf ?? new Date().toISOString())}`, 'stitchingWip');
    openPrint('Stitching WIP', head + `<table><tr><th>Order</th><th>Style</th><th>Buyer</th><th>Colour</th><th class="num">Order qty</th><th class="num">Cut</th><th class="num">Loaded</th><th class="num">Output</th><th class="num">Rejected</th><th class="num">WIP on line</th><th class="num">Cutting in stock</th><th class="num">Balance</th><th>Lines</th><th>Ship</th></tr>${rows.map((r) => `<tr><td>${esc(r.orderNo)}</td><td>${esc(r.styleNo)}</td><td>${esc(r.buyerName)}</td><td>${esc(r.colour)}</td><td class="num">${fmtN(r.orderQty)}</td><td class="num">${fmtN(r.cut)}</td><td class="num">${fmtN(r.loaded)}</td><td class="num">${fmtN(r.output)}</td><td class="num">${fmtN(r.rejected)}</td><td class="num"><b>${fmtN(r.wip)}</b></td><td class="num">${fmtN(r.cuttingInStock)}</td><td class="num">${fmtN(r.balanceToStitch)}</td><td>${esc(r.lines.join(', '))}</td><td>${fmtDate(r.shipDate)}</td></tr>`).join('')}</table>`);
  };
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div><CardTitle>Stitching WIP</CardTitle><p className="text-xs text-muted-foreground">Per order × colour: cut received · loaded on line · output · WIP on line = loaded − output · cutting in stock = cut − loaded. Log "loaded" on the Stitching production log.</p></div>
        <div className="flex items-center gap-2"><span className="text-[11.5px] text-muted-foreground">as on {fmtDate(data?.asOf ?? new Date().toISOString())}{to ? '' : ' (today)'} · cumulative</span><Button size="sm" variant="secondary" onClick={print} disabled={!rows.length}><Print size={14} /> Print AFN/14</Button></div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? <div className="space-y-2 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
        : !rows.length ? <EmptyState title="No open orders" text="WIP appears once cutting and stitching logs exist." />
        : <Table>
          <THead><Tr className="hover:bg-transparent"><Th>Order</Th><Th>Colour</Th><Th className="text-right">Order qty</Th><Th className="text-right">Cut</Th><Th className="text-right">Loaded</Th><Th className="text-right">Output</Th><Th className="text-right">Rejected</Th><Th className="text-right">WIP on line</Th><Th className="text-right">Cutting in stock</Th><Th className="text-right">Balance</Th><Th>Lines</Th></Tr></THead>
          <TBody>{rows.map((r, i) => <Tr key={i}>
            <Td><OrderLink id={r.orderId} className="font-mono text-xs font-bold text-brand hover:underline">{r.orderNo}</OrderLink><div className="text-[11px] text-muted-foreground">{r.styleNo} · {r.buyerName}</div></Td>
            <Td className="text-xs">{r.colour || 'all'}</Td><Td className="num text-right">{fmtN(r.orderQty)}</Td><Td className="num text-right">{fmtN(r.cut)}</Td><Td className="num text-right">{fmtN(r.loaded)}</Td>
            <Td className="num text-right font-semibold text-teal">{fmtN(r.output)}</Td><Td className={cn('num text-right', r.rejected && 'text-bad')}>{r.rejected || '—'}</Td>
            <Td className="num text-right font-semibold text-brand">{fmtN(r.wip)}</Td><Td className="num text-right">{fmtN(r.cuttingInStock)}</Td><Td className={cn('num text-right font-semibold', r.balanceToStitch ? '' : 'text-teal')}>{fmtN(r.balanceToStitch)}</Td>
            <Td className="text-[11px]">{r.lines.join(', ') || '—'}</Td>
          </Tr>)}</TBody>
        </Table>}
      </CardContent>
    </Card>
  );
}

/* ============================ Loading plan ============================ */
type PlanRow = { id: string; date: string; line: string; process: string; orderId: string; orderNo: string; styleNo: string; colour: string; target: number; note: string; actual: number; pct: number };

export function LoadingPlanPanel({ lines, filter }: { lines: string[]; filter: FloorFilter }) {
  const qc = useQueryClient();
  const range = periodRange(filter);
  const [from, setFrom] = React.useState(range.from || day(new Date()));
  React.useEffect(() => { if (range.from) setFrom(range.from); }, [range.from]);
  const [adding, setAdding] = React.useState<{ date: string; line: string } | null>(null);
  const to = day(new Date(new Date(from).getTime() + 6 * 864e5));
  const { data, isLoading } = useQuery<{ items: PlanRow[]; lines: string[] }>({ queryKey: ['/production', 'loading-plan', from], queryFn: async () => (await api.get('/production/loading-plan', { params: { from, to } })).data });
  const del = useMutation({ mutationFn: async (id: string) => (await api.delete(`/production/loading-plan/${id}`)).data, onSuccess: () => qc.invalidateQueries({ queryKey: ['/production'] }), onError: (e) => toast.error(apiMessage(e)) });
  const days = Array.from({ length: 7 }, (_, i) => day(new Date(new Date(from).getTime() + i * 864e5)));
  const rows = (data?.items ?? []).filter((r) => !filter.orderId || r.orderId === filter.orderId);
  const lineNames = lines.length ? lines : (data?.lines ?? []);
  const print = async () => {
    const head = await companyHead(`Loading Plan — ${fmtDate(from)} to ${fmtDate(to)}`, 'loadingPlan');
    openPrint('Loading Plan', head + `<table><tr><th>Line</th>${days.map((d) => `<th>${fmtDate(d)}</th>`).join('')}</tr>${lineNames.map((l) => `<tr><td><b>${esc(l)}</b></td>${days.map((d) => `<td>${rows.filter((r) => r.line === l && day(r.date) === d).map((r) => `${esc(r.orderNo)} ${esc(r.colour)}<br><small>${esc(r.process)} · target ${r.target} · actual ${r.actual}</small>`).join('<hr>') || ''}</td>`).join('')}</tr>`).join('')}</table>`);
  };
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div><CardTitle>Loading Plan</CardTitle><p className="text-xs text-muted-foreground">Which order runs on which line each day (cutting / stitching / finishing / packing) — target vs actual from the logs. Click a cell to plan.</p></div>
        <div className="flex items-center gap-2"><span className="text-[11.5px] text-muted-foreground">week from</span><Input type="date" className="h-8 w-40" value={from} onChange={(e) => setFrom(e.target.value)} /><Button size="sm" variant="secondary" onClick={print}><Print size={14} /> Print</Button><Button size="sm" onClick={() => setAdding({ date: from, line: lineNames[0] || '' })}><Plus size={14} /> Plan</Button></div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        {isLoading ? <div className="space-y-2 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
        : <table className="w-full text-[11.5px]">
          <thead><tr className="bg-secondary text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2 text-left">Line</th>{days.map((d) => <th key={d} className="px-2 py-2 text-left">{fmtDate(d)}</th>)}</tr></thead>
          <tbody>{lineNames.map((l) => <tr key={l} className="border-t align-top">
            <td className="px-3 py-2 font-semibold">{l}</td>
            {days.map((d) => { const cell = rows.filter((r) => r.line === l && day(r.date) === d); return <td key={d} className="min-w-[120px] cursor-pointer px-2 py-1.5 hover:bg-secondary/60" onClick={() => setAdding({ date: d, line: l })}>
              {cell.map((r) => <div key={r.id} className="mb-1 rounded-md border bg-card px-1.5 py-1"><div className="flex items-center justify-between gap-1"><span className="font-mono text-[10.5px] font-bold">{r.orderNo}</span><button type="button" className="text-muted-foreground hover:text-bad" onClick={(e) => { e.stopPropagation(); del.mutate(r.id); }}><Trash size={11} /></button></div><div className="text-[10px] text-muted-foreground">{r.process}{r.colour ? ` · ${r.colour}` : ''}</div><div className={cn('text-[10.5px] font-semibold', r.actual >= r.target && r.target ? 'text-teal' : r.actual ? 'text-gold' : 'text-muted-foreground')}>{fmtN(r.actual)} / {fmtN(r.target)}{r.target ? ` · ${r.pct}%` : ''}</div></div>)}
            </td>; })}
          </tr>)}</tbody>
        </table>}
      </CardContent>
      <LoadingDialog target={adding} lines={lineNames} onClose={() => setAdding(null)} />
    </Card>
  );
}

function LoadingDialog({ target, lines, onClose }: { target: { date: string; line: string } | null; lines: string[]; onClose: () => void }) {
  const qc = useQueryClient();
  const orders = useOpenOrders(!!target);
  const [f, setF] = React.useState({ date: '', line: '', process: 'Stitching', orderId: '', colour: '', target: '', note: '' });
  const cf = useCustomFields('loading', null, target ? `${target.date}${target.line}` : 'closed', 2);
  React.useEffect(() => { if (target) setF((x) => ({ ...x, date: target.date, line: target.line })); }, [target]);
  const o = (orders.data?.items ?? []).find((x) => x.id === f.orderId);
  const post = useMutation({ mutationFn: async () => (await api.post('/production/loading-plan', { ...f, custom: cf.value })).data, onSuccess: () => { toast.success('Loading plan saved'); qc.invalidateQueries({ queryKey: ['/production'] }); onClose(); }, onError: (e) => toast.error(apiMessage(e)) });
  const lctx = useOrderContext(target ? f.orderId : null);
  const lbal = opBalance(lctx.data, f.process, f.colour || undefined);
  if (!target) return null;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent meta={cf.meta}>
        <DialogHeader><DialogTitle>Plan loading</DialogTitle><DialogDescription>Order and target pieces for one line on one day. Actual output comes from the production logs of that day, line and process.</DialogDescription></DialogHeader>
        <DialogBody><div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Line"><Select value={f.line} onValueChange={(v) => setF({ ...f, line: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{lines.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Process"><Select value={f.process} onValueChange={(v) => setF({ ...f, process: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['Cutting', 'Stitching', 'Finishing', 'Packing'].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Order"><Select value={f.orderId} onValueChange={(v) => setF({ ...f, orderId: v, colour: '' })}><SelectTrigger><SelectValue placeholder="Open orders…" /></SelectTrigger><SelectContent>{(orders.data?.items ?? []).map((x) => <SelectItem key={x.id} value={x.id}>{x.orderNo} · {x.styleNo}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Colour">{colourNames(o).length ? <Select value={f.colour || 'none'} onValueChange={(v) => setF({ ...f, colour: v === 'none' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">—</SelectItem>{colourNames(o).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select> : <Input value={f.colour} onChange={(e) => setF({ ...f, colour: e.target.value })} />}</Field>
          <Field label="Target (pcs)" hint={lctx.data && lbal ? `${fmtN(lbal.done)} of ${fmtN(lbal.planned)} ${f.process.toLowerCase()} done · balance ${fmtN(lbal.balance)}` : undefined}><Input type="number" value={f.target} placeholder={lbal ? String(lbal.balance) : ''} onChange={(e) => setF({ ...f, target: e.target.value })} /></Field>
          <Field label="Note" className="sm:col-span-2"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        </div>{cf.node}</DialogBody>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={post.isPending || !f.orderId || !f.line || !f.date || !cf.ok} onClick={() => post.mutate()}><Check size={15} /> Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ Operation logs (Stitching / Finishing / Packing) with totals ============================ */
type LogRow = { id: string; date: string; orderId: string; orderNo: string; op: string; exec: string; where: string; colour?: string; loaded?: number; workers: number; output: number; rejected: number; supervisor: string; source: string; grnNo: string; hourly?: Record<string, number> };
export function OpLogsPanel({ op, filter, onLog }: { op: string; filter: FloorFilter; onLog: () => void }) {
  const range = periodRange(filter);
  const list = useList<LogRow>('/production/logs', { size: 500, op, orderId: filter.orderId || undefined, ...range });
  const rows = list.data?.items ?? [];
  const sum = (k: 'output' | 'rejected' | 'workers' | 'loaded') => rows.reduce((a, r) => a + (r[k] || 0), 0);
  const isStitch = op === 'Stitching';
  const print = async () => {
    const head = await companyHead(`${op} Log — ${range.from ? fmtDate(range.from) : 'all'}${range.to ? ` to ${fmtDate(range.to)}` : ''}`, isStitch ? 'hourlyOutput' : undefined);
    openPrint(`${op} log`, head + `<table><tr><th>Date</th><th>Order</th><th>Line / vendor</th><th>Colour</th>${isStitch ? '<th class="num">Loaded</th>' : ''}<th class="num">Output</th><th class="num">Rejected</th><th class="num">Workers</th><th>Supervisor</th>${isStitch ? '<th>Hourly</th>' : ''}</tr>${rows.map((r) => `<tr><td>${fmtDate(r.date)}</td><td>${esc(r.orderNo)}</td><td>${esc(r.where)}</td><td>${esc(r.colour)}</td>${isStitch ? `<td class="num">${r.loaded || ''}</td>` : ''}<td class="num">${fmtN(r.output)}</td><td class="num">${r.rejected || ''}</td><td class="num">${r.workers || ''}</td><td>${esc(r.supervisor)}</td>${isStitch ? `<td><small>${Object.entries(r.hourly || {}).map(([h, n]) => `${h}: ${n}`).join(' · ')}</small></td>` : ''}</tr>`).join('')}<tr><th colspan="${isStitch ? 4 : 4}">Total</th>${isStitch ? `<th class="num">${fmtN(sum('loaded'))}</th>` : ''}<th class="num">${fmtN(sum('output'))}</th><th class="num">${fmtN(sum('rejected'))}</th><th class="num">${fmtN(sum('workers'))}</th><th></th>${isStitch ? '<th></th>' : ''}</tr></table>`);
  };
  const byDay = Object.values(rows.reduce<Record<string, { date: string; output: number; rejected: number; lines: Set<string> }>>((acc, r) => { const k = r.date.slice(0, 10); const d = acc[k] || { date: k, output: 0, rejected: 0, lines: new Set() }; d.output += r.output; d.rejected += r.rejected; if (r.where) d.lines.add(r.where); acc[k] = d; return acc; }, {})).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div><CardTitle>{op} log</CardTitle><p className="text-xs text-muted-foreground">{isStitch ? 'Every line log: loaded, output, rejected, workers, hourly output.' : op === 'Cutting' ? 'Cut pieces logged per table — from cutting reports above or the Log button.' : `Daily ${op.toLowerCase()} output per line / vendor · rejected pieces are counted here.`} Rows from job-work returns at the gate are marked.</p></div>
        <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={print} disabled={!rows.length}><Print size={14} /> Print</Button><Button size="sm" onClick={onLog}><Plus size={14} /> Log {op.toLowerCase()}</Button></div>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length > 0 && <div className="grid gap-2 border-b px-4 py-3 sm:grid-cols-4">
          {[['Output', fmtN(sum('output'))], ['Rejected', `${fmtN(sum('rejected'))} · ${sum('output') + sum('rejected') ? (sum('rejected') * 100 / (sum('output') + sum('rejected'))).toFixed(1) : '0.0'}%`], isStitch ? ['Loaded', fmtN(sum('loaded'))] : ['Days logged', String(byDay.length)], ['Avg / day', fmtN(byDay.length ? Math.round(sum('output') / byDay.length) : 0)]].map(([k, v]) => <div key={k} className="rounded-lg border bg-secondary/60 px-3 py-2"><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{k}</div><div className="num text-[15px] font-bold">{v}</div></div>)}
        </div>}
        {list.isLoading ? <div className="space-y-2 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
        : !rows.length ? <EmptyState title={`No ${op.toLowerCase()} logged`} text={filter.orderId || filter.period !== 'all' ? 'Nothing in this filter — widen the period or clear the order.' : 'Post the first log from the Log button.'} action={<Button onClick={onLog}><Plus size={15} /> Log {op.toLowerCase()}</Button>} />
        : <Table>
          <THead><Tr className="hover:bg-transparent"><Th>Date</Th><Th>Order</Th><Th>Line / vendor</Th><Th>Colour</Th>{isStitch && <Th className="text-right">Loaded</Th>}<Th className="text-right">Output</Th><Th className="text-right">Rejected</Th><Th className="text-right">Workers</Th><Th>Supervisor</Th><Th>Source</Th></Tr></THead>
          <TBody>{rows.map((r) => <Tr key={r.id}>
            <Td className="text-xs">{fmtDate(r.date)}</Td><Td><OrderLink id={r.orderId} className="font-mono text-xs font-semibold text-brand hover:underline">{r.orderNo}</OrderLink></Td><Td className="text-xs">{r.where || '—'}{r.exec === 'Outsourced' && <Badge tone="brand" className="ml-1 text-[9px] uppercase">vendor</Badge>}</Td><Td className="text-xs">{r.colour || '—'}</Td>
            {isStitch && <Td className="num text-right">{r.loaded ? fmtN(r.loaded) : '—'}</Td>}<Td className="num text-right font-semibold text-teal">{fmtN(r.output)}</Td><Td className={cn('num text-right', r.rejected && 'text-bad')}>{r.rejected || '—'}</Td><Td className="num text-right">{r.workers || '—'}</Td>
            <Td className="text-xs">{r.supervisor}{isStitch && r.hourly && Object.keys(r.hourly).length ? <div className="text-[10px] text-muted-foreground" title={Object.entries(r.hourly).map(([h, n]) => `${h}: ${n}`).join(' · ')}>hourly ✓</div> : null}</Td>
            <Td>{r.source === 'gate' ? <Badge tone="ok">Gate · {r.grnNo}</Badge> : r.source === 'cutting' ? <Badge tone="info">Cutting report</Badge> : <Badge tone="mute">Manual</Badge>}</Td>
          </Tr>)}</TBody>
        </Table>}
      </CardContent>
    </Card>
  );
}

export const HOURS = ['08-09', '09-10', '10-11', '11-12', '12-13', '14-15', '15-16', '16-17', '17-18'];
export function HourlyGrid({ value, onChange }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const total = Object.values(value).reduce((a, v) => a + (+v || 0), 0);
  return (
    <div className="rounded-lg border bg-secondary/50 p-2">
      <div className="mb-1 flex items-center justify-between text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground"><span>Hourly output (AFN/40) — optional</span><Badge tone="plain">Σ {fmtN(total)}</Badge></div>
      <div className="grid grid-cols-5 gap-1 sm:grid-cols-9">{HOURS.map((h) => <label key={h} className="flex flex-col items-center rounded-md border bg-card px-1 py-0.5"><span className="text-[9.5px] text-muted-foreground">{h}</span><input type="number" className="num h-6 w-full bg-transparent text-center text-xs outline-none" value={value[h] ?? ''} onChange={(e) => onChange({ ...value, [h]: e.target.value })} /></label>)}</div>
    </div>
  );
}
