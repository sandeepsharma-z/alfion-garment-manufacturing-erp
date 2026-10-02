import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useList, fmtDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton, Badge, Table, THead, TBody, Tr, Th, Td } from '@/components/ui/misc';
import { PageHeader, KpiTile, StatusPill, EmptyState } from '@/components/shared';
import { MyWork as WorkIcon, Alert, Clock, Check, ChevronRight, Flag, Edit } from '@/icons/icons';
import { TaskDialog, RAG, ragLabel, type Task } from '@/features/tna/TnaPage';

type Item = { kind: 'tna' | 'alert' | 'approval' | 'quality'; id: string; title: string; sub: string; due?: string; priority: string; rag: string; replanned?: boolean; link: string; entityNo: string; status: string; bucket: string; severity?: string };
type Queue = { items: Item[]; counts: Record<string, number>; total: number };
type Row = { uid: string; name: string; role: string; Overdue: number; Today: number; 'This week': number; Later: number; total: number; urgent: number };
const BUCKETS = ['Overdue', 'Today', 'This week', 'Later'];
const KIND: Record<string, string> = { tna: 'TNA task', alert: 'Alert', approval: 'Approval', quality: 'Quality check' };

export default function MyWorkPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [heat, setHeat] = React.useState(false);
  const q = useQuery<Queue>({ queryKey: ['/mywork'], queryFn: async () => (await api.get('/mywork')).data });
  const all = useQuery<{ items: Row[] }>({ queryKey: ['/mywork', 'all'], queryFn: async () => (await api.get('/mywork/all')).data, enabled: heat && user?.role === 'Admin' });
  const tasks = useList<Task>('/tna/tasks', { mine: 1, open: 1 });
  const [edit, setEdit] = React.useState<Task | null>(null);
  const inv = () => ['/mywork', '/tna', '/alerts'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const done = useMutation({ mutationFn: async (id: string) => (await api.post(`/tna/tasks/${id}/complete`, {})).data, onSuccess: (t: Task) => { toast.success(`${t.activity} completed`); inv(); }, onError: (e) => toast.error(apiMessage(e)) });
  const ack = useMutation({ mutationFn: async (id: string) => (await api.post(`/alerts/${id}/ack`)).data, onSuccess: () => { toast.success('Acknowledged'); inv(); }, onError: (e) => toast.error(apiMessage(e)) });
  const d = q.data;
  const c = d?.counts ?? { Overdue: 0, Today: 0, 'This week': 0, Later: 0 };
  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="My Work" sub="Everything assigned to you across modules — TNA tasks, alerts, approvals and quality checks — ordered Urgent → overdue → due today → this week. Nothing leaves this list until it is completed, reassigned or replanned with a reason.">
        {user?.role === 'Admin' && <Button variant="secondary" onClick={() => setHeat(!heat)}>{heat ? 'My queue' : "Everyone's queues"}</Button>}
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={Alert} label="Overdue" value={c.Overdue} tone={c.Overdue ? 'bad' : 'teal'} foot="past due — act or replan" />
        <KpiTile icon={Clock} label="Due Today" value={c.Today} tone={c.Today ? 'gold' : 'teal'} />
        <KpiTile icon={WorkIcon} label="This Week" value={c['This week']} tone="info" />
        <KpiTile icon={Check} label="Total in Queue" value={d?.total ?? '—'} tone="brand" foot={`${(d?.items ?? []).filter((i) => i.priority === 'Urgent').length} urgent`} />
      </div>
      {heat && user?.role === 'Admin' ? (
        <Card><CardHeader><div><CardTitle>Workload — everyone's queues</CardTitle><p className="text-xs text-muted-foreground">Who is overloaded, who has capacity (FR-24.4)</p></div></CardHeader>
          <CardContent className="p-0">{all.isLoading ? <div className="p-5"><Skeleton className="h-9" /></div> : <Table><THead><Tr className="hover:bg-transparent"><Th>User</Th><Th>Role</Th>{BUCKETS.map((b) => <Th key={b} className="text-right">{b}</Th>)}<Th className="text-right">Urgent</Th><Th className="text-right">Total</Th></Tr></THead>
            <TBody>{(all.data?.items ?? []).map((r) => <Tr key={r.uid}><Td className="font-semibold">{r.name}</Td><Td className="text-xs">{r.role}</Td>
              {BUCKETS.map((b) => { const v = r[b as keyof Row] as number; return <Td key={b} className={cn('num text-right', v > 0 && b === 'Overdue' && 'font-bold text-bad', v > 0 && b === 'Today' && 'font-semibold text-gold')}><span className={cn('inline-block min-w-8 rounded px-1.5 py-0.5', v >= 5 ? 'bg-bad-soft dark:bg-bad/15' : v > 0 ? 'bg-gold-soft dark:bg-gold-vivid/15' : '')}>{v || '—'}</span></Td>; })}
              <Td className="num text-right">{r.urgent || '—'}</Td><Td className="num text-right font-semibold">{r.total}</Td></Tr>)}</TBody></Table>}</CardContent></Card>
      ) : q.isLoading ? <Skeleton className="h-64" /> : !d?.items.length ? <Card><EmptyState title="Your queue is clear" text="New TNA tasks, alerts and approvals land here automatically." /></Card>
      : BUCKETS.filter((b) => d.items.some((i) => i.bucket === b)).map((b) => (
        <Card key={b}>
          <CardHeader className="py-3"><CardTitle className={cn(b === 'Overdue' && 'text-bad', b === 'Today' && 'text-gold')}>{b} <span className="ml-1 text-xs font-normal text-muted-foreground">{d.items.filter((i) => i.bucket === b).length}</span></CardTitle></CardHeader>
          <CardContent className="divide-y p-0">{d.items.filter((i) => i.bucket === b).map((i) => (
            <div key={`${i.kind}-${i.id}`} className="flex items-center gap-3 px-4 py-2.5">
              <Flag size={15} className={cn('shrink-0', i.priority === 'Urgent' ? 'text-bad' : i.priority === 'High' ? 'text-gold-vivid' : 'text-muted-foreground/50')} />
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 text-[13px]"><Link to={i.link} className="font-semibold hover:underline">{i.title}</Link><Badge tone="plain">{KIND[i.kind]}</Badge><StatusPill value={i.priority} />{i.rag && i.rag !== 'green' && <Badge tone={RAG[i.rag] || 'mute'}>{ragLabel(i.rag)}</Badge>}{i.replanned && <span className="text-xs text-brand">↻</span>}</div>
                <div className="text-[11px] text-muted-foreground">{i.sub}{i.due ? ` · due ${fmtDate(i.due)}` : ''}</div></div>
              {i.kind === 'tna' && <><Button size="sm" variant="secondary" onClick={() => { const t = tasks.data?.items.find((x) => x.id === i.id); if (t) setEdit(t); }}><Edit size={13} /> Replan</Button><Button size="sm" onClick={() => done.mutate(i.id)}><Check size={13} /> Done</Button></>}
              {i.kind === 'alert' && <Button size="sm" variant="secondary" onClick={() => ack.mutate(i.id)}><Check size={13} /> Acknowledge</Button>}
              {(i.kind === 'approval' || i.kind === 'quality') && <Button size="sm" variant="secondary" asChild><Link to={i.link}>Open <ChevronRight size={13} /></Link></Button>}
            </div>))}</CardContent>
        </Card>))}
      <TaskDialog task={edit ? tasks.data?.items.find((x) => x.id === edit.id) ?? edit : null} onClose={() => setEdit(null)} />
    </div>
  );
}
