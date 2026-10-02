import * as React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtN, fmtInr, fmtDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton, Badge } from '@/components/ui/misc';
import { Payments, Alert, Check, Orders, Ship, Print } from '@/icons/icons';
import { openPrint, companyHead } from '@/features/samples/StyleTools';

/* Money in: what each buyer's orders are worth, what is invoiced, what came in and what is still to come. */
export type BuyerRow = { id: string; name: string; alias: string; country: string; currency: string; terms: string; status: string; money: boolean;
  orders: number; liveOrders: number; liveQty: number; invoices: number; openInvoices: number;
  orderValue?: number; liveValue?: number; invoiced?: number; received?: number; advance?: number; outstanding?: number; overdue?: number; toInvoice?: number;
  nextShip: { orderNo: string; date: string } | null; lastReceipt: { invoiceNo: string; date: string; amount?: number } | null };
export type ReceivableSummary = { money: boolean; buyers: number; liveOrders: number; liveQty: number; openInvoices: number;
  liveValue: number; invoiced: number; received: number; advance: number; outstanding: number; overdue: number; toInvoice: number;
  top: { id: string; name: string; outstanding: number; overdue: number; toInvoice: number; openInvoices: number }[] };
type AccOrder = { id: string; orderNo: string; styleNo: string; description: string; qty: number; stage: string; status: string; shipDate?: string;
  buyerPoNo?: string; currency: string; invoices: number; value?: number; valueFx?: number; invoiced?: number; received?: number; balance?: number; toInvoice?: number };
type AccInvoice = { id: string; invoiceNo: string; orderNo: string; invoiceDate: string; dueDate?: string; method: string; currency: string; bank?: string;
  reference?: string; displayStatus: string; overdue: boolean; amount?: number; receivedTotal?: number; pending?: number; receivedPct: number;
  receipts: { amount?: number; creditDate: string; bank?: string; reference?: string; by?: string }[] };
export type BuyerAccount = { buyer: { id: string; name: string; alias: string; country: string; currency: string; terms: string; status: string; legalName?: string;
    contact?: { name: string; role: string; email: string; phone: string } | null };
  orders: AccOrder[]; invoices: AccInvoice[]; money: boolean;
  totals: { orders: number; liveOrders: number; liveQty: number; invoices: number; openInvoices: number;
    orderValue?: number; liveValue?: number; invoiced?: number; received?: number; advance?: number; outstanding?: number; overdue?: number; toInvoice?: number } };

export const useReceivableSummary = () => useQuery<ReceivableSummary>({ queryKey: ['/buyers', 'accounts', 'summary'], queryFn: async () => (await api.get('/buyers/accounts/summary')).data });
export const useBuyerAccounts = () => useQuery<{ items: BuyerRow[]; money: boolean }>({ queryKey: ['/buyers', 'accounts'], queryFn: async () => (await api.get('/buyers/accounts')).data });
export const useBuyerAccount = (id?: string | null) => useQuery<BuyerAccount>({ queryKey: ['/buyers', 'account', id], queryFn: async () => (await api.get(`/buyers/${id}/account`)).data, enabled: !!id });

/** Chip for money still to come — red when pending, teal when nothing is left. */
export const DueIn = ({ amount, empty }: { amount?: number; empty?: string }) => {
  if (amount == null) return <span className="text-[11.5px] text-muted-foreground">{empty ?? '—'}</span>;
  return amount > 0
    ? <span className="inline-flex items-center gap-1 rounded-md bg-bad-soft px-1.5 py-0.5 text-[11.5px] font-bold text-bad dark:bg-bad/15"><Alert size={11} /> {fmtInr(amount)}</span>
    : <span className="inline-flex items-center gap-1 rounded-md bg-teal-soft px-1.5 py-0.5 text-[11.5px] font-semibold text-teal dark:bg-teal/15"><Check size={11} /> all received</span>;
};

