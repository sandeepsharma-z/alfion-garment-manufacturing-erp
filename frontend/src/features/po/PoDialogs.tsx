import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useList, useSave, useAction, fmtN, fmtInr, fmtDate, toInputDate } from '@/lib/crud';
import { useCustomFields } from '@/components/CustomFields';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, THead, TBody, Tr, Th, Td, Badge } from '@/components/ui/misc';
import { Field, StatusPill, Bar } from '@/components/shared';
import { Check, Gate as GateIcon, Power, Dispatch as Truck, Shield } from '@/icons/icons';

export type Po = {
  id: string; poNo: string; supplierId: string; supplierName: string; materialId: string; materialCode: string; materialName: string;
  category: string; uom: string; orderId?: string; orderNo: string; orderedQty: number; receivedQty: number; rejectedQty: number;
  remainingQty: number; receivedPct: number; rate?: number; value?: number; poDate: string; eta?: string; paymentTerms: string;
  deliveryAt: string; notes: string; priority: string; status: string; approvedBy: string; approvedAt?: string; createdBy: string;
  receipts: { grnNo: string; gateEntryId?: string; qty: number; rejectedQty: number; challanNo: string; date: string; by: string }[];
  billed?: number; paid?: number; balance?: number; inProgress?: number;   // what the gate received is worth, and what is still to pay
};
type Meta = { statuses: string[]; paymentTerms: string[]; deliveryAt: string[] };
type Material = { id: string; code: string; name: string; uom: string; rate?: number; supplierId?: string; supplierName: string; category: string };
type Supplier = { id: string; name: string; category: string; leadTimeDays: number; paymentTerms: string };
type OrderLite = { id: string; orderNo: string; styleNo: string; buyerName: string; status: string };

export type PoPrefill = { materialId?: string; orderId?: string; qty?: number };

