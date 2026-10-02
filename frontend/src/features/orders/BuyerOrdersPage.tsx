import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useList, useItem, useSave, fmtN, fmtInr, fmtDate, toInputDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { useCustomFields } from '@/components/CustomFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton, Table, THead, TBody, Tr, Th, Td, Badge } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader, KpiTile, Toolbar, Field, StatusPill, EmptyState, OrderLink } from '@/components/shared';
import { Orders as OrdersIcon, Plus, Edit, Check, Ship, Clock, Eye } from '@/icons/icons';
import { ShippingTrackTable, useOrdersMeta, fmtMoney, type ShipTrack } from './OrderCommercial';

export type BuyerOrder = { id: string; poNo: string; buyerId: string; buyerName: string; date: string; season: string; currency: string; fxRate?: number; terms: string; incoterm: string; latestShipment?: string; deliveryDate?: string; salesMonth: string;
  revision: number; revisions: { no: number; at: string; by: string; reason: string; changes: { field: string; from: string; to: string }[] }[]; notes: string; status: string; lines: number; qty: number; styles: string[]; custom?: Record<string, unknown> };
type Buyer = { id: string; displayName: string };
type Detail = { buyerOrder: BuyerOrder; lines: ShipTrack[]; totals: { qty: number; shipped: number; balance: number; valueFx?: number; value?: number } };
const TERMS = ['LC at sight', 'Letter of Credit (LC) — 60 days', 'LC — 90 days', 'T/T — 30% advance', 'T/T — 100% against documents', 'T/T — 30 days from B/L', 'D/P at sight'];

export default function BuyerOrdersPage() {
  const [tab, setTab] = React.useState<'orders' | 'track'>('orders');
  const [q, setQ] = React.useState('');
  const [chip, setChip] = React.useState('Open');
  const [editing, setEditing] = React.useState<BuyerOrder | 'new' | null>(null);
  const [view, setView] = React.useState<string | null>(null);
  const list = useList<BuyerOrder>('/buyer-orders', { size: 500 });
  const all = list.data?.items ?? [];
  const rows = all.filter((b) => (chip === 'All' || b.status === chip) && (!q || `${b.poNo} ${b.buyerName} ${b.season} ${b.styles.join(' ')}`.toLowerCase().includes(q.toLowerCase())));
  const open = all.filter((b) => b.status === 'Open');
  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Buyer Orders & Shipping Track" sub="The buyer's purchase note as one header with many style lines (each line is an AFI order) · currency, terms, revisions · ship-1…n per line with balance.">
        <div className="flex rounded-lg border bg-secondary p-0.5 text-xs font-semibold">
          {(['orders', 'track'] as const).map((t) => <button key={t} type="button" onClick={() => setTab(t)} className={cn('rounded-md px-3 py-1.5', tab === t ? 'bg-card shadow-card' : 'text-muted-foreground')}>{t === 'orders' ? 'Buyer orders' : 'Shipping track'}</button>)}
        </div>
        <Button onClick={() => setEditing('new')}><Plus size={17} /> New Buyer Order</Button>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={OrdersIcon} label="Open buyer orders" value={open.length} tone="brand" foot={`${open.reduce((a, b) => a + b.lines, 0)} style lines`} />
        <KpiTile icon={Ship} label="Pieces on order" value={fmtN(open.reduce((a, b) => a + b.qty, 0))} tone="info" foot="open headers" />
        <KpiTile icon={Clock} label="Next latest shipment" value={fmtDate(open.map((b) => b.latestShipment).filter(Boolean).sort()[0])} tone="gold" foot="earliest buyer deadline" />
        <KpiTile icon={Check} label="Revised" value={open.filter((b) => b.revision > 0).length} tone="teal" foot="headers with revisions" />
      </div>
      {tab === 'orders' ? (
        <Card>
          <Toolbar q={q} setQ={setQ} placeholder="Search PO, buyer, season, style…" chips={['Open', 'Closed', 'All']} chip={chip} setChip={setChip} />
          {list.isLoading ? <div className="space-y-3 p-5">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
          : !rows.length ? <EmptyState title="No buyer orders" text="Create the buyer's purchase note here, then convert approved samples into its style lines." action={<Button onClick={() => setEditing('new')}><Plus size={15} /> New Buyer Order</Button>} />
          : <Table>
            <THead><Tr className="hover:bg-transparent"><Th>Buyer PO</Th><Th>Buyer · Season</Th><Th>Date</Th><Th>Currency · Terms</Th><Th>Latest shipment</Th><Th className="text-right">Lines</Th><Th className="text-right">Qty</Th><Th>Rev</Th><Th>Status</Th><Th /></Tr></THead>
            <TBody>{rows.map((b) => (
              <Tr key={b.id} className="cursor-pointer" onClick={() => setView(b.id)}>
                <Td className="font-mono text-xs font-bold">{b.poNo}</Td>
                <Td><div className="text-xs font-semibold">{b.buyerName}</div><div className="text-[11px] text-muted-foreground">{b.season || '—'}{b.salesMonth ? ` · sales ${b.salesMonth}` : ''}</div></Td>
                <Td className="text-xs">{fmtDate(b.date)}</Td>
                <Td className="text-xs"><Badge tone="plain">{b.currency}</Badge> <span className="text-muted-foreground">{b.terms || '—'} · {b.incoterm}</span></Td>
                <Td className="text-xs">{fmtDate(b.latestShipment)}{b.deliveryDate ? <div className="text-[10.5px] text-muted-foreground">delivery {fmtDate(b.deliveryDate)}</div> : null}</Td>
                <Td className="num text-right">{b.lines}<div className="text-[10px] text-muted-foreground">{b.styles.slice(0, 3).join(', ')}</div></Td>
                <Td className="num text-right font-semibold">{fmtN(b.qty)}</Td>
                <Td>{b.revision ? <Badge tone="warn">Rev {b.revision}</Badge> : <span className="text-muted-foreground">—</span>}</Td>
                <Td><StatusPill value={b.status} /></Td>
                <Td><div className="flex gap-1"><Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setEditing(b); }}><Edit size={13} /></Button><Button size="sm" variant="secondary"><Eye size={13} /></Button></div></Td>
              </Tr>))}</TBody>
          </Table>}
        </Card>
      ) : <ShippingTrackCard />}
      <BuyerOrderDialog open={editing !== null} bo={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      <BuyerOrderDetail id={view} onClose={() => setView(null)} onEdit={(b) => { setView(null); setEditing(b); }} />
    </div>
  );
}

