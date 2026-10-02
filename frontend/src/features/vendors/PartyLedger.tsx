import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { fmtN, fmtInr, fmtDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton, Badge } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, EmptyState } from '@/components/shared';
import { Payments, Check, Alert, Jobwork, Po as PoIcon, Trash, Print } from '@/icons/icons';
import { openPrint, companyHead } from '@/features/samples/StyleTools';

/* Money out: what each job-work vendor / material supplier has earned, what we paid and what is still owed. */
export type PartyRow = { id: string; kind: 'vendor' | 'supplier'; name: string; alias: string; category: string; location: string; status: string;
  docs: number; openDocs: number; qty: number; pendingQty: number; lastDoc: { no: string; what: string; date: string } | null;
  lastPayment: { payNo: string; amount?: number; date: string } | null;
  billed?: number; paid?: number; outstanding?: number; overdue?: number; inProgress?: number; money: boolean };
export type LedgerDoc = { kind: string; id: string; no: string; date: string; dueDate?: string; what: string; orderNo: string; styleNo: string;
  qty: number; doneQty: number; pendingQty: number; uom: string; rate?: number; billed?: number; paid?: number; balance?: number; inProgress?: number; status: string };
export type Voucher = { id: string; payNo: string; date: string; method: string; reference: string; note: string; by: string; amount?: number; tdsAmount?: number;
  lines: { kind: string; refNo: string; refId: string; amount?: number }[] };
export type Ledger = { party: { id: string; kind: 'vendor' | 'supplier'; name: string; alias: string; category: string; location: string; gstin?: string; terms: string; status: string };
  docs: LedgerDoc[]; payments: Voucher[]; totals: { billed?: number; paid?: number; outstanding?: number; overdue?: number; inProgress?: number; docs: number; openDocs: number; advances?: number }; money: boolean };
export type PayableSummary = { money: boolean; vendors: Tot; suppliers: Tot; top: { id: string; kind: 'vendor' | 'supplier'; name: string; outstanding: number; overdue: number; openDocs: number }[] };
type Tot = { count: number; billed: number; paid: number; outstanding: number; overdue: number; inProgress: number };
const METHODS = ['Bank transfer', 'NEFT / RTGS', 'UPI', 'Cheque', 'Cash', 'Adjustment'];

export const usePayableSummary = (enabled = true) => useQuery<PayableSummary>({ queryKey: ['/payables', 'summary'], queryFn: async () => (await api.get('/payables/summary')).data, enabled });
export const useParties = (kind: 'vendor' | 'supplier', enabled = true) => useQuery<{ items: PartyRow[]; money: boolean }>({ queryKey: ['/payables', 'parties', kind], queryFn: async () => (await api.get(`/payables/parties?kind=${kind}`)).data, enabled });
export const useLedger = (kind: 'vendor' | 'supplier', id?: string | null) => useQuery<Ledger>({ queryKey: ['/payables', kind, id], queryFn: async () => (await api.get(`/payables/${kind}/${id}`)).data, enabled: !!id });

