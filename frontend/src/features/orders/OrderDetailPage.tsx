import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/AuthProvider';
import { useItem, useSave, useAction, openFile, fmtN, fmtInr, fmtDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton, Table, THead, TBody, Tr, Th, Td, Badge } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader, KpiTile, StatusPill, Bar, AuthImg } from '@/components/shared';
import { ArrowLeft, Orders as OrdersIcon, Stock, Clock, Payments, Eye, Download, Power, Note, Check, Planning, Po as PoIcon, Gate as GateIcon, Refresh } from '@/icons/icons';
import type { Order } from './OrdersPage';
import { PoDetailDialog, type Po } from '@/features/po/PoDialogs';
import { TXN_LABEL, type LedgerRow } from '@/features/stock/StockPage';
import { LOC_TONE, ChallanDetailDialog, NewChallanDialog, type JobWork } from '@/features/jobwork/JobWorkPage';
import { STATE_TONE, LogDialog, PlanOpDialog, type Op } from '@/features/production/ProductionPage';
import { Jobwork as JwIcon, Plus } from '@/icons/icons';
import { OrderTna } from '@/features/tna/TnaPage';
import { ShareTracking } from '@/features/portal/ShareTracking';
import { DispatchDetail, type Dispatch as DispatchT } from '@/features/dispatch/DispatchPage';
import type { Payment } from '@/features/payments/PaymentsPage';
import { ColourMatrixCard, RevisionDialog, RevisionsCard, ShippingTrackTable, FabricWipCard, fmtMoney, type ShipTrack } from './OrderCommercial';
import type { BuyerOrder } from './BuyerOrdersPage';
import { RequirementTable, type PlanRow } from '@/features/planning/RequirementTable';

type Gate = { n: number; t: string; s: string; k: 'ok' | 'warn' | 'bad' | 'pending' | '' };
type Detail = { order: Order; tower: Gate[]; material: { hasBom: boolean; rows: PlanRow[]; shortages?: number; toOrderLines?: number }; pos: Po[]; movements: LedgerRow[]; jobworks: JobWork[]; ops: Op[]; shipping?: ShipTrack; buyerOrder?: BuyerOrder | null; dispatches: DispatchT[]; payments: Payment[] };

const STAGES = ['Order Confirmed', 'Material Sourcing', 'Job Work', 'Cutting', 'Stitching', 'Finishing', 'Packing', 'Dispatch', 'Payment', 'Closed'];
const GATE: Record<string, string> = {
  ok: 'border-teal/40 bg-teal-soft text-teal dark:bg-teal/10', warn: 'border-gold-vivid/40 bg-gold-soft text-gold dark:bg-gold-vivid/10 dark:text-gold-vivid',
  bad: 'border-bad/40 bg-bad-soft text-bad dark:bg-bad/10', pending: 'border-dashed text-muted-foreground', '': 'text-muted-foreground',
};

