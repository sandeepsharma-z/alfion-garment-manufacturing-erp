import * as React from 'react';
import { Link, useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useList, fmtN, fmtDate, toInputDate, saveBlob } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton, Table, THead, TBody, Tr, Th, Td, Badge } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader, KpiTile, Field, StatusPill, EmptyState, Bar, OrderLink, AuthImg } from '@/components/shared';
import { Tna as TnaIcon, Alert, Check, Clock, Refresh, Plus, Edit, Calendar, Flag, Download, ChevronDown, ChevronRight, Eye } from '@/icons/icons';
import { StagePipeline, StagesButton, TnaGuideButton, Ring, type StageCell } from './StagePipeline';
import { ShareTracking } from '@/features/portal/ShareTracking';

export type Task = { id: string; orderId: string; orderNo: string; styleNo: string; buyerName: string; seq: number; key: string; activity: string; stage: string; dept: string;
  ownerUid: string; ownerName: string; plannedStart: string; plannedEnd: string; actualStart?: string; actualEnd?: string; status: string; priority: string;
  replanCount: number; replanned: boolean; replans: { at: string; by: string; reason: string; from: { plannedEnd: string; priority: string }; to: { plannedEnd: string; priority: string } }[];
  rag: 'red' | 'amber' | 'green' | 'done'; delayDays: number; remark: string; sourceEvent: string;
  auto?: boolean; doneLabel?: string; templateName?: string };
type BoardOrder = { orderId: string; orderNo: string; styleNo: string; description: string; qty: number; shipDate?: string; priority: string; stage: string; progress: number; hasTna: boolean; liveNow?: string[]; photo?: string | null;
  health: string; total: number; done: number; pct: number; red: number; amber: number; replanned: number; stages: StageCell[] };
type Board = { buyers: { buyer: string; health: string; orders: BoardOrder[] }[]; stages: string[] };
type Summary = { red: number; amber: number; green: number; dueToday: number; mine: number; mineRed: number; ordersWithTna: number; amberDays: number };
type Template = { id: string; name: string; buyerAlias: string; productType: string; isDefault: boolean; status: string; items: { key: string; activity: string; stage: string; dept: string; ownerRole: string; anchor: string; offsetDays: number; durationDays: number; sourceEvent: string }[] };
type UserLite = { id: string; uid: string; name: string; role: string; status: string };

/** The buyer's T&A sheet — style block on the left, planned row + actual row per order, one column per activity. */
export async function downloadTnaExcel(orderId?: string, label?: string) {
  try {
    const r = await api.get('/tna/export', { params: orderId ? { orderId } : {}, responseType: 'blob' });
    saveBlob(r.data, `TNA-${label || (orderId ? 'order' : 'all-orders')}-${new Date().toISOString().slice(0, 10)}.xls`, 'application/vnd.ms-excel');
    toast.success('T&A plan downloaded — opens in Excel');
  } catch (e) { toast.error(apiMessage(e)); }
}

/** Password-protected link for the buyer: their order's whole T&A plan, no ERP login. */
export function SharePlanButton({ orderId, orderNo, size = 'sm', variant = 'secondary' }: { orderId: string; orderNo?: string; size?: 'sm' | 'default'; variant?: 'secondary' | 'default' }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)} title="Generate a link + password and send it to the buyer"><Eye size={14} /> Share plan</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent wide>
          <DialogHeader><DialogTitle>Share the T&amp;A plan {orderNo ? `· ${orderNo}` : ''}</DialogTitle>
            <DialogDescription>Pick how much to show, set a password, then send the link. The buyer opens it in a browser — no account, read-only, and you can revoke it any time.</DialogDescription></DialogHeader>
          <DialogBody><ShareTracking orderId={orderId} detail="full" title="Link, password and access log" /></DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Change the template an order runs on: completed activities stay, the open ones are rebuilt. */
