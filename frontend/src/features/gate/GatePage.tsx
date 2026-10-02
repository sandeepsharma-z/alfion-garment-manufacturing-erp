import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useList, uploadFile, fmtN, fmtDate } from '@/lib/crud';
import { cn, uuid as newUuid } from '@/lib/utils';
import { useCustomFields, FormMetaProvider } from '@/components/CustomFields';
import { GateSimple } from './GateSimple';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton, Table, THead, TBody, Tr, Th, Td, Badge } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertStrip } from '@/components/AlertStrip';
import { PageHeader, KpiTile, Field, StatusPill, EmptyState } from '@/components/shared';
import { Gate as GateIcon, Stock, Check, Alert, Upload, Jobwork, Eye, EyeOff, Plus, Trash } from '@/icons/icons';

type Pending = { kind: 'po' | 'jw'; id: string; no: string; party: string; materialId: string; materialCode: string; material: string; uom: string;
  orderNo: string; orderedQty: number; receivedQty: number; pendingQty: number; status: string; eta?: string; priority: string };
type Entry = { id: string; gateNo: string; grnNo: string; kind: string; refNo: string; partyName: string; materialCode: string; materialName: string; uom: string;
  orderNo: string; orderedQty: number; previousQty: number; receivedQty: number; rejectedQty: number; totalAfter: number; remainingAfter: number; statusAfter: string;
  vehicleNo: string; driverName: string; challanNo: string; invoiceNo: string; date: string; time: string; receivedBy: string; inspection: string; godown: string; remarks: string; by: string; createdAt: string };
type Summary = { awaiting: number; pendingQty: number; verifiedToday: number; withVendors: number; jwOpen: number };
type Company = { godowns?: string[] };

type Lot = { lotNo: string; colour: string; thans: string; tagLength: string; actualLength: string; tagWidth: string; actualWidth: string; gsm: string };
const L0: Lot = { lotNo: '', colour: '', thans: '', tagLength: '', actualLength: '', tagWidth: '', actualWidth: '', gsm: '' };
const F0 = { receivedQty: 0, rejectedQty: 0, vehicleNo: '', driverName: '', challanNo: '', invoiceNo: '', date: new Date().toISOString().slice(0, 10), receivedBy: '', inspection: 'Passed 4-point', godown: '', remarks: '' };