/** Headline strip — what is still to be received, the live order book, and who we are waiting on. */
export function ReceivableStrip({ onOpen }: { onOpen?: (id: string) => void }) {
  const s = useReceivableSummary().data;
  if (!s?.money) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
      <div className="rounded-xl border bg-card p-4 shadow-card">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"><Payments size={13} /> Still to receive</div>
        <div className={cn('num mt-1 font-slab text-[24px] font-bold leading-none', s.outstanding ? 'text-bad' : 'text-teal')}>{fmtInr(s.outstanding)}</div>
        <div className="mt-0.5 text-[11.5px] text-muted-foreground">invoiced {fmtInr(s.invoiced)} · received {fmtInr(s.received)}</div>
        {s.overdue > 0 && <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-bad-soft px-1.5 py-0.5 text-[11px] font-bold text-bad dark:bg-bad/15"><Alert size={12} /> {fmtInr(s.overdue)} past the due date</div>}
        {s.advance > 0 && <div className="mt-1 text-[11px] text-teal">{fmtInr(s.advance)} advance / part payment already in</div>}
      </div>
      <div className="rounded-xl border bg-card p-4 shadow-card">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"><Orders size={13} /> Live order book</div>
        <div className="num mt-1 font-slab text-[24px] font-bold leading-none text-brand">{fmtInr(s.liveValue)}</div>
        <div className="mt-0.5 text-[11.5px] text-muted-foreground">{s.liveOrders} open order{s.liveOrders === 1 ? '' : 's'} · {fmtN(s.liveQty)} pcs</div>
        {s.toInvoice > 0 && <div className="mt-1 text-[11px] text-muted-foreground">{fmtInr(s.toInvoice)} still to be invoiced (not shipped yet)</div>}
      </div>
      <div className="rounded-xl border bg-card p-4 shadow-card">
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-muted-foreground"><span>Waiting for money</span><span className="font-normal normal-case">click to open the account</span></div>
        {!s.top.length ? <div className="mt-2 text-[12.5px] text-teal">Nothing pending — every invoice is realised.</div>
        : <ul className="mt-1.5 space-y-1">{s.top.map((x) => (
          <li key={x.id}>
            <button type="button" onClick={() => onOpen?.(x.id)} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-secondary">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', x.overdue ? 'bg-bad' : x.outstanding ? 'bg-gold-vivid' : 'bg-info')} />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{x.name}<span className="font-normal text-muted-foreground"> · {x.outstanding ? `${x.openInvoices} open invoice${x.openInvoices === 1 ? '' : 's'}` : 'order book, not invoiced yet'}</span></span>
              <span className={cn('num text-[12.5px] font-bold', x.outstanding ? 'text-bad' : 'text-muted-foreground')}>{fmtInr(x.outstanding || x.toInvoice)}</span>
            </button>
          </li>))}</ul>}
      </div>
    </div>
  );
}

const Cell = ({ k, v, sub, cls }: { k: string; v: React.ReactNode; sub?: string; cls?: string }) => (
  <div className="lg:text-right"><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{k}</div>
    <div className={cn('num text-[13px] font-semibold', cls)}>{v}</div>{sub ? <div className="text-[10.5px] text-muted-foreground">{sub}</div> : null}</div>
);

