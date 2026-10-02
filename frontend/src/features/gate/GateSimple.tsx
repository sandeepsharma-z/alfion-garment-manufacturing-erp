import * as React from 'react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useList, uploadFile, fmtN, fmtDate } from '@/lib/crud';
import { cn, uuid as newUuid } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Check, Upload, ArrowLeft, Search, Gate as GateIcon, Alert, Plus, Trash, Refresh } from '@/icons/icons';

/**
 * Gate man screen — three taps, phone-first: 1 pick what arrived → 2 type the quantity (+ optional photo / vehicle) → 3 confirm.
 * Same API as the full form; everything the store manager needs later (driver, challan, invoice, godown, lots) is optional under "More".
 */
type Pending = { kind: 'po' | 'jw'; id: string; no: string; party: string; materialCode: string; material: string; uom: string; orderNo: string; orderedQty: number; receivedQty: number; pendingQty: number; status: string; eta?: string; priority: string };
type Entry = { id: string; gateNo: string; grnNo: string; refNo: string; partyName: string; materialName: string; uom: string; receivedQty: number; rejectedQty: number; statusAfter: string; createdAt: string; by: string };
type Lot = { lotNo: string; colour: string; thans: string; tagLength: string; actualLength: string; tagWidth: string; actualWidth: string; gsm: string };
const L0: Lot = { lotNo: '', colour: '', thans: '', tagLength: '', actualLength: '', tagWidth: '', actualWidth: '', gsm: '' };
const BIG_INPUT = 'h-14 w-full rounded-xl border-2 bg-card px-4 text-lg outline-none focus:border-brand';

