import * as React from 'react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useAction, fmtN, fmtInr, fmtDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton, Table, THead, TBody, Tr, Th, Td, Badge } from '@/components/ui/misc';
import { PageHeader, KpiTile, StatusPill, EmptyState, OrderLink, Bar } from '@/components/shared';
import { Accessory as AccIcon, Alert, Payments, Orders as OrdersIcon, Po as PoIcon, ChevronDown, ChevronRight, Search } from '@/icons/icons';
import { NewPoDialog, type PoPrefill } from '@/features/po/PoDialogs';

type Item = { id: string; code: string; name: string; uom: string; supplierName: string; physicalQty: number; reservedQty: number; freeQty: number; onOrder: number; reorderLevel: number; stockState: string; rate?: number };
type Line = { materialId: string; code: string; name: string; uom: string; required: number; available: number; reservedForOrder: number; shortage: number; onOrder: number; toOrder: number; status: string };
type ByOrder = { orderId: string; orderNo: string; styleNo: string; qty: number; shipDate?: string; priority: string; buyerName: string; spec: string; status: string; lines: Line[] };
type Overview = { items: Item[]; byOrder: ByOrder[]; kpi: { skus: number; short: number; value?: number; ordersShort: number } };

const ORDER_TONE: Record<string, 'ok' | 'info' | 'mute' | 'bad' | 'warn'> = { Available: 'ok', 'On Order': 'info', 'No BOM': 'mute', 'Not Ordered': 'bad', Short: 'bad' };
const STOCK_FILTERS = ['All', 'Short', 'Below Reorder', 'Healthy'] as const;

