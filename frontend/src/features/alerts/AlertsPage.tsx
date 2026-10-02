import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton, Badge } from '@/components/ui/misc';
import { PageHeader, KpiTile, Toolbar, EmptyState } from '@/components/shared';
import { Bell, Alert as AlertIcon, Check, Refresh, ChevronRight } from '@/icons/icons';
import { flatNav } from '@/app/nav';
import type { AlertRow } from '@/components/AlertStrip';

type Resp = { items: AlertRow[]; total: number; red: number; amber: number; unacknowledged: number };
const SEV: Record<string, 'bad' | 'warn' | 'info'> = { red: 'bad', amber: 'warn', info: 'info' };
const modLabel = (k: string) => (flatNav.find((n) => n.key === k) ?? flatNav.find((n) => (n.module ?? n.key) === k))?.label ?? k;

export default function AlertsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [sp] = useSearchParams();
  const [q, setQ] = React.useState('');
  const [chip, setChip] = React.useState(sp.get('module') ? 'All' : 'Open');
  const [all, setAll] = React.useState(false);
  const [mod, setMod] = React.useState(sp.get('module') || '');
  const data = useQuery<Resp>({ queryKey: ['/alerts', 'page', all], queryFn: async () => (await api.get('/alerts', { params: all ? { all: 1 } : {} })).data });
  const ack = useMutation({ mutationFn: async (id: string) => (await api.post(`/alerts/${id}/ack`)).data, onSuccess: () => qc.invalidateQueries({ queryKey: ['/alerts'] }), onError: (e) => toast.error(apiMessage(e)) });
  const recompute = useMutation({ mutationFn: async () => (await api.post('/alerts/recompute')).data, onSuccess: (r: { open: number; created: number; resolved: number }) => { toast.success(`Rules re-evaluated · ${r.open} open · ${r.created} new · ${r.resolved} resolved`); qc.invalidateQueries({ queryKey: ['/alerts'] }); qc.invalidateQueries({ queryKey: ['/mywork'] }); }, onError: (e) => toast.error(apiMessage(e)) });
  const items = (data.data?.items ?? []).filter((a) => (!q || `${a.message} ${a.entityNo} ${a.module}`.toLowerCase().includes(q.toLowerCase())) && (!mod || a.module === mod)
    && (chip === 'All' || (chip === 'Open' ? !a.acknowledgedAt : chip === 'Acknowledged' ? !!a.acknowledgedAt : a.severity === chip.toLowerCase())));
  const modules = [...new Set((data.data?.items ?? []).map((a) => a.module))];
  const d = data.data;
  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Alert Center" sub="One inbox of everything needing attention. Every alert is computed from live records, deep-links to the record, and clears itself when the condition is fixed. Red alerts left unacknowledged escalate to the admin.">
        {user?.role === 'Admin' && <><Button variant="secondary" onClick={() => setAll(!all)}>{all ? 'My alerts' : 'Everyone\'s alerts'}</Button><Button variant="secondary" disabled={recompute.isPending} onClick={() => recompute.mutate()}><Refresh size={16} /> Re-evaluate now</Button></>}
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={Bell} label="Open Alerts" value={d?.total ?? '—'} tone="brand" foot={`${d?.unacknowledged ?? 0} not yet acknowledged`} />
        <KpiTile icon={AlertIcon} label="Red" value={d?.red ?? '—'} tone={d?.red ? 'bad' : 'teal'} foot="overdue · failed · blocked" />
        <KpiTile icon={AlertIcon} label="Amber" value={d?.amber ?? '—'} tone={d?.amber ? 'gold' : 'teal'} foot="due soon · short · pending" />
        <KpiTile icon={Check} label="Escalated" value={(d?.items ?? []).filter((a) => a.escalatedAt).length} tone="mute" foot="red, unacknowledged past the limit" />
      </div>
      <Card>
        <Toolbar q={q} setQ={setQ} placeholder="Search alerts…" chips={['Open', 'Red', 'Amber', 'Info', 'Acknowledged', 'All']} chip={chip} setChip={setChip}
          right={<select className="h-9 rounded-lg border bg-secondary px-2 text-xs" value={mod} onChange={(e) => setMod(e.target.value)}><option value="">All modules</option>{modules.map((m) => <option key={m} value={m}>{modLabel(m)}</option>)}</select>} />
        {data.isLoading ? <div className="space-y-3 p-5">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        : !items.length ? <EmptyState title="Nothing needs attention" text="Alerts appear here automatically when a rule fires — overdue POs, TNA delays, quality failures, blocked operations…" />
        : <div className="divide-y">{items.map((a) => (
          <div key={a.id} className={cn('flex items-start gap-3 px-4 py-3', a.acknowledgedAt && 'opacity-60')}>
            <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', a.severity === 'red' ? 'bg-bad' : a.severity === 'amber' ? 'bg-gold-vivid' : 'bg-info')} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-[13px]"><Link to={a.link || '#'} className="font-semibold hover:underline">{a.message}</Link><Badge tone={SEV[a.severity]}>{a.severity}</Badge><Badge tone="plain">{modLabel(a.module)}</Badge>{a.escalatedAt && <Badge tone="bad">escalated</Badge>}</div>
              <div className="text-[11px] text-muted-foreground">{a.entityNo} · raised {new Date(a.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}{a.acknowledgedAt ? ` · acknowledged` : ''}</div>
            </div>
            {!a.acknowledgedAt && <Button size="sm" variant="secondary" onClick={() => ack.mutate(a.id)}><Check size={13} /> Acknowledge</Button>}
            <Button size="sm" variant="ghost" asChild><Link to={a.link || '/'}><ChevronRight size={14} /></Link></Button>
          </div>))}</div>}
      </Card>
    </div>
  );
}