export default function GatePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  /* screen mode follows the device: phone / tablet (< 1024 px) or a Gate Man login → 3-step screen; desktop → full form. A manual switch lasts until the window is resized. */
  const [small, setSmall] = React.useState(() => window.matchMedia('(max-width: 1023px)').matches);
  const [manual, setManual] = React.useState<boolean | null>(null);
  React.useEffect(() => { const mq = window.matchMedia('(max-width: 1023px)'); const on = (e: MediaQueryListEvent) => { setSmall(e.matches); setManual(null); }; mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); }, []);
  const simple = user?.role === 'Gate Man' || (manual ?? small);
  const setSimple = (v: boolean) => setManual(v);
  const [docId, setDocId] = React.useState(sp.get('po') || sp.get('jw') || '');
  const [f, setF] = React.useState({ ...F0, receivedBy: user?.name || '' });
  const [lots, setLots] = React.useState<Lot[]>([]);
  const [photos, setPhotos] = React.useState<{ id: string; name: string }[]>([]);
  const [uuid, setUuid] = React.useState(() => newUuid());
  const cf = useCustomFields('gate', null, uuid);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const pending = useQuery<{ items: Pending[] }>({ queryKey: ['/gate/pending'], queryFn: async () => (await api.get('/gate/pending')).data });
  const sum = useQuery<Summary>({ queryKey: ['/gate/summary'], queryFn: async () => (await api.get('/gate/summary')).data });
  const meta = useQuery<{ inspection: string[] }>({ queryKey: ['/gate/meta'], queryFn: async () => (await api.get('/gate/meta')).data });
  const company = useQuery<Company>({ queryKey: ['/settings/company'], queryFn: async () => (await api.get('/settings/company')).data });
  const register = useList<Entry>('/gate', { size: 100 });

  const docs = pending.data?.items ?? [];
  const doc = docs.find((d) => d.id === docId) || null;
  React.useEffect(() => { if (docId && docs.length && !doc) setDocId(''); }, [docId, docs, doc]);

  const cur = Math.max(f.receivedQty, 0);
  const total = (doc?.receivedQty ?? 0) + cur;
  const remaining = (doc?.orderedQty ?? 0) - total;
  const over = !!doc && cur > doc.pendingQty;
  const isJw = doc?.kind === 'jw';
  const statusAfter = !doc || over ? '' : isJw ? (remaining <= 0 ? 'IN-HOUSE' : 'PARTIALLY IN-HOUSE') : remaining <= 0 ? 'Fully Received' : 'Partially Received';

  const post = useMutation({
    mutationFn: async () => (await api.post('/gate', { clientUuid: uuid, kind: doc!.kind, refId: doc!.id, ...f, custom: cf.value, photoFileIds: photos.map((p) => p.id), lots: lots.filter((l) => l.lotNo || l.actualLength) })).data,
    onSuccess: (d: { message: string; duplicate: boolean }) => {
      toast.success(d.duplicate ? 'Already posted — no double entry' : d.message);
      ['/gate', '/gate/pending', '/gate/summary', '/po', '/po/summary', '/materials', '/stock', '/orders', '/accessories', '/jobwork', '/production', '/packing', '/tna'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setF({ ...F0, receivedBy: user?.name || '' }); setPhotos([]); setUuid(newUuid()); setDocId(''); setSp({});
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const addPhoto = async (file?: File) => {
    if (!file) return;
    try { const r = await uploadFile(file, 'gate', uuid); setPhotos((p) => [...p, { id: r.id, name: r.name }]); toast.success(`${r.name} attached`); }
    catch (e) { toast.error(apiMessage(e)); } finally { if (fileRef.current) fileRef.current.value = ''; }
  };
  const big = simple ? 'h-12 text-base' : '';
  const godowns = [...new Set([...(company.data?.godowns ?? []), f.godown].filter(Boolean))];

  /* gate man (or anyone who taps "Simple screen") gets the three-step phone screen; the full form stays for the store */
  if (simple) return (
    <div className="animate-rise">
      <div className="mb-3 flex items-center justify-between gap-2"><div><h1 className="font-slab text-xl font-bold">Gate Entry</h1><p className="text-[12.5px] text-muted-foreground">Goods received at the gate — 3 steps.</p></div>
        {user?.role !== 'Gate Man' && <Button variant="secondary" size="sm" onClick={() => setSimple(false)}><Eye size={14} /> Full form</Button>}</div>
      <GateSimple onFull={user?.role === 'Gate Man' ? undefined : () => setSimple(false)} />
    </div>
  );

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Gate Entry / Receiving" sub="Purchase receipts and job-work returns. Until a gate entry is confirmed, material is NOT in stock and goods are still at the vendor. Every installment becomes a GRN.">
        <Button variant="secondary" onClick={() => setSimple(true)}><EyeOff size={16} /> Simple screen</Button>
      </PageHeader>

      {!simple && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile icon={GateIcon} label="Awaiting Verification" value={sum.data?.awaiting ?? '—'} tone="brand" foot="documents with quantity pending" />
          <KpiTile icon={Stock} label="Quantity Pending" value={fmtN(sum.data?.pendingQty)} tone="gold" foot="units still to arrive" />
          <KpiTile icon={Check} label="Verified Today" value={sum.data?.verifiedToday ?? '—'} tone="teal" foot="gate entries posted" />
          <KpiTile icon={Jobwork} label="With Vendors" value={fmtN(sum.data?.withVendors)} tone={sum.data?.withVendors ? 'brand' : 'mute'} foot={`${sum.data?.jwOpen ?? 0} job-work challan${sum.data?.jwOpen === 1 ? '' : 's'} open`} />
        </div>
      )}

      {!simple && <AlertStrip module="gate" />}
      <div className={cn('grid gap-5', !simple && 'xl:grid-cols-5')}>
        {/* ---- awaiting table ---- */}
        {!simple && (
          <Card className="xl:col-span-3">
            <CardHeader><div><CardTitle>Awaiting Gate Verification</CardTitle><p className="text-xs text-muted-foreground">Purchase orders and job-work challan returns in one place</p></div></CardHeader>
            <CardContent className="p-0">
              {pending.isLoading ? <div className="space-y-2 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
              : !docs.length ? <EmptyState title="Nothing waiting at the gate" text="Every open PO has been fully received." />
              : <Table>
                <THead><Tr className="hover:bg-transparent"><Th>Document</Th><Th>Party · Material</Th><Th>Order</Th><Th className="text-right">Ordered / Sent</Th><Th className="text-right">Received</Th><Th className="text-right">Pending</Th><Th>ETA / Due</Th><Th>Status</Th><Th /></Tr></THead>
                <TBody>{docs.map((d) => (
                  <Tr key={d.id} className={cn('cursor-pointer', d.id === docId && 'bg-brand-soft/50 dark:bg-accent')} onClick={() => setDocId(d.id)}>
                    <Td><div className="font-mono text-xs font-bold">{d.no}</div><Badge tone={d.kind === 'po' ? 'plain' : 'brand'} className="mt-1">{d.kind === 'po' ? 'Purchase' : 'Job work return'}</Badge></Td>
                    <Td><div className="text-xs font-semibold">{d.party}</div><div className="text-[11px] text-muted-foreground">{d.materialCode} · {d.material}</div></Td>
                    <Td className="font-mono text-xs">{d.orderNo || '—'}</Td>
                    <Td className="num text-right">{fmtN(d.orderedQty)}</Td><Td className="num text-right">{fmtN(d.receivedQty)}</Td>
                    <Td className="num text-right font-bold text-brand">{fmtN(d.pendingQty)} <span className="text-[10px] font-normal text-muted-foreground">{d.uom}</span></Td>
                    <Td className={cn('text-xs', d.eta && new Date(d.eta).getTime() < Date.now() && 'font-semibold text-bad')}>{fmtDate(d.eta)}</Td>
                    <Td><StatusPill value={d.status} /></Td>
                    <Td><Button size="sm" variant={d.id === docId ? 'default' : 'secondary'}>Receive</Button></Td>
                  </Tr>))}</TBody>
              </Table>}
            </CardContent>
          </Card>
        )}

        {/* ---- gate entry form ---- */}
        <Card className={cn(!simple && 'xl:col-span-2')}>
          <CardHeader><div><CardTitle>Gate Entry</CardTitle><p className="text-xs text-muted-foreground">Gate entry no. and GRN are issued by the server on confirm</p></div></CardHeader>
          <CardContent className="space-y-4"><FormMetaProvider meta={cf.meta}>
            <Field label="Document (PO / challan)">
              <Select value={docId} onValueChange={setDocId}><SelectTrigger className={big}><SelectValue placeholder="Select what arrived…" /></SelectTrigger>
                <SelectContent>{docs.map((d) => <SelectItem key={d.id} value={d.id}>{d.no} · {d.material} · {fmtN(d.pendingQty)} {d.uom} pending</SelectItem>)}</SelectContent></Select>
            </Field>
            {doc && (
              <div className="grid grid-cols-2 gap-2 rounded-xl border bg-secondary p-3 text-[12.5px]">
                <div><div className="text-[10px] font-bold uppercase text-muted-foreground">{isJw ? 'Vendor (job work return)' : 'Supplier'}</div><div className="font-semibold">{doc.party}</div></div>
                <div><div className="text-[10px] font-bold uppercase text-muted-foreground">{isJw ? 'Item · process' : 'Material'}</div><div className="font-semibold">{doc.material}</div></div>
                <div><div className="text-[10px] font-bold uppercase text-muted-foreground">For Order</div><div className="font-semibold">{doc.orderNo || 'Stock'}</div></div>
                <div><div className="text-[10px] font-bold uppercase text-muted-foreground">Priority</div><StatusPill value={doc.priority} /></div>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`${isJw ? 'Current Return Qty' : 'Current Received Qty'}${doc ? ` (${doc.uom})` : ''}`}><Input type="number" min={0} className={cn(big, 'font-bold', over && 'border-bad focus-visible:border-bad')} value={f.receivedQty || ''} onChange={(e) => setF({ ...f, receivedQty: +e.target.value })} placeholder="0" /></Field>
              <Field label="Rejected / Short"><Input type="number" min={0} className={big} value={f.rejectedQty || ''} onChange={(e) => setF({ ...f, rejectedQty: +e.target.value })} placeholder="0" /></Field>
              <Field label="Vehicle Number"><Input className={cn(big, 'uppercase')} value={f.vehicleNo} onChange={(e) => setF({ ...f, vehicleNo: e.target.value.toUpperCase() })} placeholder="HR 55 AB 4412" /></Field>
              <Field label="Driver Name"><Input className={big} value={f.driverName} onChange={(e) => setF({ ...f, driverName: e.target.value })} /></Field>
              <Field label={isJw ? 'Vendor Challan No' : 'Delivery Challan No'}><Input className={big} value={f.challanNo} onChange={(e) => setF({ ...f, challanNo: e.target.value })} /></Field>
              <Field label={isJw ? 'Vendor Invoice / Job Bill No' : 'Supplier Invoice No'}><Input className={big} value={f.invoiceNo} onChange={(e) => setF({ ...f, invoiceNo: e.target.value })} /></Field>
              <Field label="Date"><Input type="date" className={big} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
              <Field label="Received By"><Input className={big} value={f.receivedBy} onChange={(e) => setF({ ...f, receivedBy: e.target.value })} /></Field>
              <Field label="Inspection Result"><Select value={f.inspection} onValueChange={(v) => setF({ ...f, inspection: v })}><SelectTrigger className={big}><SelectValue /></SelectTrigger>
                <SelectContent>{(meta.data?.inspection ?? [f.inspection]).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Store Location"><Select value={f.godown || 'auto'} onValueChange={(v) => setF({ ...f, godown: v === 'auto' ? '' : v })}><SelectTrigger className={big}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="auto">Material's usual godown</SelectItem>{godowns.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Remarks" className="sm:col-span-2"><Input className={big} value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} placeholder="Lot no, shade batch, damage…" /></Field>
            </div>
            {cf.node}
            {doc && !isJw && /mtr|m$|meter|metre|yd/i.test(doc.uom) && (
              <div className="overflow-hidden rounded-xl border">
                <div className="flex items-center justify-between border-b bg-secondary px-3 py-1.5"><span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Fabric lots on this receipt (dyeing lot · thans · on-tag vs actual)</span>
                  <Button size="sm" variant="secondary" type="button" onClick={() => setLots([...lots, { ...L0 }])}><Plus size={13} /> Add lot</Button></div>
                {lots.length > 0 && <table className="w-full text-[12px]"><thead><tr className="text-[10px] font-bold uppercase text-muted-foreground"><th className="px-1 py-1 text-left">Lot no</th><th className="px-1 text-left">Colour</th><th className="px-1">Thans</th><th className="px-1">Tag length</th><th className="px-1">Actual length</th><th className="px-1">Tag width</th><th className="px-1">Actual width</th><th className="px-1">GSM</th><th className="w-7" /></tr></thead>
                  <tbody>{lots.map((l, i) => <tr key={i} className="border-t">{(['lotNo', 'colour', 'thans', 'tagLength', 'actualLength', 'tagWidth', 'actualWidth', 'gsm'] as (keyof Lot)[]).map((k) => <td key={k} className="p-1"><input type={['lotNo', 'colour'].includes(k) ? 'text' : 'number'} className={cn('h-8 w-full rounded-md border bg-card px-1.5 text-xs outline-none focus:border-brand', !['lotNo', 'colour'].includes(k) && 'num')} value={l[k]} onChange={(e) => { const next = lots.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)); setLots(next); if (k === 'actualLength') setF({ ...f, receivedQty: next.reduce((a, x) => a + (+x.actualLength || 0), 0) }); }} /></td>)}
                    <td className="p-1"><button type="button" className="text-muted-foreground hover:text-bad" onClick={() => { const next = lots.filter((_, j) => j !== i); setLots(next); setF({ ...f, receivedQty: next.reduce((a, x) => a + (+x.actualLength || 0), 0) }); }}><Trash size={13} /></button></td></tr>)}</tbody></table>}
                {lots.length > 0 && <div className="border-t bg-secondary/40 px-3 py-1 text-[11px] text-muted-foreground">Received qty = Σ actual length = <b>{fmtN(lots.reduce((a, x) => a + (+x.actualLength || 0), 0))}</b> {doc.uom} · short on tag: {fmtN(lots.reduce((a, x) => a + Math.max((+x.tagLength || 0) - (+x.actualLength || 0), 0), 0))} {doc.uom}</div>}
              </div>)}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size={simple ? 'default' : 'sm'} onClick={() => fileRef.current?.click()}><Upload size={15} /> Photo of challan / vehicle</Button>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => addPhoto(e.target.files?.[0])} />
              {photos.map((p) => <Badge key={p.id} tone="ok">{p.name}</Badge>)}
            </div>

            {/* ---- live quantity verification ---- */}
            <div className={cn('rounded-xl border p-4', over ? 'border-bad/50 bg-bad-soft dark:bg-bad/10' : 'bg-secondary')}>
              <div className="mb-2 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Quantity verification — live</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[[isJw ? 'Sent to Vendor' : 'Ordered', doc?.orderedQty], [isJw ? 'Previously Returned' : 'Previously Received', doc?.receivedQty], [isJw ? 'Current Return' : 'Current Receipt', cur], [isJw ? 'Total Returned' : 'Total Received', doc ? total : undefined], [isJw ? 'With Vendor' : 'Remaining', doc ? remaining : undefined]].map(([k, v]) => (
                  <div key={k as string}><div className="text-[10px] uppercase text-muted-foreground">{k as string}</div><div className={cn('num font-slab text-lg font-bold', k === 'Remaining' && doc && (remaining < 0 ? 'text-bad' : remaining === 0 && 'text-teal'))}>{v == null ? '—' : fmtN(v as number)}</div></div>))}
                <div><div className="text-[10px] uppercase text-muted-foreground">{isJw ? 'Location after' : 'Status'}</div><div className="mt-1">{statusAfter ? <Badge tone={statusAfter === 'IN-HOUSE' || statusAfter === 'Fully Received' ? 'ok' : 'warn'}>{statusAfter}</Badge> : '—'}</div></div>
              </div>
              {over && <div className="mt-3 flex items-start gap-2 text-[12.5px] font-semibold text-bad"><Alert size={16} className="mt-0.5 shrink-0" />
                {isJw ? `Cannot return ${fmtN(cur)} ${doc!.uom}. Only ${fmtN(doc!.pendingQty)} ${doc!.uom} are pending with this vendor against ${doc!.no}.` : `Cannot receive ${fmtN(cur)} ${doc!.uom}. Only ${fmtN(doc!.pendingQty)} ${doc!.uom} are pending against this purchase order.`}</div>}
            </div>
            <Button className={cn('w-full', simple && 'h-14 text-lg')} disabled={!doc || cur <= 0 || over || post.isPending || !cf.ok} onClick={() => post.mutate()}>
              <Check size={simple ? 22 : 17} /> {post.isPending ? 'Posting…' : 'Confirm Gate Entry'}</Button>
          </FormMetaProvider></CardContent>
        </Card>
      </div>

      {/* ---- register ---- */}
      <Card>
        <CardHeader><div><CardTitle>Gate Register</CardTitle><p className="text-xs text-muted-foreground">Every entry posted — newest first</p></div></CardHeader>
        <CardContent className="p-0">
          {register.isLoading ? <div className="space-y-2 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
          : !register.data?.items.length ? <EmptyState title="No gate entries yet" />
          : <Table>
            <THead><Tr className="hover:bg-transparent"><Th>Gate No</Th><Th>GRN</Th><Th>Date · Time</Th><Th>Document</Th><Th>Party · Material</Th>{!simple && <Th>Order</Th>}<Th className="text-right">Received</Th>{!simple && <><Th className="text-right">Total / Remaining</Th><Th>Vehicle</Th><Th>Challan</Th><Th>Inspection</Th><Th>By</Th></>}<Th>Status</Th></Tr></THead>
            <TBody>{register.data.items.map((g) => (
              <Tr key={g.id}>
                <Td className="font-mono text-xs font-semibold">{g.gateNo}</Td><Td className="font-mono text-xs font-semibold text-brand">{g.grnNo}</Td>
                <Td className="text-xs">{fmtDate(g.date)} · {g.time}</Td>
                <Td className="font-mono text-xs">{g.refNo}</Td>
                <Td><div className="text-xs font-semibold">{g.partyName}</div><div className="text-[11px] text-muted-foreground">{g.materialCode} · {g.materialName}</div></Td>
                {!simple && <Td className="font-mono text-xs">{g.orderNo || '—'}</Td>}
                <Td className="num text-right font-semibold">+{fmtN(g.receivedQty)} {g.uom}{g.rejectedQty ? <div className="text-[10px] font-normal text-bad">rej {fmtN(g.rejectedQty)}</div> : null}</Td>
                {!simple && <><Td className="num text-right text-xs">{fmtN(g.totalAfter)} / {fmtN(g.remainingAfter)}{g.kind === 'jw' && <div className="text-[9.5px] text-brand">job work</div>}</Td><Td className="text-xs">{g.vehicleNo || '—'}</Td><Td className="text-xs">{g.challanNo || '—'}</Td>
                  <Td><Badge tone={g.inspection === 'Rejected' ? 'bad' : g.inspection.includes('deviation') ? 'warn' : 'ok'}>{g.inspection}</Badge></Td><Td className="text-xs">{g.by}</Td></>}
                <Td><StatusPill value={g.statusAfter} /></Td>
              </Tr>))}</TBody>
          </Table>}
        </CardContent>
      </Card>
    </div>
  );
}
