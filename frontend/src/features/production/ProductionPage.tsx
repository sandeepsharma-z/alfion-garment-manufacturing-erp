import * as React from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
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
import { AlertStrip } from '@/components/AlertStrip';
import { PageHeader, Field, StatusPill, Bar, EmptyState, OrderLink, useOrderContext, OrderFacts, opBalance } from '@/components/shared';
import { Production as ProdIcon, Jobwork, Alert, Check, Plus, Edit, Note, Clock } from '@/icons/icons';
import { Ring } from '@/features/tna/StagePipeline';
import { CuttingPanel, WipPanel, LoadingPlanPanel, HourlyGrid, OpLogsPanel, FloorFilterBar, useFloorFilter } from './FloorTools';

export type Op = { id: string; orderId: string; orderNo: string; styleNo: string; op: string; exec: string; vendorId?: string; vendorAlias: string; vendorLabel: string; line: string;
  plannedQty: number; doneQty: number; rejectedQty: number; pendingQty: number; pct: number; state: string; location: string; whereLabel: string; blocked: boolean; blockedReason: string };
type Card_ = Op & { buyerName: string; description: string; priority: string; shipDate?: string; orderQty: number; photo?: string | null };
type Line = { line: string; orderNo: string; op: string; workers: number; output: number; rejected: number; supervisor: string; target: number; efficiency: number; status: string };
type Board = { kpi: { todayOutput: number; todayRejected: number; dhu: number; manpower: number; linesIdle: string[]; outsourcedOps: number; pendingAtVendors: number; blocked: number };
  ops: string[]; cards: Card_[]; lines: Line[]; lineTarget: number; lineNames: string[]; week: { date: string; output: number; rejected: number }[]; todayByOp: { op: string; output: number }[] };
type LogRow = { id: string; date: string; orderId: string; orderNo: string; op: string; colour?: string; exec: string; where: string; workers: number; output: number; rejected: number; supervisor: string; source: string; grnNo: string };
type OrderLite = { id: string; orderNo: string; styleNo: string; buyerName: string };
type Vendor = { id: string; displayName: string; category: string };

const OP_TONE: Record<string, string> = { Cutting: 'bg-info-soft text-info dark:bg-info/15', Stitching: 'bg-brand-soft text-brand dark:bg-accent', Finishing: 'bg-gold-soft text-gold dark:bg-gold-vivid/15 dark:text-gold-vivid', Packing: 'bg-teal-soft text-teal dark:bg-teal/15' };
const OP_BAR: Record<string, string> = { Cutting: 'bg-info-vivid', Stitching: 'bg-brand', Finishing: 'bg-gold-vivid', Packing: 'bg-teal-vivid' };
const RING_TONE = (state: string): 'brand' | 'bad' | 'warn' | 'ok' => (state === 'Completed' ? 'ok' : state === 'Blocked' ? 'bad' : state === 'Partially Received' ? 'warn' : 'brand');
const ago = (d: string) => { const m = Math.max(Math.round((Date.now() - new Date(d).getTime()) / 60000), 0); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : fmtDate(d); };
export const STATE_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'info' | 'brand' | 'mute'> = { Pending: 'mute', 'In Process': 'brand', 'Partially Received': 'warn', Completed: 'ok', Blocked: 'bad' };