/** Full account of one buyer: every order with its value and billing, every invoice with its receipts. */
export function BuyerAccountPanel({ id, onClose }: { id: string; onClose?: () => void }) {
  const q = useBuyerAccount(id);
  const d = q.data;
  const print = async () => {
    if (!d) return;
    const head = await companyHead(`Buyer account — ${d.buyer.name}`);
    const esc = (x: unknown) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    const t = d.totals;
    openPrint(`Account ${d.buyer.name}`, head + `
      <p><small>${esc(d.buyer.country)}${d.buyer.terms ? ` · ${esc(d.buyer.terms)}` : ''} · ${t.orders} orders, ${t.liveOrders} live · ${t.openInvoices} open invoice(s)</small></p>
      <h2>Orders</h2>
      <table><tr><th>Order</th><th>Style</th><th>Ship</th><th class="num">Qty</th><th class="num">Order value</th><th class="num">Invoiced</th><th class="num">Received</th><th class="num">Balance</th><th>Stage</th></tr>
      ${d.orders.map((o) => `<tr><td>${esc(o.orderNo)}</td><td>${esc(o.styleNo)}</td><td>${o.shipDate ? fmtDate(o.shipDate) : ''}</td><td class="num">${fmtN(o.qty)}</td><td class="num">${fmtInr(o.value)}</td><td class="num">${fmtInr(o.invoiced)}</td><td class="num">${fmtInr(o.received)}</td><td class="num${o.balance ? ' bad' : ''}">${fmtInr(o.balance)}</td><td>${esc(o.status === 'Open' ? o.stage : o.status)}</td></tr>`).join('')}
      <tr class="hi"><th colspan="4">Total</th><th class="num">${fmtInr(t.orderValue)}</th><th class="num">${fmtInr(t.invoiced)}</th><th class="num">${fmtInr(t.received)}</th><th class="num">${fmtInr(t.outstanding)}</th><th></th></tr></table>
      <h2>Invoices</h2>
      <table><tr><th>Invoice</th><th>Date</th><th>Order</th><th>Method</th><th>Due</th><th class="num">Amount</th><th class="num">Received</th><th class="num">Pending</th><th>Status</th></tr>
      ${d.invoices.map((p) => `<tr><td>${esc(p.invoiceNo)}</td><td>${fmtDate(p.invoiceDate)}</td><td>${esc(p.orderNo)}</td><td>${esc(p.method)}</td><td>${p.dueDate ? fmtDate(p.dueDate) : ''}</td><td class="num">${fmtInr(p.amount)}</td><td class="num">${fmtInr(p.receivedTotal)}</td><td class="num${p.pending ? ' bad' : ''}">${fmtInr(p.pending)}</td><td>${esc(p.displayStatus)}</td></tr>`).join('') || '<tr><td colspan="9">No invoice raised yet</td></tr>'}</table>
      <div class="sign"><div>Accounts</div><div>Merchandiser</div></div>`);
  };
  if (q.isLoading || !d) return <Card><CardContent className="space-y-2 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /></CardContent></Card>;
  const t = d.totals;
  return (
    <Card className="border-brand/40">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle>{d.buyer.name} — account</CardTitle>
          <p className="text-xs text-muted-foreground">{d.buyer.legalName ? `${d.buyer.legalName} · ` : ''}{d.buyer.country || '—'} · {d.buyer.currency}{d.buyer.terms ? ` · ${d.buyer.terms}` : ''} · {t.orders} order{t.orders === 1 ? '' : 's'}, {t.liveOrders} live · {t.invoices} invoice{t.invoices === 1 ? '' : 's'}, {t.openInvoices} open</p>
          {d.buyer.contact && <p className="text-xs text-muted-foreground">Contact: <b className="text-foreground">{d.buyer.contact.name}</b>{d.buyer.contact.role ? ` · ${d.buyer.contact.role}` : ''}{d.buyer.contact.email ? ` · ${d.buyer.contact.email}` : ''}{d.buyer.contact.phone ? ` · ${d.buyer.contact.phone}` : ''}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={print}><Print size={14} /> Statement</Button>
          {d.money && <Button size="sm" asChild><Link to="/payments"><Payments size={14} /> Record receipt</Link></Button>}
          {onClose && <Button size="sm" variant="secondary" onClick={onClose}>Close</Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {d.money && <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {([['Live order value', fmtInr(t.liveValue), '', `${t.liveOrders} open · ${fmtN(t.liveQty)} pcs`],
            ['Invoiced', fmtInr(t.invoiced), '', `${t.invoices} invoice${t.invoices === 1 ? '' : 's'}`],
            ['Received', fmtInr(t.received), 'text-teal', t.advance ? `${fmtInr(t.advance)} as advance / part` : 'against invoices'],
            ['Still to receive', fmtInr(t.outstanding), t.outstanding ? 'text-bad' : 'text-teal', t.overdue ? `${fmtInr(t.overdue)} overdue` : 'nothing overdue'],
            ['Yet to invoice', fmtInr(t.toInvoice), 'text-muted-foreground', 'live orders not shipped']] as const).map(([k, v, cls, sub]) => (
            <div key={k} className={cn('rounded-lg border px-3 py-2', k === 'Still to receive' && (t.outstanding ? 'border-bad/40 bg-bad-soft/50 dark:bg-bad/10' : 'border-teal/40 bg-teal-soft/40 dark:bg-teal/10'))}>
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{k}</div>
              <div className={cn('num text-[17px] font-bold', cls)}>{v}</div>
              <div className="text-[10.5px] text-muted-foreground">{sub}</div>
            </div>))}
        </div>}

        <div className="overflow-hidden rounded-xl border">
          <div className="border-b bg-secondary px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Orders · value, invoiced and received</div>
          {!d.orders.length ? <div className="px-4 py-5 text-[12.5px] text-muted-foreground">No order from this buyer yet.</div>
          : <div className="divide-y">{d.orders.map((o) => (
            <div key={o.id} className={cn('grid gap-2 px-4 py-2.5 lg:grid-cols-[minmax(200px,1.4fr)_repeat(3,minmax(90px,1fr))_110px]', (o.balance ?? 0) > 0 && 'bg-bad-soft/25 dark:bg-bad/5')}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5"><Link to={`/orders/${o.id}`} className="font-mono text-[12.5px] font-bold text-brand hover:underline">{o.orderNo}</Link>
                  <Badge tone={o.status === 'Closed' ? 'ok' : 'brand'} className="text-[9px]">{o.status === 'Open' ? o.stage : 'Closed'}</Badge></div>
                <div className="truncate text-[12px]">{o.styleNo} · {o.description}</div>
                <div className="text-[11px] text-muted-foreground">{fmtN(o.qty)} pcs{o.shipDate ? ` · ship ${fmtDate(o.shipDate)}` : ''}{o.buyerPoNo ? ` · PO ${o.buyerPoNo}` : ''}</div>
              </div>
              <Cell k="Order value" v={fmtInr(o.value)} sub={o.valueFx && o.currency !== 'INR' ? `${o.currency} ${fmtN(o.valueFx)}` : ''} />
              <Cell k="Invoiced" v={fmtInr(o.invoiced)} sub={o.invoices ? `${o.invoices} invoice${o.invoices === 1 ? '' : 's'}` : o.toInvoice ? `${fmtInr(o.toInvoice)} yet to invoice` : ''} />
              <Cell k="Received" v={fmtInr(o.received)} cls="text-teal" sub={o.invoices ? '' : 'nothing due yet'} />
              <div className="lg:text-right"><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Still to come</div><DueIn amount={o.invoices ? o.balance : undefined} empty="not invoiced yet" /></div>
            </div>))}</div>}
        </div>

        <div className="overflow-hidden rounded-xl border">
          <div className="border-b bg-secondary px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Invoices · receipts</div>
          {!d.invoices.length ? <div className="px-4 py-5 text-[12.5px] text-muted-foreground">Nothing shipped and invoiced yet.</div>
          : <div className="divide-y">{d.invoices.map((p) => (
            <div key={p.id} className={cn('grid gap-2 px-4 py-2.5 lg:grid-cols-[minmax(200px,1.4fr)_repeat(3,minmax(90px,1fr))_110px]', p.overdue && 'bg-bad-soft/25 dark:bg-bad/5')}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5"><span className="font-mono text-[12.5px] font-bold">{p.invoiceNo}</span>
                  <Badge tone={p.displayStatus === 'Received' ? 'ok' : p.displayStatus === 'Overdue' ? 'bad' : p.displayStatus === 'Partial' ? 'warn' : 'brand'} className="text-[9px]">{p.displayStatus}</Badge>
                  <Badge tone="plain" className="text-[9px]">{p.method}</Badge></div>
                <div className="text-[12px]">{p.orderNo}{p.bank ? ` · ${p.bank}` : ''}{p.reference ? ` · ${p.reference}` : ''}</div>
                <div className="text-[11px] text-muted-foreground">{fmtDate(p.invoiceDate)}{p.dueDate ? ` · due ${fmtDate(p.dueDate)}` : ''}</div>
              </div>
              <Cell k="Invoice" v={fmtInr(p.amount)} sub={p.currency !== 'INR' ? p.currency : ''} />
              <Cell k="Received" v={fmtInr(p.receivedTotal)} cls="text-teal" sub={`${p.receivedPct}%`} />
              <Cell k="Receipts" v={p.receipts.length || '—'} sub={p.receipts.length ? `last ${fmtDate(p.receipts[p.receipts.length - 1].creditDate)}` : 'nothing in'} />
              <div className="lg:text-right"><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Pending</div><DueIn amount={p.pending} /></div>
            </div>))}</div>}
        </div>

        <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><Ship size={13} /> Invoices are raised by Dispatch; receipts are recorded on the Payments page and reflect here at once.</p>
      </CardContent>
    </Card>
  );
}
