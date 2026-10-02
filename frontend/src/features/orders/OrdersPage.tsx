import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { useList, fmtN, fmtInr, fmtDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Skeleton, Badge } from '@/components/ui/misc';
import { PageHeader, KpiTile, Toolbar, StatusPill, EmptyState, AuthImg } from '@/components/shared';
import { Orders as OrdersIcon, Clock, Alert, Payments, Ship, ChevronRight, FileIcon } from '@/icons/icons';

export type Order = {
  id: string; orderNo: string; sampleId?: string; sampleNo: string; sampleRound: number; styleId?: string; styleNo: string; description: string;
  buyerId: string; buyerName: string; buyerPoNo: string; fabric: string; colour: string; sizeRange: string; accessories: string;
  qty: number; cutQty: number; sizes: { size: string; pct: number; qty: number }[]; fobRate?: number; value?: number; currency: string;
  sizeSet?: string[]; colours?: { code: string; name: string; qty: number; cutQty: number; sizes: { size: string; qty: number; cutQty?: number; barcode?: string }[] }[]; cutExtraPct?: number;
  unitPrice?: number; firstPrice?: number; fxRate?: number; valueFx?: number; revision?: number; revisions?: { no: number; at: string; by: string; reason: string; changes: { field: string; from: string; to: string }[] }[];
  cancelledQty?: number; targetShipDate?: string; deliveryDate?: string; salesMonth?: string; buyerOrderId?: string; buyerOrderNo?: string; shippedQty?: number; shipments?: number; balanceQty?: number;
  shipDate?: string; paymentTerms: string; mode: string; priority: string; instructions: string;
  specSheet?: { version?: number; fileId?: string; fileName?: string; kind?: string }; stage: string; progress: number; status: string;
  activity: { at: string; by: string; text: string }[]; createdBy: string; createdAt: string;
  photos?: string[]; photoCount?: number; swatch?: string; pieceColours?: string[]; custom?: Record<string, unknown>;
};

const STAGES = ['Order Confirmed', 'Material Sourcing', 'Job Work', 'Cutting', 'Stitching', 'Finishing', 'Packing', 'Dispatch', 'Payment', 'Closed'];
const CHIPS = ['All', ...STAGES];
const DAY = 864e5;

/** Ship-date countdown: "in 12 d", "today", "3 d late". */
const shipHint = (d?: string, closed = false) => {
  if (!d || closed) return null;
  const n = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / DAY);
  if (n < 0) return { text: `${-n} d late`, tone: 'text-bad' };
  if (n === 0) return { text: 'ships today', tone: 'text-bad' };
  if (n <= 21) return { text: `in ${n} d`, tone: 'text-gold' };
  return { text: `in ${n} d`, tone: 'text-muted-foreground' };
};
const isLight = (hex?: string) => { if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return true; const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (r * 299 + g * 587 + b * 114) / 1000 > 150; };

/** Photo of the first sample piece; falls back to a swatch tile with the colour name. */
function Thumb({ o }: { o: Order }) {
  const photo = o.photos?.[0];
  if (photo) {
    return (
      <div className="relative h-[92px] w-[74px] shrink-0 overflow-hidden rounded-xl border bg-secondary">
        <AuthImg fileId={photo} className="h-full w-full" alt={o.description} />
        {(o.photoCount ?? 0) > 1 && <span className="absolute bottom-1 right-1 rounded-md bg-ink/80 px-1.5 py-px font-mono text-[10px] font-bold text-white">+{(o.photoCount ?? 1) - 1}</span>}
      </div>
    );
  }
  const sw = o.swatch && o.swatch !== '#8ba9c9' ? o.swatch : undefined;
  return (
    <div className={cn('flex h-[92px] w-[74px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border text-center', !sw && 'border-dashed bg-secondary')} style={sw ? { background: sw } : undefined} title={o.colour ? `Colour: ${o.colour}` : 'No sample photo'}>
      {!sw && <span className="h-6 w-6 rounded-full border-2 border-white shadow-sm" style={{ background: o.swatch || '#8ba9c9' }} />}
      <span className={cn('px-1 text-[10.5px] font-semibold leading-tight', sw ? (isLight(sw) ? 'text-ink' : 'text-white') : 'text-muted-foreground')}>{o.colour || 'No photo'}</span>
    </div>
  );
}

const ColourDot = ({ hex, name }: { hex?: string; name?: string }) => name ? <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border shadow-sm" style={{ background: hex || '#8ba9c9' }} />{name}</span> : null;

