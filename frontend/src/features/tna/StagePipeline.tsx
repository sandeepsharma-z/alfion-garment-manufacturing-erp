import * as React from 'react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { fmtDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/misc';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Check, Plus, Trash, ChevronDown, ChevronRight, Refresh, Eye, EyeOff, Settings as SettingsIcon, Alert, Info } from '@/icons/icons';

/* ---------- pipeline visual: one chip per stage, connected left → right ---------- */
export type LiveStage = { key: string; state: 'done' | 'now' | 'upcoming' | 'blocked'; detail: string; pct: number; link?: string };
export type StageCell = { stage: string; unlisted?: boolean; total: number; done: number; rag: string; next: { activity: string; plannedEnd: string; rag: string } | null; actualEnd?: string; live?: LiveStage | null };
const RAG_LABEL: Record<string, string> = { green: 'On track', amber: 'Due soon', red: 'Overdue', done: 'Done', none: 'Not planned' };
const TONE: Record<string, { chip: string; dot: string; line: string }> = {
  done: { chip: 'border-teal/30 bg-teal-soft text-teal dark:bg-teal/15', dot: 'bg-teal text-white', line: 'bg-teal' },
  green: { chip: 'border-teal/40 bg-card text-foreground ring-2 ring-teal/40', dot: 'bg-teal text-white', line: 'bg-border' },
  amber: { chip: 'border-gold-vivid/50 bg-gold-soft text-gold dark:bg-gold-vivid/15 dark:text-gold-vivid ring-2 ring-gold-vivid/40', dot: 'bg-gold-vivid text-white', line: 'bg-border' },
  red: { chip: 'border-bad/50 bg-bad-soft text-bad dark:bg-bad/15 ring-2 ring-bad/40', dot: 'bg-bad text-white', line: 'bg-border' },
  none: { chip: 'border-dashed bg-secondary/60 text-muted-foreground', dot: 'bg-secondary text-muted-foreground', line: 'bg-border' },
};

const STATE_PILL: Record<string, string> = {
  done: 'bg-teal text-white', now: 'bg-brand text-white', red: 'bg-bad text-white', amber: 'bg-gold-vivid text-white', green: 'bg-teal-soft text-teal', none: 'bg-secondary text-muted-foreground',
};
const STATE_LABEL: Record<string, string> = { done: 'Done', now: 'Now', red: 'Overdue', amber: 'Due soon', green: 'Upcoming', none: 'Not planned' };
const CARD: Record<string, string> = {
  done: 'border-teal/30 bg-teal-soft/40 dark:bg-teal/10', now: 'border-brand shadow-pop ring-1 ring-brand/30', red: 'border-bad/50 bg-bad-soft/40 dark:bg-bad/10', amber: 'border-gold-vivid/60 bg-gold-soft/40 dark:bg-gold-vivid/10', green: 'border-border bg-card', none: 'border-dashed bg-secondary/40',
};

/**
 * Pipeline of an order's stages. `stages` = configured order; cells come from the roll-up.
 * Wide mode: step cards that wrap like a snake (left → right, then next row), an arrow between steps, one status pill and a mini progress bar per stage.
 * Compact mode (order page): single scrolling strip.
 */
