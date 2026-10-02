import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Alert as AlertIcon, ChevronRight } from '@/icons/icons';

export type AlertRow = { id: string; ruleKey: string; severity: 'red' | 'amber' | 'info'; module: string; entityNo: string; message: string; link: string; acknowledgedAt?: string; escalatedAt?: string; createdAt: string };

/** Per-module alert strip (FR-23.3) — the demo's "note" component fed by the computed Alert Center. */
export function AlertStrip({ module, max = 3 }: { module: string; max?: number }) {
  const q = useQuery<{ items: AlertRow[] }>({ queryKey: ['/alerts', 'strip', module], queryFn: async () => (await api.get('/alerts', { params: { module } })).data, staleTime: 30_000 });
  const items = (q.data?.items ?? []).filter((a) => !a.acknowledgedAt);
  if (!items.length) return null;
  const worst = items.some((a) => a.severity === 'red') ? 'red' : items.some((a) => a.severity === 'amber') ? 'amber' : 'info';
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border px-4 py-3 text-[12.5px]',
      worst === 'red' ? 'border-bad/30 bg-bad-soft text-bad dark:bg-bad/10' : worst === 'amber' ? 'border-gold-vivid/40 bg-gold-soft text-gold dark:bg-gold-vivid/10 dark:text-gold-vivid' : 'border-info/25 bg-info-soft text-info dark:bg-info/10')}>
      <AlertIcon size={17} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <b>{items.length} alert{items.length === 1 ? '' : 's'} need attention</b>
        <ul className="mt-1 space-y-0.5">{items.slice(0, max).map((a) => (
          <li key={a.id} className="flex items-center gap-2"><span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', a.severity === 'red' ? 'bg-bad' : a.severity === 'amber' ? 'bg-gold-vivid' : 'bg-info')} />
            <Link to={a.link || '/alerts'} className="truncate hover:underline">{a.message}</Link></li>))}</ul>
      </div>
      <Link to={`/alerts?module=${module}`} className="flex shrink-0 items-center gap-1 text-[11.5px] font-semibold hover:underline">Alert Center <ChevronRight size={13} /></Link>
    </div>
  );
}
