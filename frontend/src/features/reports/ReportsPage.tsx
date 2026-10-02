import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { fmtN, fmtInr, fmtDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton, Table, THead, TBody, Tr, Th, Td, Badge } from '@/components/ui/misc';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader, KpiTile, EmptyState, StatusPill } from '@/components/shared';
import { LineChart, BarChart, Donut } from '@/components/charts';
import { Reports as RepIcon, Check, Production, Alert, Payments as PayIcon, Print, Download, Eye } from '@/icons/icons';

type Kpis = { onTimePct: number | null; shipments: number; capacityPct: number | null; linesTotal: number; linesBusy: number; wastagePct: number; wastageTarget: number; grossMarginPct: number | null };
type Trend = { months: string[]; dispatched: number[]; realised?: number[] };
type Buyers = { items: { buyer: string; orders: number; live: number; qty: number; value?: number; shipped: number; onTimePct: number | null }[] };
type Cost = { items: { process: string; value: number }[]; total: number };
type Reg = { items: { key: string; title: string; description: string; frequency: string; financial?: boolean; allowed: boolean }[] };
type Run = { key: string; title: string; description: string; generatedAt: string; columns: { key: string; label: string; num?: boolean }[]; rows: Record<string, unknown>[]; total: number; note?: string };
const mon = (k: string) => new Date(`${k}-01`).toLocaleDateString('en-IN', { month: 'short' });
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v);
const cell = (v: unknown) => (v == null || v === '' ? '—' : isDate(v) ? fmtDate(v as string) : typeof v === 'number' ? v.toLocaleString('en-IN') : String(v));

