import * as React from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge, Label } from '@/components/ui/misc';
import { Input } from '@/components/ui/input';
import { Search, Shield } from '@/icons/icons';
import { useFileUrl, fmtN, fmtDate } from '@/lib/crud';
import { useFormMeta, keyOf } from '@/components/form-meta';

/* ---------- auth-protected image (files need the bearer token, so a plain <img src> cannot load them) ---------- */
export const AuthImg = ({ fileId, className, alt = '' }: { fileId?: string | null; className?: string; alt?: string }) => {
  const url = useFileUrl(fileId);
  return url ? <img src={url} alt={alt} className={cn('object-cover', className)} /> : <div className={cn('animate-pulse bg-secondary', className)} />;
};

/* ---------- order link with a hover card (sample photo · style · buyer · qty · stage) — used wherever an order number is printed but a picture would clutter the row ---------- */
type OrderCard = { id: string; orderNo: string; styleNo: string; buyerName: string; description: string; qty: number; shipDate?: string; stage: string; priority: string; progress: number; sampleNo: string; photos: string[]; swatch: string };
const HoverCard = ({ id, anchor }: { id: string; anchor: DOMRect }) => {
  const q = useQuery<OrderCard>({ queryKey: ['/orders', id, 'card'], queryFn: async () => (await api.get(`/orders/${id}/card`)).data, staleTime: 5 * 60_000 });
  const o = q.data;
  const below = anchor.bottom + 190 < window.innerHeight;
  const style: React.CSSProperties = { position: 'fixed', left: Math.min(anchor.left, window.innerWidth - 300), top: below ? anchor.bottom + 6 : undefined, bottom: below ? undefined : window.innerHeight - anchor.top + 6, zIndex: 80 };
  return createPortal(
    <div style={style} className="pointer-events-none w-72 animate-rise rounded-xl border bg-card p-2.5 shadow-pop">
      {!o ? <div className="flex gap-3"><div className="h-24 w-20 animate-pulse rounded-lg bg-secondary" /><div className="flex-1 space-y-2 py-1"><div className="h-3 w-3/4 animate-pulse rounded bg-secondary" /><div className="h-3 w-1/2 animate-pulse rounded bg-secondary" /></div></div>
      : <div className="flex gap-3">
        {o.photos[0] ? <AuthImg fileId={o.photos[0]} alt={o.styleNo} className="h-24 w-20 shrink-0 rounded-lg border" /> : <div className="grid h-24 w-20 shrink-0 place-items-center rounded-lg border bg-secondary text-[10px] text-muted-foreground" style={o.swatch ? { background: o.swatch } : undefined}>{o.swatch ? '' : 'no photo'}</div>}
        <div className="min-w-0 flex-1 text-[11.5px] leading-snug">
          <div className="font-mono text-[12.5px] font-bold text-brand">{o.orderNo}</div>
          <div className="truncate font-semibold" title={o.description}>{o.description || o.styleNo}</div>
          <div className="text-muted-foreground">{o.styleNo} · {o.buyerName}</div>
          <div className="mt-1 num">{fmtN(o.qty)} pcs · ship {fmtDate(o.shipDate)}</div>
          <div className="mt-1 flex items-center gap-1.5"><Badge tone="brand" className="text-[9px]">{o.stage}</Badge>{o.priority && o.priority !== 'Normal' && <Badge tone="warn" className="text-[9px]">{o.priority}</Badge>}<span className="num text-[10.5px] text-muted-foreground">{o.progress}%</span></div>
        </div>
      </div>}
    </div>, document.body);
};
export const OrderLink = ({ id, children, className, onClick }: { id: string; children: React.ReactNode; className?: string; onClick?: (e: React.MouseEvent) => void }) => {
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const timer = React.useRef<number>();
  const show = (e: React.MouseEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); timer.current = window.setTimeout(() => setRect(r), 250); };
  const hide = () => { window.clearTimeout(timer.current); setRect(null); };
  return (
    <Link to={`/orders/${id}`} className={cn('font-mono text-xs font-semibold text-brand hover:underline', className)} onMouseEnter={show} onMouseLeave={hide} onClick={(e) => { hide(); onClick?.(e); }}>
      {children}
      {rect && <HoverCard id={id} anchor={rect} />}
    </Link>
  );
};