function ShippingTrackCard() {
  const [status, setStatus] = React.useState('Open');
  const { data, isLoading } = useQuery<{ items: ShipTrack[] }>({ queryKey: ['/orders', 'shipping-track', status], queryFn: async () => (await api.get('/orders/shipping-track', { params: status === 'All' ? {} : { status } })).data });
  const rows = data?.items ?? [];
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div><div className="font-slab text-[15px] font-bold">Shipping Track</div><div className="text-xs text-muted-foreground">Order qty · ship-1…n (invoice no · AWB / B-L) · shipped · cancelled · balance · on time vs contracted date</div></div>
        <div className="flex gap-1">{['Open', 'Closed', 'All'].map((s) => <button key={s} type="button" onClick={() => setStatus(s)} className={cn('rounded-lg border px-3 py-1 text-xs font-semibold', status === s ? 'border-brand bg-brand-soft text-brand' : 'text-muted-foreground')}>{s}</button>)}</div>
      </div>
      {isLoading ? <div className="space-y-3 p-5">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
      : !rows.length ? <EmptyState title="No order lines" text="Convert an approved sample to an order to see it here." /> : <ShippingTrackTable rows={rows} />}
    </Card>
  );
}

function BuyerOrderDialog({ open, bo, onClose }: { open: boolean; bo: BuyerOrder | null; onClose: () => void }) {
  const { hasFlag } = useAuth();
  const meta = useOrdersMeta(open);
  const buyers = useList<Buyer>('/buyers', { size: 200, status: 'Active' }, open);
  const blank = { poNo: '', buyerId: '', date: new Date().toISOString().slice(0, 10), season: '', currency: 'USD', fxRate: 0, terms: 'LC at sight', incoterm: 'FOB', latestShipment: '', deliveryDate: '', salesMonth: '', notes: '', revisionReason: '' };
  const [f, setF] = React.useState(blank);
  const cf = useCustomFields('buyer_orders', bo?.custom ?? null, bo?.id ?? 'new');
  React.useEffect(() => {
    if (!open) return;
    setF(bo ? { poNo: bo.poNo, buyerId: bo.buyerId, date: toInputDate(bo.date), season: bo.season, currency: bo.currency, fxRate: bo.fxRate ?? 0, terms: bo.terms, incoterm: bo.incoterm, latestShipment: toInputDate(bo.latestShipment), deliveryDate: toInputDate(bo.deliveryDate), salesMonth: bo.salesMonth, notes: bo.notes, revisionReason: '' }
      : { ...blank, currency: meta.data?.defaultCurrency || 'USD', fxRate: meta.data?.fxRate || 0 });
  }, [open, bo, meta.data]);   // eslint-disable-line react-hooks/exhaustive-deps
  const save = useSave<BuyerOrder>('/buyer-orders', ['/buyer-orders', '/orders'], (r) => { toast.success(`${r.poNo} ${bo ? 'updated' : 'created'}${r.revision ? ` · revision ${r.revision}` : ''}`); onClose(); });
  const submit = () => save.mutate({ id: bo?.id, body: { ...f, custom: cf.value, latestShipment: f.latestShipment || undefined, deliveryDate: f.deliveryDate || undefined, fxRate: hasFlag('rates.view') ? f.fxRate : undefined } });
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent wide meta={cf.meta}>
        <DialogHeader><DialogTitle>{bo ? `Edit ${bo.poNo}` : 'New Buyer Order'}</DialogTitle><DialogDescription>The buyer's purchase note header. Style lines are added by converting approved samples and picking this buyer order.</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Buyer"><Select value={f.buyerId} onValueChange={(v) => setF({ ...f, buyerId: v })} disabled={!!bo}><SelectTrigger><SelectValue placeholder="Select buyer…" /></SelectTrigger><SelectContent>{(buyers.data?.items ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.displayName}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Buyer PO / purchase-note no"><Input value={f.poNo} onChange={(e) => setF({ ...f, poNo: e.target.value })} placeholder="PN-2026-0912" /></Field>
            <Field label="Order date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Season"><Input value={f.season} onChange={(e) => setF({ ...f, season: e.target.value })} placeholder="AW-26" /></Field>
            <Field label="Currency"><Select value={f.currency} onValueChange={(v) => setF({ ...f, currency: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(meta.data?.currencies ?? ['USD', 'INR']).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field>
            {hasFlag('rates.view') && <Field label="Exchange rate (₹ per unit)" hint="0 = company default"><Input type="number" step="0.01" value={f.fxRate || ''} onChange={(e) => setF({ ...f, fxRate: +e.target.value })} /></Field>}
            <Field label="Payment terms"><Select value={f.terms} onValueChange={(v) => setF({ ...f, terms: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[...new Set([...TERMS, f.terms].filter(Boolean))].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Incoterm"><Select value={f.incoterm} onValueChange={(v) => setF({ ...f, incoterm: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['FOB', 'CFR', 'CIF', 'CPT', 'DAP', 'DDP', 'EXW'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Latest shipment"><Input type="date" value={f.latestShipment} onChange={(e) => setF({ ...f, latestShipment: e.target.value })} /></Field>
            <Field label="Delivery date"><Input type="date" value={f.deliveryDate} onChange={(e) => setF({ ...f, deliveryDate: e.target.value })} /></Field>
            <Field label="Sales month"><Input type="month" value={f.salesMonth} onChange={(e) => setF({ ...f, salesMonth: e.target.value })} /></Field>
            <Field label="Notes" className="sm:col-span-2"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
            {bo && <Field label="Reason (if this is a revision)" className="sm:col-span-3"><Input value={f.revisionReason} onChange={(e) => setF({ ...f, revisionReason: e.target.value })} placeholder="Buyer moved the latest shipment by two weeks" /></Field>}
          </div>
          {cf.node}
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!f.poNo || !f.buyerId || save.isPending || !cf.ok} onClick={submit}><Check size={15} /> {bo ? 'Save' : 'Create'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BuyerOrderDetail({ id, onClose, onEdit }: { id: string | null; onClose: () => void; onEdit: (b: BuyerOrder) => void }) {
  const { data } = useItem<Detail>(`/buyer-orders/${id}/detail`, !!id);
  const toggle = useSave<BuyerOrder>('/buyer-orders', ['/buyer-orders'], (r) => toast.success(`${r.poNo} ${r.status.toLowerCase()}`));
  if (!id) return null;
  const b = data?.buyerOrder;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent wide>
        {!b ? <div className="space-y-3 p-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-40" /></div> : <>
          <DialogHeader><DialogTitle className="flex flex-wrap items-center gap-2">{b.poNo} <StatusPill value={b.status} />{b.revision > 0 && <Badge tone="warn">Rev {b.revision}</Badge>}</DialogTitle>
            <DialogDescription>{b.buyerName} · {fmtDate(b.date)} · {b.season || '—'} · {b.currency} · {b.terms} · {b.incoterm} · latest shipment {fmtDate(b.latestShipment)}{b.deliveryDate ? ` · delivery ${fmtDate(b.deliveryDate)}` : ''}{b.salesMonth ? ` · sales ${b.salesMonth}` : ''}</DialogDescription></DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              {[['Style lines', String(data!.lines.length)], ['Order qty', fmtN(data!.totals.qty)], ['Shipped', fmtN(data!.totals.shipped)], ['Balance', fmtN(data!.totals.balance)]].map(([k, v]) => <div key={k} className="rounded-lg border bg-secondary p-2.5"><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{k}</div><div className="num text-lg font-bold">{v}</div></div>)}
            </div>
            {data!.totals.valueFx != null && <div className="text-[12.5px]">Order value <b>{fmtMoney(data!.totals.valueFx, b.currency)}</b>{b.currency !== 'INR' && <> · <b>{fmtInr(data!.totals.value)}</b> at booking rate</>}</div>}
            <div className="overflow-hidden rounded-xl border">
              <div className="border-b bg-secondary px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Style lines · shipping track</div>
              {!data!.lines.length ? <div className="p-4 text-sm text-muted-foreground">No style lines yet — convert an approved sample and choose this buyer order.</div>
              : <Table>
                <THead><Tr className="hover:bg-transparent"><Th>Line</Th><Th>Style · colours</Th><Th className="text-right">Qty</Th><Th className="text-right">Price</Th><Th>Ship date</Th><Th className="text-right">Shipped</Th><Th className="text-right">Balance</Th><Th>Stage</Th></Tr></THead>
                <TBody>{data!.lines.map((l) => <Tr key={l.orderId}>
                  <Td><OrderLink id={l.orderId} className="font-mono text-xs font-bold text-brand hover:underline">{l.orderNo}</OrderLink>{(l.order?.revision ?? 0) > 0 && <div className="text-[10px] text-gold">rev {l.order?.revision}</div>}</Td>
                  <Td><div className="text-xs font-semibold">{l.styleNo}</div><div className="text-[11px] text-muted-foreground">{(l.order?.colours ?? []).map((c) => `${c.code || c.name} ${fmtN(c.qty)}`).join(' · ') || l.order?.colour || '—'}</div></Td>
                  <Td className="num text-right font-semibold">{fmtN(l.qty)}</Td>
                  <Td className="num text-right text-xs">{l.order?.unitPrice != null ? fmtMoney(l.order.unitPrice, l.currency) : '—'}</Td>
                  <Td className="text-xs">{fmtDate(l.shipDate)}</Td>
                  <Td className="num text-right text-teal">{fmtN(l.shippedQty)}</Td>
                  <Td className={cn('num text-right font-semibold', l.balanceQty ? 'text-brand' : 'text-muted-foreground')}>{fmtN(l.balanceQty)}</Td>
                  <Td><StatusPill value={l.order?.stage ?? ''} /></Td>
                </Tr>)}</TBody>
              </Table>}
            </div>
            {data!.lines.length > 0 && <div className="overflow-hidden rounded-xl border"><div className="border-b bg-secondary px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Ship-1 … n per line</div><ShippingTrackTable rows={data!.lines} /></div>}
            {b.revisions.length > 0 && <div className="space-y-1.5"><div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Revision history</div>
              {[...b.revisions].reverse().map((r) => <div key={r.no} className="rounded-lg border bg-secondary/60 p-2.5 text-[12px]"><b>Rev {r.no}</b> · {r.by} · {fmtDate(r.at)}{r.reason ? ` · ${r.reason}` : ''}<div className="text-muted-foreground">{r.changes.map((c) => `${c.field}: ${c.from || '—'} → ${c.to || '—'}`).join(' · ')}</div></div>)}</div>}
            {b.notes && <div className="rounded-lg border border-gold-vivid/40 bg-gold-soft p-3 text-[12.5px] text-gold dark:bg-gold-vivid/10 dark:text-gold-vivid">{b.notes}</div>}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>Close</Button>
            <Button variant="secondary" onClick={() => toggle.mutate({ id: b.id, body: { status: b.status === 'Open' ? 'Closed' : 'Open' } })}>{b.status === 'Open' ? 'Close buyer order' : 'Re-open'}</Button>
            <Button onClick={() => onEdit(b)}><Edit size={14} /> Edit header</Button>
          </DialogFooter>
        </>}
      </DialogContent>
    </Dialog>
  );
}
