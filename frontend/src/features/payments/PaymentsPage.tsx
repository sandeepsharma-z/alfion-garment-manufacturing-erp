import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useList, fmtN, fmtInr, fmtDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton, Table, THead, TBody, Tr, Th, Td, Badge } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader, KpiTile, Toolbar, Field, StatusPill, EmptyState, Bar, OrderLink } from '@/components/shared';
import { AlertStrip } from '@/components/AlertStrip';
import { Payments as PayIcon, Alert, Clock, Check, Plus, Eye, Print } from '@/icons/icons';

export type Payment = { id: string; invoiceNo: string; orderId: string; orderNo: string; buyerName: string; invoiceDate?: string; amount?: number; currency: string; method: string; bank: string; terms: string; reference: string; dueDate?: string;
  receivedTotal?: number; pending?: number; receivedPct: number; status: string; displayStatus: string; overdue: boolean; realisationDays: number | null; bankCharges?: number;
  receipts: { amount?: number; fxRate?: number; bank: string; creditDate: string; reference: string; charges?: number; remarks: string; by: string }[]; milestones: { key: string; title: string; detail?: string; at?: string; done: boolean }[] };
type Summary = { receivedFY?: number; outstanding?: number; openInvoices: number; overdue: number; lcUnderNegotiation: number; lcOpen: string[]; avgRealisationDays: number | null; lcDays: number | null; ttDays: number | null; byMethod?: Record<string, number> };
type Meta = { methods: string[]; banks: string[] };
const CHIPS = ['All', 'LC', 'T/T', 'Awaited', 'Partial', 'Overdue', 'Received'];