/* ---------- order form context: what a form should already know once an order is picked (colours × sizes, BOM, done-so-far, fabric lots) ---------- */
export type OrderCtx = {
  order: { id: string; orderNo: string; styleNo: string; styleId: string; description: string; qty: number; cutQty: number; sizeSet: string[]; priority: string; shipDate?: string; colours: { code: string; name: string; qty: number; cutQty: number; sizes: { size: string; qty: number; cutQty: number }[] }[]; sizes: { size: string; qty: number }[] };
  sample: { sampleNo: string; fabric: string; colour: string; gsm?: number; pieces: { fabric: string; colour: string }[] } | null;
  bom: { materialId: string; code: string; name: string; category: string; itemType: string; uom: string; part: string; colour: string; perPc: number; required: number; inStock: number; supplierName: string }[];
  ops: Record<string, { planned: number; done: number; pending: number; exec: string; line: string; vendorAlias: string; state: string; byColour: Record<string, { output: number; rejected: number; loaded: number }> }>;
  cutBySize: Record<string, Record<string, number>>;
  fabricLots: { grnNo: string; materialId: string; materialCode: string; lotNo: string; colour: string; thans: number; actualLength: number; actualWidth: number; gsm: number; date: string }[];
};
export const useOrderContext = (orderId?: string | null) => useQuery<OrderCtx>({ queryKey: ['/orders', orderId, 'form-context'], queryFn: async () => (await api.get(`/orders/${orderId}/form-context`)).data, enabled: !!orderId, staleTime: 30_000 });
/** planned / done / balance of one operation, for one colour or the whole order */
export const opBalance = (ctx: OrderCtx | undefined, op: string, colour?: string) => {
  const info = ctx?.ops?.[op];
  if (!ctx || !info) return null;
  if (colour) { const col = ctx.order.colours.find((c) => c.name === colour || c.code === colour); const planned = op === 'Cutting' ? (col?.cutQty || col?.qty || 0) : (col?.qty || 0); const done = info.byColour[colour]?.output || 0; return { planned, done, balance: Math.max(planned - done, 0), loaded: info.byColour[colour]?.loaded || 0 }; }
  return { planned: info.planned, done: info.done, balance: info.pending, loaded: Object.values(info.byColour).reduce((a, x) => a + x.loaded, 0) };
};
/** One-line strip under an order selector: what was set at sampling / order time, and where the order stands right now. */
export const OrderFacts = ({ ctx, op, colour, className }: { ctx?: OrderCtx; op?: string; colour?: string; className?: string }) => {
  if (!ctx) return null;
  const bal = op ? opBalance(ctx, op, colour) : null;
  const fabrics = ctx.bom.filter((l) => l.category === 'Fabric');
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-brand-soft/40 px-3 py-1.5 text-[11.5px] dark:bg-accent/40', className)}>
      <span className="font-mono font-bold text-brand">{ctx.order.orderNo}</span>
      <span className="text-muted-foreground">{ctx.order.styleNo} · {fmtN(ctx.order.qty)} pcs{ctx.order.cutQty ? ` · cut plan ${fmtN(ctx.order.cutQty)}` : ''}</span>
      {ctx.order.colours.length > 0 && <span className="text-muted-foreground">colours {ctx.order.colours.map((c) => `${c.name} ${fmtN(c.qty)}`).join(' · ')}</span>}
      {fabrics.length > 0 && <span className="text-muted-foreground">fabric {fabrics.map((l) => l.code).join(', ')}</span>}
      {ctx.sample?.fabric && !fabrics.length && <span className="text-muted-foreground">sample fabric {ctx.sample.fabric}</span>}
      {bal && <span className="ml-auto font-semibold">{op}{colour ? ` · ${colour}` : ''}: <span className="num">{fmtN(bal.done)}</span> of <span className="num">{fmtN(bal.planned)}</span> done · <span className={cn('num', bal.balance ? 'text-brand' : 'text-teal')}>{bal.balance ? `${fmtN(bal.balance)} balance` : 'complete'}</span></span>}
    </div>
  );
};

