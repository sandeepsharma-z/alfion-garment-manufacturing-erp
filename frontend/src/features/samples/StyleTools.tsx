import * as React from 'react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { fmtDate, toInputDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/misc';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/shared';
import { Plus, Close, Check, Print } from '@/icons/icons';
import { SizeSetPicker, useOrdersMeta } from '@/features/orders/OrderCommercial';
import type { Sample } from './SampleDialogs';

export type Pom = { code: string; name: string; tolerance: number; spec: Record<string, number> };
export type Style = { id: string; styleNo: string; description: string; sizeSet: string[]; pom: Pom[]; pomUnit: 'cm' | 'in';
  techPack?: { composition: string; lining: string; article: string; construction: string; labelPlacement: string; packingMethod: string; accessories: { item: string; qtyPerPc: number; note: string }[] };
  approvals?: Approval[] };
export type Approval = { title: string; group: string; dueDate?: string; pcsPerColour?: number; receivedOn?: string; submittedOn?: string; awb?: string; approvedOn?: string; commentsOn?: string; status: string; comment?: string; by?: string };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
export const useStyle = (id?: string | null) => useQuery<Style>({ queryKey: ['/styles', id], queryFn: async () => (await api.get(`/styles/${id}`)).data, enabled: !!id });
const PRINT_CSS = 'body{font:12.5px/1.4 Arial,sans-serif;color:#1f2430;margin:28px}h1{font-size:18px;margin:0}h2{font-size:12px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.06em;color:#666}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d8dbe2;padding:5px 7px;text-align:left;vertical-align:top}th{background:#f5f6f8}.num{text-align:right}.bad{color:#c0392b;font-weight:700}.hi{background:#fff3e8;font-weight:700}.head{display:flex;justify-content:space-between;border-bottom:3px solid #f28c4a;padding-bottom:10px}small{color:#666}.sign{margin-top:40px;display:flex;gap:40px}.sign div{flex:1;border-top:1px solid #333;padding-top:6px;font-size:11px}@media print{body{margin:12mm}}';
export function openPrint(title: string, body: string) {
  const w = window.open('', '_blank');
  if (!w) { toast.error('Pop-up blocked — allow pop-ups to print'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>${body}<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
  w.document.close();
}
export async function companyHead(title: string, formatKey?: string) {
  const c = (await api.get('/settings/company')).data;
  const fmt = formatKey && c.formatNos ? c.formatNos[formatKey] : '';
  return `<div class="head"><div><h1>${esc(c.legalName || 'Afion International')}</h1><small>${esc(c.address)}${c.phone ? ' · ' + esc(c.phone) : ''}</small><div style="margin-top:8px;font-size:15px;font-weight:700">${esc(title)}</div></div><div style="text-align:right"><small>${fmt ? `Format No.: <b>${esc(fmt)}</b><br>` : ''}Printed ${fmtDate(new Date().toISOString())}</small></div></div>`;
}

/** Same editor, two shells: a dialog when opened from a list, an inline panel on the sample page tabs. */
export function Shell({ inline, title, desc, footer, bodyClass, onClose, children }: { inline?: boolean; title: React.ReactNode; desc?: React.ReactNode; footer?: React.ReactNode; bodyClass?: string; onClose: () => void; children: React.ReactNode }) {
  if (inline) return (
    <Card>
      <CardHeader className="space-y-0"><CardTitle>{title}</CardTitle>{desc && <p className="text-xs text-muted-foreground">{desc}</p>}</CardHeader>
      <CardContent className={cn('pt-0', bodyClass)}>{children}</CardContent>
      {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-secondary/40 px-5 py-3">{footer}</div>}
    </Card>
  );
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent wide>
        <DialogHeader><DialogTitle>{title}</DialogTitle>{desc && <DialogDescription>{desc}</DialogDescription>}</DialogHeader>
        <DialogBody className={bodyClass}>{children}</DialogBody>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

/** Controlled POM table — used by the style POM panel and by step 3 of the new-sample wizard (before a style exists). */
export function PomEditor({ sizes, setSizes, unit, setUnit, rows, setRows }: { sizes: string[]; setSizes: (v: string[]) => void; unit: 'cm' | 'in'; setUnit: (v: 'cm' | 'in') => void; rows: Pom[]; setRows: (v: Pom[]) => void }) {
  const meta = useOrdersMeta(true);
  const set = (i: number, patch: Partial<Pom>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const grade = () => setRows(rows.map((r) => {   // fill blank sizes from the first typed size with a constant +/- step (grading rule)
    const typed = sizes.map((z, i) => [i, r.spec[z]] as const).filter(([, v]) => v != null && !Number.isNaN(v));
    if (typed.length < 2) return r;
    const step = (typed[1][1] - typed[0][1]) / (typed[1][0] - typed[0][0]);
    const spec = { ...r.spec }; sizes.forEach((z, i) => { if (spec[z] == null) spec[z] = Math.round((typed[0][1] + step * (i - typed[0][0])) * 100) / 100; });
    return { ...r, spec };
  }));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1"><SizeSetPicker value={sizes} onChange={setSizes} sets={meta.data?.sizeSets ?? []} /></div>
        <Field label="Unit"><Select value={unit} onValueChange={(v) => setUnit(v as 'cm' | 'in')}><SelectTrigger className="w-24"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cm">cm</SelectItem><SelectItem value="in">inches</SelectItem></SelectContent></Select></Field>
        <Button variant="secondary" size="sm" type="button" onClick={grade} title="Fill blank sizes by the step between the two typed sizes">Auto-grade</Button>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-[12.5px]">
          <thead><tr className="bg-secondary text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground"><th className="px-2 py-2 text-left">Code</th><th className="px-2 py-2 text-left">Point of measure</th>{sizes.map((z) => <th key={z} className="px-1 py-2 text-center">{z}</th>)}<th className="px-2 py-2 text-center">Tol ±</th><th className="w-8" /></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-t">
            <td className="p-1"><Input className="h-8 w-14 font-mono text-xs" value={r.code} onChange={(e) => set(i, { code: e.target.value })} /></td>
            <td className="p-1"><Input className="h-8 min-w-[180px] text-xs" value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Chest 1 inch below armhole" /></td>
            {sizes.map((z) => <td key={z} className="p-1 text-center"><input type="number" step="0.1" className="num h-8 w-16 rounded-md border bg-card px-1 text-center text-xs outline-none focus:border-brand" value={r.spec[z] ?? ''} onChange={(e) => set(i, { spec: { ...r.spec, [z]: e.target.value === '' ? (undefined as unknown as number) : +e.target.value } })} /></td>)}
            <td className="p-1 text-center"><input type="number" step="0.1" className="num h-8 w-14 rounded-md border bg-card px-1 text-center text-xs outline-none" value={r.tolerance ?? ''} onChange={(e) => set(i, { tolerance: +e.target.value })} /></td>
            <td className="p-1"><button type="button" className="text-muted-foreground hover:text-bad" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Close size={14} /></button></td>
          </tr>)}</tbody>
        </table>
        <div className="border-t bg-secondary/40 px-2 py-1.5"><Button size="sm" variant="secondary" type="button" onClick={() => { const used = new Set(rows.map((r) => r.code.toUpperCase())); const code = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find((c) => !used.has(c)) || String(rows.length + 1); setRows([...rows, { code, name: '', tolerance: 0.5, spec: {} }]); }}><Plus size={13} /> Add POM</Button></div>
      </div>
    </div>
  );
}

/** POM measurement spec of a style: rows = points of measure, columns = sizes of the style's size set, ± tolerance. */
export function PomDialog({ styleId, onClose, inline }: { styleId: string | null; onClose: () => void; inline?: boolean }) {
  const qc = useQueryClient();
  const style = useStyle(styleId);
  const [sizes, setSizes] = React.useState<string[]>([]);
  const [unit, setUnit] = React.useState<'cm' | 'in'>('cm');
  const [rows, setRows] = React.useState<Pom[]>([]);
  React.useEffect(() => { if (style.data) { setSizes(style.data.sizeSet?.length ? style.data.sizeSet : ['S', 'M', 'L', 'XL']); setUnit(style.data.pomUnit || 'cm'); setRows(style.data.pom?.length ? style.data.pom.map((p) => ({ ...p, spec: { ...(p.spec || {}) } })) : DEFAULT_POM.map((p) => ({ ...p, spec: {} }))); } }, [style.data]);
  const save = useMutation({ mutationFn: async () => (await api.put(`/styles/${styleId}/pom`, { sizeSet: sizes, pomUnit: unit, pom: rows })).data, onSuccess: () => { toast.success('Measurement spec saved'); qc.invalidateQueries({ queryKey: ['/styles'] }); if (!inline) onClose(); }, onError: (e) => toast.error(apiMessage(e)) });
  if (!styleId) return null;
  return (
    <Shell inline={inline} onClose={onClose} title={`Measurement Spec (POM) — ${style.data?.styleNo ?? ''}`}
      desc="Points of measure with the spec per size and tolerance. Sample rounds and the AFN/22 measurement inspection compare against this table."
      footer={<>{!inline && <Button variant="secondary" onClick={onClose}>Cancel</Button>}<Button disabled={save.isPending || !sizes.length} onClick={() => save.mutate()}><Check size={15} /> Save spec</Button></>}>
      <PomEditor sizes={sizes} setSizes={setSizes} unit={unit} setUnit={setUnit} rows={rows} setRows={setRows} />
    </Shell>
  );
}
export const DEFAULT_POM: Omit<Pom, 'spec'>[] = [
  { code: 'A', name: 'Body length from HPS', tolerance: 1 }, { code: 'B', name: 'Chest 1" below armhole', tolerance: 1 }, { code: 'C', name: 'Waist', tolerance: 1 }, { code: 'D', name: 'Bottom sweep', tolerance: 1 },
  { code: 'E', name: 'Shoulder across', tolerance: 0.5 }, { code: 'F', name: 'Sleeve length', tolerance: 0.5 }, { code: 'G', name: 'Armhole (straight)', tolerance: 0.5 }, { code: 'H', name: 'Sleeve opening', tolerance: 0.5 }, { code: 'I', name: 'Neck width', tolerance: 0.5 }, { code: 'J', name: 'Front neck drop', tolerance: 0.5 },
];

/** Sample round measurements: POM spec (from the style) vs measured, with the buyer's instruction per POM — the sample comment sheet. */
export function MeasureDialog({ sample, onClose, inline }: { sample: Sample | null; onClose: () => void; inline?: boolean }) {
  const qc = useQueryClient();
  const style = useStyle(sample?.styleId);
  const [round, setRound] = React.useState(1);
  const [size, setSize] = React.useState('');
  const [rows, setRows] = React.useState<{ code: string; measured: string; instruction: string; revised: string }[]>([]);
  const [applyToStyle, setApplyToStyle] = React.useState(false);
  const [plan, setPlan] = React.useState({ dueDate: '', pcsPerColour: '', actualSentOn: '', commentsOn: '' });
  const r = sample?.rounds.find((x) => x.no === round);
  React.useEffect(() => { if (sample) setRound(sample.round); }, [sample]);
  React.useEffect(() => {
    if (!sample || !style.data) return;
    const cur = sample.rounds.find((x) => x.no === round);
    setSize(cur?.size || style.data.sizeSet?.[Math.floor((style.data.sizeSet.length - 1) / 2)] || '');
    setRows(style.data.pom.map((p) => { const m = cur?.measurements?.find((x) => x.code === p.code); return { code: p.code, measured: m?.measured != null ? String(m.measured) : '', instruction: m?.instruction || '', revised: m?.revised != null ? String(m.revised) : '' }; }));
    setApplyToStyle(false);
    setPlan({ dueDate: toInputDate(cur?.dueDate), pcsPerColour: cur?.pcsPerColour ? String(cur.pcsPerColour) : '', actualSentOn: toInputDate(cur?.actualSentOn), commentsOn: toInputDate(cur?.commentsOn) });
  }, [sample, style.data, round]);
  const save = useMutation({ mutationFn: async () => (await api.put(`/samples/${sample!.id}/measurements`, { round, size, rows, applyToStyle, ...plan, pcsPerColour: plan.pcsPerColour || undefined })).data, onSuccess: () => { toast.success(`Round ${round} measurements saved${applyToStyle ? ' · style POM updated for all sizes' : ''}`); qc.invalidateQueries({ queryKey: ['/samples'] }); qc.invalidateQueries({ queryKey: ['/styles'] }); setApplyToStyle(false); }, onError: (e) => toast.error(apiMessage(e)) });
  if (!sample) return null;
  const st = style.data;
  const specOf = (code: string) => { const p = st?.pom.find((x) => x.code === code); return p ? { spec: p.spec?.[size], tol: p.tolerance ?? 0.5, name: p.name } : { spec: undefined, tol: 0.5, name: code }; };
  const dev = (code: string, m: string) => { const { spec } = specOf(code); return m === '' || spec == null ? null : Math.round((+m - spec) * 100) / 100; };
  const print = async () => {
    const head = await companyHead(`Sample Measurement & Comment Sheet — ${sample.styleNo} · ${sample.sampleNo} · Round ${round}`, 'measurementSheet');
    const sizes = st?.sizeSet?.length ? st.sizeSet : [size];
    const unit = st?.pomUnit ?? 'cm';
    const cols = sample.rounds.filter((x) => x.no <= round);
    const roundSize = (c: typeof cols[number]) => (c.no === round ? size : c.size || size);
    /* full spec for every size of the size set; the measured size of each round is highlighted, measured / instruction columns follow */
    const body = `<table><tr><th>POM</th><th>Point of measure</th>${sizes.map((z) => `<th class="num${z === size ? ' hi' : ''}">${esc(z)}</th>`).join('')}<th class="num">Tol ±</th>${cols.map((c) => `<th class="num">R${c.no} measured<br><small>size ${esc(roundSize(c))}</small></th><th>R${c.no} buyer instruction</th>`).join('')}</tr>
      ${(st?.pom ?? []).map((p) => `<tr><td>${esc(p.code)}</td><td>${esc(p.name)}</td>${sizes.map((z) => `<td class="num${z === size ? ' hi' : ''}">${p.spec?.[z] ?? '—'}</td>`).join('')}<td class="num">${p.tolerance ?? ''}</td>${cols.map((c) => { const zs = roundSize(c); const m = c.no === round ? rows.find((x) => x.code === p.code) : { measured: c.measurements?.find((x) => x.code === p.code)?.measured, instruction: c.measurements?.find((x) => x.code === p.code)?.instruction }; const mv = m?.measured === '' || m?.measured == null ? null : +m.measured; const d = mv == null || p.spec?.[zs] == null ? null : mv - p.spec[zs]; return `<td class="num${d != null && Math.abs(d) > (p.tolerance ?? 0.5) ? ' bad' : ''}">${mv ?? '—'}${d != null ? ` <small>(${d > 0 ? '+' : ''}${Math.round(d * 100) / 100})</small>` : ''}</td><td>${esc(m?.instruction)}</td>`; }).join('')}</tr>`).join('')}</table>
      <p><small>Spec in ${esc(unit)} for sizes ${sizes.map(esc).join(' · ')} · highlighted column = size measured this round · red = outside tolerance</small></p>
      <h2>Updated measurement spec — after round ${round} comments (all sizes, ${esc(unit)})</h2>
      <table><tr><th>POM</th><th>Point of measure</th>${sizes.map((z) => `<th class="num">${esc(z)}</th>`).join('')}<th class="num">Change</th><th>Basis</th></tr>
      ${(st?.pom ?? []).map((p) => { const rv = rows.find((x) => x.code === p.code)?.revised; const cur = p.spec?.[size]; const delta = rv !== '' && rv != null && cur != null ? Math.round((+rv - cur) * 100) / 100 : 0; return `<tr><td>${esc(p.code)}</td><td>${esc(p.name)}</td>${sizes.map((z) => { const v = p.spec?.[z]; return `<td class="num${delta ? ' hi' : ''}">${v == null ? '—' : Math.round((v + delta) * 100) / 100}</td>`; }).join('')}<td class="num${delta ? ' bad' : ''}">${delta ? (delta > 0 ? '+' : '') + delta : '—'}</td><td><small>${delta ? esc(rows.find((x) => x.code === p.code)?.instruction || `revised ${esc(size)} ${rv}`) : 'unchanged'}</small></td></tr>`; }).join('')}</table>
      <p><small>Highlighted = revised; the ${esc(size)} change is applied to every size. Tick "Save updated spec to the style POM" before saving to make this the spec for the next round.</small></p>
      <h2>Sample plan</h2><table><tr><th>Round</th><th>Type</th><th>Due</th><th class="num">Pcs / colour</th><th>Sent</th><th>Actual sent</th><th>AWB</th><th>Comments received</th><th>Result</th></tr>${sample.rounds.map((x) => `<tr><td>${x.no}</td><td>${esc(x.type)}</td><td>${x.dueDate ? fmtDate(x.dueDate) : ''}</td><td class="num">${x.pcsPerColour ?? ''}</td><td>${x.sentOn ? fmtDate(x.sentOn) : ''}</td><td>${x.actualSentOn ? fmtDate(x.actualSentOn) : ''}</td><td>${esc(x.awb)}</td><td>${x.commentsOn ? fmtDate(x.commentsOn) : ''}</td><td>${esc(x.result)}</td></tr>`).join('')}</table>
      <h2>Buyer comments</h2><table>${sample.rounds.filter((x) => x.comment).map((x) => `<tr><th style="width:120px">Round ${x.no}</th><td>${esc(x.comment)}</td></tr>`).join('') || '<tr><td>—</td></tr>'}</table><div class="sign"><div>Sampling</div><div>Merchandiser</div><div>Buyer QA</div></div>`;
    openPrint(`Measurement ${sample.sampleNo} R${round}`, head + `<p><small>${esc(sample.buyerName)} · ${esc(sample.description)} · ${esc(sample.type)} · ${esc(sample.fabric)} · ${esc(sample.colour)}</small></p>` + body);
  };
  return (
    <Shell inline={inline} onClose={onClose} bodyClass="space-y-3"
      title={`Measurements — ${sample.sampleNo} · ${sample.styleNo}`}
      desc="Measured value per POM against the style spec (± tolerance) and the buyer's instruction for the next round. Deviations outside tolerance turn red."
      footer={<>{!inline && <Button variant="secondary" onClick={onClose}>Close</Button>}{st?.pom?.length ? <><Button variant="secondary" onClick={print}><Print size={14} /> Print comment sheet</Button><Button disabled={save.isPending || !size} onClick={() => save.mutate()}><Check size={15} /> Save</Button></> : null}</>}>
      <>
          {!st?.pom?.length ? <div className="rounded-xl border border-gold-vivid/40 bg-gold-soft p-3 text-[12.5px] text-gold dark:bg-gold-vivid/10 dark:text-gold-vivid">No measurement spec on style {sample.styleNo} yet — open <b>POM spec</b> first and enter the points of measure per size.</div> : <>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Field label="Round"><Select value={String(round)} onValueChange={(v) => setRound(+v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{sample.rounds.map((x) => <SelectItem key={x.no} value={String(x.no)}>Round {x.no} · {x.type}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Size measured"><Select value={size} onValueChange={setSize}><SelectTrigger><SelectValue placeholder="size" /></SelectTrigger><SelectContent>{st.sizeSet.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Due date (plan)"><Input type="date" value={plan.dueDate} onChange={(e) => setPlan({ ...plan, dueDate: e.target.value })} /></Field>
              <Field label="Pcs per colour"><Input type="number" value={plan.pcsPerColour} onChange={(e) => setPlan({ ...plan, pcsPerColour: e.target.value })} /></Field>
              <Field label="Actual sent on"><Input type="date" value={plan.actualSentOn} onChange={(e) => setPlan({ ...plan, actualSentOn: e.target.value })} /></Field>
              <Field label="Comments received"><Input type="date" value={plan.commentsOn} onChange={(e) => setPlan({ ...plan, commentsOn: e.target.value })} /></Field>
            </div>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-[12.5px]">
                <thead><tr className="bg-secondary text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground"><th className="px-2 py-2 text-left">POM</th><th className="px-2 py-2 text-left">Point of measure</th><th className="px-2 py-2 text-right">Spec {size} ({st.pomUnit})</th><th className="px-2 py-2 text-right">Tol ±</th><th className="px-2 py-2 text-center">Measured</th><th className="px-2 py-2 text-right">Dev</th><th className="px-2 py-2 text-left">Buyer instruction</th><th className="px-2 py-2 text-center" title="Revised spec for this size after the buyer's comments — the same +/- applies to every size on the print">Updated {size}</th></tr></thead>
                <tbody>{rows.map((row, i) => { const { spec, tol, name } = specOf(row.code); const d = dev(row.code, row.measured); const bad = d != null && Math.abs(d) > tol; return (
                  <tr key={row.code} className={cn('border-t', bad && 'bg-bad-soft/40')}>
                    <td className="px-2 font-mono text-xs font-bold">{row.code}</td><td className="px-2 text-xs">{name}</td>
                    <td className="num px-2 text-right">{spec ?? '—'}</td><td className="num px-2 text-right text-muted-foreground">{tol}</td>
                    <td className="p-1 text-center"><input type="number" step="0.1" className="num h-8 w-20 rounded-md border bg-card px-1 text-center text-xs outline-none focus:border-brand" value={row.measured} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, measured: e.target.value } : x)))} /></td>
                    <td className={cn('num px-2 text-right font-semibold', bad ? 'text-bad' : d != null ? 'text-teal' : 'text-muted-foreground')}>{d == null ? '—' : `${d > 0 ? '+' : ''}${d}`}</td>
                    <td className="p-1"><Input className="h-8 text-xs" value={row.instruction} placeholder="e.g. reduce by 1 cm" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, instruction: e.target.value } : x)))} /></td>
                    <td className="p-1 text-center"><input type="number" step="0.1" className={cn('num h-8 w-20 rounded-md border bg-card px-1 text-center text-xs outline-none focus:border-brand', row.revised !== '' && spec != null && +row.revised !== spec && 'border-brand font-semibold text-brand')} value={row.revised} placeholder={spec != null ? String(spec) : ''} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, revised: e.target.value } : x)))} /></td>
                  </tr>); })}</tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-secondary/60 px-3 py-2 text-[12px]">
              <span><b>Updated {size}</b> = revised spec after the buyer's comments. Blank = unchanged. The print shows an <b>Updated spec</b> table for every size (same +/- shift as {size}).</span>
              <label className="flex items-center gap-1.5 font-semibold"><input type="checkbox" checked={applyToStyle} onChange={(e) => setApplyToStyle(e.target.checked)} /> Save updated spec to the style POM (all sizes)</label>
            </div>
            {r?.comment && <div className="rounded-lg border bg-secondary/60 p-2.5 text-[12px]"><b>Buyer comment (round {r.no}):</b> {r.comment}</div>}
          </>}
      </>
    </Shell>
  );
}

