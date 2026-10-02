import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtN, fmtDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton, Badge } from '@/components/ui/misc';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatusPill, AuthImg, PageHeader } from '@/components/shared';
import { Check, ChevronRight, Orders as OrdersIcon, Tna as TnaIcon, Download } from '@/icons/icons';
import { TasksTab, TemplateSwitch, downloadTnaExcel, SharePlanButton } from './TnaPage';
import { StagePipeline, type StageCell } from './StagePipeline';
import type { Order } from '@/features/orders/OrdersPage';

type Gate = { n: number; t: string; s: string; k: string };
type Detail = { order: Order; tower: Gate[]; material: { hasBom: boolean; rows: { code: string; name: string; shortage: number; toOrder?: number; onOrder?: number }[]; shortages?: number }; ops: { op: string; plannedQty: number; doneQty: number; state: string; whereLabel: string }[];
  dispatches: { invoiceNo: string; status: string; qty: number }[]; payments: { invoiceNo: string; status: string }[]; shipping?: { shippedQty: number; balanceQty: number } };
type Tna = { tasks: { id: string; activity: string; stage: string; plannedEnd: string; status: string; rag: string; ownerName: string; templateName?: string }[]; stages: StageCell[]; done: number; total: number; red: number; amber: number; health: string };
const GATE: Record<string, string> = { ok: 'border-teal/40 bg-teal-soft text-teal dark:bg-teal/10', warn: 'border-gold-vivid/40 bg-gold-soft text-gold dark:bg-gold-vivid/10 dark:text-gold-vivid', bad: 'border-bad/40 bg-bad-soft text-bad dark:bg-bad/10', pending: 'border-dashed text-muted-foreground', '': 'text-muted-foreground' };