/* ---------- page header ---------- */
export const PageHeader = ({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) => (
  <div className="flex flex-wrap items-end gap-4">
    <div>
      <h1 className="font-slab text-[22px] font-bold">{title}</h1>
      {sub && <p className="mt-0.5 text-[13px] text-muted-foreground">{sub}</p>}
    </div>
    {children && <div className="ml-auto flex flex-wrap gap-2">{children}</div>}
  </div>
);

/* ---------- KPI tile ---------- */
const TONES: Record<string, string> = {
  brand: 'bg-brand-soft text-brand dark:bg-accent',
  teal: 'bg-teal-soft text-teal dark:bg-teal/15',
  info: 'bg-info-soft text-info dark:bg-info/15',
  gold: 'bg-gold-soft text-gold dark:bg-gold-vivid/15 dark:text-gold-vivid',
  bad: 'bg-bad-soft text-bad dark:bg-bad/15',
  mute: 'bg-secondary text-muted-foreground',
};
export const KpiTile = ({ icon: Icon, label, value, foot, tone = 'brand' }: {
  icon: (p: { size?: number }) => JSX.Element; label: string; value: React.ReactNode; foot?: string; tone?: keyof typeof TONES;
}) => (
  <Card className="p-4">
    <div className="flex items-center gap-3">
      <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg', TONES[tone])}><Icon size={19} /></div>
      <div className="min-w-0">
        <div className="num truncate font-slab text-2xl font-bold leading-none">{value}</div>
        <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        {foot && <div className="mt-0.5 text-[11px] text-muted-foreground">{foot}</div>}
      </div>
    </div>
  </Card>
);

/* ---------- search + chips toolbar (goes inside a Card) ---------- */
export const Toolbar = ({ q, setQ, placeholder, chips, chip, setChip, right }: {
  q: string; setQ: (v: string) => void; placeholder?: string;
  chips?: string[]; chip?: string; setChip?: (c: string) => void; right?: React.ReactNode;
}) => (
  <div className="flex flex-wrap items-center gap-2.5 border-b px-4 py-3">
    <div className="flex h-9 min-w-56 items-center gap-2 rounded-lg border bg-secondary px-3">
      <Search size={15} className="text-muted-foreground" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder || 'Search…'}
        className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground" />
    </div>
    {chips && setChip && (
      <div className="ml-auto flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button key={c} onClick={() => setChip(c)}
            className={cn('h-9 rounded-lg border px-3 text-xs font-semibold transition-colors',
              chip === c ? 'border-brand/40 bg-brand-soft text-brand dark:bg-accent' : 'text-muted-foreground hover:border-brand/40 hover:text-foreground')}>
            {c}
          </button>
        ))}
      </div>
    )}
    {right && <div className={cn(!chips && 'ml-auto')}>{right}</div>}
  </div>
);

/* ---------- form field ---------- */
export const Field = ({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) => {
  const meta = useFormMeta();
  const ov = meta?.lookup(label);
  // required tracking for built-in fields the admin marked required: read the value straight off the single child input/select
  const child = React.isValidElement(children) ? (children as React.ReactElement<{ value?: unknown; type?: string; placeholder?: string }>) : null;
  const v = child?.props.value;
  const empty = v === undefined || v === null || v === '' || (child?.props.type === 'number' && Number(v) === 0);
  const missing = !!ov?.required && empty;
  const key = keyOf(label);
  React.useEffect(() => { if (meta && ov?.required !== undefined) meta.report(key, missing); return () => { if (meta && ov?.required !== undefined) meta.report(key, false); }; }, [meta, ov?.required, key, missing]);
  if (ov?.hidden) return null;
  const textLike = !!child && (child.type === Input || child.type === 'input' || child.type === 'textarea');
  let content: React.ReactNode = children;
  if (child && textLike) {
    const plain = child.type === Input && (child.props.type === undefined || child.props.type === 'text');
    const cp = child.props as { value?: unknown; onChange?: (e: { target: { value: string } }) => void; placeholder?: string; className?: string; readOnly?: boolean };
    const ph = ov?.placeholder ?? cp.placeholder;
    if (plain && ov?.type === 'textarea') content = <textarea rows={3} value={String(cp.value ?? '')} onChange={(e) => cp.onChange?.(e)} placeholder={ph} readOnly={cp.readOnly} className="w-full rounded-md border border-input bg-secondary px-3 py-2 text-sm outline-none focus-visible:border-brand focus-visible:bg-card" />;
    else if (plain && ov?.type === 'select') content = <select value={String(cp.value ?? '')} onChange={(e) => cp.onChange?.(e)} disabled={cp.readOnly} className="h-[38px] w-full rounded-md border border-input bg-secondary px-3 text-sm"><option value="">{ov.placeholder || 'Select…'}</option>{(ov.options ?? []).concat(cp.value && !(ov.options ?? []).includes(String(cp.value)) ? [String(cp.value)] : []).map((o) => <option key={o} value={o}>{o}</option>)}</select>;
    else if (plain && ov?.type && ov.type !== 'text') content = React.cloneElement(child, { type: ov.type === 'phone' ? 'tel' : ov.type, placeholder: ph });
    else if (ov?.placeholder) content = React.cloneElement(child, { placeholder: ov.placeholder });
  }
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label>{ov?.label || label}{ov?.required && <span className="ml-0.5 text-bad">*</span>}</Label>
      {content}
      {(ov?.hint ?? hint) && <p className="text-[11px] text-muted-foreground">{ov?.hint ?? hint}</p>}
    </div>
  );
};