export default function PaymentsPage() {
  const { hasFlag } = useAuth();
  const money = hasFlag('rates.view') || hasFlag('reports.financial');
  const [q, setQ] = React.useState('');
  const [chip, setChip] = React.useState('All');
  const [rec, setRec] = React.useState<Payment | null>(null);
  const [view, setView] = React.useState<Payment | null>(null);
  const list = useList<Payment>('/payments', { size: 500 });
  const sum = useQuery<Summary>({ queryKey: ['/payments', 'summary'], queryFn: async () => (await api.get('/payments/summary')).data });
  const all = list.data?.items ?? [];
  const rows = all.filter((p) => (!q || `${p.invoiceNo} ${p.orderNo} ${p.buyerName} ${p.reference}`.toLowerCase().includes(q.toLowerCase())) && (chip === 'All' || p.method === chip || p.displayStatus === chip));
  const s = sum.data;
  const bm = s?.byMethod ?? {};
  const bmMax = Math.max(...Object.values(bm), 1);
  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Payments (LC / T-T)" sub="One tracker per export invoice. Payment pending = invoice − Σ receipts. LC milestones from receipt of the credit to funds credited; realisation days feed the reports.">
        <Button onClick={() => { const p = all.find((x) => x.status !== 'Received'); if (p) setRec(p); else toast.info('Nothing pending'); }}><Plus size={17} /> Record Receipt</Button>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={PayIcon} label="Received this FY" value={money ? fmtInr(s?.receivedFY) : '—'} tone="teal" foot="credited receipts since 1 April" />
        <KpiTile icon={Alert} label="Outstanding" value={money ? fmtInr(s?.outstanding) : `${s?.openInvoices ?? '—'} open`} tone={s?.overdue ? 'bad' : 'gold'} foot={`${s?.openInvoices ?? 0} invoices open · ${s?.overdue ?? 0} overdue`} />
        <KpiTile icon={Clock} label="LC Under Negotiation" value={s?.lcUnderNegotiation ?? '—'} tone="info" foot={s?.lcOpen.slice(0, 2).join(' · ') || 'no open LCs'} />
        <KpiTile icon={Check} label="Avg Realisation" value={s?.avgRealisationDays == null ? '—' : `${s.avgRealisationDays} d`} tone="brand" foot={`LC ${s?.lcDays ?? '—'} · T/T ${s?.ttDays ?? '—'} days`} />
      </div>
      <AlertStrip module="payments" />
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <Toolbar q={q} setQ={setQ} placeholder="Search invoice, order, buyer, LC…" chips={CHIPS} chip={chip} setChip={setChip} />
          {list.isLoading ? <div className="space-y-3 p-5">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
          : !rows.length ? <EmptyState title="No payment trackers" text="A tracker opens automatically when an export invoice is created." />
          : <Table>
            <THead><Tr className="hover:bg-transparent"><Th>Invoice / Order</Th>{money && <Th className="text-right">Invoice</Th>}<Th>Method</Th><Th>Bank &amp; terms</Th><Th>Reference</Th><Th>Due</Th><Th className="w-32">Received</Th><Th>Status</Th><Th /></Tr></THead>
            <TBody>{rows.map((p) => (
              <Tr key={p.id} className={cn('cursor-pointer', p.overdue && 'bg-bad-soft/40 dark:bg-bad/5')} onClick={() => setView(p)}>
                <Td><div className="font-mono text-xs font-bold">{p.invoiceNo}</div><div className="text-[11px] text-muted-foreground"><OrderLink id={p.orderId} className="text-brand hover:underline" onClick={(e) => e.stopPropagation()}>{p.orderNo}</OrderLink> · {p.buyerName}</div></Td>
                {money && <Td className="num text-right">{fmtInr(p.amount)}<div className="text-[10px] text-muted-foreground">{p.pending ? `${fmtInr(p.pending)} pending` : 'realised'}</div></Td>}
                <Td><Badge tone={p.method === 'LC' ? 'brand' : 'info'}>{p.method}</Badge></Td><Td className="text-xs">{p.bank || '—'}<div className="text-[10.5px] text-muted-foreground">{p.terms}</div></Td>
                <Td className="font-mono text-xs">{p.reference || '—'}</Td><Td className={cn('text-xs', p.overdue && 'font-semibold text-bad')}>{fmtDate(p.dueDate)}</Td>
                <Td><Bar pct={p.receivedPct} tone={p.receivedPct >= 100 ? 'ok' : p.overdue ? 'bad' : 'brand'} /></Td><Td><StatusPill value={p.displayStatus} /></Td>
                <Td><div className="flex gap-1">{p.status !== 'Received' && money && <Button size="sm" onClick={(e) => { e.stopPropagation(); setRec(p); }}>Record</Button>}<Button size="sm" variant="secondary"><Eye size={13} /></Button></div></Td>
              </Tr>))}</TBody>
          </Table>}
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Receipts by method</CardTitle><p className="text-xs text-muted-foreground">Credited amounts vs what is still pending</p></div></CardHeader>
          <CardContent className="space-y-3">
            {!money ? <div className="text-xs text-muted-foreground">Amounts are restricted to users with the rates / financial flag.</div>
            : Object.keys(bm).length === 0 ? <div className="text-xs text-muted-foreground">No receipts yet.</div>
            : Object.entries(bm).map(([k, v]) => (
              <div key={k} className="text-[12px]"><div className="flex justify-between"><span className="font-semibold">{k}</span><span className="num text-muted-foreground">{fmtInr(v)}</span></div><div className="mt-0.5 h-2 overflow-hidden rounded-full bg-secondary"><div className={cn('h-full rounded-full', k === 'Pending' ? 'bg-bad' : k === 'LC' ? 'bg-brand' : 'bg-teal')} style={{ width: `${v / bmMax * 100}%` }} /></div></div>))}
          </CardContent>
        </Card>
      </div>
      <ReceiptDialog p={rec} onClose={() => setRec(null)} />
      <PaymentDetail p={view ? all.find((x) => x.id === view.id) ?? view : null} onClose={() => setView(null)} onRecord={(p) => { setView(null); setRec(p); }} />
    </div>
  );
}

