import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useList, fmtDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton, Badge } from '@/components/ui/misc';
import { AlertStrip } from '@/components/AlertStrip';
import { PageHeader, KpiTile, Toolbar, StatusPill, EmptyState, AuthImg } from '@/components/shared';
import { Samples, Plus, Clock, Check, Refresh } from '@/icons/icons';
import { type Sample } from './SampleDialogs';

const DOT: Record<string, string> = { approved: 'border-teal bg-teal', changes: 'border-gold-vivid bg-gold-vivid', rejected: 'border-gold-vivid bg-gold-vivid', sent: 'border-brand bg-brand ring-4 ring-brand/15' };

/** Card = photo, date, description, status, rounds. Everything else lives on the sample page. */
export default function SamplesPage() {
  const [sp] = useSearchParams();
  const [q, setQ] = React.useState(sp.get('q') || '');
  const [chip, setChip] = React.useState('All');
  const { data, isLoading } = useList<Sample>('/samples', { size: 200 });
  const all = data?.items ?? [];
  const rows = all.filter((s) => {
    const t = `${s.sampleNo} ${s.styleNo} ${s.description} ${s.buyerName}`.toLowerCase();
    return (!q || t.includes(q.toLowerCase())) && (chip === 'All' || s.status === chip);
  });
  const active = all.filter((s) => !['Approved', 'Rejected'].includes(s.status));
  const avgRounds = all.length ? (all.reduce((a, s) => a + s.round, 0) / all.length).toFixed(1) : '—';

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Sample Development" sub="The entry point: pieces, measurement spec, costing and the buyer's dates are typed once here and travel with the style to the order, BOM and inspections.">
        <Button asChild><Link to="/samples/new"><Plus size={17} /> New Sample Request</Link></Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={Samples} label="Active Sample Styles" value={active.length} tone="brand" foot={`${new Set(active.map((s) => s.buyerName)).size} buyers`} />
        <KpiTile icon={Clock} label="Awaiting Buyer" value={all.filter((s) => s.status === 'Client Review').length} tone="info" foot="in client review" />
        <KpiTile icon={Check} label="Approved → Order Ready" value={all.filter((s) => s.status === 'Approved' && !s.orderId).length} tone="teal" foot="convert to order" />
        <KpiTile icon={Refresh} label="Avg Rounds / Style" value={avgRounds} tone="gold" foot="target ≤ 2.0" />
      </div>

      <AlertStrip module="samples" />
      <Card>
        <Toolbar q={q} setQ={setQ} placeholder="Search sample, style, buyer…"
          chips={['All', 'In Sampling', 'Client Review', 'Revision', 'Approved', 'Rejected']} chip={chip} setChip={setChip} />
        {isLoading ? <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-60" />)}</div>
        : !rows.length ? <EmptyState title="No samples" text="Start with a sample request from the buyer's tech pack." action={<Button asChild><Link to="/samples/new"><Plus size={16} /> New Sample</Link></Button>} />
        : (
          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((s) => {
              const shots = (s.items ?? []).flatMap((i) => (i.photos?.length ? i.photos : i.fileId ? [{ fileId: i.fileId }] : []));
              const last = s.rounds[s.rounds.length - 1];
              return (
                <Link key={s.id} to={`/samples/${s.id}`} title="Open sample page"
                  className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-card transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-pop/60">
                  <div className="flex gap-3 p-4">
                    {shots[0] ? (
                      <div className="relative h-[86px] w-[66px] shrink-0 overflow-hidden rounded-lg border">
                        <AuthImg fileId={shots[0].fileId} className="h-full w-full" alt={s.styleNo} />
                        {shots.length > 1 && <span className="absolute bottom-0.5 right-0.5 rounded bg-ink/75 px-1 text-[9.5px] font-bold text-white">+{shots.length - 1}</span>}
                      </div>
                    ) : <div className="h-[86px] w-[66px] shrink-0 rounded-lg" style={{ background: `linear-gradient(150deg, ${s.swatch}, ${s.swatch}99)` }} />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-slab text-[15px] font-bold">{s.styleNo}</div>
                        <StatusPill value={s.status} />
                      </div>
                      <div className="line-clamp-2 text-[12.5px] font-semibold leading-snug">{s.description}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground"><span className="font-mono">{s.sampleNo}</span> · {s.buyerName}</div>
                      <div className="text-[11px] text-muted-foreground">{s.targetDate ? `Target ${fmtDate(s.targetDate)}` : last?.sentOn ? `Sent ${fmtDate(last.sentOn)}` : 'No target date'}</div>
                      {s.priority !== 'Normal' && <Badge tone={s.priority === 'Urgent' ? 'bad' : 'warn'} className="mt-1.5">{s.priority}</Badge>}
                    </div>
                  </div>
                  <div className="mt-auto border-t bg-secondary/40 px-4 py-3">
                    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Rounds</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {s.rounds.map((r) => (
                        <span key={r.no} title={`${r.title}${r.sentOn ? ` · sent ${fmtDate(r.sentOn)}` : ''}${r.comment ? ` · ${r.comment}` : ''}`}
                          className={cn('flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold', r.result === 'approved' ? 'border-teal/40 bg-teal-soft text-teal' : r.result === 'changes' || r.result === 'rejected' ? 'border-gold-vivid/40 bg-gold-soft text-gold' : r.result === 'sent' ? 'border-brand/40 bg-brand-soft text-brand' : 'text-muted-foreground')}>
                          <span className={cn('h-2 w-2 rounded-full border-2 bg-card', DOT[r.result] ?? 'border-border')} />R{r.no}
                        </span>))}
                      {s.status === 'Approved' && !s.orderId
                        ? <span className="ml-auto flex items-center gap-1 rounded-md bg-gold-soft px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-gold dark:bg-gold-vivid/15 dark:text-gold-vivid">ready → convert to order</span>
                        : s.orderNo ? <span className="ml-auto font-mono text-[11px] font-semibold text-teal">{s.orderNo}</span>
                        : <span className="ml-auto text-[11px] text-muted-foreground">{last?.sentOn ? `sent ${fmtDate(last.sentOn)}` : 'not sent yet'}</span>}
                    </div>
                  </div>
                </Link>);
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
