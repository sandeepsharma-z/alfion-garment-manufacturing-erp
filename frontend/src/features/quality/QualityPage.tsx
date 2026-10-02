import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useList, uploadFile, fmtN, fmtDate, toInputDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { useCustomFields } from '@/components/CustomFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton, Table, THead, TBody, Tr, Th, Td, Badge } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader, KpiTile, Field, StatusPill, EmptyState, Bar, OrderLink, useOrderContext, OrderFacts } from '@/components/shared';
import { Quality as QIcon, Alert, Check, Plus, Upload, Refresh, Stock as StockIcon, Eye, Edit, Print } from '@/icons/icons';
import { openPrint, companyHead } from '@/features/samples/StyleTools';
import { MeasurementTab, RegistersTab } from './QualityTools';
import { AlertStrip } from '@/components/AlertStrip';

type Defect = { code: string; name: string; severity: string };
type Meta = { defects: Defect[]; fabricCategories: string[]; aqlLevels: string[] };
type Summary = { dhuToday: number; dhu7: number; dhuLimit: number; checkedToday: number; holds: { id: string; inspNo: string; materialCode: string; qty: number; days: number }[];
  failedFinal: { id: string; inspNo: string; orderNo: string; result: string }[]; finalDue: { orderId: string; orderNo: string; shipDate: string }[]; fabricPointsLimit: number; aqlLevel: string };
type Fabric = { id: string; inspNo: string; grnNo: string; materialId: string; materialCode: string; materialName: string; supplierName: string; lot: string; colour: string; metersChecked: number; widthInches: number; totalPoints: number; pointsPer100: number; pointsPer100Yd?: number; unit?: string; limit: number; result: string; hold: boolean; holdQty: number; inspector: string; date: string; remarks: string;
  gsm?: string; thans?: number; tagLength?: number; tagWidth?: number; actualWidth?: number; checkInDate?: string; releasedAt?: string; releasedBy?: string; defects: { category: string; p1: number; p2: number; p3: number; p4: number }[]; by?: string; custom?: Record<string, unknown> };
type Inline = { id: string; date: string; line: string; orderNo: string; op: string; kind: string; checked: number; totalDefects: number; dhu: number; inspector: string; defects: { name: string; count: number }[] };
type Aql = { id: string; inspNo: string; orderId: string; orderNo: string; styleNo: string; stage: string; date: string; inspectorType: string; inspector: string; aqlLevel: string; lotSize: number; sampleSize: number; acceptNo: number; rejectNo: number; majors: number; minors: number; result: string; blocksDispatch: boolean; holdReason: string; cartonsOpened: number; cartonsTotal: number; checks: Record<string, string> };
type Rej = { byType: { name: string; count: number }[]; byLine: { name: string; count: number }[]; byOrder: { name: string; count: number }[]; byVendor: { name: string; count: number }[]; totalInline: number; totalChecked: number };
type OrderLite = { id: string; orderNo: string; styleNo: string; buyerName?: string; colour: string; qty: number };
type Material = { id: string; code: string; name: string; uom: string; category: string };
type Company = { lines?: string[] };

const TABS = ['Fabric 4-point', 'Inline & DHU', 'Mid / Final AQL', 'Measurement', 'Needle & blade', 'Rejection analysis'] as const;