/* ---------- New Purchase Order ---------- */
export function NewPoDialog({ open, prefill, onClose }: { open: boolean; prefill?: PoPrefill; onClose: () => void }) {
  const { hasFlag } = useAuth();
  const showRate = hasFlag('rates.view');
  const [f, setF] = React.useState({ materialId: '', supplierId: '', orderId: '', orderedQty: 0, rate: 0, eta: '', paymentTerms: '30 days credit', deliveryAt: 'Unit 1 — Noida', notes: '', priority: 'Normal' });
  const meta = useQuery<Meta>({ queryKey: ['/po/meta'], queryFn: async () => (await api.get('/po/meta')).data, enabled: open });
  const cf = useCustomFields('po', null, open);
  const mats = useList<Material>('/materials', { size: 500, status: 'Active' }, open);
  const sups = useList<Supplier>('/suppliers', { size: 200, status: 'Active' }, open);
  const orders = useList<OrderLite>('/orders', { size: 200, status: 'Open' }, open);
  const save = useSave<Po>('/po', ['/po', '/materials', '/stock', '/orders', '/accessories'], (p) => {
    toast.success(p.status === 'Pending Approval' ? `${p.poNo} raised · waiting for approval (above limit)` : `${p.poNo} raised · ${p.supplierName}`); onClose();
  });

  React.useEffect(() => {
    if (!open) return;
    setF({ materialId: prefill?.materialId || '', supplierId: '', orderId: prefill?.orderId || '', orderedQty: prefill?.qty || 0, rate: 0, eta: '',
      paymentTerms: '30 days credit', deliveryAt: 'Unit 1 — Noida', notes: '', priority: 'Normal' });
  }, [open, prefill]);
  const m = (mats.data?.items ?? []).find((x) => x.id === f.materialId);
  React.useEffect(() => {   // material picked → its usual supplier + rate
    if (!m) return;
    setF((x) => ({ ...x, supplierId: x.supplierId || m.supplierId || '', rate: showRate ? (m.rate ?? 0) : 0 }));
  }, [m, showRate]);
  const s = (sups.data?.items ?? []).find((x) => x.id === f.supplierId);
  React.useEffect(() => {
    if (!s) return;
    setF((x) => ({ ...x, paymentTerms: s.paymentTerms || x.paymentTerms, eta: x.eta || new Date(Date.now() + (s.leadTimeDays || 14) * 864e5).toISOString().slice(0, 10) }));
  }, [s]);
  const value = showRate ? Math.round(f.orderedQty * f.rate) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide meta={cf.meta}>
        <DialogHeader><DialogTitle>Raise Purchase Order</DialogTitle>
          <DialogDescription>One material per PO. Quantities arrive only through Gate Entry — nothing here touches stock.</DialogDescription></DialogHeader>
        <DialogBody><div className="grid gap-4 sm:grid-cols-3">
          <Field label="Material" className="sm:col-span-2"><Select value={f.materialId} onValueChange={(v) => setF({ ...f, materialId: v, supplierId: '' })}><SelectTrigger><SelectValue placeholder="Select material…" /></SelectTrigger>
            <SelectContent>{(mats.data?.items ?? []).map((x) => <SelectItem key={x.id} value={x.id}>{x.code} · {x.name}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Quantity" hint={m ? `in ${m.uom}` : undefined}><Input type="number" value={f.orderedQty} onChange={(e) => setF({ ...f, orderedQty: +e.target.value })} /></Field>
          <Field label="Supplier" className="sm:col-span-2"><Select value={f.supplierId} onValueChange={(v) => setF({ ...f, supplierId: v })}><SelectTrigger><SelectValue placeholder="Select supplier…" /></SelectTrigger>
            <SelectContent>{(sups.data?.items ?? []).map((x) => <SelectItem key={x.id} value={x.id}>{x.name} · {x.category} · {x.leadTimeDays} d</SelectItem>)}</SelectContent></Select></Field>
          {showRate ? <Field label="Rate (₹ / UOM)" hint={value ? `PO value ${fmtInr(value)}` : undefined}><Input type="number" step="0.01" value={f.rate} onChange={(e) => setF({ ...f, rate: +e.target.value })} /></Field>
            : <Field label="Rate" hint="taken from the material master"><Input value="restricted" readOnly /></Field>}
          <Field label="Against Order" className="sm:col-span-2"><Select value={f.orderId || 'none'} onValueChange={(v) => setF({ ...f, orderId: v === 'none' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">— stock replenishment (no order) —</SelectItem>{(orders.data?.items ?? []).map((o) => <SelectItem key={o.id} value={o.id}>{o.orderNo} · {o.styleNo} · {o.buyerName}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Expected Delivery"><Input type="date" value={f.eta} onChange={(e) => setF({ ...f, eta: e.target.value })} /></Field>
          <Field label="Payment Terms"><Select value={f.paymentTerms} onValueChange={(v) => setF({ ...f, paymentTerms: v })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{(meta.data?.paymentTerms ?? [f.paymentTerms]).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Delivery At"><Select value={f.deliveryAt} onValueChange={(v) => setF({ ...f, deliveryAt: v })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{(meta.data?.deliveryAt ?? [f.deliveryAt]).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Priority"><Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{['Urgent', 'High', 'Normal', 'Low'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Specification & Notes" className="sm:col-span-3"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Shade lot, width, GSM tolerance, packing…" /></Field>
        </div>{cf.node}</DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={save.isPending || !f.materialId || !f.supplierId || !(f.orderedQty > 0) || !cf.ok}
            onClick={() => save.mutate({ body: { ...f, custom: cf.value, orderId: f.orderId || undefined, eta: f.eta || undefined, rate: showRate ? f.rate : undefined } })}>
            <Check size={16} /> Raise PO</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- PO detail: receipts history, rate history, actions ---------- */
export function PoDetailDialog({ po, onClose }: { po: Po | null; onClose: () => void }) {
  const nav = useNavigate();
  const { hasFlag, hasModule } = useAuth();
  const showRate = hasFlag('rates.view');
  const act = useAction<Po>(['/po', '/orders', '/materials', '/stock', '/gate'], (p) => toast.success(`${p.poNo} · ${p.status}`));
  const save = useSave<Po>('/po', ['/po'], (p) => toast.success(`${p.poNo} updated`));
  const [eta, setEta] = React.useState('');
  React.useEffect(() => { setEta(toInputDate(po?.eta)); }, [po]);
  const hist = useQuery<{ items: { poNo: string; supplierName: string; rate: number; orderedQty: number; uom: string; poDate: string }[] }>({
    queryKey: ['/po/rate-history', po?.materialId], queryFn: async () => (await api.get('/po/rate-history', { params: { materialId: po!.materialId } })).data, enabled: !!po && showRate });
  if (!po) return null;
  const open = ['Ordered', 'In Transit', 'Partially Received'].includes(po.status);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{po.poNo} <StatusPill value={po.status} /> {po.priority !== 'Normal' && <StatusPill value={po.priority} />}</DialogTitle>
          <DialogDescription>{po.materialCode} · {po.materialName} · {po.supplierName}{po.orderNo ? ` · for ${po.orderNo}` : ''}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            {[['Ordered', `${fmtN(po.orderedQty)} ${po.uom}`], ['Received', `${fmtN(po.receivedQty)} ${po.uom}`], ['Remaining', `${fmtN(po.remainingQty)} ${po.uom}`],
              showRate ? ['PO Value', `${fmtInr(po.value)} @ ₹${po.rate}`] : ['Rejected / Short', `${fmtN(po.rejectedQty)} ${po.uom}`]].map(([k, v]) => (
              <div key={k} className="rounded-xl border bg-secondary p-3"><div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">{k}</div><div className="num mt-0.5 font-slab text-lg font-bold">{v}</div></div>))}
          </div>
          {po.billed != null && <div className="grid gap-3 sm:grid-cols-3">
            {[['Billed on received', fmtInr(po.billed), `${fmtN(po.receivedQty)} ${po.uom} x ${fmtInr(po.rate)}`, ''],
              ['Paid', fmtInr(po.paid), po.paid ? 'against this PO' : 'nothing paid yet', 'text-teal'],
              ['Still to pay', fmtInr(po.balance), po.inProgress ? `${fmtInr(po.inProgress)} not received yet` : 'billed on what the gate took in', (po.balance ?? 0) > 0 ? 'text-bad' : 'text-teal']].map(([k, v, sub, cls]) => (
              <div key={k} className={cn('rounded-xl border p-3', k === 'Still to pay' && ((po.balance ?? 0) > 0 ? 'border-bad/40 bg-bad-soft/50 dark:bg-bad/10' : 'border-teal/40 bg-teal-soft/40 dark:bg-teal/10'))}>
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">{k}</div>
                <div className={cn('num mt-0.5 font-slab text-lg font-bold', cls)}>{v}</div>
                <div className="text-[10.5px] text-muted-foreground">{sub}</div></div>))}
          </div>}
          <Bar pct={po.receivedPct} tone={po.receivedPct >= 100 ? 'ok' : 'brand'} />
          <div className="grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
            {[['PO Date', fmtDate(po.poDate)], ['Payment Terms', po.paymentTerms], ['Delivery At', po.deliveryAt], ['Raised By', po.createdBy],
              ['Approved By', po.approvedBy || (po.status === 'Pending Approval' ? 'awaiting approval' : '—')], ['Notes', po.notes || '—']].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b py-1"><span className="text-muted-foreground">{k}</span><span className="text-right font-semibold">{v}</span></div>))}
            <div className="flex items-center justify-between gap-3 border-b py-1"><span className="text-muted-foreground">Expected Delivery</span>
              {open ? <div className="flex items-center gap-2"><Input type="date" className="h-8 w-40" value={eta} onChange={(e) => setEta(e.target.value)} />
                {eta !== toInputDate(po.eta) && <Button size="sm" onClick={() => save.mutate({ id: po.id, body: { eta } })}>Save</Button>}</div> : <span className="font-semibold">{fmtDate(po.eta)}</span>}</div>
          </div>

          <div className="overflow-hidden rounded-xl border">
            <div className="border-b bg-secondary px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Receiving history — every installment came through the gate</div>
            {!po.receipts.length ? <div className="px-4 py-5 text-center text-sm text-muted-foreground">Nothing received yet.</div>
            : <Table><THead><Tr className="hover:bg-transparent"><Th>GRN</Th><Th>Date</Th><Th className="text-right">Qty</Th><Th className="text-right">Rejected</Th>{showRate && <Th className="text-right">Value</Th>}<Th>Challan</Th><Th>By</Th></Tr></THead>
              <TBody>{po.receipts.map((r) => <Tr key={r.grnNo}><Td className="font-mono text-xs font-semibold">{r.grnNo}</Td><Td className="text-xs">{fmtDate(r.date)}</Td>
                <Td className="num text-right font-semibold">{fmtN(r.qty)} {po.uom}</Td><Td className="num text-right">{r.rejectedQty || '—'}</Td>{showRate && <Td className="num text-right">{fmtInr(r.qty * (po.rate || 0))}</Td>}<Td className="text-xs">{r.challanNo || '—'}</Td><Td className="text-xs">{r.by}</Td></Tr>)}</TBody></Table>}
          </div>

          {showRate && (hist.data?.items.length ?? 0) > 1 && (
            <div className="overflow-hidden rounded-xl border">
              <div className="border-b bg-secondary px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Supplier rate history — {po.materialCode}</div>
              <Table><THead><Tr className="hover:bg-transparent"><Th>PO</Th><Th>Supplier</Th><Th className="text-right">Rate</Th><Th className="text-right">Qty</Th><Th>Date</Th></Tr></THead>
                <TBody>{hist.data!.items.map((h) => <Tr key={h.poNo} className={h.poNo === po.poNo ? 'bg-brand-soft/40' : ''}><Td className="font-mono text-xs">{h.poNo}</Td><Td className="text-xs">{h.supplierName}</Td>
                  <Td className="num text-right font-semibold">₹{h.rate}</Td><Td className="num text-right">{fmtN(h.orderedQty)} {h.uom}</Td><Td className="text-xs">{fmtDate(h.poDate)}</Td></Tr>)}</TBody></Table>
            </div>
          )}
        </DialogBody>
        <DialogFooter className="flex-wrap">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {po.orderId && <Button variant="secondary" asChild><Link to={`/orders/${po.orderId}`}>{po.orderNo}</Link></Button>}
          {po.status === 'Pending Approval' && (hasFlag('po.approve')
            ? <Button onClick={() => act.mutate({ url: `/po/${po.id}/approve` })}><Shield size={16} /> Approve</Button>
            : <Badge tone="warn">Needs approval — above the PO limit</Badge>)}
          {po.status === 'Ordered' && <Button variant="secondary" onClick={() => save.mutate({ id: po.id, body: { status: 'In Transit' } })}><Truck size={16} /> Mark In Transit</Button>}
          {open && !po.receivedQty && <Button variant="destructive" onClick={() => act.mutate({ url: `/po/${po.id}/cancel` })}><Power size={16} /> Cancel PO</Button>}
          {open && hasModule('gate') && <Button onClick={() => { onClose(); nav(`/gate?po=${po.id}`); }}><GateIcon size={16} /> Receive at Gate</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