export function TemplateSwitch({ orderId, current }: { orderId: string; current?: string }) {
  const qc = useQueryClient();
  const { hasModule } = useAuth();
  const list = useQuery<{ items: Template[] }>({ queryKey: ['/tna', 'templates'], queryFn: async () => (await api.get('/tna/templates')).data, enabled: hasModule('tna') });
  const [pick, setPick] = React.useState('');
  const apply = useMutation({
    mutationFn: async () => (await api.post(`/tna/orders/${orderId}/apply`, { templateId: pick, force: true })).data,
    onSuccess: (d: { created: number; template: string }) => { toast.success(`Plan rebuilt from “${d.template}” · ${d.created} activities`); qc.invalidateQueries({ queryKey: ['/tna'] }); setPick(''); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  if (!hasModule('tna')) return null;
  const items = (list.data?.items ?? []).filter((t) => t.status === 'Active');
  return (
    <div className="flex items-center gap-1.5" title="Templates are made under TNA → Templates; applying one keeps the activities already done">
      <Select value={pick || 'cur'} onValueChange={setPick}>
        <SelectTrigger className="h-8 w-[210px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="cur">{current ? `Template: ${current}` : 'Pick a template'}</SelectItem>
          {items.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.isDefault ? ' · default' : ''}{t.buyerAlias ? ` · ${t.buyerAlias}` : ''}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="sm" variant="secondary" disabled={!pick || pick === 'cur' || apply.isPending}
        onClick={() => { if (window.confirm('Rebuild this order\u2019s plan from the chosen template? Activities already completed are kept.')) apply.mutate(); }}>
        <Refresh size={13} /> Apply
      </Button>
    </div>
  );
}

export const RAG: Record<string, 'ok' | 'warn' | 'bad' | 'mute' | 'info'> = { green: 'ok', amber: 'warn', red: 'bad', done: 'mute', none: 'mute' };
const RAG_BG: Record<string, string> = { green: 'bg-teal-soft text-teal dark:bg-teal/15', amber: 'bg-gold-soft text-gold dark:bg-gold-vivid/15 dark:text-gold-vivid', red: 'bg-bad-soft text-bad dark:bg-bad/15', done: 'bg-secondary text-muted-foreground', none: 'bg-secondary text-muted-foreground' };
export const ragLabel = (r: string) => ({ green: 'On track', amber: 'Due soon', red: 'Overdue', done: 'Done', none: '—' }[r] || r);
const TABS = ['Buyer Board', 'Tasks', 'Calendar', 'Templates'] as const;

export default function TnaPage() {
  const [sp, setSp] = useSearchParams();
  const { hasModule } = useAuth();
  const [tab, setTab] = React.useState<typeof TABS[number]>(sp.get('order') ? 'Tasks' : sp.get('tab') === 'templates' ? 'Templates' : sp.get('tab') === 'calendar' ? 'Calendar' : 'Buyer Board');
  const sum = useQuery<Summary>({ queryKey: ['/tna', 'summary'], queryFn: async () => (await api.get('/tna/summary')).data });
  const s = sum.data;

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="TNA — Time & Action Plan" sub="Every order's working calendar. Planned vs actual per activity, RAG from the dates, replans kept with their reason. Buyers see the stage board through the portal (Phase 6).">
        <div className="flex flex-wrap items-center gap-2">
          <TnaGuideButton />
          {hasModule('tna') && <Button variant="secondary" size="sm" onClick={() => downloadTnaExcel()}><Download size={15} /> Excel — full plan</Button>}
          {hasModule('tna') && <StagesButton />}
          <div className="flex rounded-lg border bg-secondary p-0.5">{TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={cn('rounded-md px-3 py-1.5 text-xs font-semibold transition-colors', tab === t ? 'bg-card text-brand shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{t}</button>)}</div>
        </div>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={Alert} label="Overdue Tasks" value={s?.red ?? '—'} tone={s?.red ? 'bad' : 'teal'} foot="planned end before today" />
        <KpiTile icon={Clock} label="Due Soon" value={s?.amber ?? '—'} tone="gold" foot={`within ${s?.amberDays ?? 3} days · ${s?.dueToday ?? 0} due today`} />
        <KpiTile icon={Check} label="On Track" value={s?.green ?? '—'} tone="teal" foot={`${s?.ordersWithTna ?? 0} orders planned`} />
        <KpiTile icon={TnaIcon} label="My Tasks" value={s?.mine ?? '—'} tone={s?.mineRed ? 'bad' : 'brand'} foot={s?.mineRed ? `${s.mineRed} overdue — see My Work` : 'assigned to me'} />
      </div>
      {tab === 'Buyer Board' && <BuyerBoard onOpen={(id) => { setSp({ order: id }); setTab('Tasks'); }} />}
      {tab === 'Tasks' && <TasksTab orderId={sp.get('order') || ''} clear={() => setSp({})} />}
      {tab === 'Calendar' && <CalendarTab />}
      {tab === 'Templates' && hasModule('tna') && <TemplatesTab />}
    </div>
  );
}

/* ---------- buyer-wise board (FR-19.5a / C4) ---------- */
function BuyerBoard({ onOpen }: { onOpen: (orderId: string) => void }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  /* live: the board re-reads every 20 s and whenever the window regains focus, so a cutting log or gate entry shows up without a reload */
  const q = useQuery<Board>({ queryKey: ['/tna', 'board'], queryFn: async () => (await api.get('/tna/board')).data, refetchInterval: 20_000, refetchOnWindowFocus: true });
  const apply = useMutation({
    mutationFn: async (orderId: string) => (await api.post(`/tna/orders/${orderId}/apply`, {})).data,
    onSuccess: (d: { created: number }) => { toast.success(`TNA generated · ${d.created} tasks`); qc.invalidateQueries({ queryKey: ['/tna'] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  if (q.isLoading) return <Skeleton className="h-64" />;
  const stages = q.data?.stages ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border bg-card px-4 py-2.5 text-[11.5px] shadow-card">
        <span className="font-slab text-[12px] font-bold">Flow</span>
        {stages.map((st, i) => <span key={st} className="flex items-center gap-1.5">{i > 0 && <span className="text-border">→</span>}<span className="grid h-4.5 w-[18px] place-items-center rounded-full bg-secondary font-mono text-[9.5px] font-bold text-muted-foreground">{i + 1}</span><span className="font-medium">{st}</span></span>)}
        <span className="ml-auto flex items-center gap-3 text-[10.5px] text-muted-foreground"><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-teal" /> done</span><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-brand" /> now</span><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-gold-vivid" /> due soon</span><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-bad" /> overdue</span><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border bg-card" /> upcoming</span></span>
      </div>
      {!q.data?.buyers.length && <Card><EmptyState title="No open orders" /></Card>}
      {q.data?.buyers.map((b) => (
        <Card key={b.buyer}>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2"><CardTitle>{b.buyer}</CardTitle><Badge tone={RAG[b.health] || 'mute'}>{ragLabel(b.health)}</Badge><span className="text-xs text-muted-foreground">{b.orders.length} live order{b.orders.length === 1 ? '' : 's'}</span></div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {b.orders.map((o, n) => (
                <div key={o.orderId} className="grid gap-4 px-4 py-4 xl:grid-cols-[250px_1fr]">
                  {/* order summary */}
                  <div className="flex cursor-pointer flex-col rounded-xl border bg-secondary/50 p-3 transition-colors hover:border-brand" onClick={() => nav(`/tna/order/${o.orderId}`)} title="Live status of this order">
                    <div className="flex items-center gap-2">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-ink font-mono text-[10.5px] font-bold text-white dark:bg-accent">{n + 1}</span>
                      <Link to={`/orders/${o.orderId}`} className="font-mono text-[13.5px] font-bold text-brand hover:underline" onClick={(e) => e.stopPropagation()}>{o.orderNo}</Link>
                      {o.priority !== 'Normal' && <StatusPill value={o.priority} />}
                    </div>
                    <div className="mt-2 flex gap-2.5">
                      {o.photo ? <AuthImg fileId={o.photo} alt={o.styleNo} className="h-[74px] w-[60px] shrink-0 rounded-lg border" /> : <div className="grid h-[74px] w-[60px] shrink-0 place-items-center rounded-lg border border-dashed text-center text-[9.5px] leading-tight text-muted-foreground">no sample photo</div>}
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-[12.5px] font-semibold leading-snug" title={o.description}>{o.description}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{o.styleNo} · {fmtN(o.qty)} pcs</div>
                      </div>
                    </div>
                    {o.liveNow?.length ? <div className="mt-1 flex flex-wrap gap-1">{o.liveNow.map((s) => <span key={s} className="rounded-md bg-brand px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-white">now · {s}</span>)}</div> : null}
                    <div className="mt-0.5 text-[11px] text-muted-foreground">Ship <b className={cn('text-foreground', o.shipDate && new Date(o.shipDate).getTime() < Date.now() && 'text-bad')}>{fmtDate(o.shipDate)}</b></div>
                    {o.hasTna ? <>
                      <div className="mt-3 flex items-center gap-3">
                        <Ring pct={o.pct} tone={o.health === 'red' ? 'bad' : o.health === 'amber' ? 'warn' : o.health === 'done' ? 'ok' : 'brand'} />
                        <div className="text-[11.5px] leading-snug">
                          <div className="font-semibold">{o.done}/{o.total} activities</div>
                          <div className="text-muted-foreground">{o.red ? <span className="font-semibold text-bad">{o.red} overdue</span> : o.amber ? <span className="font-semibold text-gold">{o.amber} due soon</span> : 'on schedule'}{o.replanned ? ` · ↻ ${o.replanned}` : ''}</div>
                        </div>
                      </div>
                      <div className="mt-auto flex items-center justify-between gap-2 pt-3" onClick={(e) => e.stopPropagation()}>
                        <button className="text-[11.5px] font-semibold text-brand hover:underline" onClick={() => nav(`/tna/order/${o.orderId}`)}>Live status →</button>
                        <button className="text-[11.5px] font-semibold text-muted-foreground hover:text-brand hover:underline" onClick={() => onOpen(o.orderId)}>Plan</button>
                        <SharePlanButton orderId={o.orderId} orderNo={o.orderNo} />
                      </div>
                    </> : <div className="mt-3"><Button size="sm" className="h-7 text-[11px]" disabled={apply.isPending} onClick={() => apply.mutate(o.orderId)}><Plus size={12} /> Generate TNA</Button></div>}
                  </div>
                  {/* pipeline */}
                  <div className="min-w-0">{o.hasTna ? <StagePipeline stages={stages} cells={o.stages} onStage={(_, c) => nav(c?.live?.link || `/tna/order/${o.orderId}`)} /> : <div className="flex h-full items-center rounded-xl border border-dashed px-4 py-6 text-[12.5px] text-muted-foreground">No plan yet — generate the TNA to see this order move through {stages.length} stages.</div>}</div>
                </div>))}
            </div>
          </CardContent>
        </Card>))}
    </div>
  );
}

/* ---------- tasks list — grouped by order so one order's plan reads on its own ---------- */
export function TasksTab({ orderId, clear, compact }: { orderId: string; clear?: () => void; compact?: boolean }) {
  const [chip, setChip] = React.useState('Open');
  const [edit, setEdit] = React.useState<Task | null>(null);
  const [only, setOnly] = React.useState('all');
  const [shut, setShut] = React.useState<Record<string, boolean>>({});
  const params: Record<string, unknown> = orderId ? { orderId } : {};
  if (chip === 'Open') params.open = 1; else if (chip === 'Done') params.status = 'Done'; else if (chip !== 'All') params.rag = chip.toLowerCase();
  const q = useList<Task>('/tna/tasks', params);
  const all = q.data?.items ?? [];
  const orderNos = [...new Set(all.map((t) => t.orderNo))].sort();
  const rows = orderId || only === 'all' ? all : all.filter((t) => t.orderNo === only);
  const groups = React.useMemo(() => {
    const m = new Map<string, { orderNo: string; orderId: string; buyerName: string; styleNo: string; tasks: Task[] }>();
    rows.forEach((t) => {
      const g = m.get(t.orderNo) ?? { orderNo: t.orderNo, orderId: t.orderId, buyerName: t.buyerName, styleNo: t.styleNo, tasks: [] };
      g.tasks.push(t); m.set(t.orderNo, g);
    });
    return [...m.values()].sort((a, b) => a.orderNo.localeCompare(b.orderNo));
  }, [rows]);

  const table = (list: Task[]) => (
    <Table>
      <THead><Tr className="hover:bg-transparent"><Th>#</Th><Th>Activity</Th><Th>Stage · Dept</Th><Th>Owner</Th><Th>Planned</Th><Th>Actual</Th><Th className="text-right">Delay</Th><Th>Priority</Th><Th>RAG</Th><Th /></Tr></THead>
      <TBody>{list.map((t) => (
        <Tr key={t.id} className={cn(t.rag === 'red' && 'bg-bad-soft/40 dark:bg-bad/5')}>
          <Td className="num text-xs text-muted-foreground">{t.seq}</Td>
          <Td><div className="font-semibold">{t.activity}{t.replanned && <span title={`replanned ${t.replanCount}×`} className="ml-1 text-brand">↻{t.replanCount}</span>}</div>{t.remark && <div className="max-w-56 truncate text-[10.5px] text-muted-foreground" title={t.remark}>{t.remark}</div>}</Td>
          <Td className="text-xs">{t.stage}<div className="text-[10.5px] text-muted-foreground">{t.dept}</div></Td>
          <Td className="text-xs">{t.ownerName || '—'}</Td>
          <Td className="text-xs">{fmtDate(t.plannedStart)} → <b>{fmtDate(t.plannedEnd)}</b></Td>
          <Td className="text-xs"><ActualCell t={t} /></Td>
          <Td className={cn('num text-right', t.delayDays > 0 && 'font-semibold text-bad')}>{t.delayDays ? `+${t.delayDays} d` : '—'}</Td>
          <Td><StatusPill value={t.priority} /></Td>
          <Td><Badge tone={RAG[t.rag]}>{ragLabel(t.rag)}</Badge></Td>
          <Td><Button size="sm" variant="secondary" onClick={() => setEdit(t)}><Edit size={13} /></Button></Td>
        </Tr>))}</TBody>
    </Table>
  );

  return (
    <Card>
      {!compact && <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="text-[13px] font-semibold">{orderId ? <>Order TNA <span className="font-mono text-brand">{rows[0]?.orderNo || ''}</span> {clear && <button className="ml-2 text-xs text-muted-foreground hover:underline" onClick={clear}>show all orders</button>}</> : <>TNA tasks · order wise <span className="font-normal text-muted-foreground">({groups.length} order{groups.length === 1 ? '' : 's'}, {rows.length} activities)</span></>}</div>
        {!orderId && orderNos.length > 1 && <Select value={only} onValueChange={setOnly}><SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All orders</SelectItem>{orderNos.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent></Select>}
        <div className="ml-auto flex flex-wrap gap-1.5">{['Open', 'Red', 'Amber', 'Green', 'Done', 'All'].map((c) => <button key={c} onClick={() => setChip(c)} className={cn('h-8 rounded-lg border px-3 text-xs font-semibold', chip === c ? 'border-brand/40 bg-brand-soft text-brand dark:bg-accent' : 'text-muted-foreground')}>{c}</button>)}</div>
      </div>}
      {q.isLoading ? <div className="space-y-2 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
      : !rows.length ? <EmptyState title="No TNA tasks" text={orderId ? 'Generate the TNA for this order from the Buyer Board.' : 'Nothing matches this filter.'} />
      : orderId ? table(rows)
      : <div className="divide-y">{groups.map((g) => { const open = !shut[g.orderNo]; const done = g.tasks.filter((t) => t.status === 'Done').length; const red = g.tasks.filter((t) => t.rag === 'red').length; return (
        <div key={g.orderNo}>
          <div className="flex flex-wrap items-center gap-2 bg-secondary/60 px-4 py-2">
            <button type="button" className="flex items-center gap-1.5 text-muted-foreground hover:text-brand" onClick={() => setShut((x) => ({ ...x, [g.orderNo]: open }))} title={open ? 'Collapse' : 'Expand'}>
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
            <OrderLink id={g.orderId} className="font-mono text-[13px] font-bold text-brand hover:underline">{g.orderNo}</OrderLink>
            <span className="text-[12px] text-muted-foreground">{g.buyerName} · {g.styleNo}</span>
            <Badge tone={red ? 'bad' : 'mute'}>{red ? `${red} overdue` : `${g.tasks.length} activities`}</Badge>
            {chip !== 'Open' && <span className="text-[11px] text-muted-foreground">{done}/{g.tasks.length} done</span>}
            <div className="ml-auto flex items-center gap-2">
              <Link to={`/tna/order/${g.orderId}`} className="text-[11.5px] font-semibold text-brand hover:underline">Live status →</Link>
              <Button size="sm" variant="secondary" className="h-7" onClick={() => downloadTnaExcel(g.orderId, g.orderNo)}><Download size={13} /> Excel</Button>
              <SharePlanButton orderId={g.orderId} orderNo={g.orderNo} />
            </div>
          </div>
          {open && table(g.tasks)}
        </div>); })}</div>}
      <TaskDialog task={edit ? rows.find((x) => x.id === edit.id) ?? edit : null} onClose={() => setEdit(null)} />
    </Card>
  );
}

/** Actual date + how it got there: the software fills it by itself as each step happens. */
export const ActualCell = ({ t }: { t: Task }) => {
  if (t.actualEnd) return <><b>{fmtDate(t.actualEnd)}</b><div className={cn('text-[10px] font-semibold', t.auto ? 'text-teal' : 'text-muted-foreground')}>{t.doneLabel}{t.auto ? ' · auto' : ''}</div></>;
  if (t.actualStart) return <span className="text-brand">started {fmtDate(t.actualStart)}</span>;
  return <span className="text-muted-foreground">—</span>;
};

/* ---------- replan / complete dialog (FR-PRI-3, FR-24.2) ---------- */
export function TaskDialog({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState({ plannedStart: '', plannedEnd: '', priority: 'Normal', ownerUid: '', reason: '', remark: '' });
  const users = useList<UserLite>('/users', { size: 100 }, !!task);
  React.useEffect(() => { if (task) setF({ plannedStart: toInputDate(task.plannedStart), plannedEnd: toInputDate(task.plannedEnd), priority: task.priority, ownerUid: task.ownerUid, reason: '', remark: task.remark || '' }); }, [task]);
  const inv = () => ['/tna', '/mywork', '/alerts', '/orders'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const save = useMutation({ mutationFn: async () => (await api.patch(`/tna/tasks/${task!.id}`, f)).data, onSuccess: (t: Task) => { toast.success(`${t.activity} · ${t.replanned ? 'replanned' : 'updated'}`); inv(); onClose(); }, onError: (e) => toast.error(apiMessage(e)) });
  const done = useMutation({ mutationFn: async () => (await api.post(`/tna/tasks/${task!.id}/complete`, { remark: f.remark })).data, onSuccess: (t: Task) => { toast.success(`${t.activity} completed`); inv(); onClose(); }, onError: (e) => toast.error(apiMessage(e)) });
  const reopen = useMutation({ mutationFn: async () => (await api.post(`/tna/tasks/${task!.id}/reopen`)).data, onSuccess: () => { toast.success('Task reopened'); inv(); onClose(); }, onError: (e) => toast.error(apiMessage(e)) });
  if (!task) return null;
  const changed = f.plannedStart !== toInputDate(task.plannedStart) || f.plannedEnd !== toInputDate(task.plannedEnd) || f.priority !== task.priority;
  const userList = (users.data?.items ?? []).filter((u) => u.status === 'Active' || u.uid === task.ownerUid);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle className="flex items-center gap-2">{task.activity} <Badge tone={RAG[task.rag]}>{ragLabel(task.rag)}</Badge></DialogTitle>
          <DialogDescription>{task.orderNo} · {task.styleNo} · {task.stage} · {task.dept}{task.sourceEvent ? ' · auto-completes from module events' : ''}</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Planned start"><Input type="date" value={f.plannedStart} onChange={(e) => setF({ ...f, plannedStart: e.target.value })} disabled={task.status === 'Done'} /></Field>
            <Field label="Planned end"><Input type="date" value={f.plannedEnd} onChange={(e) => setF({ ...f, plannedEnd: e.target.value })} disabled={task.status === 'Done'} /></Field>
            <Field label="Priority"><Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['Urgent', 'High', 'Normal', 'Low'].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Owner"><Select value={f.ownerUid || 'none'} onValueChange={(v) => setF({ ...f, ownerUid: v === 'none' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">— unassigned —</SelectItem>{userList.map((u) => <SelectItem key={u.uid} value={u.uid}>{u.name} · {u.role}</SelectItem>)}</SelectContent></Select></Field>
            {changed && <Field label="Reason for replan (required)" className="sm:col-span-2"><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. fabric delayed by mill — ETA moved 4 days" /></Field>}
            <Field label="Remark" className="sm:col-span-2"><Input value={f.remark} onChange={(e) => setF({ ...f, remark: e.target.value })} /></Field>
          </div>
          {task.replans.length > 0 && <div className="rounded-xl border bg-secondary p-3 text-[12px]"><div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Replan history ↻ {task.replanCount}</div>
            {task.replans.map((r, i) => <div key={i} className="border-t py-1 first:border-0">{fmtDate(r.at)} · <b>{r.by}</b>: {fmtDate(r.from.plannedEnd)} → {fmtDate(r.to.plannedEnd)} · {r.from.priority} → {r.to.priority} — {r.reason}</div>)}</div>}
        </DialogBody>
        <DialogFooter className="flex-wrap">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {task.status === 'Done' ? <Button variant="secondary" onClick={() => reopen.mutate()}><Refresh size={15} /> Reopen</Button>
            : <Button variant="secondary" onClick={() => done.mutate()}><Check size={15} /> Mark Done</Button>}
          <Button disabled={save.isPending || (changed && f.reason.trim().length < 3)} onClick={() => save.mutate()}><Flag size={15} /> {changed ? 'Replan' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- calendar (week / month) ---------- */
function CalendarTab() {
  const [mode, setMode] = React.useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = React.useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const start = new Date(anchor); if (mode === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); else start.setDate(1);
  const end = new Date(start); if (mode === 'week') end.setDate(end.getDate() + 6); else { end.setMonth(end.getMonth() + 1); end.setDate(0); }
  const q = useList<Task>('/tna/tasks', { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10), size: 1000 });
  const days: Date[] = []; for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(new Date(d));
  const byDay = (d: Date) => (q.data?.items ?? []).filter((t) => new Date(t.plannedEnd).toDateString() === d.toDateString());
  const today = new Date().toDateString();
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div><CardTitle>{start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – {end.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</CardTitle><p className="text-xs text-muted-foreground">Tasks by planned end date</p></div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setAnchor((a) => { const d = new Date(a); mode === 'week' ? d.setDate(d.getDate() - 7) : d.setMonth(d.getMonth() - 1); return d; })}>‹</Button>
          <Button size="sm" variant="secondary" onClick={() => setAnchor(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })}>Today</Button>
          <Button size="sm" variant="secondary" onClick={() => setAnchor((a) => { const d = new Date(a); mode === 'week' ? d.setDate(d.getDate() + 7) : d.setMonth(d.getMonth() + 1); return d; })}>›</Button>
          <Button size="sm" variant={mode === 'week' ? 'default' : 'secondary'} onClick={() => setMode('week')}>Week</Button>
          <Button size="sm" variant={mode === 'month' ? 'default' : 'secondary'} onClick={() => setMode('month')}>Month</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className={cn('grid gap-2', mode === 'week' ? 'grid-cols-2 md:grid-cols-7' : 'grid-cols-3 md:grid-cols-7')}>
          {days.map((d) => { const ts = byDay(d); return (
            <div key={d.toISOString()} className={cn('min-h-24 rounded-lg border p-2', d.toDateString() === today && 'border-brand bg-brand-soft/30 dark:bg-accent')}>
              <div className="text-[10.5px] font-bold text-muted-foreground">{d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit' })}</div>
              {ts.map((t) => <Link key={t.id} to={`/tna?order=${t.orderId}`} className={cn('mt-1 block truncate rounded px-1.5 py-0.5 text-[10.5px] font-semibold', RAG_BG[t.rag])} title={`${t.orderNo} · ${t.activity} · ${t.ownerName}`}>{t.orderNo} · {t.activity}</Link>)}
            </div>); })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- templates (FR-19.1) ---------- */
function TemplatesTab() {
  const q = useQuery<{ items: Template[] }>({ queryKey: ['/tna', 'templates'], queryFn: async () => (await api.get('/tna/templates')).data });
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle>TNA Templates</CardTitle><p className="text-xs text-muted-foreground">Ordered activities with lead-time offsets from the order date or the ex-factory date. The default applies to every new order; a buyer template overrides it.</p></div>
        <Button size="sm" asChild><Link to="/tna/templates/new"><Plus size={14} /> New Template</Link></Button></CardHeader>
      <CardContent className="p-0">
        {q.isLoading ? <div className="p-5"><Skeleton className="h-9" /></div> : <Table>
          <THead><Tr className="hover:bg-transparent"><Th>Name</Th><Th>Buyer</Th><Th>Product type</Th><Th className="text-right">Activities</Th><Th>Default</Th><Th>Status</Th><Th /></Tr></THead>
          <TBody>{(q.data?.items ?? []).map((t) => <Tr key={t.id}><Td className="font-semibold"><Link to={`/tna/templates/${t.id}`} className="text-brand hover:underline">{t.name}</Link></Td><Td className="text-xs">{t.buyerAlias || 'any'}</Td><Td className="text-xs">{t.productType || 'any'}</Td><Td className="num text-right">{t.items.length}</Td><Td>{t.isDefault && <Badge tone="ok">default</Badge>}</Td><Td><StatusPill value={t.status} /></Td><Td><Button size="sm" variant="secondary" asChild><Link to={`/tna/templates/${t.id}`}><Edit size={14} /> Edit</Link></Button></Td></Tr>)}</TBody>
        </Table>}
      </CardContent>
    </Card>
  );
}

/* ---------- template editor as a full page: header fields, then one wide row per activity ---------- */
export function TemplatePage() {
  const { id = 'new' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const isNew = id === 'new';
  const list = useQuery<{ items: Template[] }>({ queryKey: ['/tna', 'templates'], queryFn: async () => (await api.get('/tna/templates')).data });
  const meta = useQuery<{ stages: string[]; activities: Template['items'] }>({ queryKey: ['/tna', 'meta'], queryFn: async () => (await api.get('/tna/meta')).data });
  const buyers = useList<{ id: string; displayName: string }>('/buyers', { size: 200 });
  const existing = isNew ? null : (list.data?.items ?? []).find((t) => t.id === id) ?? null;
  const [f, setF] = React.useState<{ name: string; buyerId: string; productType: string; isDefault: boolean; items: Template['items'] }>({ name: '', buyerId: '', productType: '', isDefault: false, items: [] });
  const [loaded, setLoaded] = React.useState(false);
  React.useEffect(() => {
    if (loaded) return;
    if (isNew && meta.data) { setF({ name: '', buyerId: '', productType: '', isDefault: false, items: meta.data.activities }); setLoaded(true); }
    else if (existing) { setF({ name: existing.name, buyerId: '', productType: existing.productType, isDefault: existing.isDefault, items: existing.items.map((it) => ({ ...it })) }); setLoaded(true); }
  }, [isNew, meta.data, existing, loaded]);
  const save = useMutation({
    mutationFn: async () => (isNew ? await api.post('/tna/templates', { ...f, buyerId: f.buyerId || undefined }) : await api.patch(`/tna/templates/${id}`, { ...f, buyerId: f.buyerId || undefined })).data,
    onSuccess: (t: Template) => { toast.success(`Template “${t.name}” saved`); qc.invalidateQueries({ queryKey: ['/tna'] }); nav('/tna?tab=templates'); }, onError: (e) => toast.error(apiMessage(e)),
  });
  const setItem = (i: number, patch: Partial<Template['items'][number]>) => setF({ ...f, items: f.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= f.items.length) return; const items = [...f.items]; [items[i], items[j]] = [items[j], items[i]]; setF({ ...f, items }); };
  const stages = meta.data?.stages ?? [];
  const byStage = stages.map((st) => ({ stage: st, n: f.items.filter((it) => it.stage === st).length })).filter((x) => x.n);
  const span = f.items.length ? { min: Math.min(...f.items.filter((it) => it.anchor === 'order').map((it) => it.offsetDays), 0), exf: f.items.filter((it) => it.anchor === 'exf').length } : null;
  if (!isNew && list.data && !existing) return <div className="animate-rise"><EmptyState title="Template not found" action={<Button asChild><Link to="/tna?tab=templates">Back to templates</Link></Button>} /></div>;
  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title={isNew ? 'New TNA Template' : `Template — ${existing?.name ?? ''}`} sub="Offset days count from the order date (anchor “order”) or from ex-factory (anchor “exf”, negative = days before). Duration in days. Every new order copies these activities into its own calendar.">
        <Button variant="secondary" onClick={() => nav('/tna?tab=templates')}>Cancel</Button>
        <Button disabled={!f.name || !f.items.length || f.items.some((it) => !it.activity.trim()) || save.isPending} onClick={() => save.mutate()}><Check size={15} /> Save Template</Button>
      </PageHeader>
      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Template name" className="lg:col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Standard woven — 60 day" /></Field>
          <Field label="Buyer (optional)" hint="a buyer template overrides the default for that buyer's orders"><Select value={f.buyerId || 'any'} onValueChange={(v) => setF({ ...f, buyerId: v === 'any' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">Any buyer</SelectItem>{(buyers.data?.items ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.displayName}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Product type"><Input value={f.productType} onChange={(e) => setF({ ...f, productType: e.target.value })} placeholder="any" /></Field>
          <Field label="Default"><label className="flex h-[38px] items-center gap-2 rounded-md border bg-secondary px-3 text-[13px] font-semibold"><input type="checkbox" checked={f.isDefault} onChange={(e) => setF({ ...f, isDefault: e.target.checked })} className="h-4 w-4 accent-[#a05aff]" /> Use for new orders</label></Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div><CardTitle>Activities · {f.items.length}</CardTitle><p className="text-xs text-muted-foreground">{byStage.map((x) => `${x.stage} ${x.n}`).join(' · ') || 'Add the first activity'}{span ? ` · ${span.exf} anchored to ex-factory` : ''}</p></div>
          <Button size="sm" variant="secondary" onClick={() => setF({ ...f, items: [...f.items, { key: `custom_${Date.now()}`, activity: '', stage: stages[0] ?? 'Samples', dept: '', ownerRole: 'Merchandising Head', anchor: 'exf', offsetDays: -10, durationDays: 1, sourceEvent: '' }] })}><Plus size={13} /> Add activity</Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden grid-cols-[44px_minmax(260px,1fr)_170px_200px_120px_96px_84px_92px] gap-2 border-b bg-secondary px-4 py-2 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground lg:grid"><span>#</span><span>Activity</span><span>Stage</span><span>Owner role</span><span>Anchor</span><span>Offset days</span><span>Days</span><span className="text-right">Order</span></div>
          {!f.items.length && !loaded ? <div className="space-y-2 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
          : <div className="divide-y">{f.items.map((it, i) => (
            <div key={i} className="grid gap-2 px-4 py-2.5 lg:grid-cols-[44px_minmax(260px,1fr)_170px_200px_120px_96px_84px_92px] lg:items-center">
              <span className="font-mono text-[12px] font-bold text-muted-foreground">{i + 1}</span>
              <Input className="h-9" value={it.activity} placeholder="Activity name" onChange={(e) => setItem(i, { activity: e.target.value })} />
              <Select value={it.stage} onValueChange={(v) => setItem(i, { stage: v })}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{[...stages, ...(it.stage && !stages.includes(it.stage) ? [it.stage] : [])].map((st) => <SelectItem key={st} value={st}>{st}{meta.data && !stages.includes(st) ? ' (not in pipeline)' : ''}</SelectItem>)}</SelectContent></Select>
              <Select value={it.ownerRole} onValueChange={(v) => setItem(i, { ownerRole: v })}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{['Merchandising Head', 'Sampling Incharge', 'Store Manager', 'Production Manager', 'Accounts', 'Admin'].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
              <Select value={it.anchor} onValueChange={(v) => setItem(i, { anchor: v })}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="order">from order date</SelectItem><SelectItem value="exf">from ex-factory</SelectItem></SelectContent></Select>
              <Input className="h-9" type="number" value={it.offsetDays} onChange={(e) => setItem(i, { offsetDays: +e.target.value })} title="days after the anchor (negative = before)" />
              <Input className="h-9" type="number" min={1} value={it.durationDays} onChange={(e) => setItem(i, { durationDays: +e.target.value })} title="duration in days" />
              <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" className="h-8 px-2" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">↑</Button><Button size="sm" variant="ghost" className="h-8 px-2" disabled={i === f.items.length - 1} onClick={() => move(i, 1)} title="Move down">↓</Button><Button size="sm" variant="ghost" className="h-8 px-2 text-bad" onClick={() => setF({ ...f, items: f.items.filter((_, j) => j !== i) })} title="Remove">✕</Button></div>
            </div>))}</div>}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- order TNA section (used on the order page) ---------- */
export function OrderTna({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const { hasModule } = useAuth();
  const q = useQuery<{ tasks: Task[]; health: string; pct: number; red: number; amber: number; stages: StageCell[]; total: number }>({ queryKey: ['/tna', 'order', orderId], queryFn: async () => (await api.get(`/tna/orders/${orderId}`)).data });
  const apply = useMutation({ mutationFn: async (force: boolean) => (await api.post(`/tna/orders/${orderId}/apply`, { force })).data, onSuccess: (d: { created: number }) => { toast.success(`TNA generated · ${d.created} tasks`); qc.invalidateQueries({ queryKey: ['/tna'] }); }, onError: (e) => toast.error(apiMessage(e)) });
  const [edit, setEdit] = React.useState<Task | null>(null);
  const d = q.data;
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2"><CardTitle>Time &amp; Action Plan</CardTitle>{d && d.total > 0 && <Badge tone={RAG[d.health] || 'mute'}>{ragLabel(d.health)}</Badge>}{d && d.total > 0 && <span className="text-xs text-muted-foreground">{d.pct}% · {d.red} overdue · {d.amber} due soon</span>}</div>
        <div className="flex flex-wrap items-center gap-2">
          {d && d.total > 0 && <>
            <TemplateSwitch orderId={orderId} current={d.tasks[0]?.templateName} />
            <Button size="sm" variant="secondary" onClick={() => downloadTnaExcel(orderId, d.tasks[0]?.orderNo)}><Download size={13} /> Excel</Button>
          </>}
          {hasModule('tna') && !(d && d.total > 0) && <Button size="sm" disabled={apply.isPending} onClick={() => apply.mutate(false)}><Plus size={13} /> Generate TNA</Button>}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {q.isLoading ? <div className="p-5"><Skeleton className="h-9" /></div> : !d?.total ? <div className="p-6 text-sm text-muted-foreground">No TNA yet for this order.</div> : <>
          <div className="border-b px-4 py-3"><StagePipeline stages={d.stages.filter((s) => !s.unlisted).map((s) => s.stage)} cells={d.stages} compact /></div>
          <Table>
            <THead><Tr className="hover:bg-transparent"><Th>#</Th><Th>Activity</Th><Th>Owner</Th><Th>Planned end</Th><Th>Actual</Th><Th className="text-right">Delay</Th><Th>Priority</Th><Th>RAG</Th><Th /></Tr></THead>
            <TBody>{d.tasks.map((t) => (
              <Tr key={t.id} className={cn(t.rag === 'red' && 'bg-bad-soft/40 dark:bg-bad/5')}>
                <Td className="num text-xs text-muted-foreground">{t.seq}</Td>
                <Td><div className="text-xs font-semibold">{t.activity}{t.replanned && <span className="ml-1 text-brand">↻{t.replanCount}</span>}</div><div className="text-[10px] text-muted-foreground">{t.stage}</div></Td>
                <Td className="text-xs">{t.ownerName || '—'}</Td><Td className="text-xs font-semibold">{fmtDate(t.plannedEnd)}</Td><Td className="text-xs"><ActualCell t={t} /></Td>
                <Td className={cn('num text-right text-xs', t.delayDays > 0 && 'font-semibold text-bad')}>{t.delayDays ? `+${t.delayDays} d` : '—'}</Td>
                <Td><StatusPill value={t.priority} /></Td><Td><Badge tone={RAG[t.rag]}>{ragLabel(t.rag)}</Badge></Td>
                <Td><Button size="sm" variant="secondary" onClick={() => setEdit(t)}><Edit size={13} /></Button></Td>
              </Tr>))}</TBody>
          </Table></>}
      </CardContent>
      <TaskDialog task={edit ? d?.tasks.find((x) => x.id === edit.id) ?? edit : null} onClose={() => setEdit(null)} />
    </Card>
  );
}