export default function QualityPage() {
  const [sp] = useSearchParams();
  const TAB_PARAM: Record<string, typeof TABS[number]> = { fabric: 'Fabric 4-point', inline: 'Inline & DHU', aql: 'Mid / Final AQL', measure: 'Measurement', needle: 'Needle & blade', rejection: 'Rejection analysis' };
  const [tab, setTab] = React.useState<typeof TABS[number]>(() => TAB_PARAM[sp.get('tab') || ''] || 'Inline & DHU');
  React.useEffect(() => { const t = TAB_PARAM[sp.get('tab') || '']; if (t) setTab(t); }, [sp]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sum = useQuery<Summary>({ queryKey: ['/quality', 'summary'], queryFn: async () => (await api.get('/quality/summary')).data });
  const s = sum.data;
  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Quality" sub="Fabric 4-point inspection at receipt, inline / end-line DHU per line, and mid / final AQL inspections. A failed final inspection blocks dispatch on the Control Tower.">
        <div className="flex rounded-lg border bg-secondary p-0.5">{TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={cn('rounded-md px-3 py-1.5 text-xs font-semibold transition-colors', tab === t ? 'bg-card text-brand shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{t}</button>)}</div>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={QIcon} label="DHU Today" value={s ? `${s.dhuToday}%` : '—'} tone={s && s.dhuToday > s.dhuLimit ? 'bad' : 'teal'} foot={`7-day ${s?.dhu7 ?? 0}% · limit ${s?.dhuLimit ?? 5}% · ${fmtN(s?.checkedToday)} checked today`} />
        <KpiTile icon={StockIcon} label="Lots On Hold" value={s?.holds.length ?? '—'} tone={s?.holds.length ? 'bad' : 'teal'} foot={s?.holds[0] ? `${s.holds[0].materialCode} · ${fmtN(s.holds[0].qty)} · ${s.holds[0].days} d` : 'no quality holds'} />
        <KpiTile icon={Alert} label="Final Failed / Held" value={s?.failedFinal.length ?? '—'} tone={s?.failedFinal.length ? 'bad' : 'teal'} foot={s?.failedFinal[0] ? `${s.failedFinal[0].orderNo} — dispatch blocked` : 'dispatch clear'} />
        <KpiTile icon={Check} label="Final Inspections Due" value={s?.finalDue.length ?? '—'} tone={s?.finalDue.length ? 'gold' : 'teal'} foot={s?.finalDue.map((d) => d.orderNo).slice(0, 3).join(' · ') || 'nothing shipping within 7 days'} />
      </div>
      <AlertStrip module="quality" />
      {tab === 'Fabric 4-point' && <FabricTab limit={s?.fabricPointsLimit ?? 20} />}
      {tab === 'Inline & DHU' && <InlineTab limit={s?.dhuLimit ?? 5} />}
      {tab === 'Mid / Final AQL' && <AqlTab level={s?.aqlLevel ?? '2.5'} />}
      {tab === 'Measurement' && <MeasurementTab />}
      {tab === 'Needle & blade' && <RegistersTab />}
      {tab === 'Rejection analysis' && <RejectionTab />}
    </div>
  );
}

const useMeta = () => useQuery<Meta>({ queryKey: ['/quality/meta'], queryFn: async () => (await api.get('/quality/meta')).data });
const DefectGrid = ({ defects, counts, setCounts }: { defects: Defect[]; counts: Record<string, number>; setCounts: (c: Record<string, number>) => void }) => (
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{defects.map((d) => (
    <label key={d.code} className="flex items-center gap-2 rounded-lg border bg-secondary px-2 py-1.5 text-[12px]"><span className="min-w-0 flex-1 truncate" title={d.name}><b className="font-mono">{d.code}</b> {d.name} <span className={cn('text-[10px]', d.severity === 'Major' ? 'text-bad' : 'text-muted-foreground')}>{d.severity}</span></span>
      <input type="number" min={0} className="w-14 rounded border bg-card px-1 py-0.5 text-right text-xs" value={counts[d.code] ?? ''} onChange={(e) => setCounts({ ...counts, [d.code]: e.target.value === '' ? (undefined as unknown as number) : Math.max(+e.target.value, 0) })} /></label>))}</div>
);

/* ---------- fabric 4-point (AFN 10) ---------- */
function FabricTab({ limit }: { limit: number }) {
  const qc = useQueryClient();
  const meta = useMeta();
  const list = useList<Fabric>('/quality/fabric', { size: 200 });
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Fabric | null>(null);
  const [view, setView] = React.useState<Fabric | null>(null);
  const mats = useList<Material>('/materials', { size: 500, category: 'Fabric' }, open);
  const cfF = useCustomFields('quality_fabric', editing?.custom ?? null, editing?.id ?? (open ? 'new' : 'closed'));
  const [forOrder, setForOrder] = React.useState('');
  const fOrders = useList<OrderLite>('/orders', { size: 200, status: 'Open' }, open);
  const fctx = useOrderContext(open ? forOrder : null).data;
  const bomFabricIds = new Set((fctx?.bom ?? []).filter((l) => l.category === 'Fabric').map((l) => l.materialId));
  const grnLots = (fctx?.fabricLots ?? []).filter((l) => !f.materialId || l.materialId === f.materialId);
  const [f, setF] = React.useState({ materialId: '', grnNo: '', lot: '', colour: '', metersChecked: 0, widthInches: 58, gsm: '', inspector: '', remarks: '', date: new Date().toISOString().slice(0, 10), tagLength: 0, tagWidth: 0, actualWidth: 0, thans: 0, unit: 'sqm', checkInDate: '' });
  const [pts, setPts] = React.useState<Record<string, { p1?: number; p2?: number; p3?: number; p4?: number }>>({});
  const cats = meta.data?.fabricCategories ?? [];
  const total = cats.reduce((a, c) => { const p = pts[c] || {}; return a + (p.p1 || 0) + 2 * (p.p2 || 0) + 3 * (p.p3 || 0) + 4 * (p.p4 || 0); }, 0);
  const per100 = f.metersChecked > 0 && f.widthInches > 0 ? (f.unit === 'sqyd' ? Math.round(total * 3600 / (f.metersChecked * 1.09361 * f.widthInches) * 10) / 10 : Math.round(total * 3937 / (f.metersChecked * f.widthInches) * 10) / 10) : 0;
  const post = useMutation({ mutationFn: async () => (editing ? await api.patch(`/quality/fabric/${editing.id}`, { ...f, custom: cfF.value, defects: cats.map((c) => ({ category: c, ...(pts[c] || {}) })) }) : await api.post('/quality/fabric', { ...f, custom: cfF.value, defects: cats.map((c) => ({ category: c, ...(pts[c] || {}) })) })).data,
    onSuccess: (d: Fabric) => { toast[d.result === 'Pass' ? 'success' : 'error'](`${d.inspNo} · ${d.pointsPer100} pts/100 sq m · ${d.result}${d.hold ? ` · ${fmtN(d.holdQty)} on QUALITY HOLD` : ''}`); ['/quality', '/materials', '/stock', '/alerts'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); closeForm(); setPts({}); }, onError: (e) => toast.error(apiMessage(e)) });
  const release = useMutation({ mutationFn: async (id: string) => { const reason = window.prompt('Reason for releasing the hold (re-inspected, sorted, buyer accepted…):'); if (!reason) throw new Error('cancelled'); return (await api.post(`/quality/fabric/${id}/release`, { reason })).data; },
    onSuccess: () => { toast.success('Quality hold released — stock free again'); ['/quality', '/materials', '/stock', '/alerts'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); }, onError: (e) => { if ((e as Error).message !== 'cancelled') toast.error(apiMessage(e)); } });
  const setP = (c: string, k: string, v: number | undefined) => { const cur = pts[c] || {}; setPts({ ...pts, [c]: { ...cur, [k]: v } }); };
  /* open the form prefilled for an existing inspection */
  const startEdit = (r: Fabric) => {
    setEditing(r); setView(null);
    setF({ materialId: r.materialId, grnNo: r.grnNo || '', lot: r.lot || '', colour: r.colour || '', metersChecked: r.metersChecked, widthInches: r.widthInches, gsm: r.gsm || '', inspector: r.inspector || '', remarks: r.remarks || '', date: toInputDate(r.date), tagLength: r.tagLength || 0, tagWidth: r.tagWidth || 0, actualWidth: r.actualWidth || 0, thans: r.thans || 0, unit: r.unit || 'sqm', checkInDate: toInputDate(r.checkInDate) });
    setPts(Object.fromEntries((r.defects || []).map((d) => [d.category, { p1: d.p1 || undefined, p2: d.p2 || undefined, p3: d.p3 || undefined, p4: d.p4 || undefined }])));
    setOpen(true);
  };
  const closeForm = () => { setOpen(false); setEditing(null); };
  const printAfn10 = async (r: Fabric) => {
    const head = await companyHead(`Fabric Inspection Report (4-point) — ${r.inspNo}`, 'fabricInspection');
    openPrint(r.inspNo, head + `<table><tr><th>Material</th><td>${r.materialCode} · ${r.materialName}</td><th>Supplier</th><td>${r.supplierName || '—'}</td></tr><tr><th>GRN · Lot</th><td>${r.grnNo || '—'} · ${r.lot || '—'}</td><th>Colour · GSM</th><td>${r.colour || '—'} · ${r.gsm || '—'}</td></tr><tr><th>Thans</th><td>${r.thans || '—'}</td><th>Check-in · inspected</th><td>${r.checkInDate ? fmtDate(r.checkInDate) : '—'} · ${fmtDate(r.date)}</td></tr><tr><th>Length on tag / inspected</th><td>${r.tagLength || '—'} / ${r.metersChecked} m</td><th>Width on tag / actual</th><td>${r.tagWidth || '—'} / ${r.actualWidth || r.widthInches}"</td></tr></table>
      <h2>Defects (points by size bucket)</h2><table><tr><th>Category</th><th class="num">0–3" (1 pt)</th><th class="num">3–6" (2)</th><th class="num">6–9" (3)</th><th class="num">>9" / hole (4)</th><th class="num">Points</th></tr>${(r.defects || []).map((d) => `<tr><td>${d.category}</td><td class="num">${d.p1 || ''}</td><td class="num">${d.p2 || ''}</td><td class="num">${d.p3 || ''}</td><td class="num">${d.p4 || ''}</td><td class="num">${(d.p1 || 0) + 2 * (d.p2 || 0) + 3 * (d.p3 || 0) + 4 * (d.p4 || 0)}</td></tr>`).join('')}<tr><th colspan="5">Total points</th><td class="num"><b>${r.totalPoints}</b></td></tr></table>
      <p><b>${r.pointsPer100} points / 100 sq m</b>${r.pointsPer100Yd ? ` · ${r.pointsPer100Yd} points / 100 sq yd` : ''} · accepted up to ${r.limit} → <b class="${r.result === 'Pass' ? '' : 'bad'}">${r.result}</b>${r.hold ? ` · ${fmtN(r.holdQty)} m on quality hold` : r.releasedAt ? ` · hold released ${fmtDate(r.releasedAt)} by ${r.releasedBy}` : ''}</p>${r.remarks ? `<p>${r.remarks}</p>` : ''}<div class="sign"><div>Inspector: ${r.inspector}</div><div>Store</div><div>QA head</div></div>`);
  };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle>Fabric 4-point inspection</CardTitle><p className="text-xs text-muted-foreground">Points / 100 sq m = total points × 3937 ÷ (metres × width in inches) · {limit} accepted (format AFN/10) · a failed lot is put on quality hold and leaves free stock</p></div><Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> Inspect Lot</Button></CardHeader>
      <CardContent className="p-0">
        {list.isLoading ? <div className="p-5"><Skeleton className="h-9" /></div> : !list.data?.items.length ? <EmptyState title="No fabric inspections yet" text="Inspect a received lot against its GRN." />
        : <Table><THead><Tr className="hover:bg-transparent"><Th>Insp.</Th><Th>Material · Lot</Th><Th>GRN · Supplier</Th><Th className="text-right">Metres × Width</Th><Th className="text-right">Points</Th><Th className="text-right">Pts / 100 sq m</Th><Th>Result</Th><Th>Hold</Th><Th>Inspector</Th><Th /></Tr></THead>
          <TBody>{list.data.items.map((r) => (
            <Tr key={r.id} className="cursor-pointer" onClick={() => setView(r)}><Td className="font-mono text-xs font-semibold">{r.inspNo}<div className="text-[10px] font-normal text-muted-foreground">{fmtDate(r.date)}</div></Td>
              <Td><div className="text-xs font-semibold">{r.materialName}</div><div className="text-[10.5px] text-muted-foreground">{r.materialCode} · lot {r.lot || '—'} · {r.colour || '—'}</div></Td>
              <Td className="text-xs">{r.grnNo || '—'}<div className="text-[10.5px] text-muted-foreground">{r.supplierName}</div></Td>
              <Td className="num text-right text-xs">{fmtN(r.metersChecked)} m × {r.widthInches}"</Td><Td className="num text-right">{r.totalPoints}</Td>
              <Td className={cn('num text-right font-bold', r.pointsPer100 > r.limit ? 'text-bad' : 'text-teal')}>{r.pointsPer100} <span className="text-[10px] font-normal text-muted-foreground">/ {r.limit}</span></Td>
              <Td><StatusPill value={r.result} /></Td><Td>{r.hold ? <Badge tone="bad">HOLD {fmtN(r.holdQty)}</Badge> : r.holdQty ? <Badge tone="mute">released</Badge> : '—'}</Td><Td className="text-xs">{r.inspector}</Td>
              <Td><div className="flex gap-1" onClick={(e) => e.stopPropagation()}><Button size="sm" variant="secondary" title="Details" onClick={() => setView(r)}><Eye size={13} /></Button><Button size="sm" variant="secondary" title="Edit" onClick={() => startEdit(r)}><Edit size={13} /></Button>{r.hold && <Button size="sm" variant="secondary" onClick={() => release.mutate(r.id)}><Refresh size={13} /> Release</Button>}</div></Td></Tr>))}</TBody></Table>}
      </CardContent>
      <Dialog open={open} onOpenChange={(o) => !o && closeForm()}>
        <DialogContent wide meta={cfF.meta}>
          <DialogHeader><DialogTitle>{editing ? `Edit ${editing.inspNo}` : 'Fabric 4-point inspection'}</DialogTitle><DialogDescription>Count defects per category and size bucket: 0–3" = 1 pt · 3–6" = 2 · 6–9" = 3 · &gt;9" = 4 (holes: ≤1" = 2, &gt;1" = 4).</DialogDescription></DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="For order (optional)" className="sm:col-span-2" hint="narrows the fabric list to that style's BOM and offers its GRN lots"><Select value={forOrder || 'none'} onValueChange={(v) => setForOrder(v === 'none' ? '' : v)}><SelectTrigger><SelectValue placeholder="Open orders…" /></SelectTrigger><SelectContent><SelectItem value="none">— any fabric —</SelectItem>{(fOrders.data?.items ?? []).map((o) => <SelectItem key={o.id} value={o.id}>{o.orderNo} · {o.styleNo} · {o.buyerName}</SelectItem>)}</SelectContent></Select></Field>
              {fctx && <div className="sm:col-span-4"><OrderFacts ctx={fctx} /></div>}
              {grnLots.length > 0 && <Field label="GRN · lot" className="sm:col-span-2" hint="picking one fills GRN, lot, colour, width, thans"><Select value="none" onValueChange={(v) => { const l = grnLots.find((x) => `${x.grnNo}|${x.lotNo}` === v); if (l) setF({ ...f, materialId: l.materialId, grnNo: l.grnNo, lot: l.lotNo, colour: l.colour || f.colour, thans: l.thans || f.thans, actualWidth: l.actualWidth || f.actualWidth, widthInches: l.actualWidth || f.widthInches, gsm: l.gsm ? String(l.gsm) : f.gsm, tagLength: l.actualLength || f.tagLength }); }}><SelectTrigger><SelectValue placeholder="pick a received lot…" /></SelectTrigger><SelectContent><SelectItem value="none">— pick a received lot —</SelectItem>{grnLots.map((l) => <SelectItem key={`${l.grnNo}|${l.lotNo}`} value={`${l.grnNo}|${l.lotNo}`}>{l.grnNo}{l.lotNo ? ` · lot ${l.lotNo}` : ''} · {l.materialCode}{l.colour ? ` · ${l.colour}` : ''} · {fmtN(l.actualLength)} m</SelectItem>)}</SelectContent></Select></Field>}
              <Field label="Fabric" className="sm:col-span-2"><Select value={f.materialId} onValueChange={(v) => setF({ ...f, materialId: v })}><SelectTrigger><SelectValue placeholder="Select fabric…" /></SelectTrigger><SelectContent>{(bomFabricIds.size ? (mats.data?.items ?? []).filter((x) => bomFabricIds.has(x.id)) : mats.data?.items ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.code} · {m.name}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="GRN"><Input value={f.grnNo} onChange={(e) => setF({ ...f, grnNo: e.target.value })} placeholder="GRN-0012" /></Field>
              <Field label="Lot no"><Input value={f.lot} onChange={(e) => setF({ ...f, lot: e.target.value })} /></Field>
              <Field label="Metres inspected"><Input type="number" value={f.metersChecked || ''} onChange={(e) => setF({ ...f, metersChecked: +e.target.value })} /></Field>
              <Field label="Width (inches)"><Input type="number" value={f.widthInches} onChange={(e) => setF({ ...f, widthInches: +e.target.value })} /></Field>
              <Field label="Colour"><Input value={f.colour} onChange={(e) => setF({ ...f, colour: e.target.value })} /></Field>
              <Field label="GSM"><Input value={f.gsm} onChange={(e) => setF({ ...f, gsm: e.target.value })} /></Field>
              <Field label="Thans"><Input type="number" value={f.thans || ''} onChange={(e) => setF({ ...f, thans: +e.target.value })} /></Field>
              <Field label="On-tag length" hint="vs metres inspected (actual)"><Input type="number" value={f.tagLength || ''} onChange={(e) => setF({ ...f, tagLength: +e.target.value })} /></Field>
              <Field label="On-tag width (in)"><Input type="number" value={f.tagWidth || ''} onChange={(e) => setF({ ...f, tagWidth: +e.target.value })} /></Field>
              <Field label="Check-in date"><Input type="date" value={f.checkInDate} onChange={(e) => setF({ ...f, checkInDate: e.target.value })} /></Field>
              <Field label="Points per"><Select value={f.unit} onValueChange={(v) => setF({ ...f, unit: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sqm">100 sq metres</SelectItem><SelectItem value="sqyd">100 sq yards</SelectItem></SelectContent></Select></Field>
            </div>
            <div className="text-[11px] text-muted-foreground">Point buckets by defect length: 0–3" = 1 point · 3–6" = 2 · 6–9" = 3 · over 9" / hole = 4 (max 4 points per linear metre)</div>
            <div className="overflow-hidden rounded-xl border"><table className="w-full text-[12px]"><thead><tr className="bg-secondary text-[10px] uppercase text-muted-foreground"><th className="px-3 py-1.5 text-left">Defect category</th><th className="px-2 py-1.5">0–3" (1)</th><th className="px-2 py-1.5">3–6" (2)</th><th className="px-2 py-1.5">6–9" (3)</th><th className="px-2 py-1.5">&gt;9" (4)</th></tr></thead>
              <tbody>{cats.map((c) => <tr key={c} className="border-t"><td className="px-3 py-1 font-semibold">{c}</td>{(['p1', 'p2', 'p3', 'p4'] as const).map((k) => <td key={k} className="px-2 py-1 text-center"><input type="number" min={0} className="w-14 rounded border bg-secondary px-1 py-0.5 text-center" value={pts[c]?.[k] ?? ''} onChange={(e) => setP(c, k, e.target.value === '' ? undefined : Math.max(+e.target.value, 0))} /></td>)}</tr>)}</tbody></table></div>
            <div className={cn('rounded-xl border p-3 text-[13px]', per100 > limit ? 'border-bad/40 bg-bad-soft dark:bg-bad/10' : 'bg-secondary')}>
              <b>Total points {total}</b> · <b>{per100}</b> points / 100 {f.unit === 'sqyd' ? 'sq yd' : 'sq m'} · limit {limit} → <StatusPill value={per100 > limit ? 'Fail' : 'Pass'} />{per100 > limit && <span className="ml-2 text-bad">the free stock of this lot goes on quality hold</span>}
            </div>
            <div className="grid gap-4 sm:grid-cols-3"><Field label="Inspector"><Input value={f.inspector} onChange={(e) => setF({ ...f, inspector: e.target.value })} /></Field><Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field><Field label="Remarks"><Input value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} /></Field></div>
            {cfF.node}
          </DialogBody>
          <DialogFooter><Button variant="secondary" onClick={closeForm}>Cancel</Button><Button disabled={!f.materialId || !(f.metersChecked > 0) || post.isPending || !cfF.ok} onClick={() => post.mutate()}><Check size={15} /> {editing ? 'Save changes' : 'Post Inspection'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {/* detail */}
      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent wide>
          {view && <>
            <DialogHeader><DialogTitle className="flex flex-wrap items-center gap-2">{view.inspNo} <StatusPill value={view.result} />{view.hold && <Badge tone="bad">HOLD {fmtN(view.holdQty)} m</Badge>}</DialogTitle><DialogDescription>{view.materialCode} · {view.materialName} · {view.supplierName || '—'} · {fmtDate(view.date)} · {view.inspector}</DialogDescription></DialogHeader>
            <DialogBody className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {[['GRN', view.grnNo || '—'], ['Lot', view.lot || '—'], ['Colour', view.colour || '—'], ['GSM', view.gsm || '—'], ['Thans', view.thans || '—'], ['Check-in', view.checkInDate ? fmtDate(view.checkInDate) : '—'],
                  ['Length on tag → inspected', `${view.tagLength || '—'} → ${view.metersChecked} m`], ['Width on tag → actual', `${view.tagWidth || '—'} → ${view.actualWidth || view.widthInches}"`],
                  ['Points / 100 sq m', `${view.pointsPer100} (limit ${view.limit})`], ['Points / 100 sq yd', view.pointsPer100Yd ?? '—'], ['Total points', view.totalPoints], ['Hold', view.hold ? `${fmtN(view.holdQty)} m on hold` : view.releasedAt ? `released ${fmtDate(view.releasedAt)} · ${view.releasedBy}` : 'none']].map(([k, v]) => (
                  <div key={String(k)} className="rounded-lg border bg-secondary/60 px-3 py-2"><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{k}</div><div className="text-[13px] font-semibold">{v as React.ReactNode}</div></div>))}
              </div>
              <div className="overflow-hidden rounded-xl border"><table className="w-full text-[12px]"><thead><tr className="bg-secondary text-[10px] uppercase text-muted-foreground"><th className="px-3 py-1.5 text-left">Defect category</th><th className="px-2 py-1.5 text-right">0–3" (1)</th><th className="px-2 py-1.5 text-right">3–6" (2)</th><th className="px-2 py-1.5 text-right">6–9" (3)</th><th className="px-2 py-1.5 text-right">&gt;9" (4)</th><th className="px-2 py-1.5 text-right">Points</th></tr></thead>
                <tbody>{(view.defects || []).map((d) => <tr key={d.category} className="border-t"><td className="px-3 py-1 font-semibold">{d.category}</td>{(['p1', 'p2', 'p3', 'p4'] as const).map((k) => <td key={k} className="num px-2 py-1 text-right">{d[k] || '·'}</td>)}<td className="num px-2 py-1 text-right font-semibold">{(d.p1 || 0) + 2 * (d.p2 || 0) + 3 * (d.p3 || 0) + 4 * (d.p4 || 0)}</td></tr>)}</tbody></table></div>
              {view.remarks && <div className="rounded-lg border bg-secondary/60 px-3 py-2 text-[12.5px]"><b>Remarks:</b> {view.remarks}</div>}
              <div className="text-[11px] text-muted-foreground">Editing recalculates points and result; a Fail puts the free stock of this fabric on hold, a Pass releases it (a hold you released by hand stays released).</div>
            </DialogBody>
            <DialogFooter><Button variant="secondary" onClick={() => setView(null)}>Close</Button><Button variant="secondary" onClick={() => printAfn10(view)}><Print size={14} /> Print AFN/10</Button>{view.hold && <Button variant="secondary" onClick={() => { release.mutate(view.id); setView(null); }}><Refresh size={14} /> Release hold</Button>}<Button onClick={() => startEdit(view)}><Edit size={14} /> Edit</Button></DialogFooter>
          </>}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------- inline / end-line ---------- */
function InlineTab({ limit }: { limit: number }) {
  const qc = useQueryClient();
  const meta = useMeta();
  const list = useList<Inline>('/quality/inline', { size: 200 });
  const [open, setOpen] = React.useState(false);
  const orders = useList<OrderLite>('/orders', { size: 200, status: 'Open' }, open);
  const company = useQuery<Company>({ queryKey: ['/settings/company'], queryFn: async () => (await api.get('/settings/company')).data, enabled: open });
  const cfI = useCustomFields('quality_inline', null, open);
  const [f, setF] = React.useState({ orderId: '', line: '', op: 'Stitching', kind: 'Inline', checked: 0, inspector: '', remarks: '', date: new Date().toISOString().slice(0, 10) });
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const total = Object.values(counts).reduce((a, b) => a + (b || 0), 0);
  const dhu = f.checked > 0 ? Math.round(total * 1000 / f.checked) / 10 : 0;
  const post = useMutation({ mutationFn: async () => (await api.post('/quality/inline', { ...f, custom: cfI.value, defects: Object.entries(counts).map(([code, count]) => ({ code, count })) })).data,
    onSuccess: (d: Inline) => { toast[d.dhu > limit ? 'warning' : 'success'](`${d.line} · DHU ${d.dhu}%${d.dhu > limit ? ' — above limit' : ''}`); ['/quality', '/alerts', '/production'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); setOpen(false); setCounts({}); }, onError: (e) => toast.error(apiMessage(e)) });
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle>Inline / end-line inspection</CardTitle><p className="text-xs text-muted-foreground">Per line per day · DHU = defects × 100 ÷ pieces checked · limit {limit}%</p></div><Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> Log Inspection</Button></CardHeader>
      <CardContent className="p-0">
        {list.isLoading ? <div className="p-5"><Skeleton className="h-9" /></div> : !list.data?.items.length ? <EmptyState title="No inline inspections yet" />
        : <Table><THead><Tr className="hover:bg-transparent"><Th>Date</Th><Th>Line</Th><Th>Order</Th><Th>Type</Th><Th className="text-right">Checked</Th><Th className="text-right">Defects</Th><Th className="w-32">DHU</Th><Th>Top defects</Th><Th>Inspector</Th></Tr></THead>
          <TBody>{list.data.items.map((r) => (
            <Tr key={r.id} className={cn(r.dhu > limit && 'bg-bad-soft/40 dark:bg-bad/5')}><Td className="text-xs">{fmtDate(r.date)}</Td><Td className="text-xs font-semibold">{r.line}</Td><Td className="font-mono text-xs">{r.orderNo}</Td><Td><Badge tone="plain">{r.kind} · {r.op}</Badge></Td>
              <Td className="num text-right">{fmtN(r.checked)}</Td><Td className={cn('num text-right font-semibold', r.totalDefects && 'text-bad')}>{r.totalDefects}</Td>
              <Td><div className="flex items-center gap-2"><Bar pct={Math.min(r.dhu / limit * 50, 100)} tone={r.dhu > limit ? 'bad' : 'ok'} /><span className={cn('num text-xs font-bold', r.dhu > limit ? 'text-bad' : 'text-teal')}>{r.dhu}%</span></div></Td>
              <Td className="max-w-56 truncate text-[11px] text-muted-foreground" title={r.defects.map((d) => `${d.name} ${d.count}`).join(', ')}>{r.defects.slice(0, 3).map((d) => `${d.name} ${d.count}`).join(' · ') || '—'}</Td><Td className="text-xs">{r.inspector}</Td></Tr>))}</TBody></Table>}
      </CardContent>
      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent wide meta={cfI.meta}>
          <DialogHeader><DialogTitle>Log inline / end-line inspection</DialogTitle><DialogDescription>Defects by type from the master (Settings). DHU feeds the production dashboard and alerts.</DialogDescription></DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Order" className="sm:col-span-2"><Select value={f.orderId} onValueChange={(v) => setF({ ...f, orderId: v })}><SelectTrigger><SelectValue placeholder="Open orders…" /></SelectTrigger><SelectContent>{(orders.data?.items ?? []).map((o) => <SelectItem key={o.id} value={o.id}>{o.orderNo} · {o.styleNo}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Line"><Select value={f.line || 'none'} onValueChange={(v) => setF({ ...f, line: v === 'none' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">—</SelectItem>{(company.data?.lines ?? []).map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Type"><Select value={f.kind} onValueChange={(v) => setF({ ...f, kind: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Inline">Inline</SelectItem><SelectItem value="End-line">End-line</SelectItem></SelectContent></Select></Field>
              <Field label="Stage"><Select value={f.op} onValueChange={(v) => setF({ ...f, op: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['Cutting', 'Stitching', 'Finishing', 'Packing'].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Pieces checked"><Input type="number" value={f.checked || ''} onChange={(e) => setF({ ...f, checked: +e.target.value })} /></Field>
              <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
              <Field label="Inspector"><Input value={f.inspector} onChange={(e) => setF({ ...f, inspector: e.target.value })} /></Field>
            </div>
            <DefectGrid defects={meta.data?.defects ?? []} counts={counts} setCounts={setCounts} />
            <div className={cn('rounded-xl border p-3 text-[13px]', dhu > limit ? 'border-bad/40 bg-bad-soft dark:bg-bad/10' : 'bg-secondary')}><b>{total} defects</b> on {fmtN(f.checked)} pcs → DHU <b>{dhu}%</b> (limit {limit}%)</div>
            {cfI.node}
          </DialogBody>
          <DialogFooter><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!f.orderId || !(f.checked > 0) || post.isPending || !cfI.ok} onClick={() => post.mutate()}><Check size={15} /> Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------- mid / final AQL (AFN 21) ---------- */
const CHECKS = ['colour', 'fabric', 'outlook', 'packaging', 'pcl', 'assortment', 'marking'];
function AqlTab({ level }: { level: string }) {
  const qc = useQueryClient();
  const meta = useMeta();
  const { user } = useAuth();
  const list = useList<Aql>('/quality/aql', { size: 200 });
  const [open, setOpen] = React.useState(false);
  const orders = useList<OrderLite>('/orders', { size: 200, status: 'Open' }, open);
  const cfA = useCustomFields('quality_aql', null, open);
  const [f, setF] = React.useState({ orderId: '', stage: 'Final', site: 'Unit 1 — Noida', inspectorType: 'Internal', inspector: '', merchandiser: '', colour: '', sampling: 'Normal', aqlLevel: level, lotSize: 0, cartonsOpened: 0, cartonsTotal: 0, result: '', holdReason: '', remarks: '', date: new Date().toISOString().slice(0, 10) , poQty: 0, poDate: '', shippedQty: 0, refNo: '' });
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const [checks, setChecks] = React.useState<Record<string, string>>(Object.fromEntries(CHECKS.map((c) => [c, 'OK'])));
  const [report, setReport] = React.useState<{ id: string; name: string } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const plan = useQuery<{ sampleSize: number; acceptNo: number; rejectNo: number }>({ queryKey: ['/quality/aql/plan', f.lotSize, f.aqlLevel], queryFn: async () => (await api.get('/quality/aql/plan', { params: { lotSize: f.lotSize, level: f.aqlLevel } })).data, enabled: open && f.lotSize > 0 });
  const ord = (orders.data?.items ?? []).find((o) => o.id === f.orderId);
  React.useEffect(() => { if (ord) setF((x) => ({ ...x, lotSize: x.lotSize || ord.qty, colour: x.colour || ord.colour })); }, [ord]);
  const defects = meta.data?.defects ?? [];
  const majors = defects.filter((d) => d.severity === 'Major').reduce((a, d) => a + (counts[d.code] || 0), 0);
  const minors = defects.filter((d) => d.severity !== 'Major').reduce((a, d) => a + (counts[d.code] || 0), 0);
  const auto = plan.data ? (majors <= plan.data.acceptNo ? 'Pass' : 'Fail') : '';
  const post = useMutation({ mutationFn: async () => (await api.post('/quality/aql', { ...f, custom: cfA.value, defects: Object.entries(counts).map(([code, count]) => ({ code, count })), checks, result: f.result || undefined, reportFileId: report?.id, merchandiser: f.merchandiser })).data,
    onSuccess: (d: Aql) => { toast[d.result === 'Pass' ? 'success' : 'error'](`${d.inspNo} · ${d.stage} · ${d.result}${d.blocksDispatch ? ' — dispatch blocked' : ''}`); ['/quality', '/orders', '/alerts', '/tna', '/mywork'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); setOpen(false); setCounts({}); setReport(null); }, onError: (e) => toast.error(apiMessage(e)) });
  const upload = async (file?: File) => { if (!file) return; try { const r = await uploadFile(file, 'aql', ''); setReport({ id: r.id, name: r.name }); } catch (e) { toast.error(apiMessage(e)); } };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle>Mid / final inspection (AQL {level})</CardTitle><p className="text-xs text-muted-foreground">Sample size and accept / reject numbers from the AQL table (general level II) · format AFN/21 · a failed or held Final blocks dispatch</p></div><Button size="sm" onClick={() => { setF((x) => ({ ...x, inspector: user?.name || '' })); setOpen(true); }}><Plus size={14} /> New Inspection</Button></CardHeader>
      <CardContent className="p-0">
        {list.isLoading ? <div className="p-5"><Skeleton className="h-9" /></div> : !list.data?.items.length ? <EmptyState title="No AQL inspections yet" />
        : <Table><THead><Tr className="hover:bg-transparent"><Th>Insp.</Th><Th>Order</Th><Th>Stage</Th><Th>Inspector</Th><Th className="text-right">Lot · Sample</Th><Th className="text-right">Ac / Re</Th><Th className="text-right">Major / Minor</Th><Th>Result</Th><Th>Dispatch</Th></Tr></THead>
          <TBody>{list.data.items.map((r) => (
            <Tr key={r.id} className={cn(r.blocksDispatch && 'bg-bad-soft/40 dark:bg-bad/5')}><Td className="font-mono text-xs font-semibold">{r.inspNo}<div className="text-[10px] font-normal text-muted-foreground">{fmtDate(r.date)}</div></Td>
              <Td><OrderLink id={r.orderId} className="font-mono text-xs font-semibold text-brand hover:underline">{r.orderNo}</OrderLink><div className="text-[10.5px] text-muted-foreground">{r.styleNo}</div></Td>
              <Td><Badge tone={r.stage === 'Final' ? 'brand' : 'plain'}>{r.stage}</Badge></Td><Td className="text-xs">{r.inspector}<div className="text-[10.5px] text-muted-foreground">{r.inspectorType}</div></Td>
              <Td className="num text-right text-xs">{fmtN(r.lotSize)} · <b>{r.sampleSize}</b></Td><Td className="num text-right text-xs" title="majors found / allowed (Ac) · Re"><b className={r.majors > r.acceptNo ? 'text-bad' : 'text-teal'}>{r.majors}</b> / {r.acceptNo} · Re {r.rejectNo}</Td>
              <Td className="num text-right"><span className={cn('font-bold', r.majors > r.acceptNo ? 'text-bad' : 'text-teal')}>{r.majors}</span> / {r.minors}</Td>
              <Td><StatusPill value={r.result} />{r.holdReason && <div className="text-[10px] text-muted-foreground">{r.holdReason}</div>}</Td><Td>{r.blocksDispatch ? <Badge tone="bad">Blocked</Badge> : r.stage === 'Final' ? <Badge tone="ok">Clear</Badge> : '—'}</Td></Tr>))}</TBody></Table>}
      </CardContent>
      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent wide meta={cfA.meta}>
          <DialogHeader><DialogTitle>{f.stage} inspection — AQL</DialogTitle><DialogDescription>Result auto-derives from majors vs the accept number; choose Hold to stop dispatch pending a decision.</DialogDescription></DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Order" className="sm:col-span-2"><Select value={f.orderId} onValueChange={(v) => setF({ ...f, orderId: v, lotSize: 0 })}><SelectTrigger><SelectValue placeholder="Open orders…" /></SelectTrigger><SelectContent>{(orders.data?.items ?? []).map((o) => <SelectItem key={o.id} value={o.id}>{o.orderNo} · {o.styleNo} · {fmtN(o.qty)} pcs</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Stage"><Select value={f.stage} onValueChange={(v) => setF({ ...f, stage: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Mid">Mid</SelectItem><SelectItem value="Final">Final</SelectItem></SelectContent></Select></Field>
              <Field label="AQL level"><Select value={f.aqlLevel} onValueChange={(v) => setF({ ...f, aqlLevel: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(meta.data?.aqlLevels ?? ['2.5', '4.0']).map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Lot size (pcs)"><Input type="number" value={f.lotSize || ''} onChange={(e) => setF({ ...f, lotSize: +e.target.value })} /></Field>
              <Field label="Sample size" hint="from the AQL table"><Input readOnly value={plan.data?.sampleSize ?? '—'} /></Field>
              <Field label="Accept / Reject"><Input readOnly value={plan.data ? `${plan.data.acceptNo} / ${plan.data.rejectNo}` : '—'} /></Field>
              <Field label="Sampling"><Select value={f.sampling} onValueChange={(v) => setF({ ...f, sampling: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['Reduced', 'Normal', 'Reinforced'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Inspector"><Input value={f.inspector} onChange={(e) => setF({ ...f, inspector: e.target.value })} /></Field>
              <Field label="Inspector type"><Select value={f.inspectorType} onValueChange={(v) => setF({ ...f, inspectorType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['Internal', 'Buyer QA', 'Third party'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Merchandiser"><Input value={f.merchandiser} onChange={(e) => setF({ ...f, merchandiser: e.target.value })} /></Field>
              <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
              <Field label="Cartons opened / total" className="sm:col-span-2"><div className="flex gap-2"><Input type="number" value={f.cartonsOpened || ''} onChange={(e) => setF({ ...f, cartonsOpened: +e.target.value })} placeholder="opened" /><Input type="number" value={f.cartonsTotal || ''} onChange={(e) => setF({ ...f, cartonsTotal: +e.target.value })} placeholder="total" /></div></Field>
              <Field label="Colour"><Input value={f.colour} onChange={(e) => setF({ ...f, colour: e.target.value })} /></Field>
              <Field label="Site"><Input value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })} /></Field>
              <Field label="PO qty" hint="blank = order qty"><Input type="number" value={f.poQty || ''} onChange={(e) => setF({ ...f, poQty: +e.target.value })} /></Field>
              <Field label="PO date"><Input type="date" value={f.poDate} onChange={(e) => setF({ ...f, poDate: e.target.value })} /></Field>
              <Field label="Already shipped (pcs)"><Input type="number" value={f.shippedQty || ''} onChange={(e) => setF({ ...f, shippedQty: +e.target.value })} /></Field>
              <Field label="Reference no"><Input value={f.refNo} onChange={(e) => setF({ ...f, refNo: e.target.value })} placeholder="buyer inspection ref" /></Field>
            </div>
            <div><div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Defects found in the sample</div><DefectGrid defects={defects} counts={counts} setCounts={setCounts} /></div>
            <div><div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">General checking</div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">{CHECKS.map((c) => <label key={c} className="rounded-lg border bg-secondary px-2 py-1.5 text-[11px]"><div className="font-semibold uppercase">{c}</div><select className="mt-1 w-full rounded border bg-card px-1 py-0.5 text-xs" value={checks[c]} onChange={(e) => setChecks({ ...checks, [c]: e.target.value })}>{['OK', 'Not OK', 'N/A'].map((v) => <option key={v}>{v}</option>)}</select></label>)}</div></div>
            <div className={cn('flex flex-wrap items-center gap-3 rounded-xl border p-3 text-[13px]', auto === 'Fail' || f.result === 'Hold' ? 'border-bad/40 bg-bad-soft dark:bg-bad/10' : 'bg-secondary')}>
              <span><b>{majors}</b> major · <b>{minors}</b> minor on {plan.data?.sampleSize ?? '—'} pcs → auto result <StatusPill value={auto || '—'} /></span>
              <Select value={f.result || 'auto'} onValueChange={(v) => setF({ ...f, result: v === 'auto' ? '' : v })}><SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Use auto result</SelectItem><SelectItem value="Pass">Pass (override)</SelectItem><SelectItem value="Fail">Fail (override)</SelectItem><SelectItem value="Hold">Hold</SelectItem></SelectContent></Select>
              {f.result === 'Hold' && <Input className="h-8 flex-1" value={f.holdReason} onChange={(e) => setF({ ...f, holdReason: e.target.value })} placeholder="hold reason" />}
            </div>
            <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}><Upload size={13} /> Attach report / photos</Button><input ref={fileRef} type="file" accept=".pdf,image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />{report && <Badge tone="ok">{report.name}</Badge>}<Input className="h-8 flex-1" value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} placeholder="remarks" /></div>
            {cfA.node}
          </DialogBody>
          <DialogFooter><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!f.orderId || !(f.lotSize > 0) || post.isPending || !cfA.ok} onClick={() => post.mutate()}><Check size={15} /> Post Result</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------- rejection analysis (FR-20.4) ---------- */
function RejectionTab() {
  const q = useQuery<Rej>({ queryKey: ['/quality', 'rejections'], queryFn: async () => (await api.get('/quality/rejections')).data });
  const d = q.data;
  const Block = ({ title, rows, unit }: { title: string; rows: { name: string; count: number }[]; unit: string }) => {
    const max = Math.max(...rows.map((r) => r.count), 1);
    return (<Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="space-y-2">{!rows.length ? <div className="text-xs text-muted-foreground">No data in the last 30 days.</div> : rows.slice(0, 8).map((r) => (
      <div key={r.name} className="text-[12px]"><div className="flex justify-between"><span className="truncate font-semibold">{r.name}</span><span className="num text-muted-foreground">{fmtN(r.count)} {unit}</span></div><div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-bad" style={{ width: `${r.count / max * 100}%` }} /></div></div>))}</CardContent></Card>);
  };
  if (q.isLoading) return <Skeleton className="h-64" />;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-secondary px-4 py-3 text-[12.5px] text-muted-foreground">Last 30 days · <b className="text-foreground">{fmtN(d?.totalInline)}</b> inline defects on <b className="text-foreground">{fmtN(d?.totalChecked)}</b> pieces checked · job-work rejections reduce accepted quantity and count against the vendor.</div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Block title="By defect type" rows={d?.byType ?? []} unit="defects" /><Block title="By line" rows={d?.byLine ?? []} unit="defects" /><Block title="By order" rows={d?.byOrder ?? []} unit="defects" /><Block title="By vendor (job-work rejects)" rows={d?.byVendor ?? []} unit="pcs" /></div>
    </div>
  );
}
