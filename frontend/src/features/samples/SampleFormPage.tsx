import * as React from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { useList, toInputDate, uploadFile, openFile, fmtN } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader, Field, AuthImg } from '@/components/shared';
import { useCustomFields, CustomFieldsGrid } from '@/components/CustomFields';
import { Check, Upload, Plus, Trash, FileIcon, Eye, Refresh, ChevronRight, ArrowLeft, Close, Samples as SampleIcon } from '@/icons/icons';
import { PomEditor, DEFAULT_POM, useStyle, type Pom } from './StyleTools';
import { CostingSheet, emptyCosting, computeTotals, withDefaults, type Costing } from './CostingSheet';
import { MaterialSheet, L0, P0 as MP0, type MatLine, type MatPlan } from './MaterialSheet';
import { COURIERS, type Sample, type Piece, type Photo, type Courier } from './SampleDialogs';

type Buyer = { id: string; displayName: string };
const TYPES = ['Proto Sample', 'Fit Sample', 'Revised Fit Sample', 'Size Set', 'PP Sample', 'Exhibition Sample', 'Salesman Sample', 'Photoshoot Sample', 'SMS (1st of bulk)', 'TOP Sample'];
const FABRICS = ['Cotton Poplin', 'Cotton Twill', 'Cotton Cambric', 'Chambray', 'Linen', 'Linen Blend', 'Rayon', 'Viscose', 'Modal', 'Denim', 'Corduroy', 'Single Jersey', 'Pique', 'Fleece', 'French Terry', 'Georgette', 'Satin', 'Crepe', 'Polyester', 'Lycra Blend', 'Wool Blend'];
const SIZE_CHIPS = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'F'];
const SPEC_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp';
const C0: Courier = { method: '', awb: '', receiver: '', notes: '' };
const S0 = { buyerId: '', styleNo: '', description: '', type: 'Proto Sample', sizeRange: 'S – 3XL', accessories: '', targetDate: '', priority: 'Normal', notes: '', courier: C0 };
const P0: Piece = { description: '', fabric: '', colour: '', sizes: '', qty: 1, notes: '', photos: [] };
type Shot = Photo & { preview?: string; uploading?: boolean };
type Draft = Omit<Piece, 'photos'> & { key: string; shots: Shot[] };
const T0 = { articleNo: '', factory: '', processes: '', colourQtyOn: '', bomOn: '', techPackOn: '', artworkOn: '', ccMaterial: '', remarks: '' };
type SpecDraft = { fileId?: string; name: string; size: number; preview?: string; uploading?: boolean };
const fmtMb = (n?: number) => (!n ? '' : n < 1048576 ? `${Math.max(Math.round(n / 1024), 1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const STEPS = ['Request', 'Pieces & photos', 'Measurement spec', 'Material sheet', 'Costing', 'Review'] as const;

/** Sample development is the entry point: everything typed here (pieces, POM, costing, tracking) flows on to the order, BOM and inspections. */
export default function SampleFormPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const isNew = !id;
  const sampleQ = useQuery<Sample>({ queryKey: ['/samples', id], queryFn: async () => (await api.get(`/samples/${id}`)).data, enabled: !!id });
  const sample = sampleQ.data;
  const style = useStyle(sample?.styleId);
  const buyers = useList<Buyer>('/buyers', { size: 200, status: 'Active' });
  const fabricMaster = useList<{ id: string; name: string }>('/materials', { size: 300, category: 'Fabric' });
  const cf = useCustomFields('samples', sample?.custom ?? null, sample?.id ?? 'new');

  const [step, setStep] = React.useState(0);
  const [f, setF] = React.useState(S0);
  const [pieces, setPieces] = React.useState<Draft[]>([]);
  const [spec, setSpec] = React.useState<SpecDraft | null>(null);
  const [tr, setTr] = React.useState(T0);
  const [sizes, setSizes] = React.useState<string[]>(['S', 'M', 'L', 'XL']);
  const [unit, setUnit] = React.useState<'cm' | 'in'>('cm');
  const [pom, setPom] = React.useState<Pom[]>(DEFAULT_POM.map((p) => ({ ...p, spec: {} })));
  const [costing, setCosting] = React.useState<Costing>(emptyCosting());
  const [matLines, setMatLines] = React.useState<MatLine[]>([L0('Fabric'), L0('Yarn / Thread'), L0('Labels'), L0('Packing Materials')]);
  const [matPlan, setMatPlan] = React.useState<MatPlan>(MP0);
  const [saving, setSaving] = React.useState(false);
  const [loaded, setLoaded] = React.useState(isNew);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const specRef = React.useRef<HTMLInputElement>(null);
  const addRef = React.useRef<{ key: string; input: HTMLInputElement | null }>({ key: '', input: null });
  const [drag, setDrag] = React.useState(false);

  /* load an existing sample once (and its style POM / costing) */
  React.useEffect(() => {
    if (loaded || !sample) return;
    setF({ buyerId: sample.buyerId, styleNo: sample.styleNo, description: sample.description, type: sample.type, sizeRange: sample.sizeRange, accessories: sample.accessories,
      targetDate: toInputDate(sample.targetDate), priority: sample.priority, notes: sample.notes, courier: { ...C0, ...(sample.courier ?? {}) } });
    setPieces((sample.items ?? []).map((i, n) => ({ ...P0, ...i, key: `p${n}`, shots: (i.photos?.length ? i.photos : i.fileId ? [{ fileId: i.fileId, fileName: i.fileName }] : []) as Shot[] })));
    setTr({ ...T0, ...(sample.tracking ?? {}), colourQtyOn: toInputDate(sample.tracking?.colourQtyOn), bomOn: toInputDate(sample.tracking?.bomOn), techPackOn: toInputDate(sample.tracking?.techPackOn), artworkOn: toInputDate(sample.tracking?.artworkOn) });
    if (sample.costing) setCosting(withDefaults(sample.costing));
    if (sample.materials?.length) setMatLines(sample.materials.map((l) => ({ ...L0(l.group), ...l, requiredDate: toInputDate(l.requiredDate) })));
    if (sample.materialPlan) setMatPlan({ ...MP0, ...sample.materialPlan, deliveryDate: toInputDate(sample.materialPlan.deliveryDate) });
    setLoaded(true);
  }, [sample, loaded]);
  React.useEffect(() => {
    if (!style.data) return;
    if (style.data.sizeSet?.length) setSizes(style.data.sizeSet);
    if (style.data.pomUnit) setUnit(style.data.pomUnit);
    if (style.data.pom?.length) setPom(style.data.pom.map((p) => ({ ...p, spec: { ...(p.spec || {}) } })));
  }, [style.data]);

  /* ---------- pieces & photos ---------- */
  const upd = (key: string, patch: Partial<Draft>) => setPieces((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const addShots = async (files: FileList | File[] | null, key?: string) => {
    const list = [...(files ?? [])].filter((file) => file.type.startsWith('image/'));
    if (!list.length) { if (files && [...files].length) toast.error('Only images (JPG, PNG, WEBP) can be attached as sample photos'); return; }
    let k = key;
    if (!k) { k = `n${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; setPieces((ps) => [...ps, { ...P0, key: k as string, shots: [], description: ps.length ? '' : f.description }]); }
    for (const file of list) {
      const preview = URL.createObjectURL(file);
      const mark: Shot = { fileId: '', fileName: file.name, preview, uploading: true };
      setPieces((ps) => ps.map((p) => (p.key === k ? { ...p, shots: [...p.shots, mark] } : p)));
      try {
        const up = await uploadFile(file, 'sample');
        setPieces((ps) => ps.map((p) => (p.key === k ? { ...p, shots: p.shots.map((sh) => (sh === mark || (sh.preview === preview && !sh.fileId) ? { fileId: up.id, fileName: up.name, preview } : sh)) } : p)));
      } catch (e) {
        toast.error(`${file.name}: ${apiMessage(e)}`);
        setPieces((ps) => ps.map((p) => (p.key === k ? { ...p, shots: p.shots.filter((sh) => sh.preview !== preview) } : p)));
      }
    }
  };
  const dropShot = (key: string, i: number) => setPieces((ps) => ps.map((p) => (p.key === key ? { ...p, shots: p.shots.filter((_, j) => j !== i) } : p)));
  const makeCover = (key: string, i: number) => setPieces((ps) => ps.map((p) => (p.key === key ? { ...p, shots: [p.shots[i], ...p.shots.filter((_, j) => j !== i)] } : p)));
  const removePiece = (key: string) => setPieces((ps) => ps.filter((p) => p.key !== key));
  const addBlank = () => setPieces((ps) => [...ps, { ...P0, key: `b${Date.now()}`, shots: [] }]);
  const toggleSize = (key: string, size: string) => setPieces((ps) => ps.map((p) => {
    if (p.key !== key) return p;
    const cur = p.sizes.split(/[,\s/]+/).map((x) => x.trim()).filter(Boolean);
    const next = cur.includes(size) ? cur.filter((x) => x !== size) : [...cur, size].sort((a, b) => SIZE_CHIPS.indexOf(a) - SIZE_CHIPS.indexOf(b));
    return { ...p, sizes: next.join(', ') };
  }));
  const attachSpec = async (file?: File) => {
    if (!file) return;
    if (!new RegExp(`(${SPEC_ACCEPT.replace(/\./g, '\\.').replace(/,/g, '|')})$`, 'i').test(file.name)) { toast.error('Specification must be PDF, DOC/DOCX, XLS/XLSX or an image'); return; }
    const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
    setSpec({ name: file.name, size: file.size, preview, uploading: true });
    try { const up = await uploadFile(file, 'sample'); setSpec({ fileId: up.id, name: up.name, size: up.size, preview }); }
    catch (e) { toast.error(`${file.name}: ${apiMessage(e)}`); setSpec(null); }
  };

  const fabrics = [...new Set([...(fabricMaster.data?.items ?? []).map((m) => m.name), ...FABRICS])];
  const uploading = pieces.some((p) => p.shots.some((sh) => sh.uploading)) || !!spec?.uploading;
  const missing = pieces.filter((p) => !p.description.trim()).length;
  const totalPcs = pieces.reduce((a, p) => a + (p.qty || 0), 0);
  const shots = pieces.reduce((a, p) => a + p.shots.length, 0);
  const pomFilled = pom.filter((p) => p.name.trim() && sizes.some((z) => p.spec?.[z] != null)).length;
  const costTotals = computeTotals(costing);
  /* the costing sheet is filled from the material sheet — only the rates are typed */
  const fromMaterial = React.useCallback((keepRates: boolean) => {
    const lines = matLines.filter((l) => (l.item || '').trim());
    if (!lines.length) return;
    const rateOf = (arr: { item: string; rate: number }[], item: string) => (keepRates ? (arr.find((x) => (x.item || '').toLowerCase() === item.toLowerCase())?.rate ?? 0) : 0);
    setCosting((c) => ({
      ...c,
      fabrics: lines.filter((l) => l.group === 'Fabric').map((l) => ({
        item: l.item, description: l.description || '', yardage: l.perPc || 0, shrinkPct: l.wastePct || 0, actYard: 0,
        rate: rateOf(c.fabrics, l.item), amount: 0, party: l.supplierName || '', note: l.unit || '' })),
      trims: lines.filter((l) => l.group !== 'Fabric').map((l) => ({
        item: l.item, description: l.description || '', qty: l.perPc || 1, unit: l.unit || 'pcs',
        rate: rateOf(c.trims, l.item), amount: 0, party: l.supplierName || '', note: '' })),
    }));
  }, [matLines]);
  const pulled = React.useRef(false);
  React.useEffect(() => {
    if (step !== 4 || pulled.current) return;
    const touched = costing.fabrics.some((l) => l.rate > 0 || l.yardage > 0) || costing.trims.some((l) => l.rate > 0);
    if (!touched && matLines.some((l) => (l.item || '').trim())) { fromMaterial(false); pulled.current = true; }
  }, [step, matLines, costing.fabrics, costing.trims, fromMaterial]);
  const matFilled = matLines.filter((l) => l.item.trim() && l.perPc > 0).length;
  const canSave = !saving && !uploading && !missing && cf.ok && !!f.buyerId && !!f.styleNo.trim() && !!f.description.trim();

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const body = {
        ...f, targetDate: f.targetDate || undefined, specSheetFileId: spec?.fileId, custom: cf.value,
        items: pieces.map((p) => ({ description: p.description, fabric: p.fabric, colour: p.colour, sizes: p.sizes, qty: p.qty, notes: p.notes,
          photos: p.shots.filter((sh) => sh.fileId).map((sh) => ({ fileId: sh.fileId, fileName: sh.fileName })) })),
      };
      const saved: Sample = (isNew ? await api.post('/samples', body) : await api.patch(`/samples/${id}`, body)).data;
      if (saved.styleId && pom.some((p) => p.name.trim())) await api.put(`/styles/${saved.styleId}/pom`, { sizeSet: sizes, pomUnit: unit, pom });
      if (costTotals.final > 0 || costing.targetPrice > 0) await api.put(`/samples/${saved.id}/costing`, costing);
      if (Object.values(tr).some(Boolean)) await api.put(`/samples/${saved.id}/tracking`, tr);
      if (matLines.some((l) => l.item.trim() || l.perPc)) await api.put(`/samples/${saved.id}/materials`, { lines: matLines, plan: matPlan });
      ['/samples', '/styles', '/tna'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(`${saved.sampleNo} saved`);
      nav(`/samples/${saved.id}`);
    } catch (e) { toast.error(apiMessage(e)); } finally { setSaving(false); }
  };

  if (!isNew && !loaded) return <div className="space-y-3 animate-rise"><Skeleton className="h-9 w-72" /><Skeleton className="h-40" /></div>;
  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title={isNew ? 'New Sample Request' : `Edit ${sample?.sampleNo ?? ''}`}
        sub="Everything you fill here travels with the style — pieces and photos, the measurement spec, the costing sheet and the buyer's dates. Later steps (order, BOM, inspection) read it instead of asking again.">
        <Button variant="secondary" onClick={() => nav(isNew ? '/samples' : `/samples/${id}`)}><ArrowLeft size={15} /> Cancel</Button>
        <Button disabled={!canSave} onClick={submit}><Check size={16} /> {saving ? 'Saving…' : isNew ? 'Create sample' : 'Save changes'}</Button>
      </PageHeader>

      {/* stepper */}
      <div className="flex flex-wrap gap-2">
        {STEPS.map((title, i) => {
          const done = i < step;
          return (
            <button key={title} type="button" onClick={() => setStep(i)}
              className={cn('flex flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all', i === step ? 'border-brand bg-brand-soft shadow-card dark:bg-accent' : done ? 'border-teal/40 bg-teal-soft/40 dark:bg-teal/10' : 'bg-card hover:border-brand/50')}>
              <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold', i === step ? 'bg-brand text-white' : done ? 'bg-teal text-white' : 'border bg-secondary text-muted-foreground')}>{done ? <Check size={12} /> : i + 1}</span>
              <span className="min-w-0"><span className="block truncate text-[12.5px] font-semibold">{title}</span>
                <span className="block truncate text-[10.5px] text-muted-foreground">
                  {i === 0 ? (f.styleNo || 'buyer, style, dates') : i === 1 ? (pieces.length ? `${pieces.length} piece${pieces.length > 1 ? 's' : ''} · ${shots} photo${shots === 1 ? '' : 's'}` : 'photos & details') : i === 2 ? (pomFilled ? `${pomFilled} points` : 'optional') : i === 3 ? (matFilled ? `${matFilled} materials` : 'what one pc needs') : i === 4 ? (costTotals.final ? `₹${costTotals.final} / pc` : 'optional') : 'check & save'}
                </span></span>
            </button>);
        })}
      </div>

      {/* ---------- step 1 · request ---------- */}
      {step === 0 && <Card><CardContent className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Buyer"><Select value={f.buyerId} onValueChange={(v) => setF({ ...f, buyerId: v })}><SelectTrigger><SelectValue placeholder="Select buyer" /></SelectTrigger>
            <SelectContent>{(buyers.data?.items ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.displayName}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Style No" hint={isNew ? 'the style master is created from this number' : undefined}><Input value={f.styleNo} readOnly={!isNew} onChange={(e) => setF({ ...f, styleNo: e.target.value.toUpperCase() })} placeholder="AF-2480" /></Field>
          <Field label="Sample Type"><Select value={f.type} onValueChange={(v) => setF({ ...f, type: v })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Product Description" className="sm:col-span-3"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. Ladies Linen Shirt Dress — 2 tops + 1 dress set" /></Field>
          <Field label="Size Range"><Input value={f.sizeRange} onChange={(e) => setF({ ...f, sizeRange: e.target.value })} /></Field>
          <Field label="Target Send Date"><Input type="date" value={f.targetDate} onChange={(e) => setF({ ...f, targetDate: e.target.value })} /></Field>
          <Field label="Priority"><Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{['Urgent', 'High', 'Normal', 'Low'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Accessories" className="sm:col-span-2"><Input value={f.accessories} onChange={(e) => setF({ ...f, accessories: e.target.value })} placeholder="12 × buttons, woven label, care label, hang tag…" /></Field>
          <Field label="Buyer comments / tech-pack notes"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Fit, trims, measurement notes…" /></Field>
        </div>

        <div>
          <SectionTitle title="What the buyer sent" sub="Dates from the buyer's sample status sheet — they show on the tracking tab and the dossier" />
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Field label="Buyer article no"><Input value={tr.articleNo} onChange={(e) => setTr({ ...tr, articleNo: e.target.value })} placeholder="ZD-4471" /></Field>
            <Field label="Factory / unit"><Input value={tr.factory} onChange={(e) => setTr({ ...tr, factory: e.target.value })} placeholder="Unit 1" /></Field>
            <Field label="Processes"><Input value={tr.processes} onChange={(e) => setTr({ ...tr, processes: e.target.value })} placeholder="Print · Embroidery · Wash" /></Field>
            <Field label="CC material"><Input value={tr.ccMaterial} onChange={(e) => setTr({ ...tr, ccMaterial: e.target.value })} placeholder="received / awaited" /></Field>
            <Field label="Colour & qty detail received"><Input type="date" value={tr.colourQtyOn} onChange={(e) => setTr({ ...tr, colourQtyOn: e.target.value })} /></Field>
            <Field label="BOM received"><Input type="date" value={tr.bomOn} onChange={(e) => setTr({ ...tr, bomOn: e.target.value })} /></Field>
            <Field label="Tech pack received"><Input type="date" value={tr.techPackOn} onChange={(e) => setTr({ ...tr, techPackOn: e.target.value })} /></Field>
            <Field label="Artwork received"><Input type="date" value={tr.artworkOn} onChange={(e) => setTr({ ...tr, artworkOn: e.target.value })} /></Field>
            <Field label="Remarks" className="sm:col-span-3 lg:col-span-4"><Input value={tr.remarks} onChange={(e) => setTr({ ...tr, remarks: e.target.value })} /></Field>
          </div>
        </div>

        <div>
          <SectionTitle title="Specification sheet / tech pack" sub={isNew ? "The buyer's tech pack, if you have it now — it becomes version 1" : 'Attach a newer version — earlier versions stay in the history'} />
          <input ref={specRef} type="file" accept={SPEC_ACCEPT} hidden onChange={(e) => { attachSpec(e.target.files?.[0]); e.target.value = ''; }} />
          {spec ? (
            <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-card">
              {spec.preview ? <img src={spec.preview} alt="" className="h-16 w-12 rounded-md object-cover" /> : <div className="grid h-16 w-12 place-items-center rounded-md bg-secondary text-muted-foreground"><FileIcon size={22} /></div>}
              <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold">{spec.name}</div><div className="text-[11.5px] text-muted-foreground">{fmtMb(spec.size)}{spec.uploading ? ' · uploading…' : ` · saved as v${(sample?.specSheets.length ?? 0) + 1}`}</div></div>
              <Button type="button" variant="secondary" size="sm" onClick={() => specRef.current?.click()}><Refresh size={13} /> Replace</Button>
              <Button type="button" variant="secondary" size="sm" className="text-bad" onClick={() => setSpec(null)}><Trash size={13} /></Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => specRef.current?.click()} className="flex flex-1 items-center gap-3 rounded-xl border-2 border-dashed bg-secondary/60 px-4 py-3 text-left transition-colors hover:border-brand/60 hover:bg-brand-soft/40">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-soft text-teal"><Upload size={17} /></span>
                <span><span className="block text-[13px] font-semibold">Upload specification sheet</span><span className="block text-[11.5px] text-muted-foreground">PDF, DOC/DOCX, XLS/XLSX or image · optional</span></span>
              </button>
              {sample?.specSheet && <div className="flex items-center gap-2 rounded-xl border bg-secondary/60 px-3 py-2 text-[12.5px]"><FileIcon size={16} className="text-muted-foreground" /><span className="max-w-[220px] truncate">Current: v{sample.specSheet.version} · {sample.specSheet.fileName}</span>{sample.specSheet.fileId && <Button type="button" variant="secondary" size="sm" onClick={() => openFile(sample.specSheet!.fileId!, sample.specSheet!.fileName)}><Eye size={13} /></Button>}</div>}
            </div>
          )}
        </div>

        {cf.fields.length > 0 && <div><SectionTitle title="Additional details" sub="Fields your admin added in Settings → Form Fields → Sample Request" /><CustomFieldsGrid fields={cf.fields} value={cf.value} onChange={cf.setValue} /></div>}

        <div>
          <SectionTitle title="Courier" sub="How the pieces travel — the AWB is also captured when you mark a round as sent" />
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Courier method"><Select value={f.courier.method || undefined} onValueChange={(v) => setF({ ...f, courier: { ...f.courier, method: v } })}><SelectTrigger><SelectValue placeholder="Select courier" /></SelectTrigger>
              <SelectContent>{COURIERS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="AWB / tracking no"><Input value={f.courier.awb} onChange={(e) => setF({ ...f, courier: { ...f.courier, awb: e.target.value } })} /></Field>
            <Field label="Receiver at buyer"><Input value={f.courier.receiver} onChange={(e) => setF({ ...f, courier: { ...f.courier, receiver: e.target.value } })} placeholder="Name · phone" /></Field>
            <Field label="Courier notes"><Input value={f.courier.notes} onChange={(e) => setF({ ...f, courier: { ...f.courier, notes: e.target.value } })} placeholder="1 box · 1.2 kg…" /></Field>
          </div>
        </div>
      </CardContent></Card>}

      {/* ---------- step 2 · pieces ---------- */}
      {step === 1 && <Card><CardContent className="space-y-3 p-5">
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addShots(e.target.files); e.target.value = ''; }} />
        <input ref={(el) => { addRef.current.input = el; }} type="file" accept="image/*" multiple hidden onChange={(e) => { addShots(e.target.files, addRef.current.key); e.target.value = ''; }} />
        <div role="button" tabIndex={0} onClick={() => fileRef.current?.click()} onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); addShots(e.dataTransfer.files); }}
          className={cn('group flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed px-5 py-4 transition-colors', drag ? 'border-brand bg-brand-soft' : 'bg-secondary/60 hover:border-brand/60 hover:bg-brand-soft/40')}>
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand to-violet text-white shadow-card"><Upload size={20} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold">Drop photos here, or click to browse</div>
            <div className="text-[11.5px] text-muted-foreground">JPG, PNG or WEBP · up to 25 MB each · the files you drop together become one piece — use <b>Add photos</b> on a card for more views of the same piece</div>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); addBlank(); }}><Plus size={13} /> Piece without photo</Button>
        </div>

        {pieces.map((p, idx) => (
          <div key={p.key} className={cn('rounded-xl border bg-card p-3 shadow-card', !p.description.trim() && 'border-gold-vivid/60')}>
            <div className="grid gap-4 lg:grid-cols-[minmax(200px,260px)_1fr]">
              {/* gallery */}
              <div>
                <div className="flex flex-wrap gap-2">
                  {p.shots.map((sh, i) => (
                    <div key={`${sh.fileId}-${i}`} className={cn('group relative h-[104px] w-[80px] overflow-hidden rounded-lg border bg-secondary', i === 0 && 'ring-2 ring-brand')}>
                      {sh.preview ? <img src={sh.preview} alt="" className="h-full w-full object-cover" /> : sh.fileId ? <AuthImg fileId={sh.fileId} className="h-full w-full" /> : null}
                      {sh.uploading && <div className="absolute inset-x-0 bottom-0 bg-ink/70 py-0.5 text-center text-[9.5px] font-semibold text-white">uploading…</div>}
                      {i === 0 && <span className="absolute left-1 top-1 rounded bg-brand px-1 py-px text-[8.5px] font-bold uppercase text-white">cover</span>}
                      <div className="absolute inset-x-0 top-0 flex justify-end gap-0.5 p-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        {i > 0 && <button type="button" title="Make cover" className="rounded bg-card/90 p-1 text-[9px] font-bold hover:text-brand" onClick={() => makeCover(p.key, i)}>★</button>}
                        <button type="button" title="Remove photo" className="rounded bg-card/90 p-1 text-bad" onClick={() => dropShot(p.key, i)}><Close size={11} /></button>
                      </div>
                    </div>))}
                  <button type="button" onClick={() => { addRef.current.key = p.key; addRef.current.input?.click(); }}
                    className="grid h-[104px] w-[80px] place-items-center rounded-lg border-2 border-dashed text-center text-[10.5px] text-muted-foreground hover:border-brand hover:text-brand">
                    <span><Upload size={18} className="mx-auto mb-1" />Add photos</span>
                  </button>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-muted-foreground">
                  <span>#{idx + 1} · {p.shots.length} photo{p.shots.length === 1 ? '' : 's'}</span>
                  <button type="button" title="Remove piece" onClick={() => removePiece(p.key)} className="rounded p-1 text-bad hover:bg-bad-soft"><Trash size={13} /></button>
                </div>
              </div>
              {/* fields */}
              <div className="grid gap-3 sm:grid-cols-6">
                <Field label="Piece / description" className="sm:col-span-3" hint={!p.description.trim() ? 'Required — what is this piece?' : undefined}>
                  <Input value={p.description} onChange={(e) => upd(p.key, { description: e.target.value })} placeholder="e.g. Ladies top — round neck, 3/4 sleeve" className={cn(!p.description.trim() && 'border-gold-vivid/70')} /></Field>
                <Field label="Fabric type" className="sm:col-span-2"><Input list="sample-fabrics" value={p.fabric} onChange={(e) => upd(p.key, { fabric: e.target.value })} placeholder="Pick or type" /></Field>
                <Field label="Qty (pcs)"><Input type="number" min={1} value={p.qty} onChange={(e) => upd(p.key, { qty: Math.max(parseInt(e.target.value, 10) || 1, 1) })} /></Field>
                <Field label="Colour" className="sm:col-span-2"><Input value={p.colour} onChange={(e) => upd(p.key, { colour: e.target.value })} placeholder="Dusty Blue" /></Field>
                <Field label="Sizes" className="sm:col-span-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {SIZE_CHIPS.map((sz) => { const on = p.sizes.split(/[,\s/]+/).includes(sz); return <button key={sz} type="button" onClick={() => toggleSize(p.key, sz)} className={cn('rounded-md border px-2 py-1 text-[11.5px] font-semibold transition-colors', on ? 'border-brand bg-brand text-white' : 'bg-secondary text-muted-foreground hover:border-brand/60 hover:text-foreground')}>{sz}</button>; })}
                    <Input value={p.sizes} onChange={(e) => upd(p.key, { sizes: e.target.value })} placeholder="or type: 32, 34 / Free size" className="h-8 min-w-[140px] flex-1 text-xs" />
                  </div></Field>
                <Field label="Notes for this piece" className="sm:col-span-6"><Input value={p.notes} onChange={(e) => upd(p.key, { notes: e.target.value })} placeholder="Wash, print placement, trims, measurements…" /></Field>
              </div>
            </div>
          </div>))}
        {!pieces.length && <p className="px-1 text-[11.5px] text-muted-foreground">No pieces yet — drop photos above. Fabric, colour and the piece count on the sample are worked out from these cards.</p>}
        <datalist id="sample-fabrics">{fabrics.map((x) => <option key={x} value={x} />)}</datalist>
      </CardContent></Card>}

      {/* ---------- step 3 · POM ---------- */}
      {step === 2 && <Card><CardContent className="space-y-3 p-5">
        <SectionTitle title={`Measurement spec (POM) — ${f.styleNo || 'style'}`} sub="Size-wise spec with tolerance. Sample rounds, the comment sheet and the bulk measurement inspection all compare against this table — you never type it again." />
        <PomEditor sizes={sizes} setSizes={setSizes} unit={unit} setUnit={setUnit} rows={pom} setRows={setPom} />
        <p className="text-[11.5px] text-muted-foreground">Tip: type one size (e.g. M) for every point and press <b>Auto-grade</b> — the rest of the sizes fill in with the same step.</p>
      </CardContent></Card>}

      {/* ---------- step 4 · material sheet ---------- */}
      {step === 3 && <Card><CardContent className="space-y-3 p-5">
        <SectionTitle title="Material requirement — what one piece needs" sub="Fabric, thread, trims, buttons, labels and packing with consumption per piece and wastage %. The BOM is built from this sheet and the stock check (green / red) runs on it — these items are never typed again." />
        <MaterialSheet lines={matLines} plan={matPlan} onLines={setMatLines} onPlan={setMatPlan} />
      </CardContent></Card>}

      {/* ---------- step 5 · costing ---------- */}
      {step === 4 && <Card><CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <SectionTitle title="Costing sheet" sub="Items, description, consumption and unit come from the material sheet — you only type the rates. Process charges, wastage and profit stay yours." />
          {matLines.some((l) => (l.item || '').trim()) && <Button size="sm" variant="secondary" onClick={() => fromMaterial(true)} title="Re-read the material sheet — typed rates are kept">
            <Refresh size={14} /> Refill from material sheet</Button>}
        </div>
        <CostingSheet value={costing} onChange={setCosting} />
      </CardContent></Card>}

      {/* ---------- step 6 · review ---------- */}
      {step === 5 && <Card><CardContent className="space-y-4 p-5">
        <SectionTitle title="Review" sub="Check and save — after saving you can mark rounds sent, log buyer comments, record approvals and convert to an order." />
        <div className="grid gap-4 lg:grid-cols-3">
          <Fact k="Buyer" v={(buyers.data?.items ?? []).find((b) => b.id === f.buyerId)?.displayName || '—'} />
          <Fact k="Style · type" v={`${f.styleNo || '—'} · ${f.type}`} />
          <Fact k="Description" v={f.description || '—'} />
          <Fact k="Pieces" v={`${pieces.length} piece${pieces.length === 1 ? '' : 's'} · ${fmtN(totalPcs)} pcs · ${shots} photo${shots === 1 ? '' : 's'}`} />
          <Fact k="Size range · target" v={`${f.sizeRange} · ${f.targetDate || 'no date'}`} />
          <Fact k="Measurement spec" v={pomFilled ? `${pomFilled} points across ${sizes.length} sizes (${unit})` : 'not filled'} />
          <Fact k="Material sheet" v={matFilled ? `${matFilled} items${matPlan.qty ? ` on ${fmtN(matPlan.qty)} pcs` : ''}` : 'not filled'} />
          <Fact k="Costing" v={costTotals.final ? `₹${costTotals.final} / pc · ${costTotals.finalFx} ${costing.currency}` : 'not filled'} />
          <Fact k="Courier" v={f.courier.method ? `${f.courier.method}${f.courier.awb ? ` · ${f.courier.awb}` : ''}` : '—'} />
          <Fact k="Buyer dates" v={[tr.techPackOn && 'tech pack', tr.bomOn && 'BOM', tr.artworkOn && 'artwork', tr.colourQtyOn && 'colour/qty'].filter(Boolean).join(', ') || '—'} />
        </div>
        {(missing > 0 || !f.buyerId || !f.styleNo.trim() || !f.description.trim() || cf.missing.length > 0) && (
          <div className="rounded-xl border border-gold-vivid/40 bg-gold-soft p-3 text-[12.5px] text-gold dark:bg-gold-vivid/10 dark:text-gold-vivid">
            Still needed: {[!f.buyerId && 'buyer', !f.styleNo.trim() && 'style no', !f.description.trim() && 'description', missing > 0 && `${missing} piece description${missing > 1 ? 's' : ''}`, ...cf.missing].filter(Boolean).join(' · ')}
          </div>)}
        <div className="flex flex-wrap gap-2"><Button disabled={!canSave} onClick={submit}><Check size={16} /> {saving ? 'Saving…' : isNew ? 'Create sample' : 'Save changes'}</Button>
          {!isNew && <Button variant="secondary" asChild><Link to={`/samples/${id}`}><SampleIcon size={15} /> Open sample page</Link></Button>}</div>
      </CardContent></Card>}

      {/* footer nav */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={15} /> Back</Button>
        <span className="text-[11.5px] text-muted-foreground">{uploading ? 'Uploading photos…' : `Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`}</span>
        <div className="ml-auto flex gap-2">
          {step < STEPS.length - 1 && <Button onClick={() => setStep(step + 1)}>Next: {STEPS[step + 1]} <ChevronRight size={15} /></Button>}
          {step === STEPS.length - 1 && <Button disabled={!canSave} onClick={submit}><Check size={16} /> {isNew ? 'Create sample' : 'Save changes'}</Button>}
        </div>
      </div>
    </div>
  );
}

const SectionTitle = ({ title, sub }: { title: string; sub?: string }) => (
  <div className="mb-2"><div className="text-[13.5px] font-semibold">{title}</div>{sub && <div className="text-[11.5px] text-muted-foreground">{sub}</div>}</div>
);
const Fact = ({ k, v }: { k: string; v: string }) => (
  <div className="rounded-lg border bg-secondary/50 px-3 py-2"><div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{k}</div><div className="truncate text-[13px] font-semibold" title={v}>{v}</div></div>
);
