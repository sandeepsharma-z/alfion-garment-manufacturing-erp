import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useList, fmtN, fmtInr, fmtDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton, Table, THead, TBody, Tr, Th, Td, Badge } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader, KpiTile, Field, EmptyState } from '@/components/shared';
import { Planning as PlanIcon, Stock, Alert, Payments, Plus, Trash, Save, Edit, Refresh } from '@/icons/icons';
import { RequirementTable, type PlanRow } from './RequirementTable';

type Style = { id: string; styleNo: string; description: string; buyerName: string };
type Material = { id: string; code: string; name: string; uom: string; freeQty: number };
type Line = { materialId: string; perPc: number; wastePct: number; note: string; part: string; colour: string; perSize: Record<string, number>; moq: number; requiredDate: string };
const SIZE_HINT = ['S', 'M', 'L', 'XL', '2XL', '3XL'];
type Bom = { styleId: string; version: number; lines: (Partial<Line> & { materialId: string; perPc: number; wastePct: number; materialCode: string; materialName: string; uom: string })[] } | null;
type Plan = { rows: PlanRow[]; qty: number; hasBom: boolean; version: number; shortages: number; onOrderLines?: number; totalBuyCost?: number };

export default function PlanningPage() {
  const { hasFlag, hasModule } = useAuth();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const styleId = sp.get('style') || '';
  const orderId = sp.get('order') || '';   // planning for a live order → colour / size-wise basis on its cutting qty
  const [qty, setQty] = React.useState(+(sp.get('qty') || 12000));
  const [editing, setEditing] = React.useState(false);
  const [lines, setLines] = React.useState<Line[]>([]);

  const styles = useList<Style>('/styles', { size: 500 });
  /* the sample of this style already lists what one piece needs — build the BOM from it instead of typing it again */
  const samples = useList<{ id: string; sampleNo: string; styleId?: string; materials?: { item: string }[] }>('/samples', { size: 200 });
  const sampleSheet = (samples.data?.items ?? []).find((x) => x.styleId === styleId && (x.materials?.length ?? 0) > 0);
  const fromSample = useMutation({
    mutationFn: async () => (await api.post(`/bom/from-sample/${sampleSheet!.id}`, { createMissing: true })).data as { bom: { version: number; lines: unknown[] }; created: { code: string }[]; skipped: { item: string; why: string }[] },
    onSuccess: (r) => { toast.success(`BOM v${r.bom.version} built from ${sampleSheet!.sampleNo} · ${r.bom.lines.length} lines${r.created.length ? ` · ${r.created.length} new stock item(s)` : ''}`); setEditing(false); ['/bom', '/bom/calc', '/materials'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const mats = useList<Material>('/materials', { size: 500, status: 'Active' });
  const bom = useQuery<Bom>({ queryKey: ['/bom', styleId], queryFn: async () => (await api.get(`/bom/${styleId}`)).data, enabled: !!styleId });
  const plan = useQuery<Plan>({
    queryKey: ['/bom/calc', styleId, qty, orderId],
    queryFn: async () => (await api.post('/bom/calc', { styleId, qty, orderId: orderId || undefined })).data,
    enabled: !!styleId && qty > 0,
  });
  const saveBom = useMutation({
    mutationFn: async () => (await api.put(`/bom/${styleId}`, { lines: lines.filter((l) => l.materialId && l.perPc > 0) })).data,
    onSuccess: (b: NonNullable<Bom>) => { toast.success(`BOM v${b.version} saved`); setEditing(false); qc.invalidateQueries({ queryKey: ['/bom'] }); qc.invalidateQueries({ queryKey: ['/bom/calc'] }); qc.invalidateQueries({ queryKey: [`/orders`] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const startEdit = () => { setLines(bom.data?.lines.map((l) => ({ materialId: l.materialId, perPc: l.perPc, wastePct: l.wastePct, note: l.note || '', part: l.part || '', colour: l.colour || '', perSize: l.perSize || {}, moq: l.moq || 0, requiredDate: l.requiredDate ? String(l.requiredDate).slice(0, 10) : '' })) ?? []); setEditing(true); };
  const setLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const style = styles.data?.items.find((s) => s.id === styleId);
  const matById = Object.fromEntries((mats.data?.items ?? []).map((m) => [m.id, m]));
  const rows = plan.data?.rows ?? [];

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Material Planning" sub="Bill of Materials per style and the live requirement vs free stock for any order quantity. Every number is derived — nothing is typed in.">
        {styleId && !editing && sampleSheet && <Button variant="secondary" disabled={fromSample.isPending} onClick={() => fromSample.mutate()} title={`Take the material sheet of ${sampleSheet.sampleNo} (${sampleSheet.materials?.length} lines) into the BOM`}><Refresh size={16} /> {fromSample.isPending ? 'Building…' : `Build from ${sampleSheet.sampleNo}`}</Button>}
        {styleId && !editing && <Button variant="secondary" onClick={startEdit}><Edit size={16} /> {bom.data ? `Edit BOM (v${bom.data.version})` : 'Define BOM'}</Button>}
      </PageHeader>

      <Card><CardContent className="grid gap-4 p-5 sm:grid-cols-3">
        <Field label="Style" className="sm:col-span-2">
          <Select value={styleId} onValueChange={(v) => { setEditing(false); setSp({ style: v, qty: String(qty) }); }}>
            <SelectTrigger><SelectValue placeholder="Select a style…" /></SelectTrigger>
            <SelectContent>{(styles.data?.items ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.styleNo} · {s.description} · {s.buyerName}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Order Quantity (pcs)"><Input type="number" value={qty} onChange={(e) => { setQty(+e.target.value); setSp({ style: styleId, qty: e.target.value }); }} /></Field>
      </CardContent></Card>

      {!styleId ? <EmptyState title="Pick a style" text="Choose a style above to see its BOM and the material requirement for a quantity." />
      : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile icon={PlanIcon} label="BOM Lines" value={rows.length} tone="brand" foot={plan.data?.hasBom ? `v${plan.data.version}` : 'no BOM yet'} />
            <KpiTile icon={Stock} label="Lines Covered" value={rows.filter((r) => r.shortage === 0).length + (plan.data?.onOrderLines ?? 0)} tone="teal" foot={`${rows.filter((r) => r.shortage === 0).length} in stock · ${plan.data?.onOrderLines ?? 0} on order`} />
            <KpiTile icon={Alert} label="Lines To Buy" value={plan.data?.shortages ?? 0} tone={plan.data?.shortages ? 'bad' : 'teal'} foot="shortage not yet covered by a PO" />
            {hasFlag('rates.view') ? <KpiTile icon={Payments} label="Est. Purchase Cost" value={fmtInr(plan.data?.totalBuyCost ?? 0)} tone="gold" foot="shortage × material rate" />
              : <KpiTile icon={PlanIcon} label="Waste Allowance" value={rows.length ? `${Math.max(...rows.map((r) => r.wastePct))}%` : '—'} tone="mute" foot="max across lines" />}
          </div>

          {editing ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div><CardTitle>Bill of Materials — {style?.styleNo}</CardTitle><p className="text-xs text-muted-foreground">Consumption per piece with waste allowance. Saving creates a new BOM version.</p></div>
                <Button size="sm" variant="secondary" onClick={() => setLines([...lines, { materialId: '', perPc: 0, wastePct: 5, note: '', part: '', colour: '', perSize: {}, moq: 0, requiredDate: '' }])}><Plus size={14} /> Add Line</Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <THead><Tr className="hover:bg-transparent"><Th className="w-[40%]">Material</Th><Th className="w-32">Per pc</Th><Th className="w-28">Waste %</Th><Th>Note</Th><Th className="text-right">Required @ {fmtN(qty)}</Th><Th /></Tr></THead>
                  <TBody>{lines.flatMap((l, i) => {
                    const m = matById[l.materialId];
                    const req = l.perPc > 0 ? Math.ceil(l.perPc * qty * (1 + l.wastePct / 100)) : 0;
                    return ([
                      <Tr key={i} className="hover:bg-transparent">
                        <Td><Select value={l.materialId} onValueChange={(v) => setLine(i, { materialId: v })}><SelectTrigger><SelectValue placeholder="Select material…" /></SelectTrigger>
                          <SelectContent>{(mats.data?.items ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.code} · {m.name}</SelectItem>)}</SelectContent></Select></Td>
                        <Td><div className="flex items-center gap-1.5"><Input type="number" step="0.01" value={l.perPc} onChange={(e) => setLine(i, { perPc: +e.target.value })} /><span className="text-[11px] text-muted-foreground">{m?.uom ?? ''}</span></div></Td>
                        <Td><Input type="number" step="0.5" value={l.wastePct} onChange={(e) => setLine(i, { wastePct: +e.target.value })} /></Td>
                        <Td><Input value={l.note} onChange={(e) => setLine(i, { note: e.target.value })} placeholder="e.g. 165 gsm, 58in" /></Td>
                        <Td className={cn('num text-right font-semibold', m && req > m.freeQty && 'text-bad')}>{req ? fmtN(req) : '—'}{m && <div className="text-[10.5px] font-normal text-muted-foreground">free {fmtN(m.freeQty)}</div>}</Td>
                        <Td><Button size="sm" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash size={14} /></Button></Td>
                      </Tr>,
                      <Tr key={`${i}-d`} className="hover:bg-transparent"><Td colSpan={6} className="bg-secondary/40 py-2">
                        <div className="flex flex-wrap items-end gap-2 text-[11.5px]">
                          <label className="flex flex-col gap-0.5"><span className="text-[10px] font-bold uppercase text-muted-foreground">Part</span><Input className="h-7 w-24 text-xs" value={l.part} placeholder="FAB-A" onChange={(e) => setLine(i, { part: e.target.value })} /></label>
                          <label className="flex flex-col gap-0.5"><span className="text-[10px] font-bold uppercase text-muted-foreground">Colour (blank = all)</span><Input className="h-7 w-28 text-xs" value={l.colour} placeholder="B-01 / Navy" onChange={(e) => setLine(i, { colour: e.target.value })} /></label>
                          <label className="flex flex-col gap-0.5"><span className="text-[10px] font-bold uppercase text-muted-foreground">MOQ</span><Input type="number" className="h-7 w-20 text-xs" value={l.moq || ''} onChange={(e) => setLine(i, { moq: +e.target.value })} /></label>
                          <label className="flex flex-col gap-0.5"><span className="text-[10px] font-bold uppercase text-muted-foreground">Required by</span><Input type="date" className="h-7 w-36 text-xs" value={l.requiredDate} onChange={(e) => setLine(i, { requiredDate: e.target.value })} /></label>
                          <div className="flex flex-col gap-0.5"><span className="text-[10px] font-bold uppercase text-muted-foreground">Per size (overrides per pc)</span><div className="flex flex-wrap gap-1">{[...new Set([...SIZE_HINT, ...Object.keys(l.perSize)])].map((sz) => <label key={sz} className="flex items-center gap-0.5 rounded border bg-card px-1"><span className="text-[10px] font-semibold">{sz}</span><input type="number" step="0.01" className="num h-6 w-14 bg-transparent text-xs outline-none" value={l.perSize[sz] ?? ''} onChange={(e) => { const p = { ...l.perSize }; if (e.target.value === '') delete p[sz]; else p[sz] = +e.target.value; setLine(i, { perSize: p }); }} /></label>)}
                            <input className="h-6 w-16 rounded border bg-card px-1 text-[10px] outline-none" placeholder="+ size" onKeyDown={(e) => { const v = (e.target as HTMLInputElement).value.trim(); if (e.key === 'Enter' && v) { setLine(i, { perSize: { ...l.perSize, [v]: l.perPc } }); (e.target as HTMLInputElement).value = ''; } }} /></div></div>
                        </div></Td></Tr>]);
                  })}</TBody>
                </Table>
                {!lines.length && <div className="p-6 text-center text-sm text-muted-foreground">No lines — add fabric, trims and packing materials.</div>}
                <div className="flex justify-end gap-2 border-t px-5 py-3">
                  <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
                  <Button disabled={saveBom.isPending || !lines.some((l) => l.materialId && l.perPc > 0)} onClick={() => saveBom.mutate()}><Save size={16} /> Save BOM</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                <div><CardTitle>Requirement vs Stock — {style?.styleNo} × {fmtN(qty)} pcs{orderId ? ' · colour / size-wise for the order' : ''}</CardTitle>
                  <p className="text-xs text-muted-foreground">required = per pc × cut qty × (1 + waste%) · coverage = (reserved for this order + free) ÷ required · to buy = max(shortage − on order, MOQ)</p></div>
                {plan.data?.hasBom && (plan.data.shortages ? <Badge tone="bad">{plan.data.shortages} line{plan.data.shortages > 1 ? 's' : ''} to buy</Badge> : plan.data.onOrderLines ? <Badge tone="info">{plan.data.onOrderLines} line{plan.data.onOrderLines > 1 ? 's' : ''} on order · rest in stock</Badge> : <Badge tone="ok">All material available</Badge>)}
              </CardHeader>
              <CardContent className="p-0">
                {plan.isLoading ? <div className="space-y-2 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
                : !plan.data?.hasBom ? <EmptyState title="No BOM for this style" text="Define the bill of materials to calculate requirement and shortages." action={<Button onClick={startEdit}><Plus size={16} /> Define BOM</Button>} />
                : <RequirementTable rows={rows} styleId={styleId} qty={qty} orderId={orderId || undefined} />}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