/** Big "we still owe" strip — vendors and suppliers side by side, overdue in red. */
export function PayableStrip({ onOpen }: { onOpen?: (kind: 'vendor' | 'supplier', id: string) => void }) {
  const q = usePayableSummary();
  const s = q.data;
  if (!s?.money) return null;
  const card = (title: string, t: Tot, icon: React.ReactNode) => (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{icon}{title}</div>
      <div className={cn('num mt-1 font-slab text-[24px] font-bold leading-none', t.outstanding ? 'text-bad' : 'text-teal')}>{fmtInr(t.outstanding)}</div>
      <div className="mt-0.5 text-[11.5px] text-muted-foreground">still to pay · billed {fmtInr(t.billed)} · paid {fmtInr(t.paid)}</div>
      {t.overdue > 0 && <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-bad-soft px-1.5 py-0.5 text-[11px] font-bold text-bad dark:bg-bad/15"><Alert size={12} /> {fmtInr(t.overdue)} overdue &gt; 30 days</div>}
      {t.inProgress > 0 && <div className="mt-1 text-[11px] text-muted-foreground">{fmtInr(t.inProgress)} still running (not billed yet)</div>}
    </div>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
      {card('Job-work vendors', s.vendors, <Jobwork size={13} />)}
      {card('Material suppliers', s.suppliers, <PoIcon size={13} />)}
      <div className="rounded-xl border bg-card p-4 shadow-card">
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-muted-foreground"><span>Waiting for money</span><span className="font-normal normal-case">click to open the ledger</span></div>
        {!s.top.length ? <div className="mt-2 text-[12.5px] text-teal">Nothing outstanding — every challan and PO is settled.</div>
        : <ul className="mt-1.5 space-y-1">{s.top.map((x) => (
          <li key={`${x.kind}-${x.id}`}>
            <button type="button" onClick={() => onOpen?.(x.kind, x.id)} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-secondary">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', x.overdue ? 'bg-bad' : 'bg-gold-vivid')} />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{x.name}<span className="font-normal text-muted-foreground"> · {x.openDocs} open {x.kind === 'vendor' ? 'challan' : 'PO'}{x.openDocs === 1 ? '' : 's'}</span></span>
              <span className={cn('num shrink-0 text-[12.5px] font-bold', x.overdue ? 'text-bad' : 'text-foreground')}>{fmtInr(x.outstanding)}</span>
            </button>
          </li>))}</ul>}
      </div>
    </div>
  );
}

/** Full account of one party: every challan / PO with its balance, and every payment made. */
export function LedgerPanel({ kind, id, onClose }: { kind: 'vendor' | 'supplier'; id: string; onClose?: () => void }) {
  const qc = useQueryClient();
  const q = useLedger(kind, id);
  const [pay, setPay] = React.useState(false);
  const del = useMutation({ mutationFn: async (pid: string) => (await api.delete(`/payables/payment/${pid}`)).data,
    onSuccess: () => { toast.success('Payment removed'); qc.invalidateQueries({ queryKey: ['/payables'] }); }, onError: (e) => toast.error(apiMessage(e)) });
  const d = q.data;
  const print = async () => {
    if (!d) return;
    const head = await companyHead(`Account statement — ${d.party.name}`);
    const esc = (x: unknown) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    openPrint(`Statement ${d.party.name}`, head + `
      <p><small>${esc(d.party.category)}${d.party.location ? ` · ${esc(d.party.location)}` : ''}${d.party.gstin ? ` · GSTIN ${esc(d.party.gstin)}` : ''}${d.party.terms ? ` · ${esc(d.party.terms)}` : ''}</small></p>
      <h2>${kind === 'vendor' ? 'Job work given' : 'Purchase orders'}</h2>
      <table><tr><th>${kind === 'vendor' ? 'Challan' : 'PO'}</th><th>Date</th><th>What</th><th>Order</th><th class="num">Qty</th><th class="num">Done</th><th class="num">Rate</th><th class="num">Billed</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th></tr>
      ${d.docs.map((x) => `<tr><td>${esc(x.no)}</td><td>${fmtDate(x.date)}</td><td>${esc(x.what)}</td><td>${esc(x.orderNo)}</td><td class="num">${fmtN(x.qty)} ${esc(x.uom)}</td><td class="num">${fmtN(x.doneQty)}</td><td class="num">${x.rate ?? ''}</td><td class="num">${fmtInr(x.billed)}</td><td class="num">${fmtInr(x.paid)}</td><td class="num${x.balance ? ' bad' : ''}">${fmtInr(x.balance)}</td><td>${esc(x.status)}</td></tr>`).join('')}
      <tr class="hi"><th colspan="7">Total</th><th class="num">${fmtInr(d.totals.billed)}</th><th class="num">${fmtInr(d.totals.paid)}</th><th class="num">${fmtInr(d.totals.outstanding)}</th><th></th></tr></table>
      <h2>Payments made</h2>
      <table><tr><th>Voucher</th><th>Date</th><th>Method</th><th>Reference</th><th>Against</th><th class="num">Amount</th><th>By</th></tr>
      ${d.payments.map((p) => `<tr><td>${esc(p.payNo)}</td><td>${fmtDate(p.date)}</td><td>${esc(p.method)}</td><td>${esc(p.reference)}</td><td>${p.lines.map((l) => esc(l.refNo)).join(', ')}</td><td class="num">${fmtInr(p.amount)}</td><td>${esc(p.by)}</td></tr>`).join('') || '<tr><td colspan="7">No payment recorded</td></tr>'}</table>
      <div class="sign"><div>Accounts</div><div>Approved by</div></div>`);
  };
  if (q.isLoading || !d) return <Card><CardContent className="space-y-2 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /></CardContent></Card>;
  const t = d.totals;
  return (
    <Card className="border-brand/40">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle>{d.party.name} — account</CardTitle>
          <p className="text-xs text-muted-foreground">{d.party.category}{d.party.location ? ` · ${d.party.location}` : ''}{d.party.gstin ? ` · GSTIN ${d.party.gstin}` : ''}{d.party.terms ? ` · ${d.party.terms}` : ''} · {t.docs} {kind === 'vendor' ? 'challan' : 'PO'}{t.docs === 1 ? '' : 's'}, {t.openDocs} unpaid</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={print}><Print size={14} /> Statement</Button>
          {d.money && <Button size="sm" onClick={() => setPay(true)}><Payments size={14} /> Record payment</Button>}
          {onClose && <Button size="sm" variant="secondary" onClick={onClose}>Close</Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {d.money && <div className="grid gap-2 sm:grid-cols-4">
          {[['Work billed', fmtInr(t.billed), ''], ['Paid', fmtInr(t.paid), 'text-teal'], ['Still to pay', fmtInr(t.outstanding), t.outstanding ? 'text-bad' : 'text-teal'], ['Running (not billed)', fmtInr(t.inProgress), 'text-muted-foreground']].map(([k, v, cls]) => (
            <div key={k} className={cn('rounded-lg border px-3 py-2', k === 'Still to pay' && (t.outstanding ? 'border-bad/40 bg-bad-soft/50 dark:bg-bad/10' : 'border-teal/40 bg-teal-soft/40 dark:bg-teal/10'))}>
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{k}</div><div className={cn('num text-[17px] font-bold', cls)}>{v}</div></div>))}
        </div>}

        <div className="overflow-hidden rounded-xl border">
          <div className="border-b bg-secondary px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{kind === 'vendor' ? 'Work given · challan wise' : 'Material bought · PO wise'}</div>
          {!d.docs.length ? <div className="px-4 py-5 text-[12.5px] text-muted-foreground">Nothing given to this {kind} yet.</div>
          : <div className="divide-y">{d.docs.map((x) => (
            <div key={x.id} className={cn('grid gap-2 px-4 py-2.5 lg:grid-cols-[minmax(190px,1.3fr)_repeat(3,minmax(84px,1fr))_110px]', (x.balance ?? 0) > 0 && 'bg-bad-soft/25 dark:bg-bad/5')}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5"><span className="font-mono text-[12.5px] font-bold">{x.no}</span><Badge tone={x.status === 'Received' || x.status === 'Closed' ? 'ok' : x.status === 'Cancelled' ? 'mute' : 'brand'} className="text-[9px]">{x.status}</Badge></div>
                <div className="truncate text-[12px]">{x.what}</div>
                <div className="text-[11px] text-muted-foreground">{fmtDate(x.date)}{x.orderNo ? ` · ${x.orderNo}` : ''}{x.dueDate ? ` · due ${fmtDate(x.dueDate)}` : ''}</div>
              </div>
              <Cell k="Given" v={`${fmtN(x.qty)} ${x.uom}`} sub={x.pendingQty ? `${fmtN(x.pendingQty)} pending` : 'complete'} />
              <Cell k={kind === 'vendor' ? 'Done' : 'Received'} v={`${fmtN(x.doneQty)} ${x.uom}`} sub={x.rate ? `@ ${fmtInr(x.rate)}` : ''} />
              <Cell k="Billed" v={fmtInr(x.billed)} sub={x.paid ? `paid ${fmtInr(x.paid)}` : d.money ? 'nothing paid' : ''} />
              <div className="lg:text-right">
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Balance</div>
                <div className={cn('num text-[15px] font-bold', (x.balance ?? 0) > 0 ? 'text-bad' : 'text-teal')}>{(x.balance ?? 0) > 0 ? fmtInr(x.balance) : d.money ? 'settled' : '—'}</div>
              </div>
            </div>))}</div>}
        </div>

        <div className="overflow-hidden rounded-xl border">
          <div className="border-b bg-secondary px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Payments made</div>
          {!d.payments.length ? <div className="px-4 py-4 text-[12.5px] text-muted-foreground">No payment recorded yet.</div>
          : <div className="divide-y">{d.payments.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-[12.5px]">
              <span className="font-mono font-bold">{p.payNo}</span>
              <span className="text-muted-foreground">{fmtDate(p.date)} · {p.method}{p.reference ? ` · ${p.reference}` : ''}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">against {p.lines.map((l) => l.refNo).join(', ')}{p.note ? ` · ${p.note}` : ''}</span>
              <span className="num font-bold text-teal">{fmtInr(p.amount)}</span>
              {p.tdsAmount ? <span className="text-[11px] text-muted-foreground">TDS {fmtInr(p.tdsAmount)}</span> : null}
              {d.money && <Button size="sm" variant="ghost" className="h-7 px-2 text-bad" title="Remove this payment" onClick={() => del.mutate(p.id)}><Trash size={13} /></Button>}
            </div>))}</div>}
        </div>
      </CardContent>
      {pay && <PayDialog ledger={d} onClose={() => setPay(false)} />}
    </Card>
  );
}
const Cell = ({ k, v, sub }: { k: string; v: string; sub?: string }) => (
  <div className="lg:text-right"><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{k}</div><div className="num text-[13px] font-semibold">{v}</div>{sub ? <div className="truncate text-[10.5px] text-muted-foreground">{sub}</div> : null}</div>
);

