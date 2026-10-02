import * as React from 'react';
import { toast } from 'sonner';
import { useMutation, useQueryClient, useQueries } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { fmtN, fmtInr, fmtDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Po as PoIcon, Check } from '@/icons/icons';

export type PlanRow = { materialId: string; code: string; name: string; uom: string; category?: string; itemType?: string; part?: string; colour?: string; moq?: number; orderQty?: number; toOrder?: number; onOrder?: number; openPos?: number; poNos?: string[]; poEta?: string; requiredDate?: string;
  supplierId?: string; supplierName?: string; perPc: number; wastePct: number; required: number; physical: number; reserved: number; reservedForOrder?: number; free: number; shortage: number; buyCost?: number; status: string };
type SupplierOpt = { supplierId: string; name: string; location?: string; paymentTerms?: string; leadDays: number; rate?: number; lastRate?: number; lastPoDate?: string; lastPoNo?: string; moq: number; source: 'master' | 'alternate' | 'last PO' | 'category'; pos: number; onTimePct: number | null; primary?: boolean; note?: string };
type Options = { materialId: string; code: string; uom: string; primarySupplierId?: string; options: SupplierOpt[] };
type Pick = { qty: string; supplierId: string; rate: string };
const GROUPS = ['Fabric', 'Accessory', 'Packing'];
const GROUP_LABEL: Record<string, string> = { Fabric: 'Fabric', Accessory: 'Trims & accessories', Packing: 'Packing' };
/** PO quantity for a line: MOQ-aware (order page → toOrder, planning calculator → orderQty) */
export const needOf = (r: PlanRow) => (r.orderQty != null ? r.orderQty : r.toOrder != null ? r.toOrder : r.shortage);   // 0 when open POs already cover the shortage

/**
 * Requirement vs stock — grouped by category, coverage bar per line, one-click PO per line or for a selection.
 * `orderId` makes the PO order-linked; without it the planning calculator quantity is used.
 */