export default function OrdersPage() {
  const nav = useNavigate();
  const { hasFlag } = useAuth();
  const showValue = hasFlag('rates.view');
  const [q, setQ] = React.useState('');
  const [chip, setChip] = React.useState('All');
  const { data, isLoading } = useList<Order>('/orders', { size: 500 });
  const all = data?.items ?? [];
  const open = all.filter((o) => o.status === 'Open');
  const rows = all
    .filter((o) => {
      const t = `${o.orderNo} ${o.styleNo} ${o.description} ${o.buyerName} ${o.buyerPoNo} ${o.colour}`.toLowerCase();
      return (!q || t.includes(q.toLowerCase())) && (chip === 'All' || (chip === 'Closed' ? o.status === 'Closed' : o.stage === chip && o.status === 'Open'));
    })
    .sort((a, b) => (a.status === b.status ? (a.shipDate ? new Date(a.shipDate).getTime() : Infinity) - (b.shipDate ? new Date(b.shipDate).getTime() : Infinity) : a.status === 'Open' ? -1 : 1));
  const soon = open.filter((o) => o.shipDate && (new Date(o.shipDate).getTime() - Date.now()) / DAY < 21);
  const counts = Object.fromEntries(CHIPS.map((c) => [c, c === 'All' ? all.length : c === 'Closed' ? all.length - open.length : open.filter((o) => o.stage === c).length]));

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Orders" sub="Created only from an approved sample. Open an order for its Control Tower, material requirement, TNA and activity." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={OrdersIcon} label="Open Orders" value={open.length} tone="brand" foot={`${fmtN(open.reduce((a, o) => a + o.qty, 0))} pcs in work`} />
        <KpiTile icon={Clock} label="Shipping ≤ 3 Weeks" value={soon.length} tone={soon.length ? 'gold' : 'teal'} foot="by ship date" />
        <KpiTile icon={Alert} label="Urgent / High" value={open.filter((o) => ['Urgent', 'High'].includes(o.priority)).length} tone="bad" />
        {showValue
          ? <KpiTile icon={Payments} label="Open Order Value" value={fmtInr(open.reduce((a, o) => a + (o.value || 0), 0))} tone="info" foot="FOB × quantity" />
          : <KpiTile icon={OrdersIcon} label="Closed" value={all.length - open.length} tone="mute" />}
      </div>

      <Card>
        <Toolbar q={q} setQ={setQ} placeholder="Search order, style, buyer, PO, colour…" chips={CHIPS.filter((c) => c === 'All' || counts[c] > 0 || c === chip)} chip={chip} setChip={setChip} />
        {isLoading ? <div className="space-y-3 p-5">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        : !rows.length ? <EmptyState title="No orders" text="Approve a sample and use “Convert to Order” on the Samples page." />
        : <div className="divide-y">
          {rows.map((o) => {
            const closed = o.status === 'Closed';
            const hint = shipHint(o.shipDate, closed);
            const stageIdx = Math.max(STAGES.indexOf(closed ? 'Closed' : o.stage), 0);
            return (
              <button key={o.id} type="button" onClick={() => nav(`/orders/${o.id}`)} className={cn('group grid w-full gap-4 px-4 py-3.5 text-left transition-colors hover:bg-secondary/50 md:grid-cols-[74px_1fr_auto] md:items-center', closed && 'opacity-70')}>
                <Thumb o={o} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-[13px] font-bold text-brand">{o.orderNo}</span>
                    <span className="truncate text-[13.5px] font-semibold">{o.description}</span>
                    {o.priority !== 'Normal' && <StatusPill value={o.priority} />}
                    {closed && <StatusPill value="Closed" />}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{o.buyerName}</span>
                    {o.buyerPoNo && <span>PO {o.buyerPoNo}</span>}
                    <span>{o.styleNo} · from {o.sampleNo}</span>
                    <ColourDot hex={o.swatch} name={o.colour} />
                    {o.pieceColours && o.pieceColours.length > 1 && <span title={o.pieceColours.join(', ')}>{o.pieceColours.length} colours</span>}
                    {o.fabric && <span className="truncate">{o.fabric}</span>}
                  </div>
                  <div className="mt-2 flex items-center gap-2.5">
                    <StatusPill value={closed ? 'Closed' : o.stage} />
                    <div className="flex flex-1 items-center gap-1" title={`${o.progress}% · stage ${stageIdx + 1} of ${STAGES.length}`}>
                      {STAGES.slice(0, -1).map((s, i) => <span key={s} className={cn('h-1.5 flex-1 rounded-full', i < stageIdx ? 'bg-teal' : i === stageIdx ? (closed ? 'bg-teal' : 'bg-brand') : 'bg-secondary')} />)}
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">{o.progress}%</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 md:grid md:grid-cols-[auto_auto_auto_auto] md:gap-x-6 md:text-right">
                  <div><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Qty</div><div className="font-mono text-[13px] font-bold">{fmtN(o.qty)}</div><div className="text-[10.5px] text-muted-foreground">pcs</div></div>
                  <div><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Ship</div><div className="text-[12.5px] font-semibold">{fmtDate(o.shipDate)}</div>{hint ? <div className={cn('text-[10.5px] font-semibold', hint.tone)}>{hint.text}</div> : <div className="text-[10.5px] text-muted-foreground">{o.shipDate ? '' : 'not set'}</div>}</div>
                  <div><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{showValue ? 'Value' : 'Mode'}</div>{showValue ? <><div className="font-mono text-[13px] font-bold">{fmtInr(o.value)}</div><div className="flex items-center justify-end gap-1 text-[10.5px] text-muted-foreground"><Ship size={11} /> {o.mode}</div></> : <div className="flex items-center gap-1 text-[12.5px] font-semibold"><Ship size={12} /> {o.mode}</div>}</div>
                  <div className="flex items-center gap-2">
                    {o.specSheet?.fileName ? <Badge tone="ok" title={o.specSheet.fileName}><FileIcon size={11} /> Spec v{o.specSheet.version}</Badge> : <Badge tone="warn">No spec</Badge>}
                    <ChevronRight size={16} className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                  </div>
                </div>
              </button>);
          })}
        </div>}
      </Card>
    </div>
  );
}