/** Record money paid out — the oldest unpaid documents are filled in for you, every line editable. */
export function PayDialog({ ledger, preset, onClose }: { ledger: Ledger; preset?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const open = ledger.docs.filter((d) => (d.balance ?? 0) > 0).sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const [f, setF] = React.useState({ date: new Date().toISOString().slice(0, 10), method: 'Bank transfer', reference: '', tdsAmount: 0, note: '' });
  const [alloc, setAlloc] = React.useState<Record<string, number>>(() => {
    if (preset) { const d = open.find((x) => x.id === preset); return d ? { [d.id]: d.balance ?? 0 } : {}; }
    return Object.fromEntries(open.map((d) => [d.id, d.balance ?? 0]));
  });
  const amount = Math.round(Object.values(alloc).reduce((a, v) => a + (+v || 0), 0) * 100) / 100;
  const save = useMutation({
    mutationFn: async () => (await api.post('/payables/pay', { partyKind: ledger.party.kind, partyId: ledger.party.id, ...f, amount,
      lines: Object.entries(alloc).filter(([, v]) => +v > 0).map(([refId, a]) => ({ refId, amount: +a })) })).data,
    onSuccess: () => { toast.success(`${fmtInr(amount)} paid to ${ledger.party.name}`); ['/payables', '/jobwork', '/po'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onClose(); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide>
        <DialogHeader><DialogTitle>Pay {ledger.party.name}</DialogTitle>
          <DialogDescription>Tick off what this payment settles — the oldest bills are filled in first. Outstanding today: <b>{fmtInr(ledger.totals.outstanding)}</b>.</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Payment date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Method"><Select value={f.method} onValueChange={(v) => setF({ ...f, method: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Reference (UTR / cheque)"><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
            <Field label="TDS deducted (₹)"><Input type="number" value={f.tdsAmount || ''} onChange={(e) => setF({ ...f, tdsAmount: +e.target.value || 0 })} /></Field>
            <Field label="Note"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="part payment, advance…" /></Field>
          </div>
          <div className="overflow-hidden rounded-xl border">
            <div className="flex items-center justify-between border-b bg-secondary px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <span>Settle these bills</span>
              <span className="flex gap-2 font-normal normal-case">
                <button type="button" className="text-brand hover:underline" onClick={() => setAlloc(Object.fromEntries(open.map((d) => [d.id, d.balance ?? 0])))}>all</button>
                <button type="button" className="text-brand hover:underline" onClick={() => setAlloc({})}>none</button>
              </span>
            </div>
            {!open.length ? <div className="px-4 py-4 text-[12.5px] text-teal">Nothing pending — everything is settled.</div>
            : <div className="divide-y">{open.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-[12.5px]">
                <span className="font-mono font-bold">{d.no}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.what}{d.orderNo ? ` · ${d.orderNo}` : ''} · {fmtN(d.doneQty)} {d.uom} @ {fmtInr(d.rate)}</span>
                <span className="text-muted-foreground">balance <b className="num text-foreground">{fmtInr(d.balance)}</b></span>
                <Input type="number" className="h-8 w-32 text-right" value={alloc[d.id] ?? ''} placeholder="0"
                  onChange={(e) => setAlloc({ ...alloc, [d.id]: Math.min(+e.target.value || 0, d.balance ?? 0) })} />
              </div>))}</div>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-secondary/60 px-4 py-3">
            <span className="text-[12.5px] text-muted-foreground">Paying now</span>
            <span className="num font-slab text-[22px] font-bold">{fmtInr(amount)}</span>
          </div>
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={save.isPending || amount <= 0} onClick={() => save.mutate()}><Check size={15} /> Record payment</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Small "₹x pending" chip used in tables. */
export const DueChip = ({ amount, className }: { amount?: number; className?: string }) => {
  if (amount == null) return <span className="text-muted-foreground">—</span>;
  return amount > 0
    ? <span className={cn('inline-flex items-center gap-1 rounded-md bg-bad-soft px-1.5 py-0.5 text-[11.5px] font-bold text-bad dark:bg-bad/15', className)}><Alert size={11} /> {fmtInr(amount)}</span>
    : <span className={cn('inline-flex items-center gap-1 rounded-md bg-teal-soft px-1.5 py-0.5 text-[11.5px] font-semibold text-teal dark:bg-teal/15', className)}><Check size={11} /> settled</span>;
};

/** Standalone page used by the Job Work / Vendors pages when a party is opened from a link. */
export function PartyLedgerCard({ kind, id, onClose }: { kind: 'vendor' | 'supplier'; id: string; onClose?: () => void }) {
  return <LedgerPanel kind={kind} id={id} onClose={onClose} />;
}
export { EmptyState, Link };