export default function ReportsPage() {
  const { hasFlag } = useAuth();
  const money = hasFlag('reports.financial') || hasFlag('rates.view');
  const [period, setPeriod] = React.useState<'Monthly' | 'Quarterly'>('Monthly');
  const [sp] = useSearchParams();
  const [run, setRun] = React.useState<string | null>(sp.get('run'));   // /reports?run=<key> opens that report straight away (dashboard cards)
  const kpis = useQuery<Kpis>({ queryKey: ['/reports', 'kpis'], queryFn: async () => (await api.get('/reports/kpis')).data });
  const trend = useQuery<Trend>({ queryKey: ['/reports', 'trend'], queryFn: async () => (await api.get('/reports/trend')).data });
  const buyers = useQuery<Buyers>({ queryKey: ['/reports', 'buyers'], queryFn: async () => (await api.get('/reports/buyers')).data });
  const cost = useQuery<Cost>({ queryKey: ['/reports', 'process-cost'], queryFn: async () => (await api.get('/reports/process-cost')).data, enabled: money });
  const reg = useQuery<Reg>({ queryKey: ['/reports', 'register'], queryFn: async () => (await api.get('/reports/register')).data });
  const k = kpis.data;
  const t = trend.data;
  const series = React.useMemo(() => {
    if (!t) return null;
    if (period === 'Monthly') return { labels: t.months.map(mon), a: t.dispatched, b: t.realised };
    const labels: string[] = [], a: number[] = [], b: number[] = [];
    for (let i = 0; i < t.months.length; i += 3) { labels.push(`${mon(t.months[i])}–${mon(t.months[Math.min(i + 2, t.months.length - 1)])}`); a.push(t.dispatched.slice(i, i + 3).reduce((x, y) => x + y, 0)); if (t.realised) b.push(t.realised.slice(i, i + 3).reduce((x, y) => x + y, 0)); }
    return { labels, a, b: t.realised ? b : undefined };
  }, [t, period]);
  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Reports & Analytics" sub="Headline KPIs, trends and the standard report register. Every report runs on live data and can be exported to CSV (opens in Excel) or printed to PDF.">
        <Button variant="secondary" onClick={() => window.print()}><Print size={16} /> Print Dashboard</Button>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={Check} label="On-Time Delivery" value={k?.onTimePct == null ? '—' : `${k.onTimePct}%`} tone={k?.onTimePct != null && k.onTimePct < 90 ? 'gold' : 'teal'} foot={`${k?.shipments ?? 0} shipments on board vs ship date`} />
        <KpiTile icon={Production} label="Capacity Utilised" value={k?.capacityPct == null ? '—' : `${k.capacityPct}%`} tone="info" foot={`${k?.linesBusy ?? 0} of ${k?.linesTotal ?? 0} lines logged this week`} />
        <KpiTile icon={Alert} label="Fabric Wastage" value={k ? `${k.wastagePct}%` : '—'} tone={k && k.wastagePct > k.wastageTarget ? 'gold' : 'teal'} foot={`BOM allowance · target ${k?.wastageTarget ?? 4}%`} />
        <KpiTile icon={PayIcon} label="Gross Margin" value={money ? (k?.grossMarginPct == null ? '—' : `${k.grossMarginPct}%`) : 'restricted'} tone="brand" foot="FOB vs material + job-work cost" />
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle>Dispatch &amp; Payment Realisation Trend</CardTitle><p className="text-xs text-muted-foreground">Pieces shipped on board (left) vs receipts credited (right), last 12 months</p></div>
          <div className="flex rounded-lg border bg-secondary p-0.5">{(['Monthly', 'Quarterly'] as const).map((p) => <button key={p} onClick={() => setPeriod(p)} className={cn('rounded-md px-3 py-1 text-xs font-semibold', period === p ? 'bg-card text-brand shadow-sm' : 'text-muted-foreground')}>{p}</button>)}</div></CardHeader>
        <CardContent>{!series ? <Skeleton className="h-52" /> : <LineChart labels={series.labels} a={series.a} b={series.b} aLabel="Dispatched pcs" bLabel="Realised ₹" />}</CardContent>
      </Card>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card><CardHeader><div><CardTitle>Buyer-wise Order Value</CardTitle><p className="text-xs text-muted-foreground">{money ? 'FOB value of all orders per buyer' : 'Order quantity per buyer (values restricted)'}</p></div></CardHeader>
          <CardContent>{buyers.isLoading ? <Skeleton className="h-52" /> : <BarChart items={(buyers.data?.items ?? []).map((b) => ({ label: b.buyer, value: money ? (b.value ?? 0) : b.qty }))} valueLabel={money ? '₹ FOB value' : 'pieces'} format={(v) => (money ? fmtInr(v) : fmtN(v))} />}
            <Table><THead><Tr className="hover:bg-transparent"><Th>Buyer</Th><Th className="text-right">Orders</Th><Th className="text-right">Live</Th><Th className="text-right">Pcs</Th><Th className="text-right">Shipped</Th><Th className="text-right">On-time</Th></Tr></THead>
              <TBody>{(buyers.data?.items ?? []).map((b) => <Tr key={b.buyer}><Td className="font-semibold">{b.buyer}</Td><Td className="num text-right">{b.orders}</Td><Td className="num text-right">{b.live}</Td><Td className="num text-right">{fmtN(b.qty)}</Td><Td className="num text-right">{b.shipped}</Td><Td className="num text-right">{b.onTimePct == null ? '—' : `${b.onTimePct}%`}</Td></Tr>)}</TBody></Table></CardContent></Card>
        <Card><CardHeader><div><CardTitle>Process Cost Split</CardTitle><p className="text-xs text-muted-foreground">Job-work spend by process (rate × quantity sent)</p></div></CardHeader>
          <CardContent>{!money ? <div className="text-xs text-muted-foreground">Restricted to the financial-reports flag.</div> : cost.isLoading ? <Skeleton className="h-52" /> : <Donut items={(cost.data?.items ?? []).map((i) => ({ label: i.process, value: i.value }))} centerLabel="TOTAL SPEND" format={fmtInr} />}</CardContent></Card>
      </div>
      <Card>
        <CardHeader><div><CardTitle>Standard Reports</CardTitle><p className="text-xs text-muted-foreground">Run on live data · CSV export · print to PDF</p></div></CardHeader>
        <CardContent className="p-0">{reg.isLoading ? <div className="p-5"><Skeleton className="h-9" /></div> : <Table>
          <THead><Tr className="hover:bg-transparent"><Th>Report</Th><Th>Description</Th><Th>Frequency</Th><Th /></Tr></THead>
          <TBody>{(reg.data?.items ?? []).map((r) => <Tr key={r.key} className={!r.allowed ? 'opacity-50' : ''}><Td className="font-semibold">{r.title}{r.financial && <Badge tone="warn" className="ml-2">financial</Badge>}</Td><Td className="text-xs text-muted-foreground">{r.description}</Td><Td><Badge tone="plain">{r.frequency}</Badge></Td><Td><Button size="sm" variant="secondary" disabled={!r.allowed} onClick={() => setRun(r.key)}><Eye size={13} /> Run</Button></Td></Tr>)}</TBody></Table>}</CardContent>
      </Card>
      <RunDialog keyName={run} onClose={() => setRun(null)} />
    </div>
  );
}

