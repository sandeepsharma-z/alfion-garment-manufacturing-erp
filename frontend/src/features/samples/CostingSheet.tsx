import * as React from 'react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/shared';
import { Plus, Close, Check, Print } from '@/icons/icons';
import { Shell, openPrint, companyHead } from './StyleTools';
import type { Sample } from './SampleDialogs';

/* The client's costing sheet: fabric yardage → shrinkage → rate, trims, process costs, wastage %, sending charges, profit %. */
export type FabricLine = { item: string; description: string; yardage: number; shrinkPct: number; actYard: number; rate: number; amount: number; party: string; note: string };
export type TrimLine = { item: string; description: string; qty: number; unit: string; rate: number; amount: number; party: string; note: string };
export type CostLine = { item: string; qty: number; rate: number; amount: number; note: string };
export type Totals = { material: number; process: number; sub: number; wastage: number; afterWastage: number; charges: number; afterCharges: number; profit: number; final: number; finalFx: number };
export type Costing = { currency: string; exchangeRate: number; targetPrice: number; fabrics: FabricLine[]; trims: TrimLine[]; processes: CostLine[]; charges: CostLine[]; wastagePct: number; profitPct: number; totals?: Totals; notes?: string; updatedBy?: string; updatedAt?: string };

const F0 = (item = ''): FabricLine => ({ item, description: '', yardage: 0, shrinkPct: 0, actYard: 0, rate: 0, amount: 0, party: '', note: '' });
const T0 = (item = ''): TrimLine => ({ item, description: '', qty: 1, unit: 'pcs', rate: 0, amount: 0, party: '', note: '' });
const C0 = (item = ''): CostLine => ({ item, qty: 1, rate: 0, amount: 0, note: '' });
/** Blank sheet with the rows the client's format always has. */
export const emptyCosting = (): Costing => ({
  currency: 'USD', exchangeRate: 83.5, targetPrice: 0,
  fabrics: [F0('FABRIC-A'), F0('FABRIC-B'), F0('FABRIC-C')],
  trims: [T0('ACCESSORIES'), T0('LACE-1'), T0('LACE-2')],
  processes: ['STITCHING', 'EMBROIDERY', 'FINISHING', 'WASHING', 'LABEL / TAGS', 'INSPECTION', 'OVERHEAD'].map((x) => C0(x)),
  charges: [C0('FOB SENDING'), C0('C&F SENDING')],
  wastagePct: 5, profitPct: 25, notes: '',
});
/** Saved sheets come back with the schema's empty arrays — fall back to the standard rows so the editor is never blank. */
export const withDefaults = (c?: Costing | null): Costing => {
  const base = emptyCosting();
  if (!c) return base;
  return { ...base, ...c,
    currency: c.currency || base.currency, exchangeRate: c.exchangeRate || base.exchangeRate,
    fabrics: c.fabrics?.length ? c.fabrics : base.fabrics, trims: c.trims?.length ? c.trims : base.trims,
    processes: c.processes?.length ? c.processes : base.processes, charges: c.charges?.length ? c.charges : base.charges };
};
/** Has anyone actually costed this sample? (an all-zero sheet does not count) */
export const hasCosting = (c?: Costing | null) => !!c && ((c.totals?.final ?? 0) > 0 || [...(c.fabrics ?? []), ...(c.trims ?? []), ...(c.processes ?? []), ...(c.charges ?? [])].some((l) => (l as { rate?: number }).rate));
const n = (v: unknown) => (Number.isFinite(+(v as number)) ? +(v as number) : 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
/** Same arithmetic as the sheet (and as the server) — act yard = yardage × (1 + shrink %). */
export const computeTotals = (c: Costing): Totals => {
  const fabAmt = c.fabrics.reduce((a, l) => a + r2((n(l.actYard) || n(l.yardage) * (1 + n(l.shrinkPct) / 100)) * n(l.rate)), 0);
  const trimAmt = c.trims.reduce((a, l) => a + r2((n(l.qty) || 1) * n(l.rate)), 0);
  const process = c.processes.reduce((a, l) => a + r2((n(l.qty) || 1) * n(l.rate)), 0);
  const material = r2(fabAmt + trimAmt), sub = r2(material + process);
  const wastage = r2(sub * n(c.wastagePct) / 100), afterWastage = r2(sub + wastage);
  const charges = c.charges.reduce((a, l) => a + r2((n(l.qty) || 1) * n(l.rate)), 0);
  const afterCharges = r2(afterWastage + charges);
  const profit = r2(afterCharges * n(c.profitPct) / 100), final = r2(afterCharges + profit);
  return { material, process: r2(process), sub, wastage, afterWastage, charges: r2(charges), afterCharges, profit, final, finalFx: n(c.exchangeRate) ? r2(final / n(c.exchangeRate)) : 0 };
};
export const actYardOf = (l: FabricLine) => r2(n(l.actYard) || n(l.yardage) * (1 + n(l.shrinkPct) / 100));
export const lineAmount = (l: { qty?: number; rate: number }) => r2((n(l.qty) || 1) * n(l.rate));
const money = (v: number) => v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const Num = ({ value, onChange, w = 'w-20', step = '0.01', title }: { value: number; onChange: (v: number) => void; w?: string; step?: string; title?: string }) => (
  <input type="number" step={step} title={title} className={cn('num h-8 rounded-md border bg-card px-1.5 text-right text-xs outline-none focus:border-brand', w)} value={value || ''} onChange={(e) => onChange(+e.target.value || 0)} />
);

/** Controlled costing sheet — used as a wizard step and as the sample's Costing tab. */
export function CostingSheet({ value, onChange }: { value: Costing; onChange: (c: Costing) => void }) {
  const t = computeTotals(value);
  const setL = <K extends 'fabrics' | 'trims' | 'processes' | 'charges'>(key: K, i: number, patch: Partial<Costing[K][number]>) =>
    onChange({ ...value, [key]: value[key].map((l, j) => (j === i ? { ...l, ...patch } : l)) } as Costing);
  const del = (key: 'fabrics' | 'trims' | 'processes' | 'charges', i: number) => onChange({ ...value, [key]: value[key].filter((_, j) => j !== i) } as Costing);
  const add = (key: 'fabrics' | 'trims' | 'processes' | 'charges') =>
    onChange({ ...value, [key]: [...value[key], key === 'fabrics' ? F0() : key === 'trims' ? T0() : C0()] } as Costing);
  const Head = ({ cols }: { cols: (string | [string, string])[] }) => (
    <thead><tr className="bg-secondary text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
      {cols.map((c) => { const [label, cls] = Array.isArray(c) ? c : [c, 'text-left']; return <th key={label} className={cn('px-2 py-2', cls)}>{label}</th>; })}<th className="w-7" />
    </tr></thead>
  );
  return (
    <div className="space-y-4">
      {/* header */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Currency"><Input value={value.currency} onChange={(e) => onChange({ ...value, currency: e.target.value.toUpperCase() })} placeholder="USD" /></Field>
        <Field label="Exchange rate (₹ per unit)"><Input type="number" step="0.01" value={value.exchangeRate || ''} onChange={(e) => onChange({ ...value, exchangeRate: +e.target.value || 0 })} /></Field>
        <Field label={`Buyer target (${value.currency || 'USD'})`}><Input type="number" step="0.01" value={value.targetPrice || ''} onChange={(e) => onChange({ ...value, targetPrice: +e.target.value || 0 })} /></Field>
        <Field label="Notes"><Input value={value.notes ?? ''} onChange={(e) => onChange({ ...value, notes: e.target.value })} placeholder="quote basis, validity…" /></Field>
      </div>

      {/* fabric */}
      <div className="overflow-x-auto rounded-xl border">
        <div className="border-b bg-secondary/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Fabric — yardage × (1 + shrinkage %) × rate</div>
        <table className="w-full text-[12.5px]">
          <Head cols={['Item', 'Description', ['Yardage', 'text-right'], ['Shrink %', 'text-right'], ['Act. yard', 'text-right'], ['Rate', 'text-right'], ['Amount', 'text-right'], 'Party / note']} />
          <tbody>{value.fabrics.map((l, i) => (
            <tr key={i} className="border-t">
              <td className="p-1"><Input className="h-8 w-28 text-xs" value={l.item} onChange={(e) => setL('fabrics', i, { item: e.target.value })} placeholder="FABRIC-A" /></td>
              <td className="p-1"><Input className="h-8 min-w-[170px] text-xs" value={l.description} onChange={(e) => setL('fabrics', i, { description: e.target.value })} placeholder="92x80 voile 140 cm" /></td>
              <td className="p-1 text-right"><Num value={l.yardage} onChange={(v) => setL('fabrics', i, { yardage: v })} w="w-20" /></td>
              <td className="p-1 text-right"><Num value={l.shrinkPct} onChange={(v) => setL('fabrics', i, { shrinkPct: v })} w="w-16" step="0.1" /></td>
              <td className="num px-2 text-right font-semibold">{actYardOf(l) || '—'}</td>
              <td className="p-1 text-right"><Num value={l.rate} onChange={(v) => setL('fabrics', i, { rate: v })} /></td>
              <td className="num px-2 text-right font-bold">{money(r2(actYardOf(l) * n(l.rate)))}</td>
              <td className="p-1"><Input className="h-8 min-w-[120px] text-xs" value={l.party} onChange={(e) => setL('fabrics', i, { party: e.target.value })} placeholder="supplier / 45+20" /></td>
              <td className="p-1"><button type="button" className="text-muted-foreground hover:text-bad" onClick={() => del('fabrics', i)}><Close size={13} /></button></td>
            </tr>))}</tbody>
        </table>
        <div className="border-t bg-secondary/40 px-2 py-1.5"><Button size="sm" variant="secondary" type="button" onClick={() => add('fabrics')}><Plus size={13} /> Add fabric</Button></div>
      </div>

      {/* trims */}
      <div className="overflow-x-auto rounded-xl border">
        <div className="border-b bg-secondary/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Accessories &amp; trims — qty × rate</div>
        <table className="w-full text-[12.5px]">
          <Head cols={['Item', 'Description', ['Qty', 'text-right'], 'Unit', ['Rate', 'text-right'], ['Amount', 'text-right'], 'Party / note']} />
          <tbody>{value.trims.map((l, i) => (
            <tr key={i} className="border-t">
              <td className="p-1"><Input className="h-8 w-28 text-xs" value={l.item} onChange={(e) => setL('trims', i, { item: e.target.value })} placeholder="LACE-1" /></td>
              <td className="p-1"><Input className="h-8 min-w-[170px] text-xs" value={l.description} onChange={(e) => setL('trims', i, { description: e.target.value })} /></td>
              <td className="p-1 text-right"><Num value={l.qty} onChange={(v) => setL('trims', i, { qty: v })} w="w-16" /></td>
              <td className="p-1"><Input className="h-8 w-16 text-xs" value={l.unit} onChange={(e) => setL('trims', i, { unit: e.target.value })} placeholder="pcs" /></td>
              <td className="p-1 text-right"><Num value={l.rate} onChange={(v) => setL('trims', i, { rate: v })} /></td>
              <td className="num px-2 text-right font-bold">{money(lineAmount(l))}</td>
              <td className="p-1"><Input className="h-8 min-w-[120px] text-xs" value={l.party} onChange={(e) => setL('trims', i, { party: e.target.value })} /></td>
              <td className="p-1"><button type="button" className="text-muted-foreground hover:text-bad" onClick={() => del('trims', i)}><Close size={13} /></button></td>
            </tr>))}</tbody>
        </table>
        <div className="border-t bg-secondary/40 px-2 py-1.5"><Button size="sm" variant="secondary" type="button" onClick={() => add('trims')}><Plus size={13} /> Add trim</Button></div>
      </div>

      {/* processes + charges */}
      <div className="grid gap-4 lg:grid-cols-2">
        {([['processes', 'Process cost per piece', 'STITCHING'], ['charges', 'Sending & other charges', 'C&F SENDING']] as const).map(([key, title, ph]) => (
          <div key={key} className="overflow-x-auto rounded-xl border">
            <div className="border-b bg-secondary/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title}</div>
            <table className="w-full text-[12.5px]">
              <Head cols={['Item', ['Qty', 'text-right'], ['Rate', 'text-right'], ['Amount', 'text-right'], 'Note']} />
              <tbody>{value[key].map((l, i) => (
                <tr key={i} className="border-t">
                  <td className="p-1"><Input className="h-8 min-w-[130px] text-xs" value={l.item} onChange={(e) => setL(key, i, { item: e.target.value })} placeholder={ph} /></td>
                  <td className="p-1 text-right"><Num value={l.qty} onChange={(v) => setL(key, i, { qty: v })} w="w-14" /></td>
                  <td className="p-1 text-right"><Num value={l.rate} onChange={(v) => setL(key, i, { rate: v })} /></td>
                  <td className="num px-2 text-right font-bold">{money(lineAmount(l))}</td>
                  <td className="p-1"><Input className="h-8 min-w-[90px] text-xs" value={l.note} onChange={(e) => setL(key, i, { note: e.target.value })} /></td>
                  <td className="p-1"><button type="button" className="text-muted-foreground hover:text-bad" onClick={() => del(key, i)}><Close size={13} /></button></td>
                </tr>))}</tbody>
            </table>
            <div className="border-t bg-secondary/40 px-2 py-1.5"><Button size="sm" variant="secondary" type="button" onClick={() => add(key)}><Plus size={13} /> Add row</Button></div>
          </div>))}
      </div>

      {/* totals */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-secondary/40 p-3">
          <Field label="Wastage %"><Input type="number" step="0.1" className="w-24" value={value.wastagePct || ''} onChange={(e) => onChange({ ...value, wastagePct: +e.target.value || 0 })} /></Field>
          <Field label="Profit %"><Input type="number" step="0.1" className="w-24" value={value.profitPct || ''} onChange={(e) => onChange({ ...value, profitPct: +e.target.value || 0 })} /></Field>
          <p className="min-w-[220px] flex-1 text-[11.5px] text-muted-foreground">Material + process → <b>wastage %</b> → sending charges → <b>profit %</b> = final cost per piece. The {value.currency || 'USD'} price divides by the exchange rate.</p>
        </div>
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-[12.5px]"><tbody>
            {[['Material (fabric + trims)', t.material], ['Process', t.process], ['Sub total', t.sub], [`Wastage ${value.wastagePct || 0}%`, t.wastage], ['After wastage', t.afterWastage], ['Sending / other charges', t.charges], ['Before profit', t.afterCharges], [`Profit ${value.profitPct || 0}%`, t.profit]].map(([k, v]) => (
              <tr key={k as string} className="border-b last:border-0"><td className="px-3 py-1.5 text-muted-foreground">{k}</td><td className="num px-3 py-1.5 text-right font-semibold">₹{money(v as number)}</td></tr>))}
            <tr className="bg-brand-soft/60 dark:bg-accent"><td className="px-3 py-2 font-bold">Final cost / pc</td><td className="num px-3 py-2 text-right font-slab text-[15px] font-bold">₹{money(t.final)}</td></tr>
            <tr className="bg-brand-soft/60 dark:bg-accent"><td className="px-3 py-2 font-bold">In {value.currency || 'USD'}</td><td className={cn('num px-3 py-2 text-right font-slab text-[15px] font-bold', value.targetPrice > 0 && (t.finalFx <= value.targetPrice ? 'text-teal' : 'text-bad'))}>{t.finalFx ? `${t.finalFx}` : '—'}{value.targetPrice > 0 && <span className="block text-[10.5px] font-sans font-normal text-muted-foreground">target {value.targetPrice} · {t.finalFx <= value.targetPrice ? 'within target' : `over by ${r2(t.finalFx - value.targetPrice)}`}</span>}</td></tr>
          </tbody></table>
        </div>
      </div>
    </div>
  );
}

/** Costing tab on the sample page — loads what is saved, saves back, prints the sheet. */
export function CostingPanel({ sample, inline, onClose }: { sample: Sample; inline?: boolean; onClose?: () => void }) {
  const qc = useQueryClient();
  const [c, setC] = React.useState<Costing>(() => withDefaults(sample.costing));
  React.useEffect(() => { setC(withDefaults(sample.costing)); }, [sample.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation({
    mutationFn: async () => (await api.put(`/samples/${sample.id}/costing`, c)).data,
    onSuccess: () => { toast.success('Costing sheet saved'); qc.invalidateQueries({ queryKey: ['/samples'] }); }, onError: (e) => toast.error(apiMessage(e)),
  });
  const print = async () => openPrint(`Costing ${sample.sampleNo}`, (await companyHead(`Costing Sheet — ${sample.styleNo} · ${sample.sampleNo}`)) + costingHtml(c, sample));
  return (
    <Shell inline={inline} onClose={() => onClose?.()} title={`Costing — ${sample.sampleNo} · ${sample.styleNo}`}
      desc="Fabric, trims, processes and charges of one piece — the same sheet you quote to the buyer. Saved with the sample and printed on the sample dossier."
      footer={<><Button variant="secondary" onClick={print}><Print size={14} /> Print sheet</Button><Button disabled={save.isPending} onClick={() => save.mutate()}><Check size={15} /> Save costing</Button></>}>
      <CostingSheet value={c} onChange={setC} />
    </Shell>
  );
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string));
/** Printable costing block — also embedded in the sample dossier. */
export function costingHtml(c: Costing, sample: { sampleNo: string; styleNo: string; description: string; buyerName: string }) {
  const t = computeTotals(c);
  const rows = (title: string, body: string) => `<h2>${title}</h2><table>${body}</table>`;
  return `<p><small>${esc(sample.buyerName)} · ${esc(sample.styleNo)} · ${esc(sample.description)} · sample ${esc(sample.sampleNo)} · exchange rate ₹${c.exchangeRate}/${esc(c.currency)}${c.targetPrice ? ` · buyer target ${c.targetPrice} ${esc(c.currency)}` : ''}</small></p>
  ${rows('Fabric', `<tr><th>Item</th><th>Description</th><th class="num">Yardage</th><th class="num">Shrink %</th><th class="num">Act. yard</th><th class="num">Rate</th><th class="num">Amount</th><th>Party</th></tr>${c.fabrics.filter((l) => l.item || l.rate).map((l) => `<tr><td>${esc(l.item)}</td><td>${esc(l.description)}</td><td class="num">${l.yardage || ''}</td><td class="num">${l.shrinkPct || ''}</td><td class="num">${actYardOf(l) || ''}</td><td class="num">${l.rate || ''}</td><td class="num">${money(r2(actYardOf(l) * n(l.rate)))}</td><td>${esc(l.party)}</td></tr>`).join('')}`)}
  ${rows('Accessories &amp; trims', `<tr><th>Item</th><th>Description</th><th class="num">Qty</th><th>Unit</th><th class="num">Rate</th><th class="num">Amount</th><th>Party</th></tr>${c.trims.filter((l) => l.item || l.rate).map((l) => `<tr><td>${esc(l.item)}</td><td>${esc(l.description)}</td><td class="num">${l.qty || ''}</td><td>${esc(l.unit)}</td><td class="num">${l.rate || ''}</td><td class="num">${money(lineAmount(l))}</td><td>${esc(l.party)}</td></tr>`).join('')}`)}
  ${rows('Processes &amp; charges', `<tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th><th>Note</th></tr>${[...c.processes, ...c.charges].filter((l) => l.item || l.rate).map((l) => `<tr><td>${esc(l.item)}</td><td class="num">${l.qty || ''}</td><td class="num">${l.rate || ''}</td><td class="num">${money(lineAmount(l))}</td><td>${esc(l.note)}</td></tr>`).join('')}`)}
  ${rows('Totals', `<tr><th>Material</th><td class="num">${money(t.material)}</td><th>Process</th><td class="num">${money(t.process)}</td></tr>
    <tr><th>Sub total</th><td class="num">${money(t.sub)}</td><th>Wastage ${c.wastagePct}%</th><td class="num">${money(t.wastage)}</td></tr>
    <tr><th>After wastage</th><td class="num">${money(t.afterWastage)}</td><th>Charges</th><td class="num">${money(t.charges)}</td></tr>
    <tr><th>Before profit</th><td class="num">${money(t.afterCharges)}</td><th>Profit ${c.profitPct}%</th><td class="num">${money(t.profit)}</td></tr>
    <tr class="hi"><th>Final cost / pc (₹)</th><td class="num">${money(t.final)}</td><th>In ${esc(c.currency)}</th><td class="num">${t.finalFx}</td></tr>`)}
  ${c.notes ? `<p><small>${esc(c.notes)}</small></p>` : ''}`;
}
