import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useList, fmtN, fmtInr, fmtDate } from '@/lib/crud';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton, Table, THead, TBody, Tr, Th, Td, Badge } from '@/components/ui/misc';
import { AlertStrip } from '@/components/AlertStrip';
import { PageHeader, KpiTile, Toolbar, StatusPill, EmptyState, Bar, OrderLink } from '@/components/shared';
import { Po as PoIcon, Payments, Clock, Check, Plus, Gate as GateIcon, Eye, Shield } from '@/icons/icons';
import { NewPoDialog, PoDetailDialog, type Po } from './PoDialogs';

type Summary = { open: number; pendingApproval: number; arriving7: number; arrivingNos: string[]; openValue?: number; onTimePct: number | null };
const CHIPS = ['All', 'Pending Approval', 'Ordered', 'In Transit', 'Partially Received', 'Fully Received', 'Cancelled'];

export default function PoPage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { hasFlag, hasModule } = useAuth();
  const showRate = hasFlag('rates.view');
  const [q, setQ] = React.useState(sp.get('q') || '');
  const [chip, setChip] = React.useState('All');
  const [creating, setCreating] = React.useState(false);
  const [viewing, setViewing] = React.useState<Po | null>(null);

  const { data, isLoading } = useList<Po>('/po', { size: 500 });
  const sum = useQuery<Summary>({ queryKey: ['/po/summary'], queryFn: async () => (await api.get('/po/summary')).data });
  const all = data?.items ?? [];
  const rows = all.filter((p) => {
    const t = `${p.poNo} ${p.materialCode} ${p.materialName} ${p.supplierName} ${p.orderNo}`.toLowerCase();
    return (!q || t.includes(q.toLowerCase())) && (chip === 'All' || p.status === chip);
  });
  const s = sum.data;

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Purchase Orders" sub="Ordered · received · remaining per PO. Receipts are posted only by Gate Entry, installment by installment, and over-receipt is blocked.">
        {hasModule('gate') && <Button variant="secondary" onClick={() => nav('/gate')}><GateIcon size={17} /> Receive Goods</Button>}
        <Button onClick={() => setCreating(true)}><Plus size={17} /> New Purchase Order</Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={PoIcon} label="Open POs" value={s?.open ?? '—'} tone="brand" foot={s?.pendingApproval ? `${s.pendingApproval} awaiting approval` : 'ordered · in transit · partial'} />
        {showRate ? <KpiTile icon={Payments} label="Open PO Value" value={fmtInr(s?.openValue)} tone="info" foot="remaining qty × rate" />
          : <KpiTile icon={Shield} label="Awaiting Approval" value={s?.pendingApproval ?? '—'} tone={s?.pendingApproval ? 'gold' : 'mute'} foot="above the PO limit" />}
        <KpiTile icon={Clock} label="Arriving in 7 Days" value={s?.arriving7 ?? '—'} tone="gold" foot={s?.arrivingNos.slice(0, 3).join(' · ') || 'by ETA'} />
        <KpiTile icon={Check} label="On-Time Supply" value={s?.onTimePct == null ? '—' : `${s.onTimePct}%`} tone="teal" foot="closed POs received by ETA" />
      </div>

      <AlertStrip module="po" />
      <Card>
        <Toolbar q={q} setQ={setQ} placeholder="Search PO, material, supplier, order…" chips={CHIPS} chip={chip} setChip={setChip} />
        {isLoading ? <div className="space-y-3 p-5">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
        : !rows.length ? <EmptyState title="No purchase orders" text="Raise one here, or from a shortage line in Material Planning / an order's material table." action={<Button onClick={() => setCreating(true)}><Plus size={16} /> New PO</Button>} />
        : <Table>
          <THead><Tr className="hover:bg-transparent">
            <Th>PO No</Th><Th>Material</Th><Th>Supplier</Th><Th className="text-right">Quantity</Th><Th>For Order</Th>{showRate && <Th className="text-right">Value</Th>}
            <Th>PO Date</Th><Th>ETA</Th><Th className="w-40">Received</Th><Th>Status</Th><Th className="text-right">Actions</Th>
          </Tr></THead>
          <TBody>{rows.map((p) => {
            const open = ['Ordered', 'In Transit', 'Partially Received'].includes(p.status);
            const late = open && p.eta && new Date(p.eta).getTime() < Date.now();
            return (
              <Tr key={p.id} className={p.status === 'Cancelled' ? 'opacity-50' : ''}>
                <Td><div className="font-mono text-[12.5px] font-bold">{p.poNo}</div>{p.priority !== 'Normal' && <StatusPill value={p.priority} className="mt-1" />}</Td>
                <Td><div className="font-semibold">{p.materialName}</div><div className="font-mono text-[11px] text-muted-foreground">{p.materialCode}</div></Td>
                <Td className="text-xs">{p.supplierName}</Td>
                <Td className="num text-right font-semibold">{fmtN(p.orderedQty)} <span className="text-[11px] font-normal text-muted-foreground">{p.uom}</span></Td>
                <Td>{p.orderId ? <OrderLink id={p.orderId} className="font-mono text-xs font-semibold text-brand hover:underline">{p.orderNo}</OrderLink> : <span className="text-xs text-muted-foreground">stock</span>}</Td>
                {showRate && <Td className="num text-right">{fmtInr(p.value)}</Td>}
                <Td className="text-xs">{fmtDate(p.poDate)}</Td>
                <Td className={`text-xs ${late ? 'font-semibold text-bad' : ''}`}>{fmtDate(p.eta)}{late ? ' · late' : ''}</Td>
                <Td><Bar pct={p.receivedPct} tone={p.receivedPct >= 100 ? 'ok' : p.receivedPct > 0 ? 'brand' : 'warn'} /></Td>
                <Td><StatusPill value={p.status} /></Td>
                <Td><div className="flex justify-end gap-1.5">
                  {p.status === 'Pending Approval' && hasFlag('po.approve') && <Badge tone="warn">approve</Badge>}
                  {open && hasModule('gate') && <Button size="sm" onClick={() => nav(`/gate?po=${p.id}`)}><GateIcon size={14} /> GRN</Button>}
                  <Button size="sm" variant="secondary" onClick={() => setViewing(p)}><Eye size={14} /></Button>
                </div></Td>
              </Tr>);
          })}</TBody>
        </Table>}
      </Card>

      <NewPoDialog open={creating} onClose={() => setCreating(false)} />
      <PoDetailDialog po={viewing ? all.find((p) => p.id === viewing.id) ?? viewing : null} onClose={() => setViewing(null)} />
    </div>
  );
}
