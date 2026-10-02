import * as React from 'react';
import { cn } from '@/lib/utils';

/* Hand-drawn SVG charts (the approved demo used no chart library). Colours come from the brand tokens. */
const C = { brand: '#a05aff', teal: '#1bcfb4', info: '#4bcbeb', gold: '#f5a33c', bad: '#fe9496', ink: '#111827', muted: '#9ca3af' };
const PALETTE = [C.brand, C.teal, C.info, C.bad, C.gold, '#9e58ff', '#14b8a6', '#c4b5fd'];

const fmtShort = (v: number) => (v >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : `${v}`);

/** Two-series line chart: left axis = series A (area), right axis = series B (dashed). */
export function LineChart({ labels, a, b, aLabel, bLabel, height = 220 }: { labels: string[]; a: number[]; b?: number[]; aLabel: string; bLabel?: string; height?: number }) {
  const W = 760, H = height, px = 44, py = 18;
  const n = labels.length;
  const x = (i: number) => px + (n > 1 ? (i * (W - 2 * px)) / (n - 1) : (W - 2 * px) / 2);
  const maxA = Math.max(...a, 1), maxB = b ? Math.max(...b, 1) : 1;
  const ya = (v: number) => H - py - (v / maxA) * (H - 2 * py);
  const yb = (v: number) => H - py - (v / maxB) * (H - 2 * py);
  const pathA = a.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${ya(v)}`).join(' ');
  const pathB = b ? b.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${yb(v)}`).join(' ') : '';
  const [hover, setHover] = React.useState<number | null>(null);
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[560px] w-full" onMouseLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={px} x2={W - px} y1={H - py - f * (H - 2 * py)} y2={H - py - f * (H - 2 * py)} stroke="currentColor" strokeOpacity={0.08} />)}
        {[0, 0.5, 1].map((f) => <text key={f} x={px - 6} y={H - py - f * (H - 2 * py) + 4} textAnchor="end" fontSize="10" fill={C.muted}>{fmtShort(maxA * f)}</text>)}
        {b && [0, 0.5, 1].map((f) => <text key={f} x={W - px + 6} y={H - py - f * (H - 2 * py) + 4} fontSize="10" fill={C.muted}>₹{fmtShort(maxB * f)}</text>)}
        <path d={`${pathA} L${x(n - 1)},${H - py} L${x(0)},${H - py} Z`} fill={C.brand} fillOpacity={0.12} />
        <path d={pathA} fill="none" stroke={C.brand} strokeWidth={2.5} strokeLinejoin="round" />
        {b && <path d={pathB} fill="none" stroke={C.teal} strokeWidth={2} strokeDasharray="6 4" strokeLinejoin="round" />}
        {labels.map((l, i) => (
          <g key={l} onMouseEnter={() => setHover(i)}>
            <rect x={x(i) - 14} y={py} width={28} height={H - 2 * py} fill="transparent" />
            <circle cx={x(i)} cy={ya(a[i])} r={hover === i ? 5 : 3} fill={C.brand} />
            {b && <circle cx={x(i)} cy={yb(b[i])} r={hover === i ? 5 : 3} fill={C.teal} />}
            <text x={x(i)} y={H - 3} textAnchor="middle" fontSize="10" fill={C.muted}>{l}</text>
          </g>))}
        {hover !== null && (
          <g transform={`translate(${Math.min(x(hover) + 8, W - 170)},${py + 4})`}>
            <rect width="160" height={b ? 40 : 26} rx="6" fill={C.ink} fillOpacity={0.92} />
            <text x="8" y="16" fontSize="11" fill="#fff">{labels[hover]} · {aLabel}: {a[hover].toLocaleString('en-IN')}</text>
            {b && <text x="8" y="31" fontSize="11" fill="#9fe3dd">{bLabel}: ₹{b[hover].toLocaleString('en-IN')}</text>}
          </g>)}
      </svg>
      <div className="mt-1 flex gap-4 text-[11px] text-muted-foreground"><span className="flex items-center gap-1.5"><i className="inline-block h-2 w-4 rounded" style={{ background: C.brand }} /> {aLabel}</span>{b && <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 border-t-2 border-dashed" style={{ borderColor: C.teal }} /> {bLabel}</span>}</div>
    </div>
  );
}