/* ---------- record receipt (C10) ---------- */
function ReceiptDialog({ p, onClose }: { p: Payment | null; onClose: () => void }) {
  const qc = useQueryClient();
  const meta = useQuery<Meta>({ queryKey: ['/payments/meta'], queryFn: async () => (await api.get('/payments/meta')).data, enabled: !!p });
  const [f, setF] = React.useState({ amount: 0, fxRate: 83.5, bank: '', creditDate: new Date().toISOString().slice(0, 10), reference: '', charges: 0, remarks: '' });
  React.useEffect(() => { if (p) setF((x) => ({ ...x, amount: p.pending ?? 0, bank: p.bank || '' })); }, [p]);
  const post = useMutation({ mutationFn: async () => (await api.post(`/payments/${p!.id}/receipt`, f)).data,
    onSuccess: (r: Payment) => { toast.success(r.status === 'Received' ? `Receipt recorded · ${r.invoiceNo} fully realised — order marked for closure` : `Receipt recorded · ${fmtInr(r.pending)} still pending`); ['/payments', '/orders', '/alerts', '/tna', '/mywork'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onClose(); }, onError: (e) => toast.error(apiMessage(e)) });
  if (!p) return null;
  const over = f.amount > (p.pending ?? 0);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record Payment Receipt</DialogTitle><DialogDescription>{p.invoiceNo} · {p.orderNo} · {p.buyerName} · invoice {fmtInr(p.amount)} · received {fmtInr(p.receivedTotal)} · <b>pending {fmtInr(p.pending)}</b></DialogDescription></DialogHeader>
        <DialogBody><div className="grid gap-4 sm:grid-cols-2">
          <Field label="Method"><Input readOnly value={p.method} /></Field>
          <Field label="Amount received (₹)"><Input type="number" className={cn(over && 'border-bad')} value={f.amount || ''} onChange={(e) => setF({ ...f, amount: +e.target.value })} /></Field>
          <Field label="Exchange rate (₹ / $)"><Input type="number" step="0.01" value={f.fxRate || ''} onChange={(e) => setF({ ...f, fxRate: +e.target.value })} /></Field>
          <Field label="Bank"><Select value={f.bank || 'none'} onValueChange={(v) => setF({ ...f, bank: v === 'none' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">—</SelectItem>{[...new Set([...(meta.data?.banks ?? []), p.bank].filter(Boolean))].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Credit date"><Input type="date" value={f.creditDate} onChange={(e) => setF({ ...f, creditDate: e.target.value })} /></Field>
          <Field label="Reference / BRC / FIRC no"><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="BRC-2026-0117" /></Field>
          <Field label="Bank charges (₹)"><Input type="number" value={f.charges || ''} onChange={(e) => setF({ ...f, charges: +e.target.value })} /></Field>
          <Field label="Remarks"><Input value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} /></Field>
        </div>{over && <div className="mt-3 text-[12.5px] font-semibold text-bad">Cannot record {fmtInr(f.amount)} — only {fmtInr(p.pending)} is pending against this invoice.</div>}</DialogBody>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!(f.amount > 0) || over || post.isPending} onClick={() => post.mutate()}><Check size={15} /> Record Receipt</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- detail: receipts + milestones ---------- */
function PaymentDetail({ p, onClose, onRecord }: { p: Payment | null; onClose: () => void; onRecord: (p: Payment) => void }) {
  const qc = useQueryClient();
  const { hasFlag } = useAuth();
  const money = hasFlag('rates.view') || hasFlag('reports.financial');
  const [ms, setMs] = React.useState({ key: '', detail: '', at: new Date().toISOString().slice(0, 10), reference: '', bank: '' });
  const act = useMutation({ mutationFn: async ({ url, body }: { url: string; body?: unknown }) => (await api.post(url, body ?? {})).data, onSuccess: () => { toast.success('Updated'); ['/payments', '/orders', '/tna'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); }, onError: (e) => toast.error(apiMessage(e)) });
  React.useEffect(() => { if (p) setMs((x) => ({ ...x, key: p.milestones.find((m) => !m.done)?.key || '' })); }, [p]);
  if (!p) return null;
  const printVoucher = () => {
    const w = window.open('', '_blank'); if (!w) return toast.error('Pop-up blocked');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt voucher ${p.invoiceNo}</title><style>body{font:13px Arial;margin:32px}table{border-collapse:collapse;width:100%;margin-top:12px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f5f6f8}.num{text-align:right}</style></head><body><h2>Receipt voucher — ${p.invoiceNo}</h2><p>${p.orderNo} · ${p.buyerName} · ${p.method} · ${p.bank} · ${p.reference}</p>
      <table><tr><th>Date</th><th>Reference</th><th>Bank</th><th class="num">Amount ₹</th><th class="num">FX</th><th class="num">Charges ₹</th></tr>${p.receipts.map((r) => `<tr><td>${fmtDate(r.creditDate)}</td><td>${r.reference || '—'}</td><td>${r.bank}</td><td class="num">${(r.amount ?? 0).toLocaleString('en-IN')}</td><td class="num">${r.fxRate ?? ''}</td><td class="num">${(r.charges ?? 0).toLocaleString('en-IN')}</td></tr>`).join('')}</table>
      <p>Invoice ${fmtInr(p.amount)} · received ${fmtInr(p.receivedTotal)} · pending ${fmtInr(p.pending)}</p><script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`); w.document.close();
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent wide>
        <DialogHeader><DialogTitle className="flex flex-wrap items-center gap-2">{p.invoiceNo} <StatusPill value={p.displayStatus} /><Badge tone={p.method === 'LC' ? 'brand' : 'info'}>{p.method}</Badge></DialogTitle>
          <DialogDescription>{p.orderNo} · {p.buyerName} · {p.bank || 'bank —'} · {p.terms} · {p.reference}{money ? ` · invoice ${fmtInr(p.amount)} · pending ${fmtInr(p.pending)}` : ''} · due {fmtDate(p.dueDate)}{p.realisationDays != null ? ` · realised in ${p.realisationDays} days` : ''}</DialogDescription></DialogHeader>
        <DialogBody className="grid gap-5 lg:grid-cols-2">
          <div className="overflow-hidden rounded-xl border">
            <div className="border-b bg-secondary px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{p.method === 'LC' ? 'LC milestones' : 'Payment milestones'}</div>
            <div className="relative m-4 pl-6 before:absolute before:bottom-1 before:left-2 before:top-1 before:w-0.5 before:bg-border">{p.milestones.map((m, i) => (
              <div key={m.key} className="relative pb-3.5 last:pb-0"><span className={cn('absolute -left-[22px] top-1 h-[11px] w-[11px] rounded-full border-2 bg-card', m.done ? 'border-teal bg-teal' : p.milestones.findIndex((x) => !x.done) === i ? 'border-brand bg-brand ring-4 ring-brand/15' : 'border-border')} />
                <div className={cn('text-[12.5px] font-semibold', !m.done && 'text-muted-foreground')}>{m.title}{m.done && <span className="ml-1 text-[10.5px] font-normal text-muted-foreground">· {fmtDate(m.at)}</span>}</div>{m.detail && <div className="text-[11px] text-muted-foreground">{m.detail}</div>}</div>))}</div>
            {p.status !== 'Received' && <div className="space-y-2 border-t bg-secondary/60 p-3"><div className="grid grid-cols-2 gap-2">
              <Select value={ms.key} onValueChange={(v) => setMs({ ...ms, key: v })}><SelectTrigger className="h-8"><SelectValue placeholder="milestone" /></SelectTrigger><SelectContent>{p.milestones.filter((m) => !m.done && m.key !== 'credited').map((m) => <SelectItem key={m.key} value={m.key}>{m.title}</SelectItem>)}</SelectContent></Select>
              <Input type="date" className="h-8" value={ms.at} onChange={(e) => setMs({ ...ms, at: e.target.value })} /><Input className="h-8 col-span-2" value={ms.detail} onChange={(e) => setMs({ ...ms, detail: e.target.value })} placeholder="detail — HSBC · 60 days from BL · amendment: shipment date extended…" />
              {ms.key === 'lc_received' && <><Input className="h-8" value={ms.reference} onChange={(e) => setMs({ ...ms, reference: e.target.value })} placeholder="LC number" /><Input className="h-8" value={ms.bank} onChange={(e) => setMs({ ...ms, bank: e.target.value })} placeholder="bank" /></>}</div>
              <Button size="sm" disabled={!ms.key || act.isPending} onClick={() => act.mutate({ url: `/payments/${p.id}/milestone`, body: ms })}><Check size={13} /> Mark done</Button></div>}
          </div>
          <div className="overflow-hidden rounded-xl border">
            <div className="border-b bg-secondary px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Receipts · {p.receipts.length}</div>
            {!p.receipts.length ? <div className="px-4 py-5 text-center text-sm text-muted-foreground">Nothing received yet.</div>
            : <Table><THead><Tr className="hover:bg-transparent"><Th>Date</Th><Th>Reference</Th><Th>Bank</Th>{money && <><Th className="text-right">Amount</Th><Th className="text-right">FX</Th><Th className="text-right">Charges</Th></>}</Tr></THead>
              <TBody>{p.receipts.map((r, i) => <Tr key={i}><Td className="text-xs">{fmtDate(r.creditDate)}</Td><Td className="font-mono text-xs">{r.reference || '—'}</Td><Td className="text-xs">{r.bank}</Td>{money && <><Td className="num text-right font-semibold text-teal">{fmtInr(r.amount)}</Td><Td className="num text-right text-xs">{r.fxRate || '—'}</Td><Td className="num text-right text-xs">{r.charges ? fmtN(r.charges) : '—'}</Td></>}</Tr>)}</TBody></Table>}
            {money && <div className="border-t px-4 py-2 text-[12px]"><Bar pct={p.receivedPct} tone={p.receivedPct >= 100 ? 'ok' : 'brand'} /><div className="mt-1 text-muted-foreground">received {fmtInr(p.receivedTotal)} of {fmtInr(p.amount)} · bank charges {fmtInr(p.bankCharges)}</div></div>}
          </div>
        </DialogBody>
        <DialogFooter className="flex-wrap"><Button variant="secondary" onClick={onClose}>Close</Button><Button variant="secondary" asChild><Link to={`/orders/${p.orderId}`}>{p.orderNo}</Link></Button>{p.receipts.length > 0 && money && <Button variant="secondary" onClick={printVoucher}><Print size={15} /> Voucher</Button>}{p.status !== 'Received' && money && <Button onClick={() => onRecord(p)}><Plus size={15} /> Record Receipt</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