/* ---------- empty state ---------- */
export const EmptyState = ({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) => (
  <div className="grid place-items-center px-6 py-14 text-center">
    <div>
      <div className="font-slab text-base font-bold">{title}</div>
      {text && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  </div>
);

/* ---------- confidential notice (SEC-3) ---------- */
export const MaskedNote = ({ what }: { what: string }) => (
  <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info-soft px-4 py-3 text-[12.5px] text-info dark:bg-info/10">
    <Shield size={17} className="mt-0.5 shrink-0" />
    <div><b>Confidential fields hidden.</b> {what} are shown only to users with the confidential-access flag.
      Ask an administrator if your role needs it.</div>
  </div>
);

/* ---------- status → pill tone ---------- */
const TONE_MAP: Record<string, 'ok' | 'warn' | 'bad' | 'info' | 'brand' | 'mute'> = {
  Active: 'ok', Inactive: 'mute', Healthy: 'ok', 'Below Reorder': 'warn', 'Short for Orders': 'bad', 'Out of Stock': 'bad',
  'In Sampling': 'brand', Sent: 'info', 'Client Review': 'info', Revision: 'warn', Approved: 'ok', Rejected: 'bad',
  Open: 'ok', Closed: 'mute', Urgent: 'bad', High: 'warn', Normal: 'mute', Low: 'mute',
  'Order Confirmed': 'ok', 'Material Sourcing': 'warn', 'Job Work': 'brand', Cutting: 'info', Stitching: 'brand',
  Finishing: 'info', Packing: 'warn', Dispatch: 'ok', Payment: 'info', 'In Stock': 'ok', Purchase: 'bad',
  'Pending Approval': 'warn', Ordered: 'info', 'In Transit': 'brand', 'Partially Received': 'warn', 'Fully Received': 'ok', Cancelled: 'mute',
  Reserved: 'ok', Available: 'ok', 'On Order': 'info', 'Not Ordered': 'bad', 'No BOM': 'mute', 'Passed 4-point': 'ok', 'Passed with deviation': 'warn',
  'Sent to Vendor': 'brand', Overdue: 'bad', Received: 'ok', Completed: 'ok', 'In Process': 'brand', Blocked: 'bad', Pending: 'mute', Queued: 'mute', 'In Progress': 'info',
  Sufficient: 'ok', 'Reorder Now': 'bad', Idle: 'mute', Running: 'info', 'On Target': 'ok',
  Draft: 'mute', 'In Review': 'warn', Superseded: 'mute', Pass: 'ok', Fail: 'bad', Hold: 'warn', Done: 'ok', Due: 'warn', 'Not started': 'mute', Graded: 'ok',
  'Docs In Progress': 'warn', 'Ready to Ship': 'info', 'Shipped On Board': 'brand', Delivered: 'ok', Awaited: 'warn', Partial: 'info',
  Valid: 'ok', Expiring: 'warn', Expired: 'bad', 'No expiry': 'mute', 'Renewal in progress': 'info', 'Due soon': 'warn', 'On track': 'ok', Yes: 'bad',
};
export const StatusPill = ({ value, className }: { value: string; className?: string }) => (
  <Badge tone={TONE_MAP[value] ?? 'mute'} className={className}>{value}</Badge>
);

/* ---------- progress bar ---------- */
export const Bar = ({ pct, tone = 'brand' }: { pct: number; tone?: 'brand' | 'ok' | 'warn' | 'bad' }) => {
  const c = { brand: 'bg-brand', ok: 'bg-teal-vivid', warn: 'bg-gold-vivid', bad: 'bg-bad-vivid' }[tone];
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full border bg-secondary">
        <div className={cn('h-full rounded-full', c)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="num w-9 text-right text-[11.5px] text-muted-foreground">{pct}%</span>
    </div>
  );
};
