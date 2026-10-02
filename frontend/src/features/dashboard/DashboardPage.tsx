import * as React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { fmtN, fmtInr, fmtDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge, Skeleton } from '@/components/ui/misc';
import { AuthImg, OrderLink, EmptyState } from '@/components/shared';
import { Donut, LineChart } from '@/components/charts';
import { Ring } from '@/features/tna/StagePipeline';
import { flatNav, moduleOf } from '@/app/nav';
import { Samples, Orders, Clock, Gate as GateIcon, Po as PoIcon, Stock as StockIcon, Alert, Jobwork, Production, Plus, ChevronRight, Reports, Tna as TnaIcon, Quality, Ship, Payments, Check } from '@/icons/icons';

type Overview = {
  orders?: { open: number; total: number; closed: number; qtyOpen: number; valueOpen?: number; byStage: { stage: string; n: number }[]; byBuyer: { buyer: string; orders: number; qty: number }[];
    shippingSoon: { id: string; orderNo: string; styleNo: string; description: string; buyerName: string; qty: number; shipDate: string; priority: string; stage: string; daysLeft: number; floorPct: number; now: string; photo?: string | null }[] };
  samples?: { total: number; active: number; approved: number; byStatus: { status: string; n: number }[] };
  production?: { days: { date: string; output: number; rejected: number }[]; todayOutput: number; todayRejected: number; byOp: { op: string; output: number }[]; byOpToday: { op: string; output: number }[]; pendingAtVendors: number; blocked: number; linesRunning: number; dhu: { date: string; dhu: number | null }[] };
  stock?: { total: number; byState: { state: string; n: number }[]; byCategory: { category: string; items: number; value?: number }[]; value?: number };
  po?: { open: number; pendingApproval: number; overdue: number; value?: number };
  jobwork?: { open: number; outside: number; overdue: number; vendors: number };
  tna?: { open: number; red: number; amber: number; green: number; byOwner: { owner: string; open: number; overdue: number }[] };
  quality?: { aql: { result: string; n: number }[]; finals: number };
  trend?: { months: string[]; dispatched: number[]; realised?: number[] };
  shipping?: { invoices: number; inTransit: number };
  payments?: { openInvoices: number; outstanding: number; overdue: number };
};
type WorkItem = { kind: string; id: string; title: string; sub: string; due?: string; priority: string; rag: string; link: string; bucket: string };
type AlertItem = { id: string; message: string; severity: string; module: string; link: string; entityNo?: string; createdAt: string; acknowledgedAt?: string };
type Report = { key: string; title: string; description: string; frequency: string; financial?: boolean; allowed: boolean };

const mon = (k: string) => new Date(`${k}-01`).toLocaleDateString('en-IN', { month: 'short' });
const OP_COL: Record<string, string> = { Cutting: 'bg-info-vivid', Stitching: 'bg-brand', Finishing: 'bg-gold-vivid', Packing: 'bg-teal-vivid' };
const STATE_COL: Record<string, string> = { Healthy: 'bg-teal-vivid', 'Below Reorder': 'bg-gold-vivid', Short: 'bg-bad-vivid', 'Out of Stock': 'bg-bad' };

