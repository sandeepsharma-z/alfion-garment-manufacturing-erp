import * as React from 'react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useList, useItem, fmtN, fmtDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { useCustomFields } from '@/components/CustomFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton, Table, THead, TBody, Tr, Th, Td, Badge } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, StatusPill, EmptyState } from '@/components/shared';
import { Plus, Check, Print } from '@/icons/icons';
import { openPrint, companyHead, useStyle } from '@/features/samples/StyleTools';

type OrderLite = { id: string; orderNo: string; styleNo: string; styleId?: string; buyerName: string; colour: string; colours?: { code: string; name: string }[]; sizeSet?: string[]; sizes: { size: string }[] };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/* ============================ Measurement inspection (AFN/22) ============================ */
type MRow = { code: string; name: string; spec?: number; tolerance: number; measured: number[]; maxDev: number; pass: boolean };
type MI = { id: string; inspNo: string; orderNo: string; styleNo: string; stage: string; date: string; colour: string; size: string; unit: string; pieces: number; rows: MRow[]; passed: number; failed: number; result: string; inspector: string; remarks: string };
const PIECES = 5;

export function MeasurementTab() {
  const [open, setOpen] = React.useState(false);
  const list = useList<MI>('/quality/measurements', { size: 200 });
  const rows = list.data?.items ?? [];
  const print = async (r: MI) => {
    const head = await companyHead(`Measurement Inspection ${r.inspNo} — ${r.orderNo} · ${r.styleNo} · size ${r.size}${r.colour ? ` · ${r.colour}` : ''}`, 'measurementInspection');
    openPrint(r.inspNo, head + `<p><small>${esc(r.stage)} · ${fmtDate(r.date)} · ${esc(r.inspector)} · ${r.pieces} pcs measured · result <b>${esc(r.result)}</b> (${r.failed} POM out of tolerance)</small></p><table><tr><th>POM</th><th>Point of measure</th><th class="num">Spec (${esc(r.unit)})</th><th class="num">Tol ±</th>${Array.from({ length: r.pieces }, (_, i) => `<th class="num">Pc ${i + 1}</th>`).join('')}<th class="num">Max dev</th><th>Result</th></tr>${r.rows.map((x) => `<tr><td>${esc(x.code)}</td><td>${esc(x.name)}</td><td class="num">${x.spec ?? '—'}</td><td class="num">${x.tolerance}</td>${Array.from({ length: r.pieces }, (_, i) => `<td class="num${x.spec != null && x.measured[i] != null && Math.abs(x.measured[i] - x.spec) > x.tolerance ? ' bad' : ''}">${x.measured[i] ?? ''}</td>`).join('')}<td class="num">${x.maxDev}</td><td class="${x.pass ? '' : 'bad'}">${x.pass ? 'OK' : 'Out'}</td></tr>`).join('')}</table>${r.remarks ? `<p>${esc(r.remarks)}</p>` : ''}<div class="sign"><div>QA inspector</div><div>Production</div><div>Merchandiser</div></div>`);
  };
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div><CardTitle>Measurement Inspection</CardTitle><p className="text-xs text-muted-foreground">Measure {PIECES} pieces of one size against the style's POM spec ± tolerance (Sample Development → POM). Any POM outside tolerance fails the check.</p></div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> Measurement inspection</Button>
      </CardHeader>
      <CardContent className="p-0">
        {list.isLoading ? <div className="space-y-2 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
        : !rows.length ? <EmptyState title="No measurement inspections" text="Record inline / pre-final / final measurement checks here." action={<Button onClick={() => setOpen(true)}><Plus size={15} /> Measurement inspection</Button>} />
        : <Table>
          <THead><Tr className="hover:bg-transparent"><Th>Insp no</Th><Th>Order · style</Th><Th>Stage</Th><Th>Size · colour</Th><Th className="text-right">Pcs</Th><Th className="text-right">POM out</Th><Th>Result</Th><Th>Date · inspector</Th><Th /></Tr></THead>
          <TBody>{rows.map((r) => <Tr key={r.id}>
            <Td className="font-mono text-xs font-bold">{r.inspNo}</Td><Td className="text-xs"><span className="font-mono font-semibold">{r.orderNo}</span> · {r.styleNo}</Td><Td><Badge tone="plain">{r.stage}</Badge></Td>
            <Td className="text-xs">{r.size}{r.colour ? ` · ${r.colour}` : ''}</Td><Td className="num text-right">{r.pieces}</Td><Td className={cn('num text-right font-semibold', r.failed && 'text-bad')}>{r.failed} / {r.rows.length}</Td>
            <Td><StatusPill value={r.result} /></Td><Td className="text-xs">{fmtDate(r.date)} · {r.inspector}</Td><Td><Button size="sm" variant="secondary" onClick={() => print(r)}><Print size={13} /></Button></Td>
          </Tr>)}</TBody>
        </Table>}
      </CardContent>
      <MeasurementDialog open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}

function MeasurementDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const orders = useList<OrderLite>('/orders', { size: 200, status: 'Open' }, open);
  const [f, setF] = React.useState({ orderId: '', stage: 'Final', size: '', colour: '', inspector: '', remarks: '', date: new Date().toISOString().slice(0, 10) });
  const [vals, setVals] = React.useState<Record<string, string[]>>({});
  const cf = useCustomFields('quality_measure', null, open ? 'open' : 'closed', 3);
  const o = (orders.data?.items ?? []).find((x) => x.id === f.orderId);
  const style = useStyle(o?.styleId);
  const pom = style.data?.pom ?? [];
  React.useEffect(() => { if (open) setF((x) => ({ ...x, inspector: user?.name || '' })); }, [open, user]);
  React.useEffect(() => { if (style.data && !f.size) setF((x) => ({ ...x, size: style.data!.sizeSet?.[0] || '' })); }, [style.data]);   // eslint-disable-line react-hooks/exhaustive-deps
  const post = useMutation({ mutationFn: async () => (await api.post('/quality/measurements', { ...f, rows: pom.map((p) => ({ code: p.code, measured: (vals[p.code] ?? []).map((v) => (v === '' ? '' : +v)) })), custom: cf.value })).data,
    onSuccess: (d: MI) => { toast.success(`${d.inspNo} · ${d.result}`); qc.invalidateQueries({ queryKey: ['/quality'] }); qc.invalidateQueries({ queryKey: ['/orders'] }); onClose(); setVals({}); }, onError: (e) => toast.error(apiMessage(e)) });
  const sizes = style.data?.sizeSet?.length ? style.data.sizeSet : (o?.sizeSet?.length ? o.sizeSet : (o?.sizes ?? []).map((s) => s.size));
  const colours = (o?.colours ?? []).map((c) => c.name || c.code).filter(Boolean);
  const set = (code: string, i: number, v: string) => setVals({ ...vals, [code]: Array.from({ length: PIECES }, (_, j) => (j === i ? v : vals[code]?.[j] ?? '')) });
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent wide meta={cf.meta}>
        <DialogHeader><DialogTitle>Measurement Inspection</DialogTitle><DialogDescription>Pick the order, stage and size — the spec and tolerance come from the style's POM table. Type the measured value of each piece; out-of-tolerance cells turn red.</DialogDescription></DialogHeader>
        <DialogBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Field label="Order" className="sm:col-span-2"><Select value={f.orderId} onValueChange={(v) => { setF({ ...f, orderId: v, size: '', colour: '' }); setVals({}); }}><SelectTrigger><SelectValue placeholder="Open orders…" /></SelectTrigger><SelectContent>{(orders.data?.items ?? []).map((x) => <SelectItem key={x.id} value={x.id}>{x.orderNo} · {x.styleNo} · {x.buyerName}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Stage"><Select value={f.stage} onValueChange={(v) => setF({ ...f, stage: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['Inline', 'Pre-final', 'Final'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Size"><Select value={f.size} onValueChange={(v) => setF({ ...f, size: v })}><SelectTrigger><SelectValue placeholder="size" /></SelectTrigger><SelectContent>{sizes.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Colour">{colours.length ? <Select value={f.colour || 'none'} onValueChange={(v) => setF({ ...f, colour: v === 'none' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">—</SelectItem>{colours.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select> : <Input value={f.colour} onChange={(e) => setF({ ...f, colour: e.target.value })} />}</Field>
            <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          </div>
          {o && !pom.length && <div className="rounded-xl border border-gold-vivid/40 bg-gold-soft p-3 text-[12.5px] text-gold dark:bg-gold-vivid/10 dark:text-gold-vivid">No POM spec on style {o.styleNo} — add it under Sample Development → POM first.</div>}
          {pom.length > 0 && <div className="overflow-x-auto rounded-xl border"><table className="w-full text-[12px]">
            <thead><tr className="bg-secondary text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground"><th className="px-2 py-2 text-left">POM</th><th className="px-2 py-2 text-left">Point of measure</th><th className="px-2 py-2 text-right">Spec {f.size}</th><th className="px-2 py-2 text-right">Tol ±</th>{Array.from({ length: PIECES }, (_, i) => <th key={i} className="px-1 py-2 text-center">Pc {i + 1}</th>)}<th className="px-2 py-2 text-right">Max dev</th></tr></thead>
            <tbody>{pom.map((p) => { const spec = p.spec?.[f.size]; const m = vals[p.code] ?? []; const devs = m.map((v) => (v === '' || spec == null ? null : Math.abs(+v - spec))).filter((d): d is number => d != null); const maxDev = devs.length ? Math.max(...devs) : 0; const bad = maxDev > (p.tolerance ?? 0.5); return (
              <tr key={p.code} className={cn('border-t', bad && 'bg-bad-soft/40')}><td className="px-2 font-mono text-xs font-bold">{p.code}</td><td className="px-2 text-xs">{p.name}</td><td className="num px-2 text-right">{spec ?? '—'}</td><td className="num px-2 text-right text-muted-foreground">{p.tolerance}</td>
                {Array.from({ length: PIECES }, (_, i) => { const v = m[i] ?? ''; const off = v !== '' && spec != null && Math.abs(+v - spec) > (p.tolerance ?? 0.5); return <td key={i} className="p-1 text-center"><input type="number" step="0.1" className={cn('num h-8 w-16 rounded-md border bg-card px-1 text-center text-xs outline-none focus:border-brand', off && 'border-bad text-bad')} value={v} onChange={(e) => set(p.code, i, e.target.value)} /></td>; })}
                <td className={cn('num px-2 text-right font-semibold', bad ? 'text-bad' : devs.length ? 'text-teal' : 'text-muted-foreground')}>{devs.length ? Math.round(maxDev * 100) / 100 : '—'}</td></tr>); })}</tbody>
          </table></div>}
          <div className="grid gap-3 sm:grid-cols-3"><Field label="Inspector"><Input value={f.inspector} onChange={(e) => setF({ ...f, inspector: e.target.value })} /></Field><Field label="Remarks" className="sm:col-span-2"><Input value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} /></Field></div>
          {cf.node}
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={post.isPending || !f.orderId || !f.size || !pom.length || !cf.ok} onClick={() => post.mutate()}><Check size={15} /> Save inspection</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ Needle (AFN/17) & blade (AFN/13) registers ============================ */
type Needle = { id: string; date: string; time: string; line: string; machineNo: string; operator: string; orderNo: string; needleType: string; needleSize: string; parts: { point: boolean; shank: boolean; eye: boolean; middle: boolean }; allFound: boolean; garmentChecked: boolean; newIssued: boolean; supervisor: string; remarks: string };
type Blade = { id: string; date: string; kind: string; received: number; issued: number; broken: number; returned: number; balance: number; issuedTo: string; machineNo: string; remarks: string; by: string };
const PARTS: (keyof Needle['parts'])[] = ['point', 'shank', 'eye', 'middle'];
const BLADE_KINDS = ['Cutting blade', 'Band knife', 'Scissor', 'Trimmer', 'Seam ripper', 'Cutter blade'];

export function RegistersTab() {
  const { data: company } = useItem<{ lines?: string[] }>('/settings/company');
  const [needleOpen, setNeedleOpen] = React.useState(false);
  const [bladeOpen, setBladeOpen] = React.useState(false);
  const needles = useList<Needle>('/quality/needles', { size: 200 });
  const blades = useList<Blade>('/quality/blades', { size: 200 });
  const nRows = needles.data?.items ?? [], bRows = blades.data?.items ?? [];
  const yes = (v: boolean) => (v ? 'Yes' : 'No');
  const printNeedles = async () => openPrint('Broken Needle Register', await companyHead('Broken Needle Register', 'needleRegister') + `<table><tr><th>Date</th><th>Time</th><th>Line</th><th>Machine</th><th>Operator</th><th>Order</th><th>Needle</th><th>Point</th><th>Shank</th><th>Eye</th><th>Middle</th><th>All found</th><th>Garment checked</th><th>New issued</th><th>Supervisor</th><th>Remarks</th></tr>${nRows.map((r) => `<tr><td>${fmtDate(r.date)}</td><td>${esc(r.time)}</td><td>${esc(r.line)}</td><td>${esc(r.machineNo)}</td><td>${esc(r.operator)}</td><td>${esc(r.orderNo)}</td><td>${esc(r.needleType)} ${esc(r.needleSize)}</td>${PARTS.map((p) => `<td>${yes(r.parts[p])}</td>`).join('')}<td class="${r.allFound ? '' : 'bad'}">${yes(r.allFound)}</td><td>${yes(r.garmentChecked)}</td><td>${yes(r.newIssued)}</td><td>${esc(r.supervisor)}</td><td>${esc(r.remarks)}</td></tr>`).join('')}</table>`);
  const printBlades = async () => openPrint('Blade Register', await companyHead('Blade / Sharp Tool Register', 'bladeRegister') + `<table><tr><th>Date</th><th>Kind</th><th class="num">Received</th><th class="num">Issued</th><th class="num">Broken</th><th class="num">Returned</th><th class="num">Balance</th><th>Issued to</th><th>Machine</th><th>Remarks</th><th>By</th></tr>${bRows.map((r) => `<tr><td>${fmtDate(r.date)}</td><td>${esc(r.kind)}</td><td class="num">${r.received || ''}</td><td class="num">${r.issued || ''}</td><td class="num">${r.broken || ''}</td><td class="num">${r.returned || ''}</td><td class="num"><b>${r.balance}</b></td><td>${esc(r.issuedTo)}</td><td>${esc(r.machineNo)}</td><td>${esc(r.remarks)}</td><td>${esc(r.by)}</td></tr>`).join('')}</table>`);
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div><CardTitle>Broken Needle Register</CardTitle><p className="text-xs text-muted-foreground">Every broken needle: machine, operator, parts recovered. A needle whose parts are not all found flags the garment for detector check.</p></div>
          <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={printNeedles} disabled={!nRows.length}><Print size={14} /> AFN/17</Button><Button size="sm" onClick={() => setNeedleOpen(true)}><Plus size={14} /> Record</Button></div>
        </CardHeader>
        <CardContent className="p-0">
          {!nRows.length ? <EmptyState title="No broken needles recorded" text="Good news — or record the first one." />
          : <Table><THead><Tr className="hover:bg-transparent"><Th>Date</Th><Th>Line · machine</Th><Th>Operator</Th><Th>Needle</Th><Th>Parts</Th><Th>All found</Th><Th>New issued</Th></Tr></THead>
            <TBody>{nRows.map((r) => <Tr key={r.id}><Td className="text-xs">{fmtDate(r.date)} {r.time}</Td><Td className="text-xs">{r.line || '—'} · {r.machineNo || '—'}</Td><Td className="text-xs">{r.operator}{r.orderNo ? <div className="font-mono text-[10px] text-muted-foreground">{r.orderNo}</div> : null}</Td><Td className="text-xs">{r.needleType} {r.needleSize}</Td>
              <Td className="text-[11px]">{PARTS.filter((p) => r.parts[p]).join(', ') || '—'}</Td><Td><Badge tone={r.allFound ? 'ok' : 'bad'}>{r.allFound ? 'Yes' : 'No'}</Badge></Td><Td><Badge tone={r.newIssued ? 'ok' : 'mute'}>{r.newIssued ? 'Yes' : 'No'}</Badge></Td></Tr>)}</TBody></Table>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div><CardTitle>Blade Register</CardTitle><p className="text-xs text-muted-foreground">Blades / sharp tools received, issued, broken and returned — running balance per kind.</p></div>
          <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={printBlades} disabled={!bRows.length}><Print size={14} /> AFN/13</Button><Button size="sm" onClick={() => setBladeOpen(true)}><Plus size={14} /> Entry</Button></div>
        </CardHeader>
        <CardContent className="p-0">
          {!bRows.length ? <EmptyState title="No blade entries" text="Record blades received into the store first, then issues and breakages." />
          : <Table><THead><Tr className="hover:bg-transparent"><Th>Date</Th><Th>Kind</Th><Th className="text-right">Recd</Th><Th className="text-right">Issued</Th><Th className="text-right">Broken</Th><Th className="text-right">Balance</Th><Th>Issued to</Th></Tr></THead>
            <TBody>{bRows.map((r) => <Tr key={r.id}><Td className="text-xs">{fmtDate(r.date)}</Td><Td className="text-xs">{r.kind}</Td><Td className="num text-right text-teal">{r.received || '—'}</Td><Td className="num text-right">{r.issued || '—'}</Td><Td className={cn('num text-right', r.broken && 'text-bad')}>{r.broken || '—'}</Td><Td className="num text-right font-semibold">{fmtN(r.balance)}</Td><Td className="text-xs">{r.issuedTo || '—'}{r.machineNo ? ` · ${r.machineNo}` : ''}</Td></Tr>)}</TBody></Table>}
        </CardContent>
      </Card>
      <NeedleDialog open={needleOpen} lines={company?.lines ?? []} onClose={() => setNeedleOpen(false)} />
      <BladeDialog open={bladeOpen} onClose={() => setBladeOpen(false)} />
    </div>
  );
}

function NeedleDialog({ open, lines, onClose }: { open: boolean; lines: string[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [f, setF] = React.useState({ date: new Date().toISOString().slice(0, 10), time: new Date().toTimeString().slice(0, 5), line: '', machineNo: '', operator: '', orderNo: '', needleType: 'DB×1', needleSize: '11', parts: { point: true, shank: true, eye: true, middle: true }, garmentChecked: false, newIssued: true, supervisor: '', remarks: '' });
  const cf = useCustomFields('needle', null, open ? 'open' : 'closed', 3);
  React.useEffect(() => { if (open) setF((x) => ({ ...x, supervisor: user?.name || '' })); }, [open, user]);
  const allFound = PARTS.every((p) => f.parts[p]);
  const post = useMutation({ mutationFn: async () => (await api.post('/quality/needles', { ...f, allFound, custom: cf.value })).data, onSuccess: () => { toast.success('Broken needle recorded'); qc.invalidateQueries({ queryKey: ['/quality/needles'] }); onClose(); }, onError: (e) => toast.error(apiMessage(e)) });
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent meta={cf.meta}>
        <DialogHeader><DialogTitle>Broken Needle</DialogTitle><DialogDescription>Tick every part recovered. If a part is missing, the garments on that machine must pass the needle detector before they move on.</DialogDescription></DialogHeader>
        <DialogBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Time"><Input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
            <Field label="Line"><Select value={f.line || 'none'} onValueChange={(v) => setF({ ...f, line: v === 'none' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">—</SelectItem>{lines.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Machine no"><Input value={f.machineNo} onChange={(e) => setF({ ...f, machineNo: e.target.value })} /></Field>
            <Field label="Operator"><Input value={f.operator} onChange={(e) => setF({ ...f, operator: e.target.value })} /></Field>
            <Field label="Order"><Input value={f.orderNo} onChange={(e) => setF({ ...f, orderNo: e.target.value })} placeholder="AFI-1043" /></Field>
            <Field label="Needle type"><Input value={f.needleType} onChange={(e) => setF({ ...f, needleType: e.target.value })} /></Field>
            <Field label="Needle size"><Input value={f.needleSize} onChange={(e) => setF({ ...f, needleSize: e.target.value })} /></Field>
            <Field label="Supervisor"><Input value={f.supervisor} onChange={(e) => setF({ ...f, supervisor: e.target.value })} /></Field>
          </div>
          <div className="rounded-xl border p-3">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Parts recovered</div>
            <div className="flex flex-wrap gap-3 text-[12.5px]">{PARTS.map((p) => <label key={p} className="flex items-center gap-1.5 capitalize"><input type="checkbox" checked={f.parts[p]} onChange={(e) => setF({ ...f, parts: { ...f.parts, [p]: e.target.checked } })} /> {p}</label>)}
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.garmentChecked} onChange={(e) => setF({ ...f, garmentChecked: e.target.checked })} /> Garment checked with detector</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.newIssued} onChange={(e) => setF({ ...f, newIssued: e.target.checked })} /> New needle issued</label></div>
            <div className={cn('mt-2 text-[12px] font-semibold', allFound ? 'text-teal' : 'text-bad')}>{allFound ? 'All parts found' : 'Parts missing — detector check required before the bundle leaves the line'}</div>
          </div>
          <Field label="Remarks"><Input value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} /></Field>
          {cf.node}
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={post.isPending || !cf.ok} onClick={() => post.mutate()}><Check size={15} /> Record</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BladeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState({ date: new Date().toISOString().slice(0, 10), kind: 'Cutting blade', received: '', issued: '', broken: '', returned: '', issuedTo: '', machineNo: '', remarks: '' });
  const cf = useCustomFields('blade', null, open ? 'open' : 'closed', 3);
  const post = useMutation({ mutationFn: async () => (await api.post('/quality/blades', { ...f, custom: cf.value })).data, onSuccess: (d: Blade) => { toast.success(`${d.kind} · balance ${d.balance}`); qc.invalidateQueries({ queryKey: ['/quality/blades'] }); onClose(); }, onError: (e) => toast.error(apiMessage(e)) });
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent meta={cf.meta}>
        <DialogHeader><DialogTitle>Blade Register Entry</DialogTitle><DialogDescription>Received adds to the store balance, issued takes from it, returned (old blade back) adds. Broken blades are exchanged one-for-one and counted.</DialogDescription></DialogHeader>
        <DialogBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Kind" className="sm:col-span-2"><Select value={f.kind} onValueChange={(v) => setF({ ...f, kind: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{BLADE_KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Received"><Input type="number" value={f.received} onChange={(e) => setF({ ...f, received: e.target.value })} /></Field>
            <Field label="Issued"><Input type="number" value={f.issued} onChange={(e) => setF({ ...f, issued: e.target.value })} /></Field>
            <Field label="Broken"><Input type="number" value={f.broken} onChange={(e) => setF({ ...f, broken: e.target.value })} /></Field>
            <Field label="Returned"><Input type="number" value={f.returned} onChange={(e) => setF({ ...f, returned: e.target.value })} /></Field>
            <Field label="Issued to"><Input value={f.issuedTo} onChange={(e) => setF({ ...f, issuedTo: e.target.value })} /></Field>
            <Field label="Machine no"><Input value={f.machineNo} onChange={(e) => setF({ ...f, machineNo: e.target.value })} /></Field>
            <Field label="Remarks" className="sm:col-span-3"><Input value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} /></Field>
          </div>
          {cf.node}
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={post.isPending || !cf.ok} onClick={() => post.mutate()}><Check size={15} /> Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