export default function OrderDetailPage() {
  const { id = '' } = useParams();
  const { hasFlag, hasModule } = useAuth();
  const showRate = hasFlag('rates.view');
  const [note, setNote] = React.useState('');
  const [po, setPo] = React.useState<Po | null>(null);
  const [jw, setJw] = React.useState<JobWork | null>(null);
  const [challan, setChallan] = React.useState(false);
  const [logFor, setLogFor] = React.useState<{ orderId?: string; op?: string } | null>(null);
  const [planOp, setPlanOp] = React.useState<Op | null>(null);
  const [ship, setShip] = React.useState<DispatchT | null>(null);
  const [revising, setRevising] = React.useState(false);
  const lines = useItem<{ lines?: string[] }>('/settings/company');
  const { data, isLoading } = useItem<Detail>(`/orders/${id}`);
  const o = data?.order;
  const keys = [`/orders/${id}`, '/orders', '/samples', '/materials', '/stock', '/po', '/accessories', '/jobwork', '/production', '/packing'];
  const save = useSave<Order>('/orders', keys, () => toast.success('Order updated'));
  const act = useAction<Order>(keys, (r) => { setNote(''); toast.success(r.status === 'Closed' ? `${r.orderNo} closed` : 'Saved'); });
  const reserve = useAction<{ reserved: string[] }>(keys, (r) => toast[r.reserved.length ? 'success' : 'info'](r.reserved.length ? `Reserved: ${r.reserved.join(', ')}` : 'Nothing free to reserve right now'));
  const release = useAction<{ released: number }>(keys, (r) => toast.success(`Released ${r.released} reservation${r.released === 1 ? '' : 's'}`));

  if (isLoading || !o || !data) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  const { tower, material, pos, movements, jobworks, ops, dispatches, payments } = data;
  const okGates = tower.filter((g) => g.k === 'ok').length;
  const reservedAny = material.rows.some((r) => (r.reservedForOrder ?? 0) > 0);

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title={`${o.orderNo} · ${o.styleNo}`} sub={`${o.buyerName} · ${o.description} · from ${o.sampleNo} (round ${o.sampleRound})${o.buyerOrderNo ? ` · buyer order ${o.buyerOrderNo}` : o.buyerPoNo ? ` · PO ${o.buyerPoNo}` : ''}${o.revision ? ` · revision ${o.revision}` : ''}`}>
        <Button variant="secondary" asChild><Link to="/orders"><ArrowLeft size={16} /> All Orders</Link></Button>
        {o.buyerOrderId && <Button variant="secondary" asChild><Link to="/buyer-orders">{o.buyerOrderNo}</Link></Button>}
        {o.status === 'Open' && <Button variant="secondary" onClick={() => setRevising(true)}><Note size={16} /> Revise</Button>}
        <Select value={o.stage} onValueChange={(v) => save.mutate({ id, body: { stage: v } })}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant={o.status === 'Open' ? 'destructive' : 'default'} onClick={() => act.mutate({ url: `/orders/${id}/close` })}>
          <Power size={16} /> {o.status === 'Open' ? 'Close Order' : 'Re-open'}</Button>
      </PageHeader>

      {/* sample photos + colour — what the buyer approved */}
      {((o.photos && o.photos.length > 0) || o.colour) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 shadow-card">
          {(o.photos ?? []).map((f, i) => <button key={f} type="button" onClick={() => openFile(f, `${o.styleNo}-piece-${i + 1}`)} title="Open photo" className="h-[104px] w-[84px] shrink-0 overflow-hidden rounded-lg border bg-secondary transition-transform hover:-translate-y-px hover:shadow-card"><AuthImg fileId={f} className="h-full w-full" alt={`${o.description} piece ${i + 1}`} /></button>)}
          {(o.photoCount ?? 0) > (o.photos?.length ?? 0) && <span className="text-[11px] text-muted-foreground">+{(o.photoCount ?? 0) - (o.photos?.length ?? 0)} more on the sample</span>}
          <div className="min-w-[180px] text-[12.5px]">
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Colour</div>
            <div className="mt-0.5 flex items-center gap-2 font-semibold"><span className="h-5 w-5 rounded-full border-2 border-white shadow" style={{ background: o.swatch || '#8ba9c9' }} />{o.colour || '—'}{o.pieceColours && o.pieceColours.length > 1 && <span className="text-[11px] font-normal text-muted-foreground">+ {o.pieceColours.filter((c) => c !== o.colour).join(', ')}</span>}</div>
            {o.fabric && <div className="mt-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Fabric</div>}{o.fabric && <div className="font-semibold">{o.fabric}</div>}
            {o.sampleId && <Link to={`/samples?q=${o.sampleNo}`} className="mt-1.5 inline-block text-[11.5px] font-semibold text-brand hover:underline">Open sample {o.sampleNo} →</Link>}
          </div>
        </div>)}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={OrdersIcon} label="Order Quantity" value={fmtN(o.qty)} tone="brand" foot={`cutting ${fmtN(o.cutQty)} pcs · ${o.sizeRange}`} />
        <KpiTile icon={Clock} label="Ship Date" value={fmtDate(o.shipDate)} tone="gold" foot={`${o.mode === 'Air' ? 'By Air' : 'By Sea'} · ${o.paymentTerms || '—'}`} />
        <KpiTile icon={Check} label="Control Tower" value={`${okGates} / 12`} tone={okGates >= 5 ? 'teal' : 'info'} foot="gates cleared" />
        {showRate
          ? <KpiTile icon={Payments} label={`Order Value${o.currency && o.currency !== 'INR' ? ` (${o.currency})` : ''}`} value={o.currency && o.currency !== 'INR' ? fmtMoney(o.valueFx, o.currency) : fmtInr(o.value)} tone="info" foot={o.currency && o.currency !== 'INR' ? `${fmtMoney(o.unitPrice, o.currency)} × ${fmtN(o.qty)} · ${fmtInr(o.value)} at ₹${o.fxRate}${o.firstPrice && o.firstPrice !== o.unitPrice ? ` · first ${fmtMoney(o.firstPrice, o.currency)}` : ''}` : `FOB ₹${o.fobRate ?? 0} × ${fmtN(o.qty)}`} />
          : <KpiTile icon={Stock} label="Material Lines Short" value={material.shortages ?? '—'} tone={material.shortages ? 'bad' : 'teal'} />}
      </div>

      {/* control tower */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div><CardTitle>Order Control Tower</CardTitle><p className="text-xs text-muted-foreground">One glance — where the order is stuck. Every gate is derived from real records, never typed in.</p></div>
          <div className="w-48"><Bar pct={o.progress} tone={o.progress >= 100 ? 'ok' : 'brand'} /></div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {tower.map((g) => (
              <div key={g.n} className={cn('rounded-xl border p-3', GATE[g.k])}>
                <div className="flex items-center justify-between text-[10.5px] font-bold uppercase tracking-wide"><span>{g.n}. {g.t}</span>
                  {g.k === 'ok' && <Check size={14} />}{g.k === 'bad' && <span>✕</span>}{g.k === 'warn' && <span>!</span>}</div>
                <div className="mt-1 truncate text-[12.5px] font-semibold text-foreground/90" title={g.s}>{g.s}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* order stock — material position */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div><CardTitle>Order Stock — Material Position</CardTitle>
            <p className="text-xs text-muted-foreground">required = per pc × cut qty {fmtN(o.cutQty || o.qty)} × (1 + waste%), colour / size-wise · coverage = reserved for this order + free · to buy = max(shortage − on order, MOQ) — raise a PO per line or tick several</p></div>
          <div className="flex flex-wrap gap-2">
            {material.hasBom && o.status === 'Open' && (reservedAny
              ? <Button size="sm" variant="secondary" disabled={release.isPending} onClick={() => release.mutate({ url: `/orders/${id}/release` })}><Refresh size={14} /> Release Reservation</Button>
              : null)}
            {material.hasBom && o.status === 'Open' && <Button size="sm" variant="secondary" disabled={reserve.isPending} onClick={() => reserve.mutate({ url: `/orders/${id}/reserve` })}><Stock size={14} /> Reserve Free Stock</Button>}
            <Button size="sm" variant="secondary" asChild><Link to={`/planning?style=${o.styleId}&qty=${o.cutQty || o.qty}&order=${id}`}><Planning size={14} /> Planning</Link></Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!o.styleId ? <div className="p-6 text-sm text-muted-foreground">Style not linked.</div>
          : !material.hasBom ? <div className="p-6 text-sm text-muted-foreground">No BOM for {o.styleNo} yet — define it in Planning to see requirement, reservations and shortages.</div>
          : <RequirementTable rows={material.rows} styleId={o.styleId} qty={o.cutQty || o.qty} orderId={id} invalidate={keys} />}
        </CardContent>
      </Card>

      <FabricWipCard orderId={id} />

      <OrderTna orderId={id} />

      <ShareTracking orderId={id} />

      {data.shipping && (data.shipping.shipments.length > 0 || (o.cancelledQty ?? 0) > 0) && (
        <Card>
          <CardHeader><div><CardTitle>Shipping Track</CardTitle><p className="text-xs text-muted-foreground">Ship-1 … n against this line · shipped {fmtN(data.shipping.shippedQty)} · balance {fmtN(data.shipping.balanceQty)}{o.targetShipDate ? ` · buyer target ${fmtDate(o.targetShipDate)}` : ''}</p></div></CardHeader>
          <CardContent className="p-0"><ShippingTrackTable rows={[data.shipping]} showOrder={false} /></CardContent>
        </Card>)}

      {(dispatches.length > 0 || payments.length > 0) && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader><div><CardTitle>Dispatch &amp; Export Documents</CardTitle><p className="text-xs text-muted-foreground">Invoices raised for this order — documents and tracking</p></div></CardHeader>
            <CardContent className="p-0">{!dispatches.length ? <div className="p-5 text-sm text-muted-foreground">Not invoiced yet.</div> : <Table>
              <THead><Tr className="hover:bg-transparent"><Th>Invoice</Th><Th>Mode · Route</Th><Th className="text-right">Cartons</Th><Th>Documents</Th><Th>Status</Th></Tr></THead>
              <TBody>{dispatches.map((d) => <Tr key={d.id} className="cursor-pointer" onClick={() => hasModule('dispatch') && setShip(d)}><Td className="font-mono text-xs font-bold">{d.invoiceNo}<div className="text-[10px] font-normal text-muted-foreground">{fmtDate(d.invoiceDate)}</div></Td><Td className="text-xs">{d.mode} · {d.route}</Td><Td className="num text-right">{fmtN(d.cartons)}</Td><Td className="text-xs">{d.docsDone}/{d.documents.length} ready{d.docsPending.length ? <div className="text-[10px] text-gold">{d.docsPending.join(', ')}</div> : null}</Td><Td><StatusPill value={d.status} /></Td></Tr>)}</TBody></Table>}</CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Payment</CardTitle><p className="text-xs text-muted-foreground">Pending = invoice − Σ receipts</p></div></CardHeader>
            <CardContent className="p-0">{!payments.length ? <div className="p-5 text-sm text-muted-foreground">No invoice yet.</div> : <Table>
              <THead><Tr className="hover:bg-transparent"><Th>Invoice</Th><Th>Method · Bank</Th><Th>Due</Th><Th className="w-28">Received</Th><Th>Status</Th></Tr></THead>
              <TBody>{payments.map((p) => <Tr key={p.id}><Td className="font-mono text-xs font-bold">{p.invoiceNo}{p.amount != null && <div className="text-[10px] font-normal text-muted-foreground">{fmtInr(p.amount)}{p.pending ? ` · ${fmtInr(p.pending)} pending` : ''}</div>}</Td><Td className="text-xs">{p.method} · {p.bank || '—'}<div className="text-[10px] text-muted-foreground">{p.reference}</div></Td><Td className={cn('text-xs', p.overdue && 'font-semibold text-bad')}>{fmtDate(p.dueDate)}</Td><Td><Bar pct={p.receivedPct} tone={p.receivedPct >= 100 ? 'ok' : 'brand'} /></Td><Td><StatusPill value={p.displayStatus} />{hasModule('payments') && <div className="mt-1"><Link to="/payments" className="text-[10.5px] text-brand hover:underline">open in Payments</Link></div>}</Td></Tr>)}</TBody></Table>}</CardContent>
          </Card>
        </div>
      )}

      {/* production operations + outsourcing */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div><CardTitle>Production Operations</CardTitle><p className="text-xs text-muted-foreground">Execution type per stage · planned / completed / pending · current location</p></div>
            {o.status === 'Open' && hasModule('production') && <Button size="sm" onClick={() => setLogFor({ orderId: id })}><Plus size={14} /> Log</Button>}
          </CardHeader>
          <CardContent className="p-0">
            {!ops.length ? <div className="p-6 text-sm text-muted-foreground">{o.status === 'Open' ? 'Operations appear once production is planned.' : 'Order closed.'}</div>
            : <Table>
              <THead><Tr className="hover:bg-transparent"><Th>Operation</Th><Th>Execution</Th><Th>Vendor / Line</Th><Th className="text-right">Planned</Th><Th className="text-right">Done</Th><Th className="text-right">Pending</Th><Th className="w-24">Progress</Th><Th>Location</Th><Th>Status</Th></Tr></THead>
              <TBody>{ops.map((x) => (
                <Tr key={x.id} className={hasModule('production') ? 'cursor-pointer' : ''} onClick={() => hasModule('production') && setPlanOp(x)}>
                  <Td><Badge tone="plain">{x.op}</Badge></Td>
                  <Td><Badge tone={x.exec === 'Outsourced' ? 'brand' : 'info'} className="text-[9.5px] uppercase">{x.exec}</Badge></Td>
                  <Td className="text-xs">{x.whereLabel}</Td>
                  <Td className="num text-right">{fmtN(x.plannedQty)}</Td><Td className="num text-right font-semibold text-teal">{fmtN(x.doneQty)}</Td>
                  <Td className={cn('num text-right font-semibold', x.pendingQty && 'text-bad')}>{fmtN(x.pendingQty)}</Td>
                  <Td><Bar pct={x.pct} tone={x.state === 'Completed' ? 'ok' : x.state === 'Blocked' ? 'bad' : 'brand'} /></Td>
                  <Td className="max-w-40 truncate text-xs" title={x.location}>{x.location}</Td>
                  <Td><Badge tone={STATE_TONE[x.state] || 'mute'}>{x.state}</Badge>{x.blocked && <div className="text-[10px] text-bad">{x.blockedReason}</div>}</Td>
                </Tr>))}</TBody>
            </Table>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div><CardTitle>Job Work — Material &amp; Process Movement</CardTitle><p className="text-xs text-muted-foreground">Sent · returned · with vendor · location derived from quantities</p></div>
            {o.status === 'Open' && hasModule('jobwork') && <Button size="sm" variant="secondary" onClick={() => setChallan(true)}><JwIcon size={14} /> Issue Challan</Button>}
          </CardHeader>
          <CardContent className="p-0">
            {!jobworks.length ? <div className="p-6 text-sm text-muted-foreground">Nothing outsourced for {o.orderNo} yet.</div>
            : <Table>
              <THead><Tr className="hover:bg-transparent"><Th>Challan</Th><Th>Vendor · Process</Th><Th>Item</Th><Th className="text-right">Sent</Th><Th className="text-right">Back</Th><Th className="text-right">At Vendor</Th><Th>Location</Th><Th>Status</Th></Tr></THead>
              <TBody>{jobworks.map((j) => (
                <Tr key={j.id} className="cursor-pointer" onClick={() => setJw(j)}>
                  <Td className="font-mono text-xs font-bold">{j.challanNo}</Td>
                  <Td className="text-xs"><div className="font-semibold">{j.vendorLabel}</div><div className="text-muted-foreground">{j.processLabel}</div></Td>
                  <Td className="max-w-36 truncate text-xs" title={j.itemDesc}>{j.itemDesc}</Td>
                  <Td className="num text-right">{fmtN(j.sentQty)} <span className="text-[10px] text-muted-foreground">{j.uom}</span></Td>
                  <Td className="num text-right text-teal">{fmtN(j.returnedQty)}</Td>
                  <Td className={cn('num text-right font-semibold', j.pendingQty ? 'text-brand' : 'text-muted-foreground')}>{j.pendingQty ? fmtN(j.pendingQty) : '—'}</Td>
                  <Td><Badge tone={LOC_TONE[j.location.label] || 'mute'}>{j.location.label}</Badge></Td>
                  <Td><StatusPill value={j.displayStatus} /></Td>
                </Tr>))}</TBody>
            </Table>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* purchase orders + movement */}
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader><div><CardTitle>Purchase Orders for this Order</CardTitle><p className="text-xs text-muted-foreground">Ordered · received · remaining — receipts come only from Gate Entry</p></div></CardHeader>
            <CardContent className="p-0">
              {!pos.length ? <div className="p-6 text-sm text-muted-foreground">No PO raised against {o.orderNo} yet.</div>
              : <Table>
                <THead><Tr className="hover:bg-transparent"><Th>PO</Th><Th>Material</Th><Th>Supplier</Th><Th className="text-right">Ordered</Th><Th className="text-right">Received</Th><Th>ETA</Th><Th className="w-36">Progress</Th><Th>Status</Th><Th /></Tr></THead>
                <TBody>{pos.map((p) => (
                  <Tr key={p.id} className="cursor-pointer" onClick={() => setPo(p)}>
                    <Td className="font-mono text-xs font-bold">{p.poNo}</Td>
                    <Td><div className="text-xs font-semibold">{p.materialName}</div><div className="font-mono text-[11px] text-muted-foreground">{p.materialCode}</div></Td>
                    <Td className="text-xs">{p.supplierName}</Td>
                    <Td className="num text-right">{fmtN(p.orderedQty)} {p.uom}</Td><Td className="num text-right font-semibold">{fmtN(p.receivedQty)}</Td>
                    <Td className="text-xs">{fmtDate(p.eta)}</Td><Td><Bar pct={p.receivedPct} tone={p.receivedPct >= 100 ? 'ok' : 'brand'} /></Td>
                    <Td><StatusPill value={p.status} /></Td>
                    <Td>{['Ordered', 'In Transit', 'Partially Received'].includes(p.status) && hasModule('gate') && <Button size="sm" variant="secondary" asChild onClick={(e) => e.stopPropagation()}><Link to={`/gate?po=${p.id}`}><GateIcon size={14} /></Link></Button>}</Td>
                  </Tr>))}</TBody>
              </Table>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Material Movement</CardTitle><p className="text-xs text-muted-foreground">Ledger rows tagged to {o.orderNo} — gate receipts, reservations, issues and returns</p></div></CardHeader>
            <CardContent>
              {!movements.length ? <div className="text-sm text-muted-foreground">No material movement for this order yet.</div>
              : <div className="relative pl-6 before:absolute before:bottom-1 before:left-2 before:top-1 before:w-0.5 before:bg-border">
                {movements.map((m) => (
                  <div key={m.id} className="relative pb-3.5 last:pb-0">
                    <span className={cn('absolute -left-[22px] top-1 h-[11px] w-[11px] rounded-full border-2 bg-card', m.txn === 'receipt' ? 'border-teal bg-teal' : m.txn === 'reserve' ? 'border-brand bg-brand' : 'border-border')} />
                    <div className="text-[12.5px] font-semibold">{TXN_LABEL[m.txn] || m.txn} · {m.qty ? `${m.qty > 0 ? '+' : ''}${fmtN(m.qty)}` : `${m.reservedDelta > 0 ? '+' : ''}${fmtN(m.reservedDelta)} res`} {m.uom} {m.materialName}</div>
                    <div className="text-[11px] text-muted-foreground">{m.refNo ? `${m.refNo} · ` : ''}{m.by} · {new Date(m.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}{m.note ? ` · ${m.note}` : ''}</div>
                  </div>))}
              </div>}
            </CardContent>
          </Card>
        </div>

        {/* source + spec + sizes */}
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Source Sample &amp; Specification</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-[13px]">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Sample</span><Link to="/samples" className="font-mono font-semibold text-brand">{o.sampleNo}</Link></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Buyer PO</span><span className="font-semibold">{o.buyerPoNo || '—'}</span></div>
              {o.targetShipDate && <div className="flex items-center justify-between"><span className="text-muted-foreground">Buyer target</span><span className="font-semibold">{fmtDate(o.targetShipDate)}</span></div>}
              {o.deliveryDate && <div className="flex items-center justify-between"><span className="text-muted-foreground">Delivery date</span><span className="font-semibold">{fmtDate(o.deliveryDate)}</span></div>}
              {o.salesMonth && <div className="flex items-center justify-between"><span className="text-muted-foreground">Sales month</span><span className="font-semibold">{o.salesMonth}</span></div>}
              {(o.cancelledQty ?? 0) > 0 && <div className="flex items-center justify-between"><span className="text-muted-foreground">Cancelled / short</span><span className="font-semibold text-bad">{fmtN(o.cancelledQty)} pcs</span></div>}
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Fabric</span><span className="max-w-[60%] truncate font-semibold" title={o.fabric}>{o.fabric || '—'}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Colour</span><span className="font-semibold">{o.colour || '—'}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Accessories</span><span className="max-w-[60%] truncate font-semibold" title={o.accessories}>{o.accessories || '—'}</span></div>
              <div className="rounded-lg border bg-secondary p-3">
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Specification sheet</div>
                {o.specSheet?.fileName ? <div className="mt-1 flex items-center gap-2">
                  <div className="min-w-0 flex-1 truncate font-semibold">{o.specSheet.fileName} <Badge tone="ok">v{o.specSheet.version}</Badge></div>
                  {o.specSheet.fileId && <>
                    <Button size="sm" variant="secondary" onClick={() => openFile(o.specSheet!.fileId!, o.specSheet!.fileName!)}><Eye size={14} /></Button>
                    <Button size="sm" variant="secondary" onClick={() => openFile(o.specSheet!.fileId!, o.specSheet!.fileName!, true)}><Download size={14} /></Button></>}
                </div> : <div className="mt-1 text-gold">Not attached — add it on the sample; the order picks up the latest version.</div>}
              </div>
              {o.instructions && <div className="rounded-lg border border-gold-vivid/40 bg-gold-soft p-3 text-[12.5px] text-gold dark:bg-gold-vivid/10 dark:text-gold-vivid"><b>Instructions:</b> {o.instructions}</div>}
            </CardContent>
          </Card>
          <ColourMatrixCard o={o} onEdit={() => setRevising(true)} />
          <RevisionsCard o={o} />
          <Card>
            <CardHeader><CardTitle>Activity</CardTitle></CardHeader>
            <CardContent>
              <div className="mb-4 flex gap-2">
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" onKeyDown={(e) => e.key === 'Enter' && note.trim() && act.mutate({ url: `/orders/${id}/activity`, body: { text: note } })} />
                <Button disabled={!note.trim() || act.isPending} onClick={() => act.mutate({ url: `/orders/${id}/activity`, body: { text: note } })}><Note size={16} /></Button>
              </div>
              <div className="relative max-h-96 overflow-y-auto pl-6 before:absolute before:bottom-1 before:left-2 before:top-1 before:w-0.5 before:bg-border">
                {[...o.activity].reverse().map((a, i) => (
                  <div key={i} className="relative pb-3.5 last:pb-0">
                    <span className={cn('absolute -left-[22px] top-1 h-[11px] w-[11px] rounded-full border-2 bg-card', i === 0 ? 'border-brand bg-brand' : 'border-border')} />
                    <div className="text-[12.5px] font-semibold">{a.text}</div>
                    <div className="text-[11px] text-muted-foreground">{a.by} · {new Date(a.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <RevisionDialog o={revising ? o : null} onClose={() => setRevising(false)} />
      <PoDetailDialog po={po ? pos.find((p) => p.id === po.id) ?? po : null} onClose={() => setPo(null)} />
      <ChallanDetailDialog jw={jw ? jobworks.find((x) => x.id === jw.id) ?? jw : null} onClose={() => setJw(null)} />
      <DispatchDetail d={ship ? dispatches.find((x) => x.id === ship.id) ?? ship : null} onClose={() => setShip(null)} />
      <NewChallanDialog open={challan} orderId={id} onClose={() => setChallan(false)} />
      <LogDialog target={logFor} lines={lines.data?.lines ?? []} onClose={() => setLogFor(null)} />
      <PlanOpDialog op={planOp ? ops.find((x) => x.id === planOp.id) ?? planOp : null} lines={lines.data?.lines ?? []} onClose={() => setPlanOp(null)} />
    </div>
  );
}