export default function AccessoriesPage() {
  const { hasFlag, hasModule } = useAuth();
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const [po, setPo] = React.useState<PoPrefill | null>(null);
  const [q, setQ] = React.useState('');
  const [filter, setFilter] = React.useState<typeof STOCK_FILTERS[number]>('All');
  const ov = useQuery<Overview>({ queryKey: ['/accessories', 'overview'], queryFn: async () => (await api.get('/accessories/overview')).data });
  const raise = useAction<{ created: string[]; skipped: string[] }>(['/accessories', '/po', '/orders'], (r) =>
    r.created.length ? toast.success(`Raised ${r.created.join(', ')}${r.skipped.length ? ` · skipped ${r.skipped.length}` : ''}`) : toast.info(r.skipped[0] || 'Nothing to order'));
  const d = ov.data;
  const canPo = hasModule('po');
  /* orders with a problem open by default; the rest stay folded until clicked */
  React.useEffect(() => { if (d && !Object.keys(open).length) setOpen(Object.fromEntries(d.byOrder.map((o) => [o.orderId, o.status !== 'Available' && o.status !== 'No BOM']))); }, [d]);   // eslint-disable-line react-hooks/exhaustive-deps
  const items = (d?.items ?? []).filter((m) => (!q || `${m.name} ${m.code} ${m.supplierName}`.toLowerCase().includes(q.toLowerCase())) && (filter === 'All' || (filter === 'Healthy' ? m.stockState === 'Healthy' : filter === 'Below Reorder' ? m.stockState === 'Below Reorder' : m.stockState !== 'Healthy' && m.stockState !== 'Below Reorder')));

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Accessories" sub="Buttons, labels, tags, thread, lace — stock vs what every open order needs. Shortfalls become POs; any accessory process (tag printing) goes through Job Work." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={AccIcon} label="Accessory SKUs" value={d?.kpi.skus ?? '—'} tone="brand" />
        <KpiTile icon={Alert} label="Short for Orders" value={d?.kpi.short ?? '—'} tone={d?.kpi.short ? 'bad' : 'teal'} foot="below reorder / short / out" />
        {hasFlag('rates.view') ? <KpiTile icon={Payments} label="Accessory Stock Value" value={fmtInr(d?.kpi.value)} tone="info" />
          : <KpiTile icon={OrdersIcon} label="Open Orders Checked" value={d?.byOrder.length ?? '—'} tone="info" />}
        <KpiTile icon={PoIcon} label="Orders Not Ordered" value={d?.kpi.ordersShort ?? '—'} tone={d?.kpi.ordersShort ? 'gold' : 'teal'} foot="shortfall with no PO yet" />
      </div>

      {/* requirement by order — one panel per open order, lines with coverage bars */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0"><div><CardTitle>Requirement by Order</CardTitle><p className="text-xs text-muted-foreground">From each style's BOM × order quantity · coverage = available ÷ required · orders with a shortfall open by default</p></div><Badge tone="plain">{d?.byOrder.length ?? 0} open orders</Badge></CardHeader>
        <CardContent className="p-0">
          {ov.isLoading ? <div className="space-y-2 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
          : !d?.byOrder.length ? <EmptyState title="No open orders" />
          : <div className="divide-y">{d.byOrder.map((o) => {
            const isOpen = !!open[o.orderId];
            const req = o.lines.reduce((a, l) => a + l.required, 0), avail = o.lines.reduce((a, l) => a + Math.min(l.available, l.required), 0);
            const pct = req ? Math.round(avail * 100 / req) : 0;
            return (
              <div key={o.orderId}>
                <div className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-secondary/50" onClick={() => setOpen({ ...open, [o.orderId]: !isOpen })}>
                  <span className="text-muted-foreground">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
                  <div className="min-w-[220px]"><OrderLink id={o.orderId} className="font-mono text-[13px] font-bold text-brand hover:underline" onClick={(e) => e.stopPropagation()}>{o.orderNo}</OrderLink><div className="text-[11px] text-muted-foreground">{o.styleNo} · {o.buyerName} · {fmtN(o.qty)} pcs · ship {fmtDate(o.shipDate)}</div></div>
                  <div className="min-w-0 flex-1 text-[12px] text-muted-foreground" title={o.spec}><span className="text-[10px] font-bold uppercase tracking-wide">Spec </span>{o.spec || '—'}</div>
                  {o.lines.length > 0 && <div className="w-40"><div className="mb-1 text-[10.5px] text-muted-foreground">{o.lines.length} lines · coverage</div><Bar pct={pct} tone={pct >= 100 ? 'ok' : pct >= 60 ? 'warn' : 'bad'} /></div>}
                  <Badge tone={ORDER_TONE[o.status] || 'warn'}>{o.status}</Badge>
                  {canPo && o.status === 'Not Ordered' && <Button size="sm" disabled={raise.isPending} onClick={(e) => { e.stopPropagation(); raise.mutate({ url: '/po/from-plan', body: { orderId: o.orderId } }); }}><PoIcon size={14} /> Raise POs</Button>}
                </div>
                {isOpen && (!o.lines.length ? <div className="border-t bg-secondary/40 px-12 py-3 text-xs text-muted-foreground">No accessory lines in this style's BOM — define them in Material Planning.</div>
                : <div className="border-t bg-secondary/40 px-4 py-2 sm:px-12">
                  <table className="w-full text-[12px]">
                    <thead><tr className="text-[10px] uppercase tracking-wide text-muted-foreground"><th className="py-1.5 text-left">Accessory</th><th className="px-2 text-right">Required</th><th className="px-2 text-right">Available</th><th className="w-40 px-2 text-left">Coverage</th><th className="px-2 text-right">Shortage</th><th className="px-2 text-right">On order</th><th className="px-2 text-left">Status</th>{canPo && <th />}</tr></thead>
                    <tbody>{o.lines.map((l) => { const cov = l.required ? Math.min(Math.round(l.available * 100 / l.required), 100) : 100; return (
                      <tr key={l.code} className="border-t">
                        <td className="py-1.5"><b>{l.name}</b> <span className="font-mono text-muted-foreground">{l.code}</span></td>
                        <td className="num px-2 text-right">{fmtN(l.required)} <span className="text-[10px] text-muted-foreground">{l.uom}</span></td>
                        <td className="num px-2 text-right">{fmtN(l.available)}</td>
                        <td className="px-2"><Bar pct={cov} tone={cov >= 100 ? 'ok' : cov >= 60 ? 'warn' : 'bad'} /></td>
                        <td className={cn('num px-2 text-right font-semibold', l.shortage > 0 && 'text-bad')}>{l.shortage ? fmtN(l.shortage) : '—'}</td>
                        <td className="num px-2 text-right">{l.onOrder ? <span className="text-info">{fmtN(l.onOrder)}</span> : '—'}</td>
                        <td className="px-2"><StatusPill value={l.status} /></td>
                        {canPo && <td className="text-right">{l.toOrder > 0 && <Button size="sm" variant="secondary" className="h-7 text-[11px]" onClick={() => setPo({ materialId: l.materialId, qty: l.toOrder, orderId: o.orderId })}><PoIcon size={13} /> PO {fmtN(l.toOrder)}</Button>}</td>}
                      </tr>); })}</tbody>
                  </table>
                </div>)}
              </div>);
          })}</div>}
        </CardContent>
      </Card>

      {/* stock — full width, searchable, filter chips */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div><CardTitle>Accessory Stock</CardTitle><p className="text-xs text-muted-foreground">Free = physical − reserved · reorder when free stock drops below the reorder level</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input className="h-8 w-56 pl-8" placeholder="Search accessory, code, supplier…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="flex rounded-lg border bg-secondary p-0.5 text-[11.5px] font-semibold">{STOCK_FILTERS.map((k) => <button key={k} type="button" onClick={() => setFilter(k)} className={cn('rounded-md px-2.5 py-1', filter === k ? 'bg-card shadow-card' : 'text-muted-foreground')}>{k}</button>)}</div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {ov.isLoading ? <div className="space-y-2 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
          : !items.length ? <EmptyState title="No accessories match" text="Change the filter or add accessories under Stock & Inventory." />
          : <Table>
            <THead><Tr className="hover:bg-transparent"><Th>Accessory</Th><Th>Supplier</Th><Th className="text-right">Free</Th><Th className="text-right">Reserved</Th><Th className="text-right">On Order</Th><Th className="text-right">Reorder level</Th><Th className="w-36">Level</Th><Th>Status</Th>{canPo && <Th className="text-right">Action</Th>}</Tr></THead>
            <TBody>{items.map((m) => { const lvl = m.reorderLevel ? Math.min(Math.round(m.freeQty * 100 / (m.reorderLevel * 2)), 100) : 100; return (
              <Tr key={m.id}>
                <Td><div className="font-semibold">{m.name}</div><div className="font-mono text-[11px] text-muted-foreground">{m.code}</div></Td>
                <Td className="text-xs text-muted-foreground">{m.supplierName || '—'}</Td>
                <Td className={cn('num text-right font-semibold', m.freeQty < 0 && 'text-bad')}>{fmtN(m.freeQty)} <span className="text-[10px] font-normal text-muted-foreground">{m.uom}</span></Td>
                <Td className="num text-right">{m.reservedQty ? fmtN(m.reservedQty) : '—'}</Td>
                <Td className="num text-right">{m.onOrder ? <span className="text-info">{fmtN(m.onOrder)}</span> : '—'}</Td>
                <Td className="num text-right text-muted-foreground">{m.reorderLevel ? fmtN(m.reorderLevel) : '—'}</Td>
                <Td><Bar pct={lvl} tone={m.stockState === 'Healthy' ? 'ok' : m.stockState === 'Below Reorder' ? 'warn' : 'bad'} /></Td>
                <Td><StatusPill value={m.stockState} /></Td>
                {canPo && <Td className="text-right"><Button size="sm" variant={m.stockState === 'Healthy' ? 'secondary' : 'default'} className="h-8" onClick={() => setPo({ materialId: m.id, qty: Math.max(m.reorderLevel * 2 - m.freeQty - m.onOrder, 0) })}><PoIcon size={14} /> {m.stockState === 'Healthy' ? 'PO' : 'Reorder'}</Button></Td>}
              </Tr>); })}</TBody>
          </Table>}
        </CardContent>
      </Card>
      <NewPoDialog open={!!po} prefill={po ?? undefined} onClose={() => setPo(null)} />
    </div>
  );
}
