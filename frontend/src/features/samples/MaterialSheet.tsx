import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { useList, fmtN, fmtDate, fmtInr, toInputDate } from '@/lib/crud';
import { useAuth } from '@/features/auth/AuthProvider';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge, Skeleton } from '@/components/ui/misc';
import { Field, StatusPill } from '@/components/shared';
import { Plus, Close, Check, Print, Po as PoIcon, Planning as PlanIcon, Alert } from '@/icons/icons';
import { Shell, openPrint, companyHead } from './StyleTools';
import { NewPoDialog, type PoPrefill } from '@/features/po/PoDialogs';
import type { Sample } from './SampleDialogs';

/* One line of the client's "style wise raw material / accessories requirement" sheet. */
export type MatLine = { group: string; item: string; description: string; unit: string; perPc: number; wastePct: number; materialId?: string; materialCode?: string; supplierId?: string; supplierName?: string; moq: number; requiredDate?: string; remarks: string };
export type MatPlan = { qty: number; garmentType: string; sizeRatio: string; colour: string; deliveryDate?: string; remarks: string };
type CatalogGroup = { group: string; category: string; itemType: string; unit: string; items: string[] };
type ReqRow = { no: number; group: string; item: string; description: string; unit: string; perPc: number; wastePct: number; avgConsumption: number; orderQty: number; required: number;
  materialId: string; materialCode: string; materialName: string; free: number; available: number; shortage: number; onOrder: number; poNos: string[]; moq: number; toOrder: number; finalOrderQty: number;
  supplierId: string; supplierName: string; rate?: number; buyCost?: number; requiredDate?: string; remarks: string; status: string };
type Requirement = { sampleNo: string; styleNo: string; styleId?: string; buyerName: string; orderNo: string; orderId: string; merchandiser: string; plan: MatPlan; rows: ReqRow[];
  totals: { lines: number; inStock: number; short: number; unlinked: number; onOrder: number; buyCost?: number } };
type MaterialLite = { id: string; code: string; name: string; uom: string; category: string; moq?: number; supplierId?: string; supplierName?: string; physicalQty: number; reservedQty: number };
type SupplierLite = { id: string; name: string; category: string };

export const L0 = (group = 'Fabric'): MatLine => ({ group, item: '', description: '', unit: '', perPc: 0, wastePct: 0, moq: 0, remarks: '' });
export const P0: MatPlan = { qty: 0, garmentType: '', sizeRatio: '', colour: '', deliveryDate: '', remarks: '' };
export const avgOf = (l: { perPc: number; wastePct: number }) => Math.round((l.perPc || 0) * (1 + (l.wastePct || 0) / 100) * 10000) / 10000;
export const useCatalog = () => useQuery<{ catalog: CatalogGroup[] }>({ queryKey: ['/samples/meta'], queryFn: async () => (await api.get('/samples/meta')).data, staleTime: 600_000 });
const STATUS_ROW: Record<string, string> = { 'In Stock': 'bg-teal-soft/40 dark:bg-teal/10', 'On Order': 'bg-info-soft/40 dark:bg-info/10', Short: 'bg-gold-soft/50 dark:bg-gold-vivid/10', 'Out of Stock': 'bg-bad-soft/50 dark:bg-bad/10', 'Not in stock': 'bg-bad-soft/40 dark:bg-bad/10' };
const STATUS_TONE: Record<string, 'ok' | 'info' | 'warn' | 'bad' | 'mute'> = { 'In Stock': 'ok', 'On Order': 'info', Short: 'warn', 'Out of Stock': 'bad', 'Not in stock': 'bad' };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

const Num = ({ k, v, sub, cls }: { k: string; v: string; sub?: string; cls?: string }) => (
  <div className="lg:text-right"><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{k}</div><div className={cn('num text-[13.5px] font-bold', cls)}>{v}</div>{sub ? <div className="truncate text-[10px] text-muted-foreground">{sub}</div> : null}</div>
);