export function BarChart({ items, valueLabel, format = (v: number) => v.toLocaleString('en-IN'), height = 220 }: { items: { label: string; value: number; sub?: string }[]; valueLabel: string; format?: (v: number) => string; height?: number }) {
  const W = 760, H = height, px = 36, py = 22;
  const max = Math.max(...items.map((i) => i.value), 1);
  const bw = items.length ? Math.min(70, (W - 2 * px) / items.length - 12) : 0;
  const x = (i: number) => px + i * ((W - 2 * px) / Math.max(items.length, 1)) + ((W - 2 * px) / Math.max(items.length, 1) - bw) / 2;
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[480px] w-full">
        {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={px} x2={W - px} y1={H - py - f * (H - 2 * py - 10)} y2={H - py - f * (H - 2 * py - 10)} stroke="currentColor" strokeOpacity={0.08} />)}
        {items.map((it, i) => { const h = (it.value / max) * (H - 2 * py - 10); return (
          <g key={it.label}>
            <rect x={x(i)} y={H - py - h} width={bw} height={h} rx="6" fill={PALETTE[i % PALETTE.length]} fillOpacity={0.9} />
            <text x={x(i) + bw / 2} y={H - py - h - 5} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="currentColor">{format(it.value)}</text>
            <text x={x(i) + bw / 2} y={H - 6} textAnchor="middle" fontSize="10" fill={C.muted}>{it.label.length > 14 ? it.label.slice(0, 13) + '…' : it.label}</text>
          </g>); })}
        {!items.length && <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="12" fill={C.muted}>No data</text>}
      </svg>
      <div className="mt-1 text-[11px] text-muted-foreground">{valueLabel}</div>
    </div>
  );
}

export function Donut({ items, centerLabel, format = (v: number) => v.toLocaleString('en-IN'), size = 200 }: { items: { label: string; value: number }[]; centerLabel: string; format?: (v: number) => string; size?: number }) {
  const total = items.reduce((a, i) => a + i.value, 0) || 1;
  const r = 70, cx = 100, cy = 100, stroke = 26;
  let acc = 0;
  const [hover, setHover] = React.useState<number | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 200 200" width={size} height={size} onMouseLeave={() => setHover(null)}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeOpacity={0.08} strokeWidth={stroke} />
        {items.map((it, i) => { const frac = it.value / total; const dash = 2 * Math.PI * r; const off = -acc * dash; acc += frac; return (
          <circle key={it.label} cx={cx} cy={cy} r={r} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth={hover === i ? stroke + 6 : stroke} strokeDasharray={`${frac * dash} ${dash}`} strokeDashoffset={off} transform={`rotate(-90 ${cx} ${cy})`} onMouseEnter={() => setHover(i)} style={{ transition: 'stroke-width .15s' }} />); })}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="15" fontWeight="700" fill="currentColor">{hover !== null ? format(items[hover].value) : format(total)}</text>
        <text x={cx} y={cy + 13} textAnchor="middle" fontSize="9.5" fill={C.muted}>{hover !== null ? items[hover].label.toUpperCase().slice(0, 18) : centerLabel}</text>
      </svg>
      <ul className="space-y-1.5 text-[12px]">{items.map((it, i) => (
        <li key={it.label} className={cn('flex items-center gap-2', hover === i && 'font-semibold')} onMouseEnter={() => setHover(i)}><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />{it.label}<span className="ml-auto pl-4 text-muted-foreground">{format(it.value)} · {Math.round(it.value * 100 / total)}%</span></li>))}
        {!items.length && <li className="text-muted-foreground">No data</li>}</ul>
    </div>
  );
}