export function RequirementTable({ rows, styleId, qty, orderId, invalidate = [] }: { rows: PlanRow[]; styleId: string; qty: number; orderId?: string; invalidate?: string[] }) {
  const { hasFlag, hasModule } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const showRate = hasFlag('rates.view');
  const canPo = hasModule('po');
  const short = rows.filter((r) => needOf(r) > 0);
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [confirm, setConfirm] = React.useState<PlanRow[] | null>(null);
  const [picks, setPicks] = React.useState<Record<string, Pick>>({});
  /* supplier options (master · alternates · past POs · same-category) for every line in the confirm dialog */
  const optQ = useQueries({ queries: (confirm ?? []).map((r) => ({ queryKey: ['/po/supplier-options', r.materialId], queryFn: async () => (await api.get('/po/supplier-options', { params: { materialId: r.materialId } })).data as Options, staleTime: 60_000 })) });
  const optsOf = (id: string) => optQ.find((q) => q.data?.materialId === id)?.data?.options ?? [];
  const loadedKey = optQ.map((q) => q.data?.materialId).join(',');
  React.useEffect(() => {   // default = cheapest supplier with a known rate, else the material's own supplier
    setPicks((p) => { const n = { ...p }; (confirm ?? []).forEach((r) => { const o = optsOf(r.materialId); if (!o.length || n[r.materialId]?.supplierId) return; const best = o.find((x) => x.rate) || o.find((x) => x.primary) || o[0]; n[r.materialId] = { ...(n[r.materialId] ?? { qty: String(needOf(r)) }), supplierId: best.supplierId, rate: best.rate != null ? String(best.rate) : '' }; }); return n; });
  }, [loadedKey, confirm]);   // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { setSel(new Set(short.map((r) => r.materialId))); }, [rows.length, short.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  const raise = useMutation({
    mutationFn: async (lines: { materialId: string; qty?: number; supplierId?: string; rate?: number }[]) => (await api.post('/po/from-plan', { styleId, qty, orderId, lines })).data as { created: string[]; skipped: string[] },
    onSuccess: (r) => {
      ['/po', '/materials', '/bom/calc', '/orders', '/alerts', ...invalidate].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setConfirm(null);
      if (!r.created.length) return toast.info(r.skipped[0] || 'Nothing to order');
      toast.success(`Raised ${r.created.join(', ')}${r.skipped.length ? ` · skipped: ${r.skipped.join('; ')}` : ''}`, { action: { label: 'Open POs', onClick: () => nav('/po') } });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const openConfirm = (list: PlanRow[]) => { setPicks(Object.fromEntries(list.map((r) => [r.materialId, { qty: String(needOf(r)), supplierId: '', rate: '' }]))); setConfirm(list); };
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selected = short.filter((r) => sel.has(r.materialId));
  const cost = (list: PlanRow[]) => list.reduce((a, r) => a + (r.buyCost || 0), 0);
  const groups = GROUPS.map((g) => ({ key: g, rows: rows.filter((r) => (r.category || 'Accessory') === g) })).filter((g) => g.rows.length);
  const other = rows.filter((r) => !GROUPS.includes(r.category || 'Accessory'));
  if (other.length) groups.push({ key: 'Other', rows: other });

  return (
    <div>
      {/* toolbar: selection + bulk raise */}
      {canPo && short.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-secondary/60 px-4 py-2">
          <div className="flex flex-wrap items-center gap-3 text-[12px]">
            <label className="flex items-center gap-1.5 font-semibold"><input type="checkbox" checked={selected.length === short.length} onChange={(e) => setSel(e.target.checked ? new Set(short.map((r) => r.materialId)) : new Set())} /> {selected.length} of {short.length} short lines selected</label>
            {showRate && <span className="text-muted-foreground">≈ {fmtInr(cost(selected))}</span>}
            <span className="text-muted-foreground">Tick the lines to buy now, or use the <b>PO</b> button on a single line.</span>
          </div>
          <Button size="sm" className="from-gold-vivid to-gold text-[#241d03]" disabled={!selected.length || raise.isPending} onClick={() => openConfirm(selected)}><PoIcon size={14} /> Raise {selected.length} PO{selected.length === 1 ? '' : 's'}</Button>
        </div>)}
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead><tr className="bg-secondary text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
            {canPo && <th className="w-8 px-2 py-2" />}<th className="px-3 py-2 text-left">Material</th><th className="px-2 py-2 text-right">Per pc</th><th className="px-2 py-2 text-right">Required</th><th className="min-w-[150px] px-2 py-2 text-left">Coverage</th><th className="px-2 py-2 text-right">Free</th><th className="px-2 py-2 text-right">On order</th><th className="px-2 py-2 text-right">To buy</th>{showRate && <th className="px-2 py-2 text-right">Cost</th>}<th className="px-2 py-2 text-left">Status</th>{canPo && <th className="w-16 px-2 py-2" />}
          </tr></thead>
          {groups.map((g) => {
            const gShort = g.rows.filter((r) => needOf(r) > 0);
            return (
              <tbody key={g.key}>
                <tr className="border-t bg-card"><td colSpan={12} className="px-3 py-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]"><span className="font-slab text-[13px] font-bold">{GROUP_LABEL[g.key] ?? g.key}</span><span className="text-muted-foreground">{g.rows.length} line{g.rows.length === 1 ? '' : 's'}</span>
                    {gShort.length ? <Badge tone="bad">{gShort.length} to buy{showRate ? ` · ${fmtInr(cost(gShort))}` : ''}</Badge> : g.rows.some((r) => r.onOrder) ? <Badge tone="info">on order</Badge> : <Badge tone="ok">covered</Badge>}</div></td></tr>
                {g.rows.map((r) => {
                  const need = needOf(r);
                  const cover = r.required ? Math.min(Math.round(((r.reservedForOrder ?? 0) + Math.max(r.free, 0)) * 100 / r.required), 100) : 100;
                  const isShort = need > 0;
                  return (
                    <tr key={`${r.materialId}-${r.colour}`} className={cn('border-t', isShort && 'bg-bad-soft/20 dark:bg-bad/5')}>
                      {canPo && <td className="px-2 text-center">{isShort && <input type="checkbox" checked={sel.has(r.materialId)} onChange={() => toggle(r.materialId)} />}</td>}
                      <td className="px-3 py-2">
                        <div className="font-semibold">{r.name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10.5px] text-muted-foreground">
                          <span className="font-mono">{r.code}</span>{r.part && <span className="rounded bg-secondary px-1 font-semibold">{r.part}</span>}{r.colour && <span className="rounded bg-secondary px-1 font-semibold">{r.colour}</span>}
                          {r.supplierName ? <span>· {r.supplierName}</span> : <span className="text-bad">· no supplier — set it on the material</span>}{r.requiredDate && <span>· by {fmtDate(r.requiredDate)}</span>}{r.moq ? <span>· MOQ {fmtN(r.moq)}</span> : null}
                        </div>
                      </td>
                      <td className="num px-2 text-right">{r.perPc} <span className="text-[10.5px] text-muted-foreground">{r.uom}</span><div className="text-[10px] text-muted-foreground">+{r.wastePct}% waste</div></td>
                      <td className="num px-2 text-right font-semibold">{fmtN(r.required)}</td>
                      <td className="px-2"><div className="flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary"><div className={cn('h-full rounded-full', cover >= 100 ? 'bg-teal' : cover >= 50 ? 'bg-gold-vivid' : 'bg-bad')} style={{ width: `${cover}%` }} /></div><span className={cn('num w-9 text-right text-[11px] font-semibold', cover >= 100 ? 'text-teal' : 'text-muted-foreground')}>{cover}%</span></div>
                        <div className="text-[10px] text-muted-foreground">stock {fmtN(r.physical)} · reserved {fmtN(r.reserved)}{r.reservedForOrder ? ` (${fmtN(r.reservedForOrder)} this order)` : ''}</div></td>
                      <td className={cn('num px-2 text-right', r.free < 0 && 'text-bad')}>{fmtN(r.free)}</td>
                      <td className="px-2 text-right">{r.onOrder ? <><span className="num font-semibold text-info">{fmtN(r.onOrder)}</span><div className="font-mono text-[10px] text-muted-foreground">{(r.poNos ?? []).slice(0, 2).join(', ')}{(r.poNos?.length ?? 0) > 2 ? ` +${r.poNos!.length - 2}` : ''}{r.poEta ? ` · ETA ${fmtDate(r.poEta)}` : ''}</div></> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="num px-2 text-right">{isShort ? <><span className="font-bold text-bad">{fmtN(need)}</span><span className="text-[10.5px] text-muted-foreground"> {r.uom}</span>{need > Math.max(r.shortage - (r.onOrder ?? 0), 0) && <div className="text-[10px] text-muted-foreground">short {fmtN(Math.max(r.shortage - (r.onOrder ?? 0), 0))} · MOQ</div>}</> : r.shortage > 0 ? <span className="text-[11px] font-semibold text-info">covered by PO</span> : <span className="text-muted-foreground">—</span>}</td>
                      {showRate && <td className="num px-2 text-right">{r.buyCost ? fmtInr(r.buyCost) : '—'}</td>}
                      <td className="px-2"><Badge tone={r.status === 'Purchase' ? 'bad' : r.status === 'On Order' ? 'info' : r.status === 'Reserved' ? 'brand' : 'ok'}>{r.status}</Badge></td>
                      {canPo && <td className="px-2 text-right">{isShort ? <Button size="sm" variant="secondary" title={`Raise a PO for ${r.name}`} disabled={raise.isPending} onClick={() => openConfirm([r])}><PoIcon size={13} /> PO</Button> : r.onOrder ? <span className="text-[10.5px] text-muted-foreground" title={(r.poNos ?? []).join(', ')}>on order</span> : null}</td>}
                    </tr>);
                })}
              </tbody>);
          })}
        </table>
      </div>

      {/* confirm: pick the supplier per line (rates compared), edit qty / rate, one PO per line */}
      <Dialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent wide>
          <DialogHeader><DialogTitle>Raise {confirm?.length ?? 0} purchase order{(confirm?.length ?? 0) === 1 ? '' : 's'}</DialogTitle><DialogDescription>One PO per line{orderId ? ', linked to this order' : ''}. Every supplier who can supply the material is listed with the rate we know (material master, alternate supplier, or their last PO) — cheapest first. Change the supplier, quantity or rate before raising.</DialogDescription></DialogHeader>
          <DialogBody className="space-y-3">
            {(confirm ?? []).map((r) => {
              const p = picks[r.materialId] ?? { qty: String(needOf(r)), supplierId: '', rate: '' };
              const opts = optsOf(r.materialId);
              const chosen = opts.find((o) => o.supplierId === p.supplierId);
              const q = +p.qty || 0, rate = +p.rate || 0;
              const cheapest = opts.find((o) => o.rate);
              const setP = (patch: Partial<Pick>) => setPicks({ ...picks, [r.materialId]: { ...p, ...patch } });
              return (
                <div key={r.materialId} className="rounded-xl border">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-secondary/60 px-3 py-2">
                    <div><span className="font-semibold">{r.name}</span> <span className="font-mono text-[11px] text-muted-foreground">{r.code}{r.colour ? ` · ${r.colour}` : ''}</span><div className="text-[11px] text-muted-foreground">to buy {fmtN(needOf(r))} {r.uom}{r.moq ? ` · MOQ ${fmtN(r.moq)}` : ''}{r.requiredDate ? ` · needed by ${fmtDate(r.requiredDate)}` : ''}</div>{r.onOrder ? <div className="text-[11px] font-semibold text-info">Already on order: {(r.poNos ?? []).join(', ')} · {fmtN(r.onOrder)} {r.uom} pending — this PO is only for the balance.</div> : null}</div>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex flex-col text-[10px] font-bold uppercase text-muted-foreground">Qty ({r.uom})<input type="number" className="num h-8 w-24 rounded-md border bg-card px-1.5 text-right text-xs font-normal text-foreground outline-none focus:border-brand" value={p.qty} onChange={(e) => setP({ qty: e.target.value })} /></label>
                      {showRate && <label className="flex flex-col text-[10px] font-bold uppercase text-muted-foreground">Rate (₹ / {r.uom})<input type="number" step="0.01" className="num h-8 w-24 rounded-md border bg-card px-1.5 text-right text-xs font-normal text-foreground outline-none focus:border-brand" value={p.rate} onChange={(e) => setP({ rate: e.target.value })} /></label>}
                      {showRate && <div className="text-right"><div className="text-[10px] font-bold uppercase text-muted-foreground">≈ Value</div><div className="num text-[13px] font-bold">{q && rate ? fmtInr(Math.round(q * rate)) : '—'}</div></div>}
                    </div>
                  </div>
                  {!opts.length ? <div className="px-3 py-2 text-xs text-muted-foreground">Loading suppliers…</div>
                  : <table className="w-full text-[12px]"><thead><tr className="text-[10px] font-bold uppercase text-muted-foreground"><th className="w-8" /><th className="px-2 py-1 text-left">Supplier</th>{showRate && <th className="px-2 py-1 text-right">Rate</th>}<th className="px-2 py-1 text-left">Basis</th><th className="px-2 py-1 text-right">Lead</th><th className="px-2 py-1 text-right">MOQ</th><th className="px-2 py-1 text-left">Terms</th><th className="px-2 py-1 text-right">POs · on-time</th>{showRate && <th className="px-2 py-1 text-right">≈ Value</th>}</tr></thead>
                    <tbody>{opts.map((o) => { const on = o.supplierId === p.supplierId; const best = showRate && cheapest && o.supplierId === cheapest.supplierId; return (
                      <tr key={o.supplierId} className={cn('cursor-pointer border-t', on && 'bg-brand-soft/40 dark:bg-accent')} onClick={() => setP({ supplierId: o.supplierId, rate: o.rate != null ? String(o.rate) : p.rate })}>
                        <td className="px-2 text-center"><input type="radio" checked={on} readOnly /></td>
                        <td className="px-2 py-1.5"><span className="font-semibold">{o.name}</span>{o.primary && <Badge tone="plain" className="ml-1 text-[9px]">material&apos;s supplier</Badge>}{best && <Badge tone="ok" className="ml-1 text-[9px]">lowest</Badge>}{(o.location || o.note) && <div className="text-[10.5px] text-muted-foreground">{o.location}{o.note ? ` · ${o.note}` : ''}</div>}</td>
                        {showRate && <td className={cn('num px-2 text-right font-semibold', best && 'text-teal')}>{o.rate ? fmtInr(o.rate) : <span className="font-normal text-muted-foreground">no rate</span>}</td>}
                        <td className="px-2 text-[11px] text-muted-foreground">{o.source === 'master' ? 'material master' : o.source === 'alternate' ? 'alternate supplier' : o.source === 'last PO' ? `last PO ${o.lastPoNo ?? ''} · ${fmtDate(o.lastPoDate)}` : 'same category'}</td>
                        <td className="num px-2 text-right">{o.leadDays ? `${o.leadDays} d` : '—'}</td><td className="num px-2 text-right">{o.moq ? fmtN(o.moq) : '—'}</td>
                        <td className="px-2 text-[11px]">{o.paymentTerms || '—'}</td>
                        <td className="num px-2 text-right text-[11px]">{o.pos ? `${o.pos} · ${o.onTimePct != null ? o.onTimePct + '%' : '—'}` : '—'}</td>
                        {showRate && <td className="num px-2 text-right">{o.rate && q ? fmtInr(Math.round(q * o.rate)) : '—'}</td>}
                      </tr>); })}</tbody></table>}
                  {chosen && chosen.moq > q && <div className="border-t px-3 py-1.5 text-[11px] text-gold">Quantity is below {chosen.name}&apos;s MOQ of {fmtN(chosen.moq)} {r.uom}.</div>}
                </div>);
            })}
          </DialogBody>
          <DialogFooter><Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button><Button disabled={raise.isPending || !(confirm ?? []).some((r) => +(picks[r.materialId]?.qty ?? 0) > 0 && picks[r.materialId]?.supplierId)} onClick={() => raise.mutate((confirm ?? []).filter((r) => +(picks[r.materialId]?.qty ?? 0) > 0 && picks[r.materialId]?.supplierId).map((r) => ({ materialId: r.materialId, qty: +picks[r.materialId].qty, supplierId: picks[r.materialId].supplierId, rate: showRate && picks[r.materialId].rate !== '' ? +picks[r.materialId].rate : undefined })))}><Check size={15} /> {raise.isPending ? 'Raising…' : `Raise ${(confirm ?? []).filter((r) => +(picks[r.materialId]?.qty ?? 0) > 0 && picks[r.materialId]?.supplierId).length} PO`}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