export default function ProductionPage() {
  const { hasModule } = useAuth();
  const [logFor, setLogFor] = React.useState<{ orderId?: string; op?: string } | null>(null);
  const [planOp, setPlanOp] = React.useState<Op | null>(null);
  const TABS = ['board', 'cutting', 'stitching', 'finishing', 'packing', 'loading'] as const;
  type Tab = typeof TABS[number];
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const [filter, setFilter] = useFloorFilter();
  const urlTab = (sp.get('tab') === 'wip' ? 'stitching' : sp.get('tab')) as Tab | null;
  const tab: Tab = urlTab && TABS.includes(urlTab) ? urlTab : 'board';
  const setTab = (t: Tab) => { const next = new URLSearchParams(sp); if (t === 'board') next.delete('tab'); else next.set('tab', t); setSp(next, { replace: true }); };
  /* a stage cell on the board opens that stage's tab already filtered to the order */
  /* packing is not logged on the floor — the Packing & Cartons page owns it */
  const openStage = (op: string, orderId: string) => nav(op === 'Packing' ? `/packing?order=${orderId}` : `/production?tab=${op.toLowerCase()}&order=${orderId}&period=all`);
  const board = useQuery<Board>({ queryKey: ['/production', 'board'], queryFn: async () => (await api.get('/production/board')).data, refetchInterval: 30_000 });
  const logs = useList<LogRow>('/production/logs', { size: 40 });
  const b = board.data;
  const k = b?.kpi;
  const [q, setQ] = React.useState('');
  /* group operation cards by order for the matrix */
  const orders = React.useMemo(() => {
    const m = new Map<string, { orderId: string; orderNo: string; styleNo: string; description: string; buyerName: string; priority: string; shipDate?: string; orderQty: number; photo?: string | null; cards: Card_[] }>();
    (b?.cards ?? []).forEach((c) => { const o = m.get(c.orderId) ?? { orderId: c.orderId, orderNo: c.orderNo, styleNo: c.styleNo, description: c.description, buyerName: c.buyerName, priority: c.priority, shipDate: c.shipDate, orderQty: c.orderQty, photo: c.photo, cards: [] }; o.cards.push(c); m.set(c.orderId, o); });
    return [...m.values()].filter((o) => !q || `${o.orderNo} ${o.styleNo} ${o.description} ${o.buyerName}`.toLowerCase().includes(q.toLowerCase())).sort((a, z) => (a.shipDate || '9').localeCompare(z.shipDate || '9'));
  }, [b, q]);

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Production Floor" sub="Every stage runs in-house on a line or outsourced to a vendor. Planned / completed / pending per operation, daily logs, and where the goods are right now.">
        <div className="flex flex-wrap rounded-lg border bg-secondary p-0.5 text-xs font-semibold">{([['board', 'Floor board'], ['cutting', 'Cutting'], ['stitching', 'Stitching'], ['finishing', 'Finishing'], ['packing', 'Packing'], ['loading', 'Loading plan']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => (k === 'packing' ? nav('/packing') : setTab(k))} className={cn('rounded-md px-3 py-1.5', tab === k ? 'bg-card shadow-card' : 'text-muted-foreground')} title={k === 'packing' ? 'Packing is handled on the Packing & Cartons page' : undefined}>{l}</button>)}</div>
        <Button variant="secondary" onClick={() => setLogFor({})}><Note size={17} /> Daily Report</Button>
        <Button onClick={() => setLogFor({})}><Plus size={17} /> Log Production</Button>
      </PageHeader>
      {/* floor pulse — one glance: what came off the lines today, the week's rhythm, who is running, what is stuck */}
      <Card className="overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[1.35fr_1fr_1fr]">
          <div className="relative overflow-hidden bg-gradient-to-br from-brand to-violet p-5 text-white">
            <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-teal-vivid/30 blur-3xl" />
            <div className="relative">
              <div className="flex items-center justify-between text-[10.5px] font-bold uppercase tracking-wider text-white/80"><span>Today on the floor</span><span className="flex items-center gap-1.5"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-vivid opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-teal-vivid" /></span>live · 30 s</span></div>
              <div className="mt-2 flex items-end gap-3"><span className="num font-slab text-[44px] font-bold leading-none">{fmtN(k?.todayOutput)}</span><span className="mb-1.5 text-[13px] text-white/85">pcs off the lines</span></div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-white/90">
                <span><b className="num">{fmtN(k?.manpower)}</b> workers</span>
                <span><b className="num">{(b?.lines ?? []).filter((l) => l.status !== 'Idle').length}</b> of {b?.lineNames.length ?? 0} lines running</span>
                <span>DHU <b className="num">{k ? `${k.dhu}%` : '—'}</b></span>
                <span><b className="num">{fmtN(k?.pendingAtVendors)}</b> pcs at vendors</span>
                {k?.blocked ? <span className="rounded-md bg-white/20 px-1.5 font-semibold">{k.blocked} blocked</span> : null}
              </div>
              {/* 7-day rhythm */}
              <div className="mt-4 flex h-16 items-end gap-1.5">{(b?.week ?? []).map((d, i, arr) => { const max = Math.max(...arr.map((x) => x.output), 1); const h = Math.max(Math.round(d.output * 100 / max), d.output ? 8 : 3); const isToday = i === arr.length - 1; return <div key={d.date} className="group flex flex-1 flex-col items-center gap-1" title={`${fmtDate(d.date)} · ${fmtN(d.output)} pcs${d.rejected ? ` · ${d.rejected} rejected` : ''}`}><div className="flex w-full items-end" style={{ height: 44 }}><div className={cn('w-full rounded-t-md transition-all', isToday ? 'bg-teal-vivid' : 'bg-white/40 group-hover:bg-white/70')} style={{ height: `${h}%` }} /></div><span className={cn('text-[9.5px] font-semibold uppercase', isToday ? 'text-white' : 'text-white/60')}>{new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2)}</span></div>; })}</div>
            </div>
          </div>
          <div className="border-t p-4 lg:border-l lg:border-t-0">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Today by stage</div>
            <ul className="mt-2 space-y-2">{(b?.todayByOp ?? []).map((x) => { const max = Math.max(...(b?.todayByOp ?? []).map((y) => y.output), 1); return <li key={x.op}><div className="flex items-center justify-between text-[12px]"><span className="flex items-center gap-1.5 font-semibold"><span className={cn('grid h-5 w-5 place-items-center rounded-md', OP_TONE[x.op])}><ProdIcon size={11} /></span>{x.op}</span><span className="num font-bold">{fmtN(x.output)}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary"><div className={cn('h-full rounded-full', OP_BAR[x.op])} style={{ width: `${Math.round(x.output * 100 / max)}%` }} /></div></li>; })}</ul>
            <div className="mt-3 text-[11px] text-muted-foreground">{fmtN(k?.todayRejected)} rejected today · {k?.outsourcedOps ?? 0} operation{k?.outsourcedOps === 1 ? '' : 's'} at vendors</div>
          </div>
          <div className="border-t p-4 lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground"><span>Lines right now</span><span className="font-normal normal-case">target {fmtN(b?.lineTarget)} / line</span></div>
            <ul className="mt-2 grid grid-cols-2 gap-1.5">{(b?.lines ?? []).map((l) => <li key={l.line} className={cn('flex items-center gap-2 rounded-lg border px-2 py-1.5', l.status === 'Idle' ? 'opacity-50' : l.status === 'On Target' ? 'border-teal/40 bg-teal-soft/50' : 'border-brand/30 bg-brand-soft/40')} title={l.orderNo ? `${l.orderNo} · ${l.op} · ${fmtN(l.output)} pcs · ${l.supervisor}` : 'idle today'}><span className={cn('h-2 w-2 shrink-0 rounded-full', l.status === 'Idle' ? 'bg-muted-foreground/40' : l.status === 'On Target' ? 'bg-teal-vivid' : 'animate-pulse bg-brand')} /><span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold">{l.line}</span><span className="num text-[11px] text-muted-foreground">{l.output ? fmtN(l.output) : '—'}</span></li>)}</ul>
          </div>
        </div>
      </Card>

      <AlertStrip module="production" />
      {tab !== 'board' && <FloorFilterBar filter={filter} onChange={setFilter} hint={tab === 'stitching' ? 'WIP is cumulative as on date · the log below follows the period' : tab === 'loading' ? 'plan shows the 7 days from the period start' : 'reports in the chosen period'} />}
      {tab === 'cutting' && <><CuttingPanel lines={b?.lineNames ?? []} filter={filter} /><OpLogsPanel op="Cutting" filter={filter} onLog={() => setLogFor({ orderId: filter.orderId || undefined, op: 'Cutting' })} /></>}
      {tab === 'stitching' && <><WipPanel filter={filter} /><OpLogsPanel op="Stitching" filter={filter} onLog={() => setLogFor({ orderId: filter.orderId || undefined, op: 'Stitching' })} /></>}
      {tab === 'finishing' && <OpLogsPanel op="Finishing" filter={filter} onLog={() => setLogFor({ orderId: filter.orderId || undefined, op: 'Finishing' })} />}
      {tab === 'packing' && <OpLogsPanel op="Packing" filter={filter} onLog={() => nav(`/packing${filter.orderId ? `?order=${filter.orderId}` : ''}`)} />}
      {tab === 'loading' && <LoadingPlanPanel lines={b?.lineNames ?? []} filter={filter} />}
      {tab === 'board' && <>
      {/* order × stage board — one row per open order: sample photo + facts, a ring per operation, overall journey */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div><CardTitle>Orders on the floor</CardTitle><p className="text-xs text-muted-foreground">Each ring = one operation (done / planned) · click it to open that stage's report for the order · <b>Plan</b> = line / vendor / block · <b>Log</b> = post today's output.</p></div>
          <div className="flex items-center gap-2"><Input className="h-8 w-52" placeholder="Search order, style, buyer…" value={q} onChange={(e) => setQ(e.target.value)} /><Badge tone="plain">{orders.length} open</Badge></div>
        </CardHeader>
        <CardContent className="p-0">
          {board.isLoading ? <div className="space-y-2 p-5"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
          : !orders.length ? <EmptyState title="No open orders on the floor" text="Convert an approved sample to an order — it appears here with its four operations." />
          : <div className="divide-y">{orders.map((o) => {
              const cells = (b?.ops ?? []).map((op) => o.cards.find((c) => c.op === op));
              const planned = o.cards.reduce((a, c) => a + c.plannedQty, 0), done = o.cards.reduce((a, c) => a + Math.min(c.doneQty, c.plannedQty), 0);
              const pct = planned ? Math.round(done * 100 / planned) : 0;
              const days = o.shipDate ? Math.ceil((new Date(o.shipDate).getTime() - Date.now()) / 864e5) : null;
              const now = o.cards.find((c) => c.state !== 'Completed' && c.doneQty > 0) || o.cards.find((c) => c.state !== 'Completed');
              return (
                <div key={o.orderId} className="grid gap-4 px-4 py-4 xl:grid-cols-[210px_1fr_140px]">
                  {/* order (hover the number for the sample photo) */}
                  <div className="flex gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5"><OrderLink id={o.orderId} className="font-mono text-[13.5px] font-bold text-brand hover:underline">{o.orderNo}</OrderLink>{o.priority !== 'Normal' && <Badge tone={o.priority === 'Urgent' ? 'bad' : 'warn'} className="text-[9px]">{o.priority}</Badge>}</div>
                      <div className="truncate text-[12.5px] font-semibold" title={o.description}>{o.description}</div>
                      <div className="text-[11px] text-muted-foreground">{o.styleNo} · {o.buyerName} · {fmtN(o.orderQty)} pcs</div>
                      {now && <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-brand px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-white"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />{now.state === 'Blocked' ? 'blocked' : 'now'} · {now.op}</div>}
                      {o.shipDate && <div className={cn('mt-1 text-[11px] font-semibold', days != null && days < 7 ? 'text-bad' : days != null && days < 21 ? 'text-gold' : 'text-muted-foreground')}>Ship {fmtDate(o.shipDate)}{days != null ? ` · ${days < 0 ? `${-days} d late` : `${days} d left`}` : ''}</div>}
                    </div>
                  </div>
                  {/* operations */}
                  <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">{cells.map((c, i) => c ? (
                    <div key={c.id} className={cn('relative flex min-w-0 cursor-pointer gap-2 rounded-xl border p-2.5 transition-all hover:-translate-y-px hover:shadow-card', c.state === 'Completed' && 'border-teal/40 bg-teal-soft/40 dark:bg-teal/10', c.state === 'Blocked' && 'border-bad/40 bg-bad-soft/50 dark:bg-bad/10', c.state === 'In Process' && 'border-brand/40')} title={`Open ${c.op} for ${o.orderNo}`} onClick={() => openStage(c.op, o.orderId)}>
                      {i > 0 && <span className={cn('absolute -left-2.5 top-1/2 hidden h-0.5 w-2.5 lg:block', cells[i - 1]?.state === 'Completed' ? 'bg-teal-vivid' : 'bg-border')} />}
                      <Ring pct={c.pct} tone={RING_TONE(c.state)} size={46} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1"><span className={cn('rounded-md px-1.5 py-px text-[10px] font-bold', OP_TONE[c.op])}>{c.op}</span>{c.state === 'Completed' ? <Check size={14} className="shrink-0 text-teal" /> : <Badge tone={STATE_TONE[c.state] || 'mute'} className="shrink-0 text-[9px]">{c.state}</Badge>}</div>
                        <div className="num mt-1 text-[13px] font-bold leading-none">{fmtN(c.doneQty)}<span className="text-[10.5px] font-normal text-muted-foreground"> / {fmtN(c.plannedQty)}</span></div>
                        <div className="mt-1 truncate text-[10.5px] text-muted-foreground" title={c.location}>{c.exec === 'Outsourced' ? '↗ ' : ''}{c.whereLabel}</div>
                        {c.blocked && <div className="mt-0.5 truncate text-[10px] font-semibold text-bad" title={c.blockedReason}>{c.blockedReason}</div>}
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <button type="button" className="rounded-md border px-1.5 py-0.5 text-[10px] font-semibold hover:border-brand hover:text-brand" title="Plan: line, vendor, block" onClick={(e) => { e.stopPropagation(); setPlanOp(c); }}>Plan</button>
                          {c.op === 'Packing'
                            ? <Link to={`/packing?order=${c.orderId}`} className="rounded-md bg-teal-vivid px-2 py-0.5 text-[10px] font-bold text-white hover:opacity-90" onClick={(e) => e.stopPropagation()} title="Cartons, packing material and the buyer's packing list live on the Packing page">Packing page</Link>
                            : c.exec === 'In-house' && c.state !== 'Completed' && <button type="button" className="rounded-md bg-brand px-2 py-0.5 text-[10px] font-bold text-white hover:bg-brand/90 disabled:opacity-40" disabled={c.blocked} onClick={(e) => { e.stopPropagation(); setLogFor({ orderId: c.orderId, op: c.op }); }}>Log</button>}
                          {c.exec === 'Outsourced' && c.state !== 'Completed' && hasModule('jobwork') && <Link to="/job-work" className="rounded-md border px-1.5 py-0.5 text-[10px] font-bold hover:border-brand" onClick={(e) => e.stopPropagation()}>Challans</Link>}
                        </div>
                      </div>
                    </div>) : <div key={i} className="rounded-xl border border-dashed p-3 text-center text-[11px] text-muted-foreground">—</div>)}</div>
                  {/* overall */}
                  <div className="flex items-center gap-3 xl:justify-end">
                    <Ring pct={pct} tone={pct >= 100 ? 'ok' : 'brand'} size={58} />
                    <div className="text-[11px] leading-snug"><div className="font-bold">{pct >= 100 ? 'Ready to pack' : 'Overall'}</div><div className="text-muted-foreground">{fmtN(done)} of {fmtN(planned)}<br />ops-pcs</div></div>
                  </div>
                </div>);
            })}</div>}
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-5">
        {/* line tiles */}
        <Card className="xl:col-span-3">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0"><div><CardTitle>Lines today</CardTitle><p className="text-xs text-muted-foreground">Efficiency = output ÷ daily target ({fmtN(b?.lineTarget)} pcs · Settings)</p></div><div className="flex gap-1.5 text-[10.5px] text-muted-foreground"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-teal-vivid" />on target</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand" />running</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground/40" />idle</span></div></CardHeader>
          <CardContent className="grid gap-2.5 p-4 pt-0 sm:grid-cols-2 lg:grid-cols-3">
            {(b?.lines ?? []).map((l) => (
              <div key={l.line} className={cn('flex items-center gap-3 rounded-xl border p-3 transition-colors', l.status === 'Idle' ? 'opacity-55' : l.status === 'On Target' ? 'border-teal/40 bg-teal-soft/40 dark:bg-teal/10' : 'border-brand/30 bg-brand-soft/30 dark:bg-accent/40')}>
                <Ring pct={Math.min(l.efficiency, 100)} tone={l.status === 'Idle' ? 'brand' : l.efficiency >= 100 ? 'ok' : l.efficiency >= 70 ? 'brand' : 'warn'} size={54} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1"><span className="truncate text-[13px] font-bold">{l.line}</span><Badge tone={l.status === 'Idle' ? 'mute' : l.status === 'On Target' ? 'ok' : 'brand'} className="text-[9px]">{l.status}</Badge></div>
                  {l.orderNo ? <div className="text-[11.5px]"><OrderLink id={(b?.cards ?? []).find((c) => c.orderNo === l.orderNo)?.orderId || ''} className="font-mono text-[11.5px] font-semibold text-brand hover:underline">{l.orderNo}</OrderLink> · {l.op}</div> : <div className="text-[11.5px] text-muted-foreground">nothing logged today</div>}
                  <div className="num text-[12px]"><b>{l.output ? fmtN(l.output) : '—'}</b> pcs{l.rejected ? <span className="text-bad"> · rej {l.rejected}</span> : null}{l.workers ? <span className="text-muted-foreground"> · {l.workers} workers</span> : null}</div>
                  {l.supervisor && <div className="truncate text-[10.5px] text-muted-foreground">{l.supervisor}</div>}
                </div>
              </div>))}
            {!(b?.lines ?? []).length && <div className="col-span-full text-[12px] text-muted-foreground">No lines defined — add them in Settings → Production.</div>}
          </CardContent>
        </Card>
        {/* live activity */}
        <Card className="xl:col-span-2">
          <CardHeader><div><CardTitle>Live activity</CardTitle><p className="text-xs text-muted-foreground">Latest floor logs · job-work returns at the gate appear here too</p></div></CardHeader>
          <CardContent className="max-h-[560px] overflow-y-auto p-0">
            {logs.isLoading ? <div className="space-y-2 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
            : !logs.data?.items.length ? <EmptyState title="No production logged yet" />
            : <ul className="divide-y">{logs.data.items.map((l) => (
              <li key={l.id} className="flex gap-3 px-4 py-2.5">
                <span className={cn('mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-md', OP_TONE[l.op])}><ProdIcon size={12} /></span>
                <div className="min-w-0 flex-1 text-[12px] leading-snug">
                  <div className="flex items-center justify-between gap-2"><span className="truncate"><b className="num">+{fmtN(l.output)}</b> {l.op.toLowerCase()} · <OrderLink id={l.orderId}>{l.orderNo}</OrderLink>{l.colour ? <span className="text-muted-foreground"> · {l.colour}</span> : null}</span><span className="shrink-0 text-[10.5px] text-muted-foreground"><Clock size={10} className="mr-0.5 inline" />{ago(l.date)}</span></div>
                  <div className="truncate text-[11px] text-muted-foreground">{l.exec === 'Outsourced' ? '↗ ' : ''}{l.where || '—'}{l.rejected ? <span className="text-bad"> · {l.rejected} rejected</span> : null}{l.source === 'gate' ? <Badge tone="ok" className="ml-1.5 text-[9px]">Gate · {l.grnNo}</Badge> : <> · {l.supervisor}</>}</div>
                </div>
              </li>))}</ul>}
          </CardContent>
        </Card>
      </div>

      <details className="group rounded-xl border bg-card px-4 py-2.5 text-[12px] shadow-card">
        <summary className="cursor-pointer list-none font-semibold text-muted-foreground group-open:mb-2">How the floor works — four operations per order, in sequence</summary>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{[['Cutting', 'Use the Cutting report tab (AFN/11) — it logs cut pieces size-wise and issues the fabric from stock.'], ['Stitching', 'Log daily per line: pieces loaded + output (+ hourly grid). Stitching WIP tab shows loaded − output.'], ['Finishing', 'Log finishing output per section; rejected pieces here feed the DHU.'], ['Packing', 'Packing runs on the Packing & Cartons page: packed pieces, cartons, packing material and the buyer\u2019s packing list. The floor only shows the numbers.']].map(([op, txt]) => <div key={op} className="flex gap-2"><span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-lg', OP_TONE[op])}><ProdIcon size={12} /></span><div><div className="font-semibold">{op}</div><div className="text-[11.5px] text-muted-foreground">{txt}</div></div></div>)}</div>
        <div className="mt-2 text-[11.5px] text-muted-foreground">Outsourced stages come back through <b>Job Work → Gate Entry</b> and log themselves. Order stage and progress move forward automatically.</div>
      </details>
      </>}
      <LogDialog target={logFor} lines={b?.lineNames ?? []} onClose={() => setLogFor(null)} />
      <PlanOpDialog op={planOp ? (b?.cards ?? []).find((c) => c.id === planOp.id) ?? planOp : null} lines={b?.lineNames ?? []} onClose={() => setPlanOp(null)} />
    </div>
  );
}

/* ---------- log production (C7) ---------- */
export function LogDialog({ target, lines, onClose }: { target: { orderId?: string; op?: string } | null; lines: string[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [f, setF] = React.useState({ orderId: '', op: 'Stitching', where: '', date: new Date().toISOString().slice(0, 10), output: 0, rejected: 0, workers: 0, supervisor: '', colour: '', loaded: 0 });
  const [hourly, setHourly] = React.useState<Record<string, string>>({});
  const orders = useList<OrderLite & { colours?: { code: string; name: string }[] }>('/orders', { size: 200, status: 'Open' }, !!target);
  const colours = ((orders.data?.items ?? []).find((o) => o.id === f.orderId)?.colours ?? []).map((c) => c.name || c.code).filter(Boolean);
  const cf = useCustomFields('production', null, target, 2);
  const ctx = useOrderContext(target ? f.orderId : null).data;
  const bal = opBalance(ctx, f.op, f.colour || undefined);
  const opInfo = ctx?.ops?.[f.op];
  React.useEffect(() => { if (target) setF((x) => ({ ...x, orderId: target.orderId || '', op: target.op || 'Stitching', output: 0, rejected: 0, supervisor: user?.name || '' })); }, [target, user]);
  /* the operation's own line / section is the default place; a colour with a single BOM-defined line stays the user's call */
  React.useEffect(() => { if (opInfo && opInfo.exec === 'In-house' && opInfo.line) setF((x) => ({ ...x, where: x.where || opInfo.line })); }, [opInfo]);
  const post = useMutation({
    mutationFn: async () => (await api.post('/production/logs', { ...f, custom: cf.value, hourly })).data,
    onSuccess: (d: { op: Op }) => { toast.success(`Production logged · ${d.op.orderNo} ${d.op.op} ${d.op.pct}% · order progress updated`); ['/production', '/orders', '/packing', '/tna'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onClose(); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  if (!target) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent meta={cf.meta}>
        <DialogHeader><DialogTitle>Log Production</DialogTitle><DialogDescription>One entry advances the matching operation and the order's progress. Outsourced work is logged automatically by gate returns.</DialogDescription></DialogHeader>
        <DialogBody><div className="grid gap-4 sm:grid-cols-2">
          <Field label="Order" className="sm:col-span-2"><Select value={f.orderId} onValueChange={(v) => setF({ ...f, orderId: v, colour: '', output: 0 })}><SelectTrigger><SelectValue placeholder="Open orders…" /></SelectTrigger>
            <SelectContent>{(orders.data?.items ?? []).map((o) => <SelectItem key={o.id} value={o.id}>{o.orderNo} · {o.styleNo} · {o.buyerName}</SelectItem>)}</SelectContent></Select></Field>
          {ctx && <div className="sm:col-span-2"><OrderFacts ctx={ctx} op={f.op} colour={f.colour || undefined} /></div>}
          <Field label="Stage"><Select value={f.op} onValueChange={(v) => setF({ ...f, op: v })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{['Cutting', 'Stitching', 'Finishing', 'Packing'].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Line / Section"><Select value={f.where || 'none'} onValueChange={(v) => setF({ ...f, where: v === 'none' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">— operation's line —</SelectItem>{lines.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Colour" hint={ctx && f.colour && bal ? `${fmtN(bal.done)} of ${fmtN(bal.planned)} done` : undefined}>{colours.length ? <Select value={f.colour || 'none'} onValueChange={(v) => { const col = v === 'none' ? '' : v; const b = opBalance(ctx, f.op, col || undefined); setF({ ...f, colour: col, output: b ? b.balance : f.output }); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">—</SelectItem>{colours.map((c) => { const b = opBalance(ctx, f.op, c); return <SelectItem key={c} value={c}>{c}{b ? ` · ${fmtN(b.done)} / ${fmtN(b.planned)} done` : ''}</SelectItem>; })}</SelectContent></Select> : <Input value={f.colour} onChange={(e) => setF({ ...f, colour: e.target.value })} placeholder="colourway" />}</Field>
          {f.op === 'Stitching' && <Field label="Loaded on line (pcs)" hint="input to the line — WIP = loaded − output"><Input type="number" value={f.loaded || ''} onChange={(e) => setF({ ...f, loaded: +e.target.value })} /></Field>}
          <Field label="Output Quantity (pcs)" hint={bal ? `balance ${fmtN(bal.balance)}${bal.balance && f.output > bal.balance ? ' — more than the balance' : ''}` : undefined}><Input type="number" value={f.output || ''} placeholder={bal ? String(bal.balance) : ''} onChange={(e) => setF({ ...f, output: +e.target.value })} /></Field>
          <Field label="Rejection / Alter"><Input type="number" min={0} value={f.rejected} onChange={(e) => setF({ ...f, rejected: Math.max(+e.target.value || 0, 0) })} /></Field>
          <Field label="Manpower"><Input type="number" min={0} value={f.workers} onChange={(e) => setF({ ...f, workers: Math.max(+e.target.value || 0, 0) })} /></Field>
          <Field label="Supervisor" className="sm:col-span-2"><Input value={f.supervisor} onChange={(e) => setF({ ...f, supervisor: e.target.value })} /></Field>
          {f.op === 'Stitching' && <div className="sm:col-span-2"><HourlyGrid value={hourly} onChange={(v) => { setHourly(v); const t = Object.values(v).reduce((a, x) => a + (+x || 0), 0); if (t) setF((x) => ({ ...x, output: t })); }} /></div>}
        </div>{cf.node}</DialogBody>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={post.isPending || !f.orderId || !(f.output > 0) || !cf.ok} onClick={() => post.mutate()}><Check size={16} /> Log Production</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- plan an operation: execution type, vendor / line, planned qty, block ---------- */
export function PlanOpDialog({ op, lines, onClose }: { op: Op | null; lines: string[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState({ exec: 'In-house', vendorId: '', line: '', plannedQty: 0, blocked: false, blockedReason: '' });
  const vendors = useList<Vendor>('/vendors', { size: 200, status: 'Active' }, !!op);
  React.useEffect(() => { if (op) setF({ exec: op.exec, vendorId: op.vendorId || '', line: op.line || '', plannedQty: op.plannedQty, blocked: op.blocked, blockedReason: op.blockedReason || '' }); }, [op]);
  const save = useMutation({
    mutationFn: async () => (await api.patch(`/production/ops/${op!.id}`, { ...f, vendorId: f.vendorId || undefined })).data,
    onSuccess: (d: Op) => { toast.success(`${d.orderNo} ${d.op} · ${d.state}`); ['/production', '/orders', '/packing'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onClose(); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  if (!op) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{op.orderNo} · {op.op}</DialogTitle><DialogDescription>Decide the execution type. Outsourced stages advance only through job-work returns at the gate; in-house stages through daily logs.</DialogDescription></DialogHeader>
        <DialogBody><div className="grid gap-4 sm:grid-cols-2">
          <Field label="Execution Type"><Select value={f.exec} onValueChange={(v) => setF({ ...f, exec: v })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="In-house">In-house</SelectItem><SelectItem value="Outsourced">Outsourced</SelectItem></SelectContent></Select></Field>
          {f.exec === 'Outsourced'
            ? <Field label="Vendor"><Select value={f.vendorId} onValueChange={(v) => setF({ ...f, vendorId: v })}><SelectTrigger><SelectValue placeholder="Select vendor…" /></SelectTrigger>
                <SelectContent>{(vendors.data?.items ?? []).map((v) => <SelectItem key={v.id} value={v.id}>{v.displayName}</SelectItem>)}</SelectContent></Select></Field>
            : <Field label="Line / Section"><Select value={f.line || 'none'} onValueChange={(v) => setF({ ...f, line: v === 'none' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">— not assigned —</SelectItem>{lines.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select></Field>}
          <Field label="Planned Quantity"><Input type="number" value={f.plannedQty} onChange={(e) => setF({ ...f, plannedQty: +e.target.value })} /></Field>
          <Field label="Completed so far"><Input readOnly value={`${fmtN(op.doneQty)} pcs`} /></Field>
          <div className="sm:col-span-2 rounded-xl border bg-secondary p-3">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold"><input type="checkbox" checked={f.blocked} onChange={(e) => setF({ ...f, blocked: e.target.checked })} className="h-4 w-4 accent-[#c02b3f]" /> Blocked</label>
            {f.blocked && <Input className="mt-2" value={f.blockedReason} onChange={(e) => setF({ ...f, blockedReason: e.target.value })} placeholder="Reason — waiting fabric, trims, approval…" />}
          </div>
        </div></DialogBody>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={save.isPending || (f.exec === 'Outsourced' && !f.vendorId) || (f.blocked && !f.blockedReason)} onClick={() => save.mutate()}><Check size={16} /> Save Plan</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