/* ---------- tiny chart helpers (SVG, no deps) ---------- */
function Spark({ values, className, stroke = '#a05aff' }: { values: number[]; className?: string; stroke?: string }) {
  const W = 120, H = 34, max = Math.max(...values, 1), n = values.length;
  const pts = values.map((v, i) => `${(i * W) / Math.max(n - 1, 1)},${H - 3 - (v / max) * (H - 6)}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn('h-9 w-full', className)} preserveAspectRatio="none">
      <defs><linearGradient id="sparkfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={stroke} stopOpacity=".35" /><stop offset="1" stopColor={stroke} stopOpacity="0" /></linearGradient></defs>
      <path d={`M0,${H} L${pts.join(' L')} L${W},${H} Z`} fill="url(#sparkfill)" />
      <polyline points={pts.join(' ')} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
function DayBars({ days, height = 150 }: { days: { date: string; output: number; rejected: number }[]; height?: number }) {
  const max = Math.max(...days.map((d) => d.output), 1);
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {days.map((d, i) => { const isToday = i === days.length - 1; const h = Math.max(Math.round(d.output * 100 / max), d.output ? 4 : 1.5); return (
        <div key={d.date} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${fmtDate(d.date)} · ${fmtN(d.output)} pcs${d.rejected ? ` · ${d.rejected} rejected` : ''}`}>
          <span className="num text-[9.5px] font-semibold text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">{d.output ? fmtN(d.output) : ''}</span>
          <div className={cn('w-full rounded-t-md transition-all', isToday ? 'bg-gradient-to-t from-brand to-violet' : 'bg-brand/25 group-hover:bg-brand/50')} style={{ height: `${h}%` }} />
          <span className={cn('text-[9px] font-semibold uppercase', isToday ? 'text-brand' : 'text-muted-foreground')}>{new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2)}</span>
        </div>); })}
    </div>
  );
}
function HBars({ items, tone = 'bg-brand', format = fmtN }: { items: { label: string; value: number; sub?: string; col?: string }[]; tone?: string; format?: (n: number) => string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-2">{items.map((it) => (
      <li key={it.label}>
        <div className="flex items-center justify-between text-[12px]"><span className="truncate font-semibold" title={it.label}>{it.label}{it.sub ? <span className="font-normal text-muted-foreground"> · {it.sub}</span> : null}</span><span className="num shrink-0 font-bold">{format(it.value)}</span></div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary"><div className={cn('h-full rounded-full transition-all', it.col || tone)} style={{ width: `${Math.round(it.value * 100 / max)}%` }} /></div>
      </li>))}{!items.length && <li className="text-[12px] text-muted-foreground">No data yet</li>}</ul>
  );
}
function Stat({ icon: Icon, label, value, foot, tone = 'brand', spark, to }: { icon: (p: { size?: number }) => JSX.Element; label: string; value: React.ReactNode; foot?: React.ReactNode; tone?: 'brand' | 'teal' | 'info' | 'gold' | 'bad'; spark?: number[]; to?: string }) {
  const T: Record<string, string> = { brand: 'bg-brand-soft text-brand dark:bg-accent', teal: 'bg-teal-soft text-teal dark:bg-teal/15', info: 'bg-info-soft text-info dark:bg-info/15', gold: 'bg-gold-soft text-gold dark:bg-gold-vivid/15 dark:text-gold-vivid', bad: 'bg-bad-soft text-bad dark:bg-bad/15' };
  const S: Record<string, string> = { brand: '#a05aff', teal: '#1bcfb4', info: '#4bcbeb', gold: '#f5a33c', bad: '#fe9496' };
  const body = (
    <Card className={cn('relative overflow-hidden p-4 transition-all', to && 'hover:-translate-y-0.5 hover:shadow-card')}>
      <div className="flex items-start gap-3">
        <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg', T[tone])}><Icon size={19} /></div>
        <div className="min-w-0 flex-1">
          <div className="num truncate font-slab text-[24px] font-bold leading-none">{value}</div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
          {foot && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{foot}</div>}
        </div>
      </div>
      {spark && spark.some((v) => v > 0) && <div className="mt-2"><Spark values={spark} stroke={S[tone]} /></div>}
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export default function DashboardPage() {
  const { user, hasModule, hasFlag } = useAuth();
  const money = hasFlag('rates.view') || hasFlag('reports.financial');
  const ov = useQuery<Overview>({ queryKey: ['/dashboard', 'overview'], queryFn: async () => (await api.get('/dashboard/overview')).data, refetchInterval: 60_000 });
  const work = useQuery<{ items: WorkItem[]; counts: Record<string, number>; total: number }>({ queryKey: ['/mywork'], queryFn: async () => (await api.get('/mywork')).data, refetchInterval: 60_000 });
  const alerts = useQuery<{ items: AlertItem[]; red: number; amber: number; total: number }>({ queryKey: ['/alerts'], queryFn: async () => (await api.get('/alerts')).data, refetchInterval: 60_000 });
  const reg = useQuery<{ items: Report[] }>({ queryKey: ['/reports', 'register'], queryFn: async () => (await api.get('/reports/register')).data, enabled: hasModule('reports') });
  const d = ov.data;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const w = work.data, al = alerts.data;
  const spark14 = d?.production?.days.map((x) => x.output) ?? [];
  const weekOut = d?.production ? d.production.days.slice(-7).reduce((a, x) => a + x.output, 0) : 0;
  const quick = [
    hasModule('production') && { to: '/production', icon: Production, label: 'Log production' },
    hasModule('gate') && { to: '/gate', icon: GateIcon, label: 'Gate entry' },
    hasModule('samples') && { to: '/samples', icon: Samples, label: 'New sample' },
    hasModule('po') && { to: '/po', icon: PoIcon, label: 'Raise PO' },
    hasModule('quality') && { to: '/quality', icon: Quality, label: 'Inspection' },
    hasModule('dispatch') && { to: '/dispatch', icon: Ship, label: 'Invoice' },
  ].filter(Boolean) as { to: string; icon: (p: { size?: number }) => JSX.Element; label: string }[];

  return (
    <div className="space-y-5 animate-rise">
      {/* hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand via-[#8f4cf0] to-violet p-6 text-white shadow-pop">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-teal-vivid/30 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/75"><span>{today}</span><span className="flex items-center gap-1.5"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-vivid opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-teal-vivid" /></span>live</span></div>
            <h1 className="mt-1 font-slab text-[26px] font-bold leading-tight">{greet}, {user?.name?.split(' ')[0]} 👋</h1>
            <p className="mt-1 max-w-xl text-[13px] text-white/80">{d?.orders ? <>{d.orders.open} live order{d.orders.open === 1 ? '' : 's'} · {fmtN(d.orders.qtyOpen)} pcs on the books{d.production ? <> · {fmtN(d.production.todayOutput)} pcs off the lines today</> : null}{w?.counts.Overdue ? <> · <b>{w.counts.Overdue} of your tasks overdue</b></> : null}</> : 'Your day at a glance — orders, floor, material, money.'}</p>
          </div>
          {quick.length > 0 && <div className="flex flex-wrap gap-2">{quick.map((q) => <Link key={q.to} to={q.to} className="flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-[12px] font-semibold backdrop-blur transition-colors hover:bg-white/20"><q.icon size={14} /> {q.label}</Link>)}</div>}
        </div>
        <div className="relative mt-5 grid gap-3 border-t border-white/15 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['My work', w ? fmtN(w.total) : '—', `${w?.counts.Overdue ?? 0} overdue · ${w?.counts.Today ?? 0} today`, '/my-work'],
            ['Alerts', al ? fmtN(al.total) : '—', `${al?.red ?? 0} red · ${al?.amber ?? 0} amber`, '/alerts'],
            ['Live orders', d?.orders ? fmtN(d.orders.open) : '—', d?.orders ? `${d.orders.byBuyer.length} buyer${d.orders.byBuyer.length === 1 ? '' : 's'} · ${fmtN(d.orders.qtyOpen)} pcs` : 'needs Orders access', '/orders'],
            ['Today\'s output', d?.production ? fmtN(d.production.todayOutput) : '—', d?.production ? `${d.production.linesRunning} line${d.production.linesRunning === 1 ? '' : 's'} running · ${d.production.todayRejected} rejected` : 'needs Production access', '/production'],
          ].map(([k, v, f, to]) => <Link key={k} to={to} className="rounded-xl bg-white/10 px-3.5 py-2.5 transition-colors hover:bg-white/20"><div className="text-[10px] font-bold uppercase tracking-wider text-white/70">{k}</div><div className="num font-slab text-[22px] font-bold leading-tight">{v}</div><div className="text-[11px] text-white/75">{f}</div></Link>)}
        </div>
      </div>

      {/* KPI row with sparklines / rings */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {d?.orders && <Stat icon={Orders} tone="brand" label="Open order book" value={`${fmtN(d.orders.qtyOpen)} pcs`} foot={money && d.orders.valueOpen ? `${fmtInr(d.orders.valueOpen)} FOB · ${d.orders.open} orders` : `${d.orders.open} open · ${d.orders.closed} closed`} to="/orders" />}
        {d?.production && <Stat icon={Production} tone="teal" label="Output · last 7 days" value={fmtN(weekOut)} foot={`${fmtN(d.production.pendingAtVendors)} pcs at vendors${d.production.blocked ? ` · ${d.production.blocked} blocked` : ''}`} spark={spark14} to="/production" />}
        {d?.tna && <Card className="p-4"><div className="flex items-center gap-3"><Ring pct={d.tna.open ? Math.round(d.tna.green * 100 / d.tna.open) : 100} tone={d.tna.red ? 'bad' : d.tna.amber ? 'warn' : 'ok'} size={48} /><div className="min-w-0"><div className="num font-slab text-[24px] font-bold leading-none">{d.tna.red} <span className="text-[13px] font-normal text-muted-foreground">/ {d.tna.amber}</span></div><div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">TNA overdue / due soon</div><div className="mt-0.5 text-[11px] text-muted-foreground">{d.tna.open} open activities · <Link to="/tna" className="text-brand hover:underline">board</Link></div></div></div></Card>}
        {d?.stock && <Card className="p-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gold-soft text-gold dark:bg-gold-vivid/15 dark:text-gold-vivid"><StockIcon size={19} /></div><div className="min-w-0 flex-1"><div className="num font-slab text-[24px] font-bold leading-none">{d.stock.byState.filter((s) => s.state !== 'Healthy').reduce((a, s) => a + s.n, 0)} <span className="text-[13px] font-normal text-muted-foreground">/ {d.stock.total}</span></div><div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Materials need attention</div>{money && d.stock.value != null && <div className="mt-0.5 text-[11px] text-muted-foreground">stock value {fmtInr(d.stock.value)}</div>}</div></div><div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-secondary">{d.stock.byState.filter((s) => s.n).map((s) => <div key={s.state} className={STATE_COL[s.state]} style={{ width: `${s.n * 100 / d.stock!.total}%` }} title={`${s.state}: ${s.n}`} />)}</div></Card>}
        {!d?.orders && hasModule('samples') && d?.samples && <Stat icon={Samples} tone="brand" label="Active samples" value={d.samples.active} foot={`${d.samples.approved} approved`} to="/samples" />}
        {!d?.production && d?.jobwork && <Stat icon={Jobwork} tone="info" label="Material outside" value={fmtN(d.jobwork.outside)} foot={`${d.jobwork.vendors} vendors · ${d.jobwork.overdue} overdue`} to="/job-work" />}
      </div>

      {/* production rhythm + orders by stage */}
      {(d?.production || d?.orders) && <div className="grid gap-5 xl:grid-cols-3">
        {d?.production && <Card className="xl:col-span-2">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0"><div><CardTitle>Production — last 14 days</CardTitle><p className="text-xs text-muted-foreground">Pieces logged per day across all stages · hover a bar</p></div>
            <div className="flex flex-wrap gap-1.5">{d.production.byOpToday.map((x) => <span key={x.op} className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]"><span className={cn('h-2 w-2 rounded-full', OP_COL[x.op])} />{x.op} <b className="num">{fmtN(x.output)}</b></span>)}</div></CardHeader>
          <CardContent className="pt-0"><DayBars days={d.production.days} />
            <div className="mt-3 grid gap-2 sm:grid-cols-4">{d.production.byOp.map((x) => { const max = Math.max(...d.production!.byOp.map((y) => y.output), 1); return <div key={x.op} className="rounded-lg border bg-secondary/60 px-3 py-2"><div className="flex items-center justify-between text-[11px]"><span className="font-semibold">{x.op}</span><span className="num font-bold">{fmtN(x.output)}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-card"><div className={cn('h-full rounded-full', OP_COL[x.op])} style={{ width: `${Math.round(x.output * 100 / max)}%` }} /></div><div className="mt-0.5 text-[10px] text-muted-foreground">14-day total</div></div>; })}</div>
          </CardContent>
        </Card>}
        {d?.orders && <Card>
          <CardHeader><div><CardTitle>Orders by stage</CardTitle><p className="text-xs text-muted-foreground">Where the {d.orders.open} live orders stand</p></div></CardHeader>
          <CardContent className="pt-0"><Donut items={d.orders.byStage.map((s) => ({ label: s.stage, value: s.n }))} centerLabel="LIVE ORDERS" size={170} />
            {d.orders.byBuyer.length > 0 && <div className="mt-4"><div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">By buyer · pcs</div><HBars items={d.orders.byBuyer.slice(0, 5).map((b) => ({ label: b.buyer, value: b.qty, sub: `${b.orders} order${b.orders === 1 ? '' : 's'}` }))} /></div>}
          </CardContent>
        </Card>}
      </div>}

      {/* shipping soon + attention */}
      <div className="grid gap-5 xl:grid-cols-3">
        {d?.orders && <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle>Shipping next</CardTitle><p className="text-xs text-muted-foreground">Nearest ship dates · floor completion across the four operations</p></div><Button size="sm" variant="secondary" asChild><Link to="/tna">TNA board <ChevronRight size={14} /></Link></Button></CardHeader>
          <CardContent className="p-0">
            {!d.orders.shippingSoon.length ? <EmptyState title="No open orders with a ship date" />
            : <div className="divide-y">{d.orders.shippingSoon.map((o) => (
              <div key={o.id} className="flex items-center gap-4 px-5 py-3">
                {o.photo ? <AuthImg fileId={o.photo} alt={o.styleNo} className="h-14 w-11 shrink-0 rounded-lg border" /> : <div className="grid h-14 w-11 shrink-0 place-items-center rounded-lg border border-dashed text-[9px] text-muted-foreground">—</div>}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5"><OrderLink id={o.id} className="font-mono text-[13px] font-bold text-brand hover:underline">{o.orderNo}</OrderLink>{o.priority !== 'Normal' && <Badge tone={o.priority === 'Urgent' ? 'bad' : 'warn'} className="text-[9px]">{o.priority}</Badge>}{o.now && <span className="rounded-md bg-brand px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-white">{o.now === 'Ready' ? 'ready' : `now · ${o.now}`}</span>}</div>
                  <div className="truncate text-[12.5px] font-semibold">{o.description}</div>
                  <div className="text-[11px] text-muted-foreground">{o.styleNo} · {o.buyerName} · {fmtN(o.qty)} pcs</div>
                </div>
                <div className="hidden w-36 sm:block"><div className="mb-1 flex justify-between text-[10.5px] text-muted-foreground"><span>floor</span><span className="num font-semibold text-foreground">{o.floorPct}%</span></div><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className={cn('h-full rounded-full', o.floorPct >= 100 ? 'bg-teal-vivid' : 'bg-brand')} style={{ width: `${Math.min(o.floorPct, 100)}%` }} /></div></div>
                <div className={cn('w-24 text-right text-[12px] font-bold', o.daysLeft < 0 ? 'text-bad' : o.daysLeft < 14 ? 'text-gold' : 'text-teal')}><div className="num text-[18px] leading-none">{Math.abs(o.daysLeft)}<span className="text-[10px] font-semibold"> d</span></div><div className="text-[10px] font-semibold uppercase text-muted-foreground">{o.daysLeft < 0 ? 'late' : 'to ship'} · {fmtDate(o.shipDate)}</div></div>
              </div>))}</div>}
          </CardContent>
        </Card>}
        <Card className={!d?.orders ? 'xl:col-span-3' : ''}>
          <CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle>Needs your attention</CardTitle><p className="text-xs text-muted-foreground">Your queue and the loudest alerts</p></div><Button size="sm" variant="secondary" asChild><Link to="/my-work">My Work</Link></Button></CardHeader>
          <CardContent className="max-h-[420px] overflow-y-auto p-0">
            {work.isLoading ? <div className="space-y-2 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
            : <ul className="divide-y">
              {(w?.items ?? []).slice(0, 6).map((i) => <li key={`${i.kind}-${i.id}`}><Link to={i.link} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-secondary/60"><span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', i.rag === 'red' ? 'bg-bad-vivid' : i.rag === 'amber' ? 'bg-gold-vivid' : 'bg-teal-vivid')} /><div className="min-w-0 flex-1"><div className="truncate text-[12.5px] font-semibold">{i.title}</div><div className="truncate text-[11px] text-muted-foreground">{i.sub}</div></div><span className={cn('shrink-0 text-[10.5px] font-semibold', i.bucket === 'Overdue' ? 'text-bad' : i.bucket === 'Today' ? 'text-gold' : 'text-muted-foreground')}>{i.bucket}</span></Link></li>)}
              {(al?.items ?? []).filter((a) => !a.acknowledgedAt && !(w?.items ?? []).some((i) => i.kind === 'alert' && i.id === a.id)).slice(0, 4).map((a) => <li key={a.id}><Link to={a.link} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-secondary/60"><span className={cn('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md', a.severity === 'red' ? 'bg-bad-soft text-bad' : a.severity === 'amber' ? 'bg-gold-soft text-gold' : 'bg-info-soft text-info')}><Alert size={11} /></span><div className="min-w-0 flex-1"><div className="truncate text-[12.5px] font-semibold">{a.message}</div><div className="text-[11px] text-muted-foreground">{a.module} · alert</div></div></Link></li>)}
              {!(w?.items.length) && !(al?.items.length) && <li className="px-4 py-6 text-center text-[12.5px] text-teal"><Check size={16} className="mx-auto mb-1" />All clear — nothing waiting on you.</li>}
            </ul>}
          </CardContent>
        </Card>
      </div>

      {/* money / shipping trend + stock + material */}
      {(d?.trend || d?.stock || d?.po) && <div className="grid gap-5 xl:grid-cols-3">
        {d?.trend && <Card className="xl:col-span-2">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0"><div><CardTitle>Dispatched{d.trend.realised ? ' vs realised' : ''} — 12 months</CardTitle><p className="text-xs text-muted-foreground">Pieces on board per month{d.trend.realised ? ' · ₹ received (dashed, right axis)' : ''}</p></div><div className="flex gap-3 text-[11.5px]">{d.shipping && <span><b className="num">{d.shipping.invoices}</b> invoices · <b className="num">{d.shipping.inTransit}</b> in transit</span>}{d.payments && <span><b className="num">{fmtInr(d.payments.outstanding)}</b> outstanding · <b className={cn('num', d.payments.overdue && 'text-bad')}>{d.payments.overdue}</b> overdue</span>}</div></CardHeader>
          <CardContent className="pt-0">{d.trend.dispatched.some((v) => v > 0) || (d.trend.realised ?? []).some((v) => v > 0) ? <LineChart labels={d.trend.months.map(mon)} a={d.trend.dispatched} b={d.trend.realised} aLabel="Dispatched (pcs)" bLabel={d.trend.realised ? 'Realised (₹)' : undefined} height={200} /> : <div className="flex h-40 items-center justify-center rounded-xl border border-dashed text-[12.5px] text-muted-foreground">No shipments on board yet — the first invoice with an on-board date draws this chart.</div>}</CardContent>
        </Card>}
        {(d?.stock || d?.po || d?.jobwork) && <Card>
          <CardHeader><div><CardTitle>Material &amp; procurement</CardTitle><p className="text-xs text-muted-foreground">Stock health · open POs · goods at vendors</p></div></CardHeader>
          <CardContent className="space-y-4 pt-0">
            {d?.stock && <Donut items={d.stock.byState.filter((s) => s.n).map((s) => ({ label: s.state, value: s.n }))} centerLabel="MATERIALS" size={140} />}
            <div className="grid grid-cols-2 gap-2">
              {d?.po && <Link to="/po" className="rounded-lg border bg-secondary/60 px-3 py-2 hover:border-brand"><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Open POs</div><div className="num text-[18px] font-bold">{d.po.open}</div><div className="text-[10.5px] text-muted-foreground">{d.po.pendingApproval ? `${d.po.pendingApproval} awaiting approval` : d.po.overdue ? <span className="text-bad">{d.po.overdue} overdue</span> : money && d.po.value ? fmtInr(d.po.value) : 'on schedule'}</div></Link>}
              {d?.jobwork && <Link to="/job-work" className="rounded-lg border bg-secondary/60 px-3 py-2 hover:border-brand"><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">At vendors</div><div className="num text-[18px] font-bold">{fmtN(d.jobwork.outside)}</div><div className="text-[10.5px] text-muted-foreground">{d.jobwork.open} challans · {d.jobwork.vendors} vendors{d.jobwork.overdue ? <span className="text-bad"> · {d.jobwork.overdue} overdue</span> : ''}</div></Link>}
              {d?.stock && d.stock.byCategory.slice(0, 2).map((c) => <Link key={c.category} to="/stock" className="rounded-lg border bg-secondary/60 px-3 py-2 hover:border-brand"><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{c.category}</div><div className="num text-[18px] font-bold">{c.items}</div><div className="text-[10.5px] text-muted-foreground">{money && c.value != null ? fmtInr(c.value) : 'items'}</div></Link>)}
            </div>
          </CardContent>
        </Card>}
      </div>}

      {/* samples · tna owners · quality */}
      {(d?.samples || d?.tna || d?.quality) && <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {d?.samples && <Card><CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle>Sampling funnel</CardTitle><p className="text-xs text-muted-foreground">{d.samples.total} samples · {d.samples.approved} approved</p></div><Button size="sm" variant="secondary" asChild><Link to="/samples"><Samples size={14} /> Open</Link></Button></CardHeader>
          <CardContent className="pt-0"><HBars items={d.samples.byStatus.map((s) => ({ label: s.status, value: s.n, col: s.status === 'Approved' ? 'bg-teal-vivid' : s.status === 'Rejected' ? 'bg-bad-vivid' : s.status === 'Client Review' ? 'bg-gold-vivid' : 'bg-brand' }))} /></CardContent></Card>}
        {d?.tna && <Card><CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle>T&amp;A workload</CardTitle><p className="text-xs text-muted-foreground">Open activities per owner · overdue in red</p></div><Button size="sm" variant="secondary" asChild><Link to="/tna"><TnaIcon size={14} /> Board</Link></Button></CardHeader>
          <CardContent className="pt-0"><HBars items={d.tna.byOwner.map((o) => ({ label: o.owner, value: o.open, sub: o.overdue ? `${o.overdue} overdue` : undefined, col: o.overdue ? 'bg-bad-vivid' : 'bg-brand' }))} /></CardContent></Card>}
        {d?.quality && <Card><CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle>AQL results</CardTitle><p className="text-xs text-muted-foreground">Last {d.quality.aql.reduce((a, r) => a + r.n, 0)} inspections · {d.quality.finals} final</p></div><Button size="sm" variant="secondary" asChild><Link to="/quality"><Quality size={14} /> Quality</Link></Button></CardHeader>
          <CardContent className="pt-0">{d.quality.aql.some((r) => r.n) ? <Donut items={d.quality.aql.filter((r) => r.n).map((r) => ({ label: r.result, value: r.n }))} centerLabel="AQL" size={140} /> : <div className="flex h-36 items-center justify-center rounded-xl border border-dashed text-[12.5px] text-muted-foreground">No AQL inspections yet</div>}
            {d.production && d.production.dhu.some((x) => x.dhu != null) && <div className="mt-3"><div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Inline DHU · 14 days</div><Spark values={d.production.dhu.map((x) => x.dhu ?? 0)} stroke="#fe9496" /></div>}
          </CardContent></Card>}
      </div>}

      {/* reports */}
      {hasModule('reports') && (reg.data?.items.length ?? 0) > 0 && <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle>Reports</CardTitle><p className="text-xs text-muted-foreground">Standard registers — run, then export CSV or print</p></div><Button size="sm" variant="secondary" asChild><Link to="/reports"><Reports size={14} /> Analytics</Link></Button></CardHeader>
        <CardContent className="grid gap-2.5 pt-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {reg.data!.items.map((r) => <Link key={r.key} to={r.allowed ? `/reports?run=${r.key}` : '/reports'} className={cn('group flex items-start gap-3 rounded-xl border p-3 transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-card', !r.allowed && 'opacity-50')}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand dark:bg-accent"><Reports size={16} /></span><div className="min-w-0"><div className="truncate text-[12.5px] font-semibold">{r.title}</div><div className="line-clamp-2 text-[11px] text-muted-foreground">{r.description}</div><div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{r.frequency}{r.financial ? ' · financial' : ''}</div></div></Link>)}
        </CardContent>
      </Card>}

      {/* modules */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-3 flex items-baseline justify-between"><h3 className="font-slab text-[15px] font-bold">Your modules</h3><span className="text-xs text-muted-foreground">{flatNav.filter((i) => i.everyone || hasModule(moduleOf(i))).length} available</span></div>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {flatNav.filter((i) => i.everyone || hasModule(moduleOf(i))).map((m) => (
              <Link key={m.key} to={m.path} className="group flex items-center gap-2.5 rounded-xl border p-2.5 transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-card">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand transition-transform group-hover:scale-105 dark:bg-accent"><m.icon size={16} /></div>
                <div className="truncate text-[12.5px] font-semibold">{m.label}</div>
              </Link>))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