/** Controlled material sheet — a wizard step and the sample's Materials tab. */
export function MaterialSheet({ lines, plan, onLines, onPlan, orderQty }: { lines: MatLine[]; plan: MatPlan; onLines: (v: MatLine[]) => void; onPlan: (v: MatPlan) => void; orderQty?: number }) {
  const cat = useCatalog();
  const groups = cat.data?.catalog ?? [];
  const mats = useList<MaterialLite>('/materials', { size: 500, status: 'Active' });
  const suppliers = useList<SupplierLite>('/suppliers', { size: 200 });
  const byGroup = Object.fromEntries(groups.map((g) => [g.group, g]));
  const set = (i: number, patch: Partial<MatLine>) => onLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const add = (group: string) => onLines([...lines, L0(group)]);
  const pickItem = (i: number, item: string) => {
    const g = byGroup[lines[i].group];
    const guess = (mats.data?.items ?? []).find((m) => m.name.toLowerCase().includes(item.toLowerCase()) && (!g || m.category === g.category));
    set(i, { item, unit: lines[i].unit || guess?.uom || g?.unit || '', ...(guess && !lines[i].materialId ? { materialId: guess.id, materialCode: guess.code, moq: lines[i].moq || guess.moq || 0, supplierId: guess.supplierId, supplierName: guess.supplierName } : {}) });
  };
  const pickMaterial = (i: number, id: string) => {
    const m = (mats.data?.items ?? []).find((x) => x.id === id);
    set(i, { materialId: id || undefined, materialCode: m?.code, unit: m?.uom || lines[i].unit, moq: lines[i].moq || m?.moq || 0, supplierId: m?.supplierId || lines[i].supplierId, supplierName: m?.supplierName || lines[i].supplierName });
  };
  const total = lines.reduce((a, l) => a + (plan.qty ? Math.ceil(avgOf(l) * plan.qty) : 0), 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Field label="Order quantity (pcs)" hint={orderQty ? `analysis runs on ${fmtN(orderQty)} pcs — the confirmed order` : 'the sheet is worked out on this'}><Input type="number" value={plan.qty || ''} onChange={(e) => onPlan({ ...plan, qty: +e.target.value || 0 })} /></Field>
        <Field label="Garment type"><Input value={plan.garmentType} onChange={(e) => onPlan({ ...plan, garmentType: e.target.value })} placeholder="Polo T-shirt" /></Field>
        <Field label="Order colour"><Input value={plan.colour} onChange={(e) => onPlan({ ...plan, colour: e.target.value })} placeholder="Navy / White" /></Field>
        <Field label="Size ratio"><Input value={plan.sizeRatio} onChange={(e) => onPlan({ ...plan, sizeRatio: e.target.value })} placeholder="S1 : M2 : L2 : XL1" /></Field>
        <Field label="Delivery date"><Input type="date" value={toInputDate(plan.deliveryDate)} onChange={(e) => onPlan({ ...plan, deliveryDate: e.target.value })} /></Field>
      </div>

      <div className="space-y-2">
        {lines.map((l, i) => {
          const g = byGroup[l.group];
          const options = (mats.data?.items ?? []).filter((m) => !g || m.category === g.category);
          const req = plan.qty ? Math.ceil(avgOf(l) * plan.qty) : 0;
          return (
            <div key={i} className={cn('rounded-xl border bg-card p-3', !l.materialId && (l.item || l.perPc) && 'border-gold-vivid/50')}>
              <div className="mb-2 flex items-center gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-secondary font-mono text-[10.5px] font-bold text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{l.item || 'New line'}<span className="font-normal text-muted-foreground">{l.description ? ` · ${l.description}` : ''}</span></span>
                {avgOf(l) > 0 && <span className="num shrink-0 text-[11.5px] text-muted-foreground">{avgOf(l)} {l.unit}/pc{req ? <> · <b className="text-brand">{fmtN(req)} {l.unit}</b> needed</> : null}</span>}
                <button type="button" title="Remove line" className="shrink-0 rounded p-1 text-muted-foreground hover:bg-bad-soft hover:text-bad" onClick={() => onLines(lines.filter((_, j) => j !== i))}><Close size={14} /></button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                <Field label="Category"><Select value={l.group || 'Fabric'} onValueChange={(v) => set(i, { group: v, unit: byGroup[v]?.unit || l.unit })}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent>{groups.map((x) => <SelectItem key={x.group} value={x.group}>{x.group}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Item"><Input list={`cat-${l.group.replace(/\W/g, '')}`} className="h-9 text-xs" value={l.item} onChange={(e) => pickItem(i, e.target.value)} placeholder="Main Fabric" /></Field>
                <Field label="Description" className="sm:col-span-2"><Input className="h-9 text-xs" value={l.description} onChange={(e) => set(i, { description: e.target.value })} placeholder="Beige 100% linen 58 inch" /></Field>
                <Field label="Unit"><Input className="h-9 text-xs" value={l.unit} onChange={(e) => set(i, { unit: e.target.value })} placeholder="mtr" /></Field>
                <Field label="Consumption / pc"><Input type="number" step="0.0001" className="h-9 text-right text-xs" value={l.perPc || ''} onChange={(e) => set(i, { perPc: +e.target.value || 0 })} /></Field>
                <Field label="Wastage %"><Input type="number" step="0.1" className="h-9 text-right text-xs" value={l.wastePct || ''} onChange={(e) => set(i, { wastePct: +e.target.value || 0 })} /></Field>
                <Field label="Average consumption"><div className="num flex h-9 items-center justify-end rounded-md border bg-secondary px-3 text-xs font-semibold">{avgOf(l) || '—'}</div></Field>
                {plan.qty > 0 && <Field label={`Required for ${fmtN(plan.qty)} pcs`}><div className="num flex h-9 items-center justify-end rounded-md border bg-brand-soft px-3 text-xs font-bold text-brand dark:bg-accent">{fmtN(req)}</div></Field>}
                <Field label="Stock item" className="sm:col-span-2" hint={!l.materialId ? 'created automatically when you build the BOM' : undefined}>
                  <Select value={l.materialId || 'none'} onValueChange={(v) => pickMaterial(i, v === 'none' ? '' : v)}><SelectTrigger className={cn('h-9 text-xs', !l.materialId && 'border-gold-vivid/60')}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">— create on BOM —</SelectItem>{options.map((m) => <SelectItem key={m.id} value={m.id}>{m.code} · {m.name}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="MOQ"><Input type="number" className="h-9 text-right text-xs" value={l.moq || ''} onChange={(e) => set(i, { moq: +e.target.value || 0 })} /></Field>
                <Field label="Supplier"><Select value={l.supplierId || 'none'} onValueChange={(v) => { const sup = (suppliers.data?.items ?? []).find((x) => x.id === v); set(i, { supplierId: v === 'none' ? undefined : v, supplierName: sup?.name || '' }); }}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">—</SelectItem>{(suppliers.data?.items ?? []).map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Required by"><Input type="date" className="h-9 text-xs" value={toInputDate(l.requiredDate)} onChange={(e) => set(i, { requiredDate: e.target.value })} /></Field>
                <Field label="Remarks" className="sm:col-span-2"><Input className="h-9 text-xs" value={l.remarks} onChange={(e) => set(i, { remarks: e.target.value })} placeholder="shade, placement…" /></Field>
              </div>
            </div>); })}
        {!lines.length && <div className="rounded-xl border border-dashed px-4 py-6 text-center text-[12.5px] text-muted-foreground">Nothing yet — add what one piece needs: fabric, thread, trims, buttons, labels, packing.</div>}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border bg-secondary/40 px-3 py-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Add line:</span>
          {groups.map((g) => <Button key={g.group} size="sm" variant="secondary" type="button" className="h-7 text-[11px]" onClick={() => add(g.group)}><Plus size={12} /> {g.group}</Button>)}
        </div>
      </div>
      {groups.map((g) => <datalist key={g.group} id={`cat-${g.group.replace(/\W/g, '')}`}>{g.items.map((x) => <option key={x} value={x} />)}</datalist>)}
      {plan.qty > 0 && <div className="rounded-lg border bg-secondary/50 px-3 py-2 text-[12px]"><b>{lines.length}</b> line{lines.length === 1 ? '' : 's'} · on <b className="num">{fmtN(plan.qty)}</b> pcs the style needs <b className="num">{fmtN(total)}</b> units of material in total · lines without a stock item are created automatically when you build the BOM.</div>}
    </div>
  );
}

/** Materials tab: the sheet, the live stock analysis (green = have it, red = buy it) and the BOM / PO buttons. */
export function MaterialPanel({ sample, inline, onClose }: { sample: Sample; inline?: boolean; onClose?: () => void }) {
  const qc = useQueryClient();
  const { hasModule } = useAuth();
  const [lines, setLines] = React.useState<MatLine[]>([]);
  const [plan, setPlan] = React.useState<MatPlan>(P0);
  const [po, setPo] = React.useState<PoPrefill | null>(null);
  React.useEffect(() => {
    setLines((sample.materials ?? []).map((l) => ({ ...L0(l.group), ...l, requiredDate: toInputDate(l.requiredDate) })));
    setPlan({ ...P0, ...(sample.materialPlan ?? {}), deliveryDate: toInputDate(sample.materialPlan?.deliveryDate) });
  }, [sample.id, sample.materials, sample.materialPlan]);   // eslint-disable-line react-hooks/exhaustive-deps
  const req = useQuery<Requirement>({ queryKey: ['/samples', sample.id, 'requirement'], queryFn: async () => (await api.get(`/samples/${sample.id}/requirement`)).data, enabled: !!sample.materials?.length });
  const save = useMutation({
    mutationFn: async () => (await api.put(`/samples/${sample.id}/materials`, { lines, plan })).data,
    onSuccess: () => { toast.success('Material sheet saved'); qc.invalidateQueries({ queryKey: ['/samples'] }); }, onError: (e) => toast.error(apiMessage(e)),
  });
  const buildBom = useMutation({
    mutationFn: async () => (await api.post(`/bom/from-sample/${sample.id}`, { createMissing: true })).data as { bom: { lines: unknown[]; version: number }; created: { code: string; name: string }[]; skipped: { item: string; why: string }[] },
    onSuccess: (r) => { toast.success(`BOM v${r.bom.version} built from the sample · ${r.bom.lines.length} lines${r.created.length ? ` · ${r.created.length} new stock item${r.created.length > 1 ? 's' : ''}` : ''}${r.skipped.length ? ` · ${r.skipped.length} skipped` : ''}`); ['/bom', '/materials', '/samples', '/planning'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const r = req.data;
  const print = async () => {
    const head = await companyHead(`Style wise material requirement — ${sample.styleNo} · ${sample.sampleNo}`);
    const rows = r?.rows ?? [];
    openPrint(`Material requirement ${sample.styleNo}`, head + `
      <table><tr><th>Buyer</th><td>${esc(sample.buyerName)}</td><th>Style no</th><td>${esc(sample.styleNo)}</td><th>Order no</th><td>${esc(r?.orderNo || '—')}</td><th>Delivery</th><td>${plan.deliveryDate ? fmtDate(plan.deliveryDate) : '—'}</td></tr>
      <tr><th>Garment type</th><td>${esc(plan.garmentType)}</td><th>Order colour</th><td>${esc(plan.colour)}</td><th>Size ratio</th><td>${esc(plan.sizeRatio)}</td><th>Merchant</th><td>${esc(sample.merchandiser)}</td></tr></table>
      <h2>Style wise raw material / accessories requirement — ${fmtN(r?.plan.qty ?? plan.qty)} pcs</h2>
      <table><tr><th>S.No</th><th>Category</th><th>Item</th><th>Item description</th><th>Unit</th><th class="num">Cons / pc</th><th class="num">Waste %</th><th class="num">Avg cons</th><th class="num">Order qty</th><th class="num">Final required</th><th class="num">Available</th><th class="num">Shortage</th><th class="num">MOQ</th><th class="num">Final order qty</th><th>Supplier</th><th>Required date</th><th>Remarks</th></tr>
      ${rows.map((x) => `<tr><td>${x.no}</td><td>${esc(x.group)}</td><td>${esc(x.item)}</td><td>${esc(x.description)}</td><td>${esc(x.unit)}</td><td class="num">${x.perPc}</td><td class="num">${x.wastePct}</td><td class="num">${x.avgConsumption}</td><td class="num">${fmtN(x.orderQty)}</td><td class="num">${fmtN(x.required)}</td><td class="num">${fmtN(x.free)}</td><td class="num${x.shortage ? ' bad' : ''}">${fmtN(x.shortage)}</td><td class="num">${x.moq || ''}</td><td class="num">${fmtN(x.finalOrderQty)}</td><td>${esc(x.supplierName)}</td><td>${x.requiredDate ? fmtDate(x.requiredDate) : ''}</td><td>${esc(x.remarks)}</td></tr>`).join('')}</table>
      <div class="sign"><div>Prepared by (Merchant)</div><div>Production head</div><div>Store incharge</div><div>Approved by</div></div>`);
  };
  return (
    <div className="space-y-5">
      <Shell inline={inline} onClose={() => onClose?.()} title={`Material requirement — ${sample.styleNo}`}
        desc="What one piece eats: fabric, thread, trims, buttons, labels, packing. Consumption × wastage × order quantity = what to buy — and the BOM is built from this sheet, so nothing is typed twice."
        footer={<><Button variant="secondary" onClick={print} disabled={!r?.rows.length}><Print size={14} /> Print sheet</Button><Button disabled={save.isPending || !lines.length} onClick={() => save.mutate()}><Check size={15} /> Save sheet</Button></>}>
        <MaterialSheet lines={lines} plan={plan} onLines={setLines} onPlan={setPlan} orderQty={r?.orderNo ? r.plan.qty : undefined} />
      </Shell>

      {/* ---------- stock analysis ---------- */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div><CardTitle>Stock analysis</CardTitle><p className="text-xs text-muted-foreground">Green = enough in stock · amber = partly short · red = buy it. Free stock = physical − reserved; open POs are netted off.</p></div>
          <div className="flex flex-wrap gap-2">
            {hasModule('planning') && <Button size="sm" disabled={buildBom.isPending || !sample.materials?.length} onClick={() => buildBom.mutate()}><PlanIcon size={14} /> {buildBom.isPending ? 'Building…' : 'Create / update BOM'}</Button>}
            {r?.styleId && <Button size="sm" variant="secondary" asChild><Link to={`/planning?style=${r.styleId}&qty=${r.plan.qty || ''}`}>Open planning</Link></Button>}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!sample.materials?.length ? <div className="p-5 text-[13px] text-muted-foreground">Fill the sheet above and save — the stock position of every line shows here.</div>
          : req.isLoading || !r ? <div className="space-y-2 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
          : <>
            <div className="grid gap-2 border-b px-4 py-3 sm:grid-cols-5">
              {[['Lines', String(r.totals.lines), ''], ['In stock', String(r.totals.inStock), 'text-teal'], ['On order', String(r.totals.onOrder), 'text-info'], ['To buy', String(r.totals.short), r.totals.short ? 'text-bad' : ''], ['Not in master', String(r.totals.unlinked), r.totals.unlinked ? 'text-gold' : '']].map(([k, v, cls]) => (
                <div key={k} className="rounded-lg border bg-secondary/60 px-3 py-2"><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{k}</div><div className={cn('num text-[17px] font-bold', cls)}>{v}</div></div>))}
            </div>
            {r.totals.unlinked > 0 && <div className="flex items-start gap-2 border-b bg-gold-soft/60 px-4 py-2 text-[12.5px] text-gold dark:bg-gold-vivid/10 dark:text-gold-vivid"><Alert size={15} className="mt-0.5 shrink-0" /><span>{r.totals.unlinked} line{r.totals.unlinked > 1 ? 's are' : ' is'} not in the stock master yet — <b>Create / update BOM</b> adds them automatically (code ACC-9xxx / FAB-9xxx) so you can receive and issue them.</span></div>}
            <div className="divide-y">{r.rows.map((x) => (
              <div key={x.no} className={cn('grid gap-3 px-4 py-3 lg:grid-cols-[minmax(200px,1.4fr)_repeat(4,minmax(78px,1fr))_120px_auto]', STATUS_ROW[x.status])}>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5"><span className="font-mono text-[10.5px] text-muted-foreground">{x.no}</span><span className="truncate text-[13px] font-semibold">{x.item || '—'}</span></div>
                  <div className="truncate text-[11px] text-muted-foreground">{x.group}{x.description ? ` · ${x.description}` : ''}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{x.materialCode ? <span className="font-mono">{x.materialCode}</span> : <span className="font-semibold text-bad">not in stock master</span>}{x.supplierName ? ` · ${x.supplierName}` : ''}{x.requiredDate ? ` · by ${fmtDate(x.requiredDate)}` : ''}</div>
                  <div className="text-[10.5px] text-muted-foreground">{x.perPc} × (1 + {x.wastePct}%) = <b>{x.avgConsumption}</b> {x.unit}/pc{x.moq ? ` · MOQ ${fmtN(x.moq)}` : ''}</div>
                </div>
                <Num k="Required" v={fmtN(x.required)} sub={x.unit} />
                <Num k="Available" v={fmtN(x.free)} cls={x.free > 0 ? 'text-teal' : 'text-muted-foreground'} />
                <Num k="Shortage" v={x.shortage ? fmtN(x.shortage) : '—'} cls={x.shortage ? 'text-bad' : 'text-teal'} />
                <Num k="On order" v={x.onOrder ? fmtN(x.onOrder) : '—'} sub={x.poNos.join(', ')} cls={x.onOrder ? 'text-info' : 'text-muted-foreground'} />
                <Num k="Order qty" v={x.finalOrderQty ? fmtN(x.finalOrderQty) : '—'} sub={x.buyCost ? fmtInr(x.buyCost) : ''} cls={x.finalOrderQty ? 'text-brand' : 'text-muted-foreground'} />
                <div className="flex items-center gap-2 lg:flex-col lg:items-end lg:justify-center">
                  <Badge tone={STATUS_TONE[x.status] ?? 'mute'}>{x.status}</Badge>
                  {hasModule('po') && x.finalOrderQty > 0 && x.materialId && <Button size="sm" variant="secondary" className="h-7 text-[11px]" onClick={() => setPo({ materialId: x.materialId, qty: x.finalOrderQty, orderId: r.orderId || undefined })}><PoIcon size={12} /> PO</Button>}
                </div>
              </div>))}
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t bg-secondary/40 px-4 py-2 text-[12px]">
              <span>On <b className="num">{fmtN(r.plan.qty)}</b> pcs{r.orderNo ? ` — the confirmed quantity of ${r.orderNo}` : ' from the sheet above'}</span>
              {r.totals.buyCost ? <span>estimated purchase <b className="num">{fmtInr(r.totals.buyCost)}</b></span> : null}
              <span className="ml-auto text-muted-foreground">Change the order quantity on the sheet above and save to recalculate.</span>
            </div>
          </>}
        </CardContent>
      </Card>
      <NewPoDialog open={!!po} prefill={po ?? undefined} onClose={() => setPo(null)} />
    </div>
  );
}
