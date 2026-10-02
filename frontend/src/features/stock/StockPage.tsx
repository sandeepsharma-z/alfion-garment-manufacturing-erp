import * as React from 'react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useList, useSave, useAction, fmtN, fmtInr, fmtDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { useCustomFields } from '@/components/CustomFields';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton, Table, THead, TBody, Tr, Th, Td, Badge } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertStrip } from '@/components/AlertStrip';
import { PageHeader, KpiTile, Toolbar, Field, StatusPill, EmptyState } from '@/components/shared';
import { Stock, Plus, Edit, Power, Check, Alert, Gate as GateIcon, Po as PoIcon, Clock, Payments, Refresh, Close } from '@/icons/icons';
import { NewPoDialog, type PoPrefill } from '@/features/po/PoDialogs';
import { MaterialNameInput, useMaterialCatalog } from '@/components/MaterialCatalog';

type Material = { custom?: Record<string, unknown>; id: string; code: string; name: string; category: string; itemType?: string; moq?: number; leadDays?: number; suppliers?: { supplierId: string; name?: string; rate?: number; moq?: number; leadDays?: number; note?: string }[]; uom: string; rate?: number; reorderLevel: number;
  godown: string; supplierId?: string; supplierName: string; physicalQty: number; reservedQty: number; freeQty: number; onOrder: number; openPos: number; atVendor: number; openJw: number;
  stockState: string; spec: string; status: string };
type Supplier = { id: string; name: string };
type Summary = { materials: number; attention: number; openPos: number; onOrderLines: number; reserved: number; physicalValue?: number };
export type LedgerRow = { id: string; txn: string; qty: number; reservedDelta: number; balanceAfter: { physical: number; reserved: number }; refType: string; refNo: string; orderNo: string; godown: string; note: string; by: string; createdAt: string; materialCode: string; materialName: string; uom: string };

type AltSupplier = { supplierId: string; rate: number; moq: number; leadDays: number; note: string };
const M0 = { code: '', name: '', category: 'Fabric', uom: 'mtr', rate: 0, reorderLevel: 0, godown: '', supplierId: '', openingQty: 0, spec: '', itemType: '', moq: 0, leadDays: 0, suppliers: [] as AltSupplier[] };
export const TXN_LABEL: Record<string, string> = { opening: 'Opening balance', receipt: 'Gate receipt', issue_jw: 'Issued to job work', return_jw: 'Job work return', adjust: 'Adjustment', reserve: 'Reserved for order', release: 'Reservation released', issue_prod: 'Issued to production', reversal: 'Reversal' };