/** Approvals board per style: sample kinds + lab dip / strike-offs / trim card / tests with the buyer's sample-status columns. */
export function ApprovalsDialog({ styleId, styleNo, onClose, inline }: { styleId: string | null; styleNo?: string; onClose: () => void; inline?: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery<{ items: Approval[]; statuses: string[]; saved: boolean }>({ queryKey: ['/styles', styleId, 'approvals'], queryFn: async () => (await api.get(`/styles/${styleId}/approvals`)).data, enabled: !!styleId });
  const [rows, setRows] = React.useState<Approval[]>([]);
  const [open, setOpen] = React.useState<number | null>(null);
  const [onlyActive, setOnlyActive] = React.useState(true);   // untouched rows hidden by default; untick to start a new approval kind
  const [dirty, setDirty] = React.useState(false);
  React.useEffect(() => { if (data) { setRows(data.items.map((a) => ({ ...a }))); setDirty(false); } }, [data]);
  const save = useMutation({ mutationFn: async () => (await api.put(`/styles/${styleId}/approvals`, { items: rows })).data, onSuccess: () => { toast.success('Approvals board saved'); setDirty(false); qc.invalidateQueries({ queryKey: ['/styles'] }); qc.invalidateQueries({ queryKey: ['/tna'] }); }, onError: (e) => toast.error(apiMessage(e)) });
  if (!styleId) return null;
  const today = new Date().toISOString().slice(0, 10);
  const set = (i: number, patch: Partial<Approval>) => { setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r))); setDirty(true); };
  /* one click = status + its date (today) — the dates stay editable under "Details" */
  const STEPS: { s: string; k?: keyof Approval; label: string; tone: 'ok' | 'bad' | 'warn' | 'info' | 'mute' }[] = [
    { s: 'Received', k: 'receivedOn', label: 'Received', tone: 'info' }, { s: 'Submitted', k: 'submittedOn', label: 'Sent to buyer', tone: 'info' },
    { s: 'Approved', k: 'approvedOn', label: 'Approved', tone: 'ok' }, { s: 'Resubmit', k: 'commentsOn', label: 'Resubmit', tone: 'warn' }, { s: 'Rejected', k: 'commentsOn', label: 'Rejected', tone: 'bad' },
  ];
  const step = (i: number, r: Approval, st: typeof STEPS[number]) => {
    if (r.status === st.s) { set(i, { status: 'Pending' }); return; }   // click again = undo
    set(i, { status: st.s, ...(st.k && !r[st.k] ? { [st.k]: today } : {}) });
  };
  const active = (r: Approval) => r.status !== 'Pending' || r.dueDate || r.receivedOn || r.submittedOn || r.awb || r.comment;
  const TONE: Record<string, 'ok' | 'bad' | 'warn' | 'info' | 'mute'> = { Approved: 'ok', Rejected: 'bad', Resubmit: 'warn', Submitted: 'info', Received: 'info', Pending: 'mute' };
  const done = rows.filter((r) => r.status === 'Approved').length, pending = rows.filter((r) => r.status === 'Pending').length;
  const print = async () => {
    const head = await companyHead(`Sample & Approval Status — ${styleNo ?? ''}`);
    openPrint(`Approvals ${styleNo}`, head + `<table><tr><th>Item</th><th>Group</th><th>Due</th><th class="num">Pcs/col</th><th>Received</th><th>Submitted</th><th>AWB</th><th>Approved</th><th>Comments on</th><th>Status</th><th>Comment</th></tr>${rows.map((r) => `<tr><td>${esc(r.title)}</td><td>${esc(r.group)}</td><td>${r.dueDate ? fmtDate(r.dueDate) : ''}</td><td class="num">${r.pcsPerColour ?? ''}</td><td>${r.receivedOn ? fmtDate(r.receivedOn) : ''}</td><td>${r.submittedOn ? fmtDate(r.submittedOn) : ''}</td><td>${esc(r.awb)}</td><td>${r.approvedOn ? fmtDate(r.approvedOn) : ''}</td><td>${r.commentsOn ? fmtDate(r.commentsOn) : ''}</td><td>${esc(r.status)}</td><td>${esc(r.comment)}</td></tr>`).join('')}</table>`);
  };
  const D = (k: keyof Approval, i: number, r: Approval, label: string) => <label className="flex flex-col gap-0.5 text-[10px] font-bold uppercase text-muted-foreground">{label}<input type="date" className="h-8 w-[130px] rounded-md border bg-card px-1.5 text-[11.5px] font-normal normal-case text-foreground outline-none" value={toInputDate(r[k] as string)} onChange={(e) => set(i, { [k]: e.target.value || undefined } as Partial<Approval>)} /></label>;
  return (
    <Shell inline={inline} onClose={onClose} bodyClass="space-y-2" title={`Approvals Board — ${styleNo ?? ''}`}
      desc="One row per thing the buyer must approve before bulk. Click a step to record it — the date fills in by itself (today); open Details only if you need due date, AWB, pcs or a comment. Approved rows complete the matching TNA activity on open orders."
      footer={<>{!inline && <Button variant="secondary" onClick={onClose}>Close</Button>}<Button variant="secondary" onClick={print}><Print size={14} /> Print</Button><Button disabled={save.isPending || !dirty} onClick={() => save.mutate()}><Check size={15} /> Save board</Button></>}>
      <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-secondary/60 px-3 py-2 text-[12px]">
            <span><b>{done}</b> approved · <b>{rows.length - done - pending}</b> in progress · <b>{pending}</b> not started</span>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={!onlyActive} onChange={(e) => setOnlyActive(!e.target.checked)} /> Show all approval kinds (to start a new one)</label>
          </div>
          <div className="divide-y rounded-xl border">
            {onlyActive && !rows.some(active) && <div className="rounded-xl border border-dashed px-4 py-6 text-center text-[12.5px] text-muted-foreground">Nothing recorded yet — tick <b>Show all approval kinds</b> and click Received / Sent to buyer / Approved on the row you want to track.</div>}
            {rows.map((r, i) => (onlyActive && !active(r) ? null : (
              <div key={i} className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-[180px] flex-1">
                    <input className="w-full bg-transparent text-[13px] font-semibold outline-none" value={r.title} onChange={(e) => set(i, { title: e.target.value })} />
                    <div className="text-[10.5px] text-muted-foreground">{r.group}{r.receivedOn ? ` · received ${fmtDate(r.receivedOn)}` : ''}{r.submittedOn ? ` · sent ${fmtDate(r.submittedOn)}` : ''}{r.awb ? ` · AWB ${r.awb}` : ''}{r.approvedOn && r.status === 'Approved' ? ` · approved ${fmtDate(r.approvedOn)}` : ''}{r.commentsOn && ['Rejected', 'Resubmit'].includes(r.status) ? ` · comments ${fmtDate(r.commentsOn)}` : ''}{r.dueDate && r.status !== 'Approved' ? ` · due ${fmtDate(r.dueDate)}` : ''}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {STEPS.map((st) => <button key={st.s} type="button" onClick={() => step(i, r, st)} className={cn('rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors', r.status === st.s ? (st.tone === 'ok' ? 'border-teal bg-teal text-white' : st.tone === 'bad' ? 'border-bad bg-bad text-white' : st.tone === 'warn' ? 'border-gold-vivid bg-gold-vivid text-[#241d03]' : 'border-brand bg-brand text-white') : 'text-muted-foreground hover:bg-secondary')}>{st.label}</button>)}
                    <Badge tone={TONE[r.status] ?? 'mute'} className="ml-1 text-[9.5px]">{r.status}</Badge>
                    <button type="button" className="ml-1 text-[11px] font-semibold text-brand hover:underline" onClick={() => setOpen(open === i ? null : i)}>{open === i ? 'Hide' : 'Details'}</button>
                    <button type="button" className="text-muted-foreground hover:text-bad" title="Remove row" onClick={() => { setRows(rows.filter((_, j) => j !== i)); setDirty(true); }}><Close size={13} /></button>
                  </div>
                </div>
                {open === i && <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-secondary/50 p-2">
                  {D('dueDate', i, r, 'Due')}{D('receivedOn', i, r, 'Received (factory)')}{D('submittedOn', i, r, 'Sent to buyer')}{D('approvedOn', i, r, 'Approved')}{D('commentsOn', i, r, 'Comments on')}
                  <label className="flex flex-col gap-0.5 text-[10px] font-bold uppercase text-muted-foreground">Pcs / colour<input type="number" className="num h-8 w-20 rounded-md border bg-card px-1.5 text-[11.5px] font-normal text-foreground outline-none" value={r.pcsPerColour ?? ''} onChange={(e) => set(i, { pcsPerColour: e.target.value === '' ? undefined : +e.target.value })} /></label>
                  <label className="flex flex-col gap-0.5 text-[10px] font-bold uppercase text-muted-foreground">AWB<input className="h-8 w-32 rounded-md border bg-card px-1.5 font-mono text-[11.5px] font-normal normal-case text-foreground outline-none" value={r.awb ?? ''} onChange={(e) => set(i, { awb: e.target.value })} /></label>
                  <label className="flex min-w-[200px] flex-1 flex-col gap-0.5 text-[10px] font-bold uppercase text-muted-foreground">Comment<input className="h-8 w-full rounded-md border bg-card px-1.5 text-[11.5px] font-normal normal-case text-foreground outline-none" value={r.comment ?? ''} onChange={(e) => set(i, { comment: e.target.value })} /></label>
                  <label className="flex flex-col gap-0.5 text-[10px] font-bold uppercase text-muted-foreground">Group<select className="h-8 rounded-md border bg-card px-1 text-[11.5px] font-normal normal-case text-foreground outline-none" value={r.group} onChange={(e) => set(i, { group: e.target.value })}><option>Sample</option><option>Approval</option></select></label>
                </div>}
              </div>)))}
            <div className="bg-secondary/40 px-2 py-1.5"><Button size="sm" variant="secondary" type="button" onClick={() => { setRows([...rows, { title: '', group: 'Approval', status: 'Pending' }]); setOpen(rows.length); setDirty(true); }}><Plus size={13} /> Add row</Button></div>
          </div>
      </>
    </Shell>
  );
}