export function StagePipeline({ stages, cells, compact, onStage }: { stages: string[]; cells: StageCell[]; compact?: boolean; onStage?: (stage: string, cell?: StageCell) => void }) {
  const order = [...stages, ...cells.filter((c) => c.unlisted && c.total).map((c) => c.stage)];
  const byName = Object.fromEntries(cells.map((c) => [c.stage, c]));
  const hasLive = cells.some((c) => c.live);
  /* state = what really happened (live) when the server sends it; the planned-task rag only colours the pill when a stage is not done yet */
  const currentIdx = hasLive ? order.findIndex((s) => byName[s]?.live?.state === 'now' || byName[s]?.live?.state === 'blocked') : order.findIndex((s) => { const c = byName[s]; return c && c.total && c.done < c.total; });
  const stateOf = (i: number) => { const c = byName[order[i]]; if (c?.live) { if (c.live.state === 'done') return 'done'; if (c.live.state === 'blocked') return 'red'; if (c.live.state === 'now') return c.rag === 'red' ? 'red' : 'now'; return c.rag === 'red' ? 'red' : c.rag === 'amber' ? 'amber' : c.total ? 'green' : 'none'; } if (!c || !c.total) return 'none'; if (c.rag === 'done') return 'done'; if (c.rag === 'red') return 'red'; if (c.rag === 'amber') return 'amber'; return i === currentIdx ? 'now' : 'green'; };
  if (compact) {
    return (
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {order.map((s, i) => {
          const c = byName[s]; const planned = !!c && c.total > 0; const rag = c?.live ? (c.live.state === 'done' ? 'done' : c.live.state === 'blocked' ? 'red' : c.rag === 'red' ? 'red' : c.rag === 'amber' ? 'amber' : c.live.state === 'now' ? 'green' : 'none') : planned ? c.rag : 'none'; const t = TONE[rag] || TONE.none; const isPast = rag === 'done';
          return (
            <div key={s} className="flex min-w-0 items-stretch">
              <button type="button" onClick={() => onStage?.(s, c)} disabled={!onStage} title={c?.live ? `${s}: ${c.live.detail}${c.next ? ` · next: ${c.next.activity} (${fmtDate(c.next.plannedEnd)})` : ''}` : planned ? `${s}: ${c.done}/${c.total} done · ${RAG_LABEL[rag]}${c.next ? ` · next: ${c.next.activity} (${fmtDate(c.next.plannedEnd)})` : ''}` : `${s}: no activities planned`}
                className={cn('relative flex w-full min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-all', t.chip, onStage && 'hover:shadow-card', c?.unlisted && 'border-dashed')}>
                <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold', t.dot)}>{isPast ? <Check size={11} /> : i + 1}</span>
                <span className="min-w-0"><span className="block truncate text-[11.5px] font-semibold leading-tight">{s}</span>
                  <span className="block truncate text-[10px] leading-tight opacity-80">{c?.live ? c.live.detail : !planned ? 'not planned' : isPast ? (c.actualEnd ? `done ${fmtDate(c.actualEnd)}` : 'done') : c.next ? `${c.done}/${c.total} · ${c.next.activity} · ${fmtDate(c.next.plannedEnd)}` : `${c.done}/${c.total} · ${RAG_LABEL[rag]}`}</span></span>
                {i === currentIdx && <span className="absolute -top-2 left-2 rounded-full bg-brand px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wide text-white shadow-sm">now</span>}
              </button>
            </div>);
        })}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-stretch gap-y-2.5">
      {order.map((s, i) => {
        const c = byName[s]; const st = stateOf(i); const planned = !!c && c.total > 0;
        const pct = c?.live ? c.live.pct : planned ? Math.round(c.done * 100 / c.total) : 0;
        const prevDone = i > 0 && stateOf(i - 1) === 'done';
        const detail = c?.live ? c.live.detail : !planned ? 'No activities in this stage' : st === 'done' ? (c.actualEnd ? `Completed ${fmtDate(c.actualEnd)}` : 'Completed') : c.next ? `Next: ${c.next.activity} · ${fmtDate(c.next.plannedEnd)}` : `${c.done}/${c.total} done`;
        const openTasks = planned ? c.total - c.done : 0;
        const taskLine = c?.live && planned && c.next && c.live.state !== 'done' ? `Next: ${c.next.activity} · ${fmtDate(c.next.plannedEnd)}` : c?.live && planned && openTasks > 0 && c.rag === 'red' ? `${openTasks} planned activit${openTasks > 1 ? 'ies' : 'y'} overdue` : c?.live && planned && openTasks > 0 ? `${openTasks} planned activit${openTasks > 1 ? 'ies' : 'y'} open` : '';
        return (
          <React.Fragment key={s}>
            {i > 0 && <span className={cn('flex w-7 shrink-0 items-center justify-center', prevDone ? 'text-teal' : 'text-border')}><ChevronRight size={16} /></span>}
            <button type="button" onClick={() => onStage?.(s, c)} disabled={!onStage} title={c?.live?.link ? `Open ${s.toLowerCase()} page` : planned && c.next ? `${c.next.activity} · planned ${fmtDate(c.next.plannedEnd)}` : undefined}
              className={cn('w-[212px] rounded-xl border p-2.5 text-left transition-all', CARD[st], onStage && 'hover:-translate-y-px hover:shadow-card', c?.unlisted && 'border-dashed', st === 'green' && currentIdx >= 0 && i > currentIdx && 'opacity-80')}>
              <div className="flex items-center gap-2">
                <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold', st === 'done' ? 'bg-teal text-white' : st === 'now' ? 'bg-brand text-white' : st === 'red' ? 'bg-bad text-white' : st === 'amber' ? 'bg-gold-vivid text-white' : 'border bg-card text-muted-foreground')}>{st === 'done' ? <Check size={13} /> : i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{s}{c?.unlisted && <span className="ml-1 text-[9px] font-normal uppercase text-muted-foreground">old</span>}</span>
                <span className={cn('shrink-0 rounded-full px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide', STATE_PILL[st])}>{STATE_LABEL[st]}</span>
              </div>
              <div className="mt-1.5 truncate text-[11px] text-muted-foreground">{detail}</div>
              {taskLine && <div className={cn('truncate text-[10px]', c?.rag === 'red' ? 'font-semibold text-bad' : c?.rag === 'amber' ? 'text-gold' : 'text-muted-foreground')}>{taskLine}</div>}
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-black/5 dark:bg-white/10"><div className={cn('h-full rounded-full', st === 'done' ? 'bg-teal' : st === 'red' ? 'bg-bad' : st === 'amber' ? 'bg-gold-vivid' : 'bg-brand')} style={{ width: `${pct}%` }} /></div>
                <span className="font-mono text-[10px] text-muted-foreground">{c?.live ? `${pct}%` : planned ? `${c.done}/${c.total}` : '—'}</span>
              </div>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/** Small progress ring for the order summary panel. */
export function Ring({ pct, tone = 'brand', size = 52 }: { pct: number; tone?: 'brand' | 'bad' | 'warn' | 'ok'; size?: number }) {
  const r = (size - 6) / 2, c = 2 * Math.PI * r; const col = { brand: '#a05aff', bad: '#fe9496', warn: '#f5a33c', ok: '#1bcfb4' }[tone];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-black/5 dark:text-white/10" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(pct, 100) / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-current font-mono text-[12px] font-bold">{pct}%</text>
    </svg>
  );
}

/* ---------- "How TNA works" guide ---------- */
const STEPS: [string, string][] = [
  ['Define the pipeline', 'Stages are the big steps every order passes through (Samples → … → Payment). Set them once under Stages; the board, order pages and the buyer portal follow the list.'],
  ['Keep a template', 'Templates hold the activities inside each stage with lead-time offsets — days after the order date or days before ex-factory. The default template applies to every new order; a buyer template overrides it.'],
  ['Generate the plan on the order', 'When a sample is converted to an order, the TNA is generated automatically (or press Generate TNA). Every activity gets a planned start / end and an owner from the role.'],
  ['Work the modules — actuals fill themselves', 'Raising the fabric PO, receiving at the gate, logging production, passing the final AQL, shipping on board, recording payment: each event completes its activity. You only tick manually what has no module (PP meeting, pattern).'],
  ['Read the colours', 'Green = on track, amber = due within the amber window, red = planned end has passed. A stage shows Done when all its activities are done; the first stage with open work is tagged Now.'],
  ['Replan with a reason', 'Dates and priorities can be moved from Tasks or the order page. A reason is mandatory and the replan history stays on the activity and in the order timeline. Overdue activities also land in My Work and the Alert Center.'],
];
export function TnaGuideButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} title="How the Time & Action plan works"><Info size={14} /> How it works</Button>
      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>How Time &amp; Action works</DialogTitle><DialogDescription>From pipeline to payment in six steps.</DialogDescription></DialogHeader>
          <DialogBody className="space-y-3">
            {STEPS.map(([t, d], i) => (
              <div key={t} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand font-slab text-[12px] font-bold text-white">{i + 1}</span>
                <div><div className="text-[13px] font-semibold">{t}</div><div className="text-[12px] text-muted-foreground">{d}</div></div>
              </div>))}
            <div className="rounded-xl border bg-secondary/60 p-3 text-[12px]"><b>Daily routine:</b> open <b>My Work</b> for your own overdue and due-soon activities → fix or replan them → glance at the <b>Buyer Board</b> to see where every order stands → share the tracking link so the buyer sees the same stages.</div>
          </DialogBody>
          <DialogFooter><Button onClick={() => setOpen(false)}>Got it</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------- stage manager (TNA → Stages) ---------- */
type StageRow = { name: string; portal: boolean; original?: string; tasks: number; open: number; templateItems: number; moveTo?: string; idx?: number };
type StagesResp = { stages: { name: string; portal: boolean; tasks: number; open: number; templateItems: number }[]; unlisted: { name: string; tasks: number; open: number; templateItems: number }[]; defaults: { name: string; portal: boolean }[] };

export function useStages() { return useQuery<StagesResp>({ queryKey: ['/tna', 'stages'], queryFn: async () => (await api.get('/tna/stages')).data, staleTime: 30_000 }); }

export function StagesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { user, hasFlag } = useAuth();
  const canEdit = user?.role === 'Admin' || hasFlag('tna.edit');
  const q = useStages();
  const [rows, setRows] = React.useState<StageRow[]>([]);
  const [removed, setRemoved] = React.useState<StageRow[]>([]);
  const initialised = React.useRef(false);
  React.useEffect(() => { if (!open) { initialised.current = false; return; } if (q.data && !initialised.current) { initialised.current = true; setRows(q.data.stages.map((s) => ({ ...s, original: s.name }))); setRemoved([]); } }, [open, q.data]);
  const save = useMutation({
    mutationFn: async () => (await api.put('/tna/stages', {
      stages: rows.map((r) => ({ name: norm(r.name), portal: r.portal })),
      renames: rows.filter((r) => r.original && r.original !== norm(r.name)).map((r) => ({ from: r.original, to: norm(r.name) })),
      moves: pendingMoves.map((r) => ({ from: r.original, to: r.moveTo })),
    })).data,
    onSuccess: (d: StagesResp & { tasksTouched: number; itemsTouched: number }) => { toast.success(`Pipeline saved · ${d.stages.length} stages${d.tasksTouched || d.itemsTouched ? ` · ${d.tasksTouched} tasks and ${d.itemsTouched} template activities moved` : ''}`); qc.invalidateQueries({ queryKey: ['/tna'] }); qc.invalidateQueries({ queryKey: ['/settings/company'] }); onClose(); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const upd = (i: number, p: Partial<StageRow>) => setRows((cur) => cur.map((r, n) => (n === i ? { ...r, ...p } : r)));
  const move = (i: number, d: number) => setRows((cur) => { const a = [...cur]; const j = i + d; if (j < 0 || j >= a.length) return cur; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const remove = (i: number) => { const r = rows[i]; const rest = rows.filter((_, n) => n !== i); setRows(rest); if (r.original) setRemoved((cur) => [...cur, { ...r, idx: i, moveTo: (rest[i - 1] ?? rest[0])?.name }]); };
  const restore = (r: StageRow) => { setRemoved((cur) => cur.filter((x) => x !== r)); setRows((cur) => { const a = [...cur]; a.splice(Math.min(r.idx ?? a.length, a.length), 0, { ...r, moveTo: undefined, idx: undefined }); return a; }); };
  const norm = (v: string) => v.trim().replace(/\s+/g, ' ');
  const names = rows.map((r) => norm(r.name));
  // a removed stage whose name is typed back in is just kept — no move needed
  const pendingMoves = removed.filter((r) => r.tasks + r.templateItems > 0 && !names.includes(r.original!));
  const dup = names.filter((n, i) => n && names.findIndex((x) => x.toLowerCase() === n.toLowerCase()) !== i);
  const blank = rows.some((r) => !r.name.trim());
  const needMove = pendingMoves.some((r) => !names.includes(norm(r.moveTo || '')) || norm(r.moveTo || '') === r.original);
  const dirty = JSON.stringify(rows.map((r) => [norm(r.name), r.portal])) !== JSON.stringify((q.data?.stages ?? []).map((s) => [s.name, s.portal])) || removed.length > 0;
  const problem = blank ? 'Every stage needs a name' : dup.length ? `“${dup[0]}” appears twice` : !rows.length ? 'Keep at least one stage' : needMove ? 'Choose where the removed stage’s activities go' : '';
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide>
        <DialogHeader><DialogTitle>Pipeline stages</DialogTitle><DialogDescription>The steps every order moves through, left to right. The Buyer Board, order pages, templates and the buyer portal all follow this list. Renaming a stage carries its activities along; removing one asks where its activities should go.</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          {/* live preview */}
          <div className="rounded-xl border bg-secondary/50 px-4 py-3">
            <div className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Preview</div>
            <div className="flex flex-wrap items-center gap-y-2">{rows.map((r, i) => (
              <React.Fragment key={i}>{i > 0 && <span className="mx-1 h-0.5 w-4 rounded-full bg-border" />}
                <span className={cn('flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1 text-[12px] font-semibold', !r.name.trim() && 'border-gold-vivid/70')}><span className="grid h-5 w-5 place-items-center rounded-full bg-brand font-mono text-[10px] text-white">{i + 1}</span>{r.name.trim() || '…'}{!r.portal && <EyeOff size={11} className="text-muted-foreground" />}</span>
              </React.Fragment>))}{!rows.length && <span className="text-[12px] text-muted-foreground">No stages</span>}</div>
          </div>

          <div className="overflow-hidden rounded-xl border">
            <div className="grid grid-cols-[28px_1fr_120px_120px_auto] items-center gap-2 border-b bg-secondary px-3 py-2 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground"><span>#</span><span>Stage</span><span>In use</span><span>Buyer portal</span><span className="w-[92px]" /></div>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[28px_1fr_120px_120px_auto] items-center gap-2 border-b px-3 py-2 last:border-0">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-brand font-mono text-[11px] font-bold text-white">{i + 1}</span>
                <div><Input value={r.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder="Stage name" className={cn('h-9', (!r.name.trim() || dup.includes(r.name.trim())) && 'border-gold-vivid/70')} disabled={!canEdit} />{r.original && r.original !== r.name.trim() && r.name.trim() && <div className="mt-0.5 text-[10.5px] text-teal">renamed from “{r.original}” — its {r.tasks} task{r.tasks === 1 ? '' : 's'} follow</div>}</div>
                <span className="text-[11.5px] text-muted-foreground">{r.original ? `${r.tasks} task${r.tasks === 1 ? '' : 's'}${r.open ? ` · ${r.open} open` : ''}` : <Badge tone="ok" className="text-[10px]">new</Badge>}</span>
                <button type="button" disabled={!canEdit} onClick={() => upd(i, { portal: !r.portal })} className={cn('flex h-8 w-fit items-center gap-1.5 rounded-md border px-2 text-[11.5px] font-semibold', r.portal ? 'border-teal/40 bg-teal-soft text-teal' : 'bg-secondary text-muted-foreground')} title={r.portal ? 'Shown to the buyer on the tracking page' : 'Hidden from the buyer portal (e.g. payment)'}>{r.portal ? <Eye size={12} /> : <EyeOff size={12} />} {r.portal ? 'Shown' : 'Hidden'}</button>
                <span className="flex items-center gap-0.5">
                  <button type="button" disabled={!canEdit || i === 0} onClick={() => move(i, -1)} title="Move up" className="rounded-md border bg-secondary p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown size={13} className="rotate-180" /></button>
                  <button type="button" disabled={!canEdit || i === rows.length - 1} onClick={() => move(i, 1)} title="Move down" className="rounded-md border bg-secondary p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown size={13} /></button>
                  <button type="button" disabled={!canEdit} onClick={() => remove(i)} title="Remove stage" className="rounded-md border bg-secondary p-1.5 text-bad hover:border-bad/40 hover:bg-bad-soft disabled:opacity-30"><Trash size={13} /></button>
                </span>
              </div>))}
            {canEdit && <div className="border-t bg-secondary/40 px-3 py-2"><Button size="sm" variant="secondary" onClick={() => setRows([...rows, { name: '', portal: true, tasks: 0, open: 0, templateItems: 0 }])}><Plus size={13} /> Add stage</Button></div>}
          </div>

          {removed.length > 0 && (
            <div className="rounded-xl border border-bad/30 bg-bad-soft/40 p-3 dark:bg-bad/10">
              <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-bad"><Alert size={14} /> Removed stages</div>
              {removed.map((r, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 py-1 text-[12.5px]">
                  <span className="font-semibold line-through">{r.original}</span>
                  {names.includes(r.original!) ? <span className="text-teal">added back by name — nothing moves</span> : r.tasks + r.templateItems > 0 ? <><span className="text-muted-foreground">{r.tasks} task{r.tasks === 1 ? '' : 's'} · {r.templateItems} template activit{r.templateItems === 1 ? 'y' : 'ies'} → move to</span>
                    <select className="h-8 rounded-md border bg-card px-2 text-[12.5px]" value={r.moveTo || ''} onChange={(e) => setRemoved(removed.map((x) => (x === r ? { ...x, moveTo: e.target.value } : x)))}><option value="">choose…</option>{names.filter((n) => n && n !== r.original).map((n) => <option key={n} value={n}>{n}</option>)}</select></>
                    : <span className="text-muted-foreground">nothing uses it</span>}
                  <button type="button" onClick={() => restore(r)} className="ml-auto flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[11.5px] text-muted-foreground hover:text-foreground"><Refresh size={12} /> Restore</button>
                </div>))}
            </div>)}

          {(q.data?.unlisted.length ?? 0) > 0 && (
            <div className="rounded-xl border border-gold-vivid/40 bg-gold-soft/50 p-3 text-[12px] dark:bg-gold-vivid/10">
              <b>Left over from an earlier pipeline:</b> {q.data!.unlisted.map((u) => `${u.name} (${u.tasks} tasks)`).join(', ')}. They still show on boards under their old name; add the name back or move them via a template edit.
            </div>)}
          {!canEdit && <p className="text-[12px] text-muted-foreground">Read-only — changing the pipeline needs the Admin role or the “Replan TNA” flag.</p>}
        </DialogBody>
        <DialogFooter className="items-center">
          {canEdit && <button type="button" onClick={() => {
            const defaults = q.data?.defaults ?? [];
            const isDefault = (r: StageRow) => defaults.some((s) => s.name === r.original);
            const dropped = rows.filter((r) => r.original && !isDefault(r));   // custom / previously renamed stages leave the pipeline → ask where their activities go
            setRows(defaults.map((s) => { const cur = rows.find((r) => r.original === s.name) || removed.find((r) => r.original === s.name); return cur ? { ...cur, name: s.name, portal: s.portal, moveTo: undefined, idx: undefined } : { name: s.name, portal: s.portal, tasks: 0, open: 0, templateItems: 0 }; }));
            setRemoved([...removed.filter((r) => !isDefault(r)), ...dropped.map((r) => ({ ...r, moveTo: defaults[0]?.name }))]);
          }} className="mr-auto text-[12px] text-muted-foreground hover:text-foreground">Reset to the standard 9 stages</button>}
          {problem && <span className="text-[12px] text-gold">{problem}</span>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {canEdit && <Button disabled={!!problem || !dirty || save.isPending} onClick={() => save.mutate()}><Check size={15} /> Save pipeline</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Header button that opens the manager. */
export function StagesButton({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false);
  const q = useStages();
  return (
    <>
      <Button size="sm" variant="secondary" className={className} onClick={() => setOpen(true)} title="Define the pipeline stages"><SettingsIcon size={14} /> Stages{q.data ? <span className="ml-1 rounded-full bg-brand px-1.5 py-px text-[10px] font-bold text-white">{q.data.stages.length}</span> : null}</Button>
      <StagesDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