export default function StockPage() {
  const { hasFlag, hasModule } = useAuth();
  const showRate = hasFlag('rates.view');
  const [q, setQ] = React.useState('');
  const [chip, setChip] = React.useState('All');
  const [editing, setEditing] = React.useState<Material | null | 'new'>(null);
  const [f, setF] = React.useState(M0);
  const catalog = useMaterialCatalog();                       // the client's possible materials / accessories
  const [grp, setGrp] = React.useState('');                   // picker only — filters the names below
  const cf = useCustomFields('materials', editing && editing !== 'new' ? editing.custom : null, editing);
  const [ledger, setLedger] = React.useState<Material | null>(null);
  const [adjust, setAdjust] = React.useState<Material | null>(null);
  const [po, setPo] = React.useState<PoPrefill | null>(null);

  const mats = useList<Material>('/materials', { size: 500 });
  const suppliers = useList<Supplier>('/suppliers', { size: 200 });
  const sum = useQuery<Summary>({ queryKey: ['/stock', 'summary'], queryFn: async () => (await api.get('/stock/summary')).data });
  const itemTypes = useQuery<{ itemTypes: Record<string, string[]> }>({ queryKey: ['/materials/meta'], queryFn: async () => (await api.get('/materials/meta')).data, staleTime: 300_000 });
  const save = useSave<Material>('/materials', ['/materials', '/stock'], (m) => { toast.success(`${m.code} saved`); setEditing(null); });
  const toggle = useAction<Material>(['/materials'], (m) => toast.success(`${m.code} is now ${m.status}`));

  React.useEffect(() => {
    if (editing && editing !== 'new') setF({ code: editing.code, name: editing.name, category: editing.category, uom: editing.uom, rate: editing.rate ?? 0,
      reorderLevel: editing.reorderLevel, godown: editing.godown, supplierId: editing.supplierId || '', openingQty: 0, spec: editing.spec || '', itemType: editing.itemType || '', moq: editing.moq || 0, leadDays: editing.leadDays || 0,
      suppliers: (editing.suppliers ?? []).map((x) => ({ supplierId: x.supplierId, rate: x.rate ?? 0, moq: x.moq ?? 0, leadDays: x.leadDays ?? 0, note: x.note ?? '' })) });
    else setF(M0);
  }, [editing]);

  const all = mats.data?.items ?? [];
  const rows = all.filter((m) => {
    const t = `${m.code} ${m.name} ${m.supplierName} ${m.godown}`.toLowerCase();
    return (!q || t.includes(q.toLowerCase())) && (chip === 'All' || m.category === chip || m.stockState === chip || (chip === 'On Order' && m.onOrder > 0) || (chip === 'At Vendor' && m.atVendor > 0));
  });
  const s = sum.data;

  const submit = () => {
    const sup = (suppliers.data?.items ?? []).find((x) => x.id === f.supplierId);
    const body: Record<string, unknown> = { ...f, custom: cf.value, supplierId: f.supplierId || undefined, supplierName: sup?.name || '' };
    if (!showRate) delete body.rate;
    if (editing !== 'new') delete body.openingQty;
    save.mutate({ id: editing && editing !== 'new' ? editing.id : undefined, body });
  };

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Stock & Inventory" sub="Physical · reserved · free, on order and the movement ledger. Balances change only through Gate Entry, reservations and audited adjustments.">
        {hasModule('gate') && <Button variant="secondary" asChild><a href="/gate"><GateIcon size={17} /> Receive (GRN)</a></Button>}
        {hasModule('po') && <Button variant="secondary" onClick={() => setPo({})}><PoIcon size={17} /> Raise PO</Button>}
        <Button onClick={() => setEditing('new')}><Plus size={17} /> Add Material</Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {showRate ? <KpiTile icon={Payments} label="Stock Value" value={fmtInr(s?.physicalValue)} tone="brand" foot={`${s?.materials ?? all.length} active materials`} />
          : <KpiTile icon={Stock} label="Materials" value={s?.materials ?? all.length} tone="brand" foot={`${all.filter((m) => m.category === 'Fabric').length} fabric · ${all.filter((m) => m.category === 'Accessory').length} accessory · ${all.filter((m) => m.category === 'Packing').length} packing`} />}
        <KpiTile icon={Alert} label="Below Reorder / Out" value={s?.attention ?? '—'} tone={s?.attention ? 'bad' : 'teal'} foot="short for orders included" />
        <KpiTile icon={GateIcon} label="Awaiting Gate Entry" value={s?.openPos ?? '—'} tone="gold" foot={`${s?.onOrderLines ?? 0} materials on order`} />
        <KpiTile icon={Clock} label="Reserved for Orders" value={fmtN(s?.reserved)} tone="info" foot="units blocked across all SKUs" />
      </div>

      <div className="rounded-xl border bg-secondary px-4 py-3 text-[12.5px] text-muted-foreground">
        <b className="text-foreground">Free = Physical − Reserved.</b> <b className="text-foreground">On Order</b> is on a PO but not yet through the gate, <b className="text-foreground">At Vendor</b> is out on a job-work challan — neither is in stock until the gate confirms it.
      </div>

      <AlertStrip module="stock" />
      <Card>
        <Toolbar q={q} setQ={setQ} placeholder="Search code, material, supplier…" chips={['All', 'Fabric', 'Accessory', 'Packing', 'Below Reorder', 'Short for Orders', 'Out of Stock', 'On Order', 'At Vendor']} chip={chip} setChip={setChip} />
        {mats.isLoading ? <div className="space-y-3 p-5">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
        : !rows.length ? <EmptyState title="No materials match" />
        : <Table>
          <THead><Tr className="hover:bg-transparent">
            <Th>Material</Th><Th className="text-right">Physical · Reserved</Th><Th className="text-right">Free</Th><Th className="text-right">On order · At vendor</Th><Th>Status · reorder</Th>{showRate && <Th className="text-right">Rate</Th>}<Th>Godown · Supplier</Th><Th className="text-right">Actions</Th>
          </Tr></THead>
          <TBody>{rows.map((m) => (
            <Tr key={m.id} className={m.status === 'Inactive' ? 'opacity-50' : ''}>
              <Td><div className="flex items-center gap-2"><span className={cn('h-2 w-2 shrink-0 rounded-full', m.category === 'Fabric' ? 'bg-brand' : m.category === 'Accessory' ? 'bg-info-vivid' : 'bg-gold-vivid')} title={m.category} /><span className="font-semibold">{m.name}</span></div><div className="font-mono text-[11px] text-muted-foreground">{m.code}{m.spec ? ` · ${m.spec}` : ''} · <span className="font-sans">{m.category}{m.itemType ? ` / ${m.itemType}` : ''}</span></div></Td>
              <Td className="num text-right"><span className="font-semibold">{fmtN(m.physicalQty)}</span> <span className="text-[11px] text-muted-foreground">{m.uom}</span>{m.reservedQty ? <div className="text-[11px] text-muted-foreground">reserved {fmtN(m.reservedQty)}</div> : null}</Td>
              <Td className={cn('num text-right font-semibold', m.freeQty < 0 && 'text-bad')}>{fmtN(m.freeQty)}</Td>
              <Td className="num text-right text-[12px]">{m.onOrder ? <div className="text-info">{fmtN(m.onOrder)}<span className="text-[10px] text-muted-foreground"> · {m.openPos} PO</span></div> : null}{m.atVendor ? <div className="text-brand">{fmtN(m.atVendor)}<span className="text-[10px] text-muted-foreground"> · {m.openJw} JW</span></div> : null}{!m.onOrder && !m.atVendor && '—'}</Td>
              <Td><StatusPill value={m.stockState} /><div className="mt-0.5 text-[10.5px] text-muted-foreground">reorder at {fmtN(m.reorderLevel)}</div></Td>
              {showRate && <Td className="num text-right">₹{(m.rate ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Td>}
              <Td className="text-xs">{m.godown || '—'}<div className="text-[11px] text-muted-foreground">{m.supplierName || '—'}</div></Td>
              <Td><div className="flex justify-end gap-1">
                {hasModule('po') && <Button variant={m.stockState === 'Healthy' ? 'secondary' : 'default'} size="sm" title="Raise PO" onClick={() => setPo({ materialId: m.id, qty: Math.max(m.reorderLevel - m.freeQty - m.onOrder, 0) })}><PoIcon size={14} /></Button>}
                <Button variant="secondary" size="sm" title="Movement ledger" onClick={() => setLedger(m)}><Clock size={14} /></Button>
                <Button variant="secondary" size="sm" title="Edit" onClick={() => setEditing(m)}><Edit size={14} /></Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="secondary" size="sm" title="More">⋯</Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setAdjust(m)}><Refresh size={14} className="mr-2" /> Adjust stock (with reason)</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toggle.mutate({ url: `/materials/${m.id}/toggle` })}><Power size={14} className="mr-2" /> {m.status === 'Inactive' ? 'Activate' : 'Deactivate'}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div></Td>
            </Tr>))}
          </TBody>
        </Table>}
      </Card>

      {/* ---- master dialog (no balance fields — those are ledger-only) ---- */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent wide meta={cf.meta}>
          <DialogHeader><DialogTitle>{editing === 'new' ? 'Add Material' : `Edit — ${editing?.code}`}</DialogTitle>
            <DialogDescription>Master record only. Quantities move through Gate Entry, reservations and adjustments — never edited here.</DialogDescription></DialogHeader>
          <DialogBody><div className="grid gap-4 sm:grid-cols-3">
            <Field label="Code"><Input value={f.code} readOnly={editing !== 'new'} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="FAB-0180" /></Field>
            <Field label="Material Group" hint="client material list"><Select value={grp || 'all'} onValueChange={(v) => { const g = (catalog.data?.catalog ?? []).find((x) => x.group === v); setGrp(v === 'all' ? '' : v); if (g) setF((x) => ({ ...x, category: g.category, itemType: g.itemType, uom: g.unit })); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">— all groups —</SelectItem>{(catalog.data?.catalog ?? []).map((g) => <SelectItem key={g.group} value={g.group}>{g.group}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Material Name" className="sm:col-span-2" hint="pick from the client list or type your own">
              <MaterialNameInput value={f.name} group={grp} onChange={(v, g) => { setF((x) => ({ ...x, name: v, ...(g ? { category: g.category, itemType: g.itemType, uom: g.unit } : {}) })); if (g) setGrp(g.group); }} /></Field>
            <Field label="Category"><Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{['Fabric', 'Accessory', 'Packing'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Item type" hint="client material list (47 categories)"><Input list="item-types" value={f.itemType} onChange={(e) => setF({ ...f, itemType: e.target.value })} placeholder="Main fabric (FAB-A) / Sewing thread / Carton…" />
              <datalist id="item-types">{(itemTypes.data?.itemTypes?.[f.category] ?? []).map((t) => <option key={t} value={t} />)}</datalist></Field>
            <Field label="Supplier MOQ" hint="final PO qty = max(shortage, MOQ)"><Input type="number" value={f.moq || ''} onChange={(e) => setF({ ...f, moq: +e.target.value })} /></Field>
            <Field label="Lead time (days)"><Input type="number" value={f.leadDays || ''} onChange={(e) => setF({ ...f, leadDays: +e.target.value })} /></Field>
            <Field label="UOM"><Select value={f.uom} onValueChange={(v) => setF({ ...f, uom: v })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{['mtr', 'kg', 'pcs', 'set', 'roll', 'cone'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field>
            {showRate && <Field label="Rate (₹ / UOM)"><Input type="number" step="0.01" value={f.rate} onChange={(e) => setF({ ...f, rate: +e.target.value })} /></Field>}
            {editing === 'new' && <Field label="Opening Qty" hint="posted as the first ledger row"><Input type="number" value={f.openingQty} onChange={(e) => setF({ ...f, openingQty: +e.target.value })} /></Field>}
            <Field label="Reorder Level"><Input type="number" value={f.reorderLevel} onChange={(e) => setF({ ...f, reorderLevel: +e.target.value })} /></Field>
            <Field label="Godown / Location"><Input value={f.godown} onChange={(e) => setF({ ...f, godown: e.target.value })} placeholder="Rack A-01" /></Field>
            <Field label="Supplier" className="sm:col-span-2"><Select value={f.supplierId || 'none'} onValueChange={(v) => setF({ ...f, supplierId: v === 'none' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">— none —</SelectItem>{(suppliers.data?.items ?? []).map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Specification" className="sm:col-span-3"><Input value={f.spec} onChange={(e) => setF({ ...f, spec: e.target.value })} placeholder="GSM, width, shade, count…" /></Field>
          </div>
          {/* alternate suppliers — compared side by side when a PO is raised from the plan */}
          <div className="mt-4 overflow-hidden rounded-xl border">
            <div className="flex items-center justify-between border-b bg-secondary px-3 py-1.5"><span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Alternate suppliers · {f.suppliers.length}</span>
              <Button size="sm" variant="secondary" type="button" onClick={() => setF({ ...f, suppliers: [...f.suppliers, { supplierId: '', rate: 0, moq: 0, leadDays: 0, note: '' }] })}><Plus size={13} /> Add supplier</Button></div>
            {!f.suppliers.length ? <div className="px-3 py-2 text-[11.5px] text-muted-foreground">Optional — other suppliers who can supply this material, with their quoted rate, MOQ and lead time. The PO dialog lists them next to the main supplier so you can pick the best rate.</div>
            : <table className="w-full text-[12px]"><thead><tr className="text-[10px] font-bold uppercase text-muted-foreground"><th className="px-2 py-1 text-left">Supplier</th>{showRate && <th className="px-2 py-1 text-right">Rate (₹)</th>}<th className="px-2 py-1 text-right">MOQ</th><th className="px-2 py-1 text-right">Lead (d)</th><th className="px-2 py-1 text-left">Note</th><th className="w-7" /></tr></thead>
              <tbody>{f.suppliers.map((x, i) => { const set = (patch: Partial<AltSupplier>) => setF({ ...f, suppliers: f.suppliers.map((y, j) => (j === i ? { ...y, ...patch } : y)) }); return (
                <tr key={i} className="border-t">
                  <td className="p-1"><Select value={x.supplierId || 'none'} onValueChange={(v) => set({ supplierId: v === 'none' ? '' : v })}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">— choose —</SelectItem>{(suppliers.data?.items ?? []).filter((sp) => sp.id !== f.supplierId).map((sp) => <SelectItem key={sp.id} value={sp.id}>{sp.name}</SelectItem>)}</SelectContent></Select></td>
                  {showRate && <td className="p-1"><input type="number" step="0.01" className="num h-8 w-24 rounded-md border bg-card px-1.5 text-right text-xs outline-none" value={x.rate || ''} onChange={(e) => set({ rate: +e.target.value })} /></td>}
                  <td className="p-1"><input type="number" className="num h-8 w-20 rounded-md border bg-card px-1.5 text-right text-xs outline-none" value={x.moq || ''} onChange={(e) => set({ moq: +e.target.value })} /></td>
                  <td className="p-1"><input type="number" className="num h-8 w-16 rounded-md border bg-card px-1.5 text-right text-xs outline-none" value={x.leadDays || ''} onChange={(e) => set({ leadDays: +e.target.value })} /></td>
                  <td className="p-1"><input className="h-8 w-full rounded-md border bg-card px-1.5 text-xs outline-none" value={x.note} placeholder="quote ref, quality remark…" onChange={(e) => set({ note: e.target.value })} /></td>
                  <td className="p-1"><button type="button" className="text-muted-foreground hover:text-bad" onClick={() => setF({ ...f, suppliers: f.suppliers.filter((_, j) => j !== i) })}><Close size={13} /></button></td>
                </tr>); })}</tbody></table>}
          </div>
          {cf.node}</DialogBody>
          <DialogFooter><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={save.isPending || !f.code || !f.name || !cf.ok} onClick={submit}><Check size={16} /> Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <LedgerDialog material={ledger} onClose={() => setLedger(null)} />
      <AdjustDialog material={adjust} onClose={() => setAdjust(null)} />
      <NewPoDialog open={!!po} prefill={po ?? undefined} onClose={() => setPo(null)} />
    </div>
  );
}

/* ---------- movement ledger per material ---------- */
export function LedgerDialog({ material, onClose }: { material: Material | null; onClose: () => void }) {
  const rows = useQuery<{ items: LedgerRow[] }>({ queryKey: ['/stock', 'ledger', material?.id], queryFn: async () => (await api.get('/stock/ledger', { params: { materialId: material!.id, limit: 300 } })).data, enabled: !!material });
  if (!material) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide>
        <DialogHeader><DialogTitle>Movement Ledger — {material.code}</DialogTitle>
          <DialogDescription>{material.name} · opening → receipts → issues → returns → closing. Append-only; corrections are new rows.</DialogDescription></DialogHeader>
        <DialogBody className="p-0">
          <div className="grid grid-cols-3 gap-2 border-b p-4 text-center">
            {[['Physical', material.physicalQty], ['Reserved', material.reservedQty], ['Free', material.freeQty]].map(([k, v]) => (
              <div key={k as string} className="rounded-lg bg-secondary p-2"><div className="text-[10px] uppercase text-muted-foreground">{k as string}</div><div className={cn('num font-slab text-lg font-bold', k === 'Free' && (v as number) < 0 && 'text-bad')}>{fmtN(v as number)} <span className="text-[10px] font-normal text-muted-foreground">{material.uom}</span></div></div>))}
          </div>
          {rows.isLoading ? <div className="space-y-2 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
          : !rows.data?.items.length ? <EmptyState title="No movements yet" />
          : <Table>
            <THead><Tr className="hover:bg-transparent"><Th>Date</Th><Th>Transaction</Th><Th>Reference</Th><Th className="text-right">Physical Δ</Th><Th className="text-right">Reserved Δ</Th><Th className="text-right">Balance</Th><Th>Godown</Th><Th>By</Th></Tr></THead>
            <TBody>{rows.data.items.map((r) => (
              <Tr key={r.id}>
                <Td className="text-xs">{new Date(r.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Td>
                <Td><div className="text-xs font-semibold">{TXN_LABEL[r.txn] || r.txn}</div>{r.note && <div className="max-w-64 truncate text-[11px] text-muted-foreground" title={r.note}>{r.note}</div>}</Td>
                <Td className="font-mono text-xs">{r.refNo || '—'}{r.orderNo ? <div className="text-[10px] text-muted-foreground">{r.orderNo}</div> : null}</Td>
                <Td className={cn('num text-right font-semibold', r.qty > 0 ? 'text-teal' : r.qty < 0 ? 'text-bad' : 'text-muted-foreground')}>{r.qty ? `${r.qty > 0 ? '+' : ''}${fmtN(r.qty)}` : '—'}</Td>
                <Td className={cn('num text-right', r.reservedDelta ? 'font-semibold' : 'text-muted-foreground')}>{r.reservedDelta ? `${r.reservedDelta > 0 ? '+' : ''}${fmtN(r.reservedDelta)}` : '—'}</Td>
                <Td className="num text-right text-xs">{fmtN(r.balanceAfter?.physical)} <span className="text-muted-foreground">/ {fmtN(r.balanceAfter?.reserved)} res</span></Td>
                <Td className="text-xs">{r.godown || '—'}</Td><Td className="text-xs">{r.by}</Td>
              </Tr>))}</TBody>
          </Table>}
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- audited adjustment ---------- */
function AdjustDialog({ material, onClose }: { material: Material | null; onClose: () => void }) {
  const [qty, setQty] = React.useState(0);
  const [reason, setReason] = React.useState('');
  const act = useAction<LedgerRow>(['/materials', '/stock'], (r) => { toast.success(`${r.materialCode} adjusted ${r.qty > 0 ? '+' : ''}${fmtN(r.qty)} · balance ${fmtN(r.balanceAfter.physical)}`); onClose(); });
  React.useEffect(() => { setQty(0); setReason(''); }, [material]);
  if (!material) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Adjust Stock — {material.code}</DialogTitle>
          <DialogDescription>Physical count variance, damage, write-off. Positive adds, negative removes. The reason is stored on the ledger row and in the audit log.</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label={`Quantity (± ${material.uom})`}><Input type="number" value={qty || ''} onChange={(e) => setQty(+e.target.value)} placeholder="-25" /></Field>
            <Field label="Balance after"><Input readOnly value={`${fmtN(material.physicalQty + qty)} ${material.uom}`} className={cn(material.physicalQty + qty < 0 && 'text-bad')} /></Field>
          </div>
          <Field label="Reason (required)"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Physical count 10 Sept — 25 mtr short, water damage" /></Field>
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!qty || reason.trim().length < 4 || material.physicalQty + qty < 0 || act.isPending} onClick={() => act.mutate({ url: '/stock/adjust', body: { materialId: material.id, qty, reason } })}><Check size={16} /> Post Adjustment</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