/** One order, everything live on its own page: photos, pipeline (real state), control-tower gates, material / production / shipping in brief, next T&A activities and the full plan — with links to act. */
export default function OrderLivePage() {
  const { id: orderId = '' } = useParams();
  const nav = useNavigate();
  const det = useQuery<Detail>({ queryKey: [`/orders/${orderId}`], queryFn: async () => (await api.get(`/orders/${orderId}`)).data, enabled: !!orderId, refetchInterval: 20_000 });
  const tna = useQuery<Tna>({ queryKey: ['/tna', 'orders', orderId], queryFn: async () => (await api.get(`/tna/orders/${orderId}`)).data, enabled: !!orderId, refetchInterval: 20_000 });
  const meta = useQuery<{ stages: string[] }>({ queryKey: ['/tna', 'board'], queryFn: async () => (await api.get('/tna/board')).data, staleTime: 60_000 });
  const stages = meta.data?.stages ?? [];
  const o = det.data?.order, t = tna.data;
  const next = (t?.tasks ?? []).filter((x) => x.status !== 'Done').slice(0, 6);
  const go = (link: string) => nav(link);
  const [big, setBig] = React.useState(0);
  if (!o || !t) return <div className="space-y-3 animate-rise"><Skeleton className="h-8 w-72" /><Skeleton className="h-24" /><Skeleton className="h-40" /></div>;
  const nowStages = t.stages.filter((c) => c.live?.state === 'now' || c.live?.state === 'blocked').map((c) => c.stage);
  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title={`${o.orderNo} — live status`} sub="Real pipeline state from the floor, gates, material and shipping, plus the T&A plan — refreshes every 20 s.">
        <Button variant="secondary" onClick={() => nav('/tna')}><TnaIcon size={16} /> TNA board</Button>
        <SharePlanButton orderId={o.id} orderNo={o.orderNo} size="default" />
        <Button asChild><Link to={`/orders/${o.id}`}><OrdersIcon size={16} /> Open order</Link></Button>
      </PageHeader>
      {/* header card: sample photos + order facts */}
      <Card>
        <CardContent className="flex flex-wrap gap-5 p-4">
          {o.photos?.length ? <div className="flex gap-2">
            <AuthImg fileId={o.photos[big] || o.photos[0]} alt={o.styleNo} className="h-44 w-36 rounded-xl border" />
            {o.photos.length > 1 && <div className="flex flex-col gap-1.5">{o.photos.map((p, i) => <button key={p} type="button" onClick={() => setBig(i)} className={cn('overflow-hidden rounded-lg border', i === big && 'ring-2 ring-brand')}><AuthImg fileId={p} alt="" className="h-[52px] w-11" /></button>)}</div>}
          </div> : <div className="grid h-44 w-36 place-items-center rounded-xl border border-dashed text-[11px] text-muted-foreground" style={o.swatch ? { background: o.swatch } : undefined}>{o.swatch ? '' : 'No sample photo'}</div>}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[18px] font-bold text-brand">{o.orderNo}</span><span className="text-[15px] font-semibold">{o.styleNo}</span><StatusPill value={o.stage} />{o.revision ? <Badge tone="warn">Rev {o.revision}</Badge> : null}{o.priority !== 'Normal' && <StatusPill value={o.priority} />}{nowStages.map((s) => <span key={s} className="rounded-md bg-brand px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-white">now · {s}</span>)}</div>
            <div className="mt-1 text-[13px] font-semibold">{o.description}</div>
            <div className="text-[12px] text-muted-foreground">{o.buyerName}{o.sampleNo ? <> · from sample <Link to={o.sampleId ? `/samples/${o.sampleId}` : '/samples'} className="font-mono text-brand hover:underline">{o.sampleNo}</Link></> : null}{o.buyerOrderNo ? ` · ${o.buyerOrderNo}` : o.buyerPoNo ? ` · PO ${o.buyerPoNo}` : ''}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[['Order qty', `${fmtN(o.qty)} pcs`, `cut plan ${fmtN(o.cutQty)}`, 'text-brand'], ['Ship date', fmtDate(o.shipDate), o.targetShipDate ? `buyer target ${fmtDate(o.targetShipDate)}` : 'ex-factory', o.shipDate && new Date(o.shipDate).getTime() < Date.now() ? 'text-bad' : 'text-teal'], ['T&A activities', `${t.done}/${t.total}`, t.red ? `${t.red} overdue` : t.amber ? `${t.amber} due soon` : 'on schedule', t.red ? 'text-bad' : t.amber ? 'text-gold' : 'text-teal'], ['Progress', `${o.progress ?? 0}%`, `stage ${o.stage}`, 'text-info']].map(([k, v, f, c]) => <div key={k} className="min-w-[120px] flex-1 rounded-lg border bg-secondary/60 px-3 py-2"><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{k}</div><div className={cn('num text-[15px] font-bold', c)}>{v}</div><div className="text-[10.5px] text-muted-foreground">{f}</div></div>)}
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-4 p-4">
            {/* live pipeline — click a stage to go and act */}
            <div className="rounded-xl border p-3">
              <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-muted-foreground"><span>Pipeline — real state</span><span className="font-normal normal-case">click a stage to open its page</span></div>
              <StagePipeline stages={stages} cells={t.stages} onStage={(_, c) => c?.live?.link && go(c.live.link)} />
            </div>
            {/* control tower gates */}
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {det.data!.tower.map((g) => <div key={g.n} className={cn('rounded-lg border px-2.5 py-2', GATE[g.k] ?? '')}><div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide"><span>{g.n}. {g.t}</span>{g.k === 'ok' && <Check size={12} />}{g.k === 'bad' && <span>✕</span>}{g.k === 'warn' && <span>!</span>}</div><div className="mt-0.5 truncate text-[11.5px] font-semibold text-foreground/90" title={g.s}>{g.s}</div></div>)}
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {/* material */}
              <div className="rounded-xl border">
                <div className="flex items-center justify-between border-b bg-secondary/60 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"><span>Material</span><button type="button" className="font-normal normal-case text-brand hover:underline" onClick={() => go(`/orders/${o.id}`)}>Order stock <ChevronRight size={12} className="inline" /></button></div>
                <div className="px-3 py-2 text-[12px]">
                  {!det.data!.material.hasBom ? <span className="text-gold">No BOM — <button type="button" className="font-semibold text-brand hover:underline" onClick={() => go(`/planning?style=${o.styleId}&qty=${o.cutQty || o.qty}&order=${o.id}`)}>define in Planning</button></span>
                  : !det.data!.material.shortages ? <span className="font-semibold text-teal">All {det.data!.material.rows.length} lines available</span>
                  : <ul className="space-y-0.5">{det.data!.material.rows.filter((r) => r.shortage > 0).slice(0, 5).map((r) => <li key={r.code} className="flex justify-between gap-2"><span className="truncate">{r.name}</span><span className={cn('num shrink-0 font-semibold', r.toOrder ? 'text-bad' : 'text-info')}>{r.toOrder ? `${fmtN(r.toOrder)} to buy` : 'on order'}</span></li>)}</ul>}
                </div>
              </div>
              {/* production */}
              <div className="rounded-xl border">
                <div className="flex items-center justify-between border-b bg-secondary/60 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"><span>Production</span><button type="button" className="font-normal normal-case text-brand hover:underline" onClick={() => go('/production')}>Floor <ChevronRight size={12} className="inline" /></button></div>
                <div className="px-3 py-2 text-[12px]">{!det.data!.ops.length ? <span className="text-muted-foreground">Not started</span> : <ul className="space-y-1">{det.data!.ops.map((x) => { const pct = x.plannedQty ? Math.min(Math.round(x.doneQty * 100 / x.plannedQty), 100) : 0; return <li key={x.op}><div className="flex justify-between"><span className="font-semibold">{x.op}</span><span className="num">{fmtN(x.doneQty)} / {fmtN(x.plannedQty)}</span></div><div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-secondary"><div className={cn('h-full rounded-full', pct >= 100 ? 'bg-teal' : x.state === 'Blocked' ? 'bg-bad' : 'bg-brand')} style={{ width: `${pct}%` }} /></div></li>; })}</ul>}</div>
              </div>
              {/* shipping + payment */}
              <div className="rounded-xl border">
                <div className="flex items-center justify-between border-b bg-secondary/60 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"><span>Dispatch · Payment</span><button type="button" className="font-normal normal-case text-brand hover:underline" onClick={() => go('/dispatch')}>Dispatch <ChevronRight size={12} className="inline" /></button></div>
                <div className="px-3 py-2 text-[12px]">
                  {!det.data!.dispatches.length ? <span className="text-muted-foreground">Not invoiced yet{det.data!.tower.find((g) => g.n === 8)?.k === 'ok' ? ' — final inspection passed, invoice can be raised' : ''}</span>
                  : <ul className="space-y-0.5">{det.data!.dispatches.map((d) => <li key={d.invoiceNo} className="flex justify-between gap-2"><span className="font-mono">{d.invoiceNo}</span><span>{fmtN(d.qty)} pcs · {d.status}</span></li>)}{det.data!.shipping && <li className="text-muted-foreground">shipped {fmtN(det.data!.shipping.shippedQty)} · balance {fmtN(det.data!.shipping.balanceQty)}</li>}{det.data!.payments.map((p) => <li key={p.invoiceNo} className="flex justify-between gap-2"><span>Payment</span><span className="font-semibold">{p.status}</span></li>)}</ul>}
                </div>
              </div>
            </div>
            {/* next activities */}
            <div className="rounded-xl border">
              <div className="flex items-center justify-between border-b bg-secondary/60 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"><span>Next T&amp;A activities · {t.done}/{t.total} done{t.red ? ` · ${t.red} overdue` : ''}{t.amber ? ` · ${t.amber} due soon` : ''}</span><button type="button" className="font-normal normal-case text-brand hover:underline" onClick={() => document.getElementById('tna-plan')?.scrollIntoView({ behavior: 'smooth' })}>Full plan <ChevronRight size={12} className="inline" /></button></div>
              {!next.length ? <div className="px-3 py-2 text-[12px] text-teal">Every planned activity is done.</div>
              : <ul className="divide-y">{next.map((x) => <li key={x.id} className="flex items-center gap-2 px-3 py-1.5 text-[12px]"><span className={cn('h-2 w-2 shrink-0 rounded-full', x.rag === 'red' ? 'bg-bad' : x.rag === 'amber' ? 'bg-gold-vivid' : 'bg-teal')} /><span className="min-w-0 flex-1 truncate"><b>{x.activity}</b> <span className="text-muted-foreground">· {x.stage} · {x.ownerName || '—'}</span></span><span className={cn('shrink-0 font-semibold', x.rag === 'red' ? 'text-bad' : x.rag === 'amber' ? 'text-gold' : 'text-muted-foreground')}>{fmtDate(x.plannedEnd)}</span></li>)}</ul>}
            </div>
        </CardContent>
      </Card>
      {/* the full plan, inline */}
      <Card>
        <CardHeader id="tna-plan" className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div><CardTitle>Time &amp; Action plan</CardTitle><p className="text-xs text-muted-foreground">Every planned activity with owner, dates and RAG. Actuals fill in by themselves as each step happens in the software.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <TemplateSwitch orderId={o.id} current={t.tasks[0]?.templateName} />
            <Button size="sm" variant="secondary" onClick={() => downloadTnaExcel(o.id, o.orderNo)}><Download size={14} /> Excel</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0"><TasksTab orderId={o.id} compact /></CardContent>
      </Card>
    </div>
  );
}