function RunDialog({ keyName, onClose }: { keyName: string | null; onClose: () => void }) {
  const q = useQuery<Run>({ queryKey: ['/reports', 'run', keyName], queryFn: async () => (await api.get(`/reports/run/${keyName}`)).data, enabled: !!keyName });
  if (!keyName) return null;
  const r = q.data;
  const csv = () => {
    if (!r) return;
    const escape = (v: unknown) => `"${String(cell(v)).replace(/"/g, '""')}"`;
    const text = [r.columns.map((c) => escape(c.label)).join(','), ...r.rows.map((row) => r.columns.map((c) => escape(row[c.key])).join(','))].join('\r\n');
    const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${r.key}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
    toast.success('CSV downloaded — opens in Excel');
  };
  const print = () => {
    if (!r) return;
    const w = window.open('', '_blank'); if (!w) return toast.error('Pop-up blocked');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${r.title}</title><style>body{font:11.5px Arial;margin:24px}h1{font-size:17px;margin:0}table{border-collapse:collapse;width:100%;margin-top:10px}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#f5f6f8}.num{text-align:right}@page{size:landscape}</style></head><body><h1>Afion ERP — ${r.title}</h1><small>${r.description} · generated ${new Date(r.generatedAt).toLocaleString('en-IN')} · ${r.total} rows</small>
      <table><tr>${r.columns.map((c) => `<th class="${c.num ? 'num' : ''}">${c.label}</th>`).join('')}</tr>${r.rows.map((row) => `<tr>${r.columns.map((c) => `<td class="${c.num ? 'num' : ''}">${cell(row[c.key])}</td>`).join('')}</tr>`).join('')}</table>${r.note ? `<p><small>${r.note}</small></p>` : ''}<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`); w.document.close();
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent wide className="max-w-6xl">
        <DialogHeader><DialogTitle>{r?.title ?? 'Running report…'}</DialogTitle><DialogDescription>{r ? `${r.description} · ${r.total} rows · generated ${new Date(r.generatedAt).toLocaleString('en-IN')}` : ''}</DialogDescription></DialogHeader>
        <DialogBody className="p-0">
          {q.isLoading ? <div className="space-y-2 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
          : q.isError ? <div className="p-6 text-sm text-bad">{apiMessage(q.error)}</div>
          : !r?.rows.length ? <EmptyState title="No rows" text="Nothing matches this report right now." />
          : <Table><THead><Tr className="hover:bg-transparent">{r.columns.map((c) => <Th key={c.key} className={c.num ? 'text-right' : ''}>{c.label}</Th>)}</Tr></THead>
            <TBody>{r.rows.map((row, i) => <Tr key={i}>{r.columns.map((c) => { const v = row[c.key]; const s = cell(v); const pillish = ['status', 'state', 'priority', 'rag', 'overdue'].includes(c.key) && typeof v === 'string' && v; return <Td key={c.key} className={cn('text-xs', c.num && 'num text-right', typeof v === 'number' && v < 0 && 'text-bad')}>{pillish ? <StatusPill value={c.key === 'rag' ? ({ red: 'Overdue', amber: 'Due soon', green: 'On track' } as Record<string, string>)[v] || v : v} /> : s}</Td>; })}</Tr>)}</TBody></Table>}
          {r?.note && <div className="border-t px-4 py-2 text-[11px] text-muted-foreground">{r.note}</div>}
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Close</Button><Button variant="secondary" disabled={!r} onClick={csv}><Download size={15} /> CSV (Excel)</Button><Button disabled={!r} onClick={print}><Print size={15} /> Print / PDF</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