/** Tech-pack facts printed on the specification sheet. */
export function TechPackDialog({ styleId, onClose, inline }: { styleId: string | null; onClose: () => void; inline?: boolean }) {
  const qc = useQueryClient();
  const style = useStyle(styleId);
  const blank = { composition: '', lining: '', article: '', construction: '', labelPlacement: '', packingMethod: '', accessories: [] as { item: string; qtyPerPc: number; note: string }[] };
  const [t, setT] = React.useState(blank);
  React.useEffect(() => { if (style.data) setT({ ...blank, ...(style.data.techPack ?? {}), accessories: style.data.techPack?.accessories ?? [] }); }, [style.data]);   // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation({ mutationFn: async () => (await api.put(`/styles/${styleId}/techpack`, t)).data, onSuccess: () => { toast.success('Tech pack saved'); qc.invalidateQueries({ queryKey: ['/styles'] }); if (!inline) onClose(); }, onError: (e) => toast.error(apiMessage(e)) });
  if (!styleId) return null;
  return (
    <Shell inline={inline} onClose={onClose} bodyClass="space-y-3" title={`Tech Pack — ${style.data?.styleNo ?? ''}`}
      desc="Composition, lining, article, construction notes, label placement, packing method and the buyer's accessory list per piece — printed on the specification sheet."
      footer={<>{!inline && <Button variant="secondary" onClick={onClose}>Cancel</Button>}<Button disabled={save.isPending} onClick={() => save.mutate()}><Check size={15} /> Save</Button></>}>
      <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Composition"><Input value={t.composition} onChange={(e) => setT({ ...t, composition: e.target.value })} placeholder="100% cotton 40s poplin" /></Field>
            <Field label="Lining"><Input value={t.lining} onChange={(e) => setT({ ...t, lining: e.target.value })} placeholder="No / 100% polyester taffeta" /></Field>
            <Field label="Article / buyer item no"><Input value={t.article} onChange={(e) => setT({ ...t, article: e.target.value })} /></Field>
            <Field label="Construction notes" className="sm:col-span-3"><Input value={t.construction} onChange={(e) => setT({ ...t, construction: e.target.value })} placeholder="French seams at side, 1/4 inch top-stitch at hem, 14 SPI" /></Field>
            <Field label="Label placement"><Input value={t.labelPlacement} onChange={(e) => setT({ ...t, labelPlacement: e.target.value })} placeholder="Main label at CB neck, care label at left side seam 10 cm from hem" /></Field>
            <Field label="Packing method" className="sm:col-span-2"><Input value={t.packingMethod} onChange={(e) => setT({ ...t, packingMethod: e.target.value })} placeholder="Flat pack, 1 pc / polybag, 12 pcs / carton solid colour solid size" /></Field>
          </div>
          <div className="overflow-hidden rounded-xl border">
            <div className="border-b bg-secondary px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Buyer accessory list (per piece)</div>
            <table className="w-full text-[12.5px]"><thead><tr className="text-[10.5px] font-bold uppercase text-muted-foreground"><th className="px-2 py-1 text-left">Item</th><th className="px-2 py-1 text-right">Qty / pc</th><th className="px-2 py-1 text-left">Note</th><th className="w-7" /></tr></thead>
              <tbody>{t.accessories.map((a, i) => <tr key={i} className="border-t"><td className="p-1"><Input className="h-8 text-xs" value={a.item} onChange={(e) => setT({ ...t, accessories: t.accessories.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)) })} placeholder="Main label" /></td>
                <td className="p-1"><input type="number" step="0.01" className="num h-8 w-20 rounded-md border bg-card px-1 text-right text-xs outline-none" value={a.qtyPerPc} onChange={(e) => setT({ ...t, accessories: t.accessories.map((x, j) => (j === i ? { ...x, qtyPerPc: +e.target.value } : x)) })} /></td>
                <td className="p-1"><Input className="h-8 text-xs" value={a.note} onChange={(e) => setT({ ...t, accessories: t.accessories.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })} /></td>
                <td className="p-1"><button type="button" className="text-muted-foreground hover:text-bad" onClick={() => setT({ ...t, accessories: t.accessories.filter((_, j) => j !== i) })}><Close size={13} /></button></td></tr>)}</tbody></table>
            <div className="border-t bg-secondary/40 px-2 py-1.5"><Button size="sm" variant="secondary" type="button" onClick={() => setT({ ...t, accessories: [...t.accessories, { item: '', qtyPerPc: 1, note: '' }] })}><Plus size={13} /> Add accessory</Button></div>
          </div>
      </>
    </Shell>
  );
}