export function GateSimple({ onFull }: { onFull?: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [step, setStep] = React.useState<1 | 2 | 3 | 'done'>(1);
  const [q, setQ] = React.useState('');
  const [doc, setDoc] = React.useState<Pending | null>(null);
  const [qty, setQty] = React.useState('');
  const [rejected, setRejected] = React.useState('');
  const [vehicleNo, setVehicleNo] = React.useState('');
  const [more, setMore] = React.useState({ driverName: '', challanNo: '', invoiceNo: '', remarks: '' });
  const [showMore, setShowMore] = React.useState(false);
  const [lots, setLots] = React.useState<Lot[]>([]);
  const [photos, setPhotos] = React.useState<{ id: string; name: string }[]>([]);
  const [uuid, setUuid] = React.useState(() => newUuid());
  const [done, setDone] = React.useState<{ grnNo: string; message: string } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const pending = useQuery<{ items: Pending[] }>({ queryKey: ['/gate/pending'], queryFn: async () => (await api.get('/gate/pending')).data });
  const register = useList<Entry>('/gate', { size: 20 });
  const docs = (pending.data?.items ?? []).filter((d) => !q || `${d.no} ${d.party} ${d.material} ${d.materialCode} ${d.orderNo}`.toLowerCase().includes(q.toLowerCase()));
  const isFabric = !!doc && doc.kind === 'po' && /mtr|m$|meter|metre|yd/i.test(doc.uom);
  const n = Math.max(+qty || 0, 0);
  const over = !!doc && n > doc.pendingQty;
  const reset = () => { setStep(1); setDoc(null); setQty(''); setRejected(''); setVehicleNo(''); setMore({ driverName: '', challanNo: '', invoiceNo: '', remarks: '' }); setShowMore(false); setLots([]); setPhotos([]); setUuid(newUuid()); setDone(null); setQ(''); };
  const post = useMutation({
    mutationFn: async () => (await api.post('/gate', { clientUuid: uuid, kind: doc!.kind, refId: doc!.id, receivedQty: n, rejectedQty: Math.max(+rejected || 0, 0), vehicleNo, ...more, date: new Date().toISOString().slice(0, 10), receivedBy: user?.name || '',
      inspection: 'Passed 4-point', photoFileIds: photos.map((p) => p.id), lots: lots.filter((l) => l.lotNo || l.actualLength) })).data,
    onSuccess: (d: { entry: { grnNo: string }; message: string; duplicate: boolean }) => {
      ['/gate', '/gate/pending', '/gate/summary', '/po', '/po/summary', '/materials', '/stock', '/orders', '/accessories', '/jobwork', '/production', '/packing', '/tna'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setDone({ grnNo: d.entry.grnNo, message: d.duplicate ? 'Already posted — no double entry' : d.message }); setStep('done');
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const addPhoto = async (file?: File) => {
    if (!file) return;
    try { const r = await uploadFile(file, 'gate', uuid); setPhotos((p) => [...p, { id: r.id, name: r.name }]); toast.success('Photo added'); }
    catch (e) { toast.error(apiMessage(e)); } finally { if (fileRef.current) fileRef.current.value = ''; }
  };
  const today = (register.data?.items ?? []).filter((e) => new Date(e.createdAt).toDateString() === new Date().toDateString());

  /* ---------- header: step dots ---------- */
  const Steps = () => (
    <div className="flex items-center gap-2 text-[12px] font-semibold">
      {[['1', 'What arrived'], ['2', 'How much'], ['3', 'Confirm']].map(([k, l], i) => { const active = step === +k || (step === 'done' && i === 2); const past = step !== 'done' && typeof step === 'number' && step > +k; return (
        <React.Fragment key={k}><span className={cn('grid h-7 w-7 place-items-center rounded-full border-2 text-[12px]', active ? 'border-brand bg-brand text-white' : past || step === 'done' ? 'border-teal bg-teal text-white' : 'border-border text-muted-foreground')}>{past || step === 'done' ? '✓' : k}</span><span className={cn(active ? 'text-foreground' : 'text-muted-foreground')}>{l}</span>{i < 2 && <span className="mx-1 h-px w-4 bg-border sm:w-8" />}</React.Fragment>); })}
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Steps />
        {onFull && <button type="button" className="text-[12px] font-semibold text-muted-foreground hover:text-brand" onClick={onFull}>Full form</button>}
      </div>

      {/* ---------- step 1: what arrived ---------- */}
      {step === 1 && (
        <div className="space-y-3">
          <div className="rounded-2xl border bg-card p-4 shadow-card">
            <div className="text-[17px] font-bold">What has arrived at the gate?</div>
            <div className="text-[13px] text-muted-foreground">Tap the paper (PO number) that came with the truck. Ask the driver for the PO or challan number if unsure.</div>
            <div className="relative mt-3"><Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" /><input className={cn(BIG_INPUT, 'pl-11')} placeholder="PO number, supplier or material…" value={q} onChange={(e) => setQ(e.target.value)} inputMode="search" /></div>
          </div>
          {pending.isLoading ? <div className="rounded-2xl border bg-card p-6 text-center text-muted-foreground">Loading…</div>
          : !docs.length ? <div className="rounded-2xl border bg-card p-6 text-center"><GateIcon size={30} className="mx-auto text-muted-foreground" /><div className="mt-2 font-semibold">Nothing is expected right now</div><div className="text-[13px] text-muted-foreground">If a truck has come, call the store manager — the PO must be made first.</div></div>
          : <div className="space-y-2">{docs.map((d) => (
            <button key={d.id} type="button" onClick={() => { setDoc(d); setQty(''); setStep(2); }} className="flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-card transition-colors hover:border-brand active:bg-brand-soft">
              <div className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[11px] font-bold', d.kind === 'po' ? 'bg-brand-soft text-brand' : 'bg-teal-soft text-teal')}>{d.kind === 'po' ? 'PO' : 'JW'}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2"><span className="font-mono text-[15px] font-bold">{d.no}</span>{d.status === 'Overdue' && <span className="rounded-md bg-bad-soft px-1.5 text-[10px] font-bold text-bad">LATE</span>}</div>
                <div className="truncate text-[14px] font-semibold">{d.party}</div>
                <div className="truncate text-[12.5px] text-muted-foreground">{d.material}</div>
                <div className="mt-1 text-[12.5px]"><b className="text-brand">{fmtN(d.pendingQty)} {d.uom}</b> still to come{d.eta ? ` · expected ${fmtDate(d.eta)}` : ''}</div>
              </div>
              <span className="text-2xl text-muted-foreground">›</span>
            </button>))}</div>}
        </div>)}

      {/* ---------- step 2: how much ---------- */}
      {step === 2 && doc && (
        <div className="space-y-3">
          <button type="button" className="flex items-center gap-1 text-[13px] font-semibold text-muted-foreground" onClick={() => setStep(1)}><ArrowLeft size={15} /> Change document</button>
          <div className="rounded-2xl border bg-card p-4 shadow-card">
            <div className="font-mono text-[13px] font-bold text-brand">{doc.no}</div>
            <div className="text-[16px] font-bold">{doc.party}</div>
            <div className="text-[13px] text-muted-foreground">{doc.material}</div>
            <div className="mt-2 rounded-lg bg-secondary px-3 py-2 text-[13px]">Expected <b>{fmtN(doc.pendingQty)} {doc.uom}</b> — count what actually came, not what the paper says.</div>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-card">
            <label className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">How much came? ({doc.uom})</label>
            <input type="number" inputMode="decimal" autoFocus className={cn(BIG_INPUT, 'mt-1.5 h-16 text-3xl font-bold', over && 'border-bad')} placeholder="0" value={qty} onChange={(e) => setQty(e.target.value)} />
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="rounded-xl border px-4 py-2 text-[13px] font-semibold hover:border-brand" onClick={() => setQty(String(doc.pendingQty))}>Full quantity ({fmtN(doc.pendingQty)})</button>
              {[0.5, 0.25].map((p) => <button key={p} type="button" className="rounded-xl border px-4 py-2 text-[13px] font-semibold hover:border-brand" onClick={() => setQty(String(Math.round(doc.pendingQty * p * 100) / 100))}>{p === 0.5 ? 'Half' : 'Quarter'}</button>)}
            </div>
            {over && <div className="mt-2 flex items-center gap-2 rounded-lg bg-bad-soft px-3 py-2 text-[13px] font-semibold text-bad"><Alert size={16} /> More than expected ({fmtN(doc.pendingQty)}). Check with the store manager — this cannot be saved.</div>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border bg-card p-4 shadow-card">
              <label className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">Damaged / short (optional)</label>
              <input type="number" inputMode="decimal" className={cn(BIG_INPUT, 'mt-1.5')} placeholder="0" value={rejected} onChange={(e) => setRejected(e.target.value)} />
            </div>
            <div className="rounded-2xl border bg-card p-4 shadow-card">
              <label className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">Vehicle number (optional)</label>
              <input className={cn(BIG_INPUT, 'mt-1.5 uppercase')} placeholder="HR 26 AB 1234" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value.toUpperCase())} />
            </div>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><div className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">Photo of the challan / truck</div><div className="text-[12.5px] text-muted-foreground">Take a photo of the delivery paper — the store checks it later.</div></div>
              <Button size="lg" variant="secondary" onClick={() => fileRef.current?.click()}><Upload size={18} /> Take photo</Button>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => addPhoto(e.target.files?.[0])} />
            </div>
            {photos.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{photos.map((p) => <span key={p.id} className="rounded-md bg-teal-soft px-2 py-1 text-[12px] font-semibold text-teal">✓ {p.name}</span>)}</div>}
          </div>
          <button type="button" className="w-full rounded-2xl border border-dashed px-4 py-3 text-[13px] font-semibold text-muted-foreground" onClick={() => setShowMore(!showMore)}>{showMore ? 'Hide' : 'More details (optional — driver, challan no, invoice no, fabric lots)'}</button>
          {showMore && <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-card">
            <div className="grid gap-3 sm:grid-cols-2">
              {([['driverName', 'Driver name'], ['challanNo', 'Challan number'], ['invoiceNo', 'Supplier invoice number'], ['remarks', 'Remarks']] as const).map(([k, l]) => <label key={k} className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">{l}<input className={cn(BIG_INPUT, 'mt-1 h-12 text-base font-normal normal-case')} value={more[k]} onChange={(e) => setMore({ ...more, [k]: e.target.value })} /></label>)}
            </div>
            {isFabric && <div>
              <div className="flex items-center justify-between"><span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Fabric lots (lot number on each roll bundle)</span><Button size="sm" variant="secondary" type="button" onClick={() => setLots([...lots, { ...L0 }])}><Plus size={13} /> Add lot</Button></div>
              {lots.map((l, i) => <div key={i} className="mt-2 grid grid-cols-2 gap-2 rounded-xl border p-2 sm:grid-cols-4">
                {(['lotNo', 'colour', 'thans', 'actualLength', 'tagLength', 'actualWidth', 'tagWidth', 'gsm'] as (keyof Lot)[]).map((k) => <label key={k} className="text-[10px] font-bold uppercase text-muted-foreground">{{ lotNo: 'Lot no', colour: 'Colour', thans: 'Rolls (thans)', actualLength: 'Length measured', tagLength: 'Length on tag', actualWidth: 'Width measured', tagWidth: 'Width on tag', gsm: 'GSM' }[k]}<input type={['lotNo', 'colour'].includes(k) ? 'text' : 'number'} inputMode={['lotNo', 'colour'].includes(k) ? 'text' : 'decimal'} className="mt-0.5 h-11 w-full rounded-lg border bg-card px-2 text-base font-normal normal-case outline-none" value={l[k]} onChange={(e) => { const next = lots.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)); setLots(next); if (k === 'actualLength') setQty(String(next.reduce((a, x) => a + (+x.actualLength || 0), 0))); }} /></label>)}
                <button type="button" className="col-span-2 flex items-center justify-center gap-1 text-[12px] text-muted-foreground sm:col-span-4" onClick={() => setLots(lots.filter((_, j) => j !== i))}><Trash size={13} /> remove lot</button>
              </div>)}
            </div>}
          </div>}
          <div className="sticky bottom-2 z-10"><Button size="lg" className="h-14 w-full text-lg" disabled={!(n > 0) || over} onClick={() => setStep(3)}>Next — check &amp; confirm ›</Button></div>
        </div>)}

      {/* ---------- step 3: confirm ---------- */}
      {step === 3 && doc && (
        <div className="space-y-3">
          <button type="button" className="flex items-center gap-1 text-[13px] font-semibold text-muted-foreground" onClick={() => setStep(2)}><ArrowLeft size={15} /> Change quantity</button>
          <div className="rounded-2xl border-2 border-brand bg-card p-5 shadow-card">
            <div className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">Please check</div>
            <div className="mt-2 grid gap-2 text-[15px]">
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Document</span><b className="font-mono">{doc.no}</b></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">From</span><b className="text-right">{doc.party}</b></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Material</span><b className="text-right">{doc.material}</b></div>
              <div className="flex justify-between gap-3 rounded-xl bg-brand-soft px-3 py-2 text-[18px]"><span>Received now</span><b>{fmtN(n)} {doc.uom}</b></div>
              {+rejected > 0 && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Damaged / short</span><b className="text-bad">{fmtN(+rejected)} {doc.uom}</b></div>}
              {vehicleNo && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Vehicle</span><b>{vehicleNo}</b></div>}
              <div className="flex justify-between gap-3 text-[13px]"><span className="text-muted-foreground">After this</span><span>{fmtN(doc.receivedQty + n)} of {fmtN(doc.orderedQty)} {doc.uom} · {doc.receivedQty + n >= doc.orderedQty ? 'complete' : `${fmtN(doc.orderedQty - doc.receivedQty - n)} still to come`}</span></div>
              {photos.length > 0 && <div className="text-[13px] text-teal">✓ {photos.length} photo{photos.length > 1 ? 's' : ''} attached</div>}
            </div>
          </div>
          <div className="sticky bottom-2 z-10"><Button size="lg" className="h-16 w-full bg-teal text-lg hover:bg-teal/90" disabled={post.isPending} onClick={() => post.mutate()}><Check size={22} /> {post.isPending ? 'Saving…' : 'CONFIRM — goods received'}</Button></div>
        </div>)}

      {/* ---------- done ---------- */}
      {step === 'done' && done && (
        <div className="space-y-3">
          <div className="rounded-2xl border-2 border-teal bg-card p-6 text-center shadow-card">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-teal text-white"><Check size={34} /></div>
            <div className="mt-3 text-[13px] font-bold uppercase tracking-wide text-muted-foreground">Saved · write this number on the paper</div>
            <div className="mt-1 font-mono text-4xl font-bold">{done.grnNo}</div>
            <div className="mt-2 text-[13px] text-muted-foreground">{done.message}</div>
          </div>
          <Button size="lg" className="h-14 w-full text-lg" onClick={reset}><Refresh size={18} /> Next truck</Button>
        </div>)}

      {/* ---------- today's entries ---------- */}
      {step === 1 && (
        <div className="rounded-2xl border bg-card shadow-card">
          <div className="border-b px-4 py-2.5 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Today · {today.length} entr{today.length === 1 ? 'y' : 'ies'}</div>
          {!today.length ? <div className="px-4 py-3 text-[13px] text-muted-foreground">Nothing received yet today.</div>
          : today.map((e) => <div key={e.id} className="flex items-center justify-between gap-3 border-b px-4 py-2.5 text-[13px] last:border-0"><div className="min-w-0"><span className="font-mono font-bold">{e.grnNo}</span> · <span className="font-semibold">{e.partyName}</span><div className="truncate text-muted-foreground">{e.materialName}</div></div><div className="text-right"><div className="num font-bold">+{fmtN(e.receivedQty)} {e.uom}</div><div className="text-[11px] text-muted-foreground">{new Date(e.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div></div></div>)}
        </div>)}
    </div>
  );
}
