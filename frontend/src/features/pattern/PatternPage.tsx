import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useList, useSave, useAction, uploadFile, openFile, fmtDate, toInputDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { useCustomFields } from '@/components/CustomFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton, Table, THead, TBody, Tr, Th, Td, Badge } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader, KpiTile, Toolbar, Field, StatusPill, EmptyState, OrderLink } from '@/components/shared';
import { Pattern as PatIcon, Plus, Edit, Eye, Download, Upload, Check, Alert, Shield, FileIcon, Login } from '@/icons/icons';

type Pattern = { custom?: Record<string, unknown>; id: string; patternNo: string; styleId: string; styleNo: string; buyerName: string; makerUid: string; makerName: string; date: string; baseSize: string; sizeRange: string;
  gradingStatus: string; markerEff: number; remarks: string; status: string; priority: string; dueDate?: string; overdue: boolean; sampleNo: string; sampleRound: number; reviewNote: string; approvedBy: string; approvedAt?: string;
  versions: { version: number; fileId?: string; fileName: string; kind: string; note: string; by: string; at: string }[]; currentVersion: { version: number; fileName: string } | null;
  issues: { version: number; orderId?: string; orderNo: string; issuedTo: string; by: string; at: string }[] };
type Style = { id: string; styleNo: string; description: string; buyerName: string };
type Sample = { id: string; sampleNo: string; styleId: string; styleNo: string; round: number; status: string };
type OrderLite = { id: string; orderNo: string; styleId: string; styleNo: string };
type UserLite = { uid: string; name: string; role: string; status: string };
type Summary = { total: number; inReview: number; approved: number; draft: number; overdue: string[] };

const P0 = { styleId: '', sampleId: '', makerUid: '', baseSize: 'M', sizeRange: 'S – 3XL', gradingStatus: 'Not started', markerEff: 0, priority: 'Normal', dueDate: '', remarks: '' };

export default function PatternPage() {
  const { hasFlag } = useAuth();
  const [q, setQ] = React.useState('');
  const [chip, setChip] = React.useState('All');
  const [editing, setEditing] = React.useState<Pattern | null | 'new'>(null);
  const [view, setView] = React.useState<Pattern | null>(null);
  const [f, setF] = React.useState(P0);
  const cf = useCustomFields('patterns', editing && editing !== 'new' ? editing.custom : null, editing);
  const list = useList<Pattern>('/patterns', { size: 500 });
  const sum = useQuery<Summary>({ queryKey: ['/patterns', 'summary'], queryFn: async () => (await api.get('/patterns/summary')).data });
  const styles = useList<Style>('/styles', { size: 500 }, editing !== null);
  const samples = useList<Sample>('/samples', { size: 500 }, editing !== null);
  const users = useList<UserLite>('/users', { size: 100 }, editing !== null);
  const save = useSave<Pattern>('/patterns', ['/patterns'], (p) => { toast.success(`${p.patternNo} saved`); setEditing(null); });
  React.useEffect(() => {
    if (editing && editing !== 'new') setF({ styleId: editing.styleId, sampleId: '', makerUid: editing.makerUid, baseSize: editing.baseSize, sizeRange: editing.sizeRange, gradingStatus: editing.gradingStatus, markerEff: editing.markerEff, priority: editing.priority, dueDate: toInputDate(editing.dueDate), remarks: editing.remarks });
    else setF(P0);
  }, [editing]);
  const all = list.data?.items ?? [];
  const rows = all.filter((p) => (!q || `${p.patternNo} ${p.styleNo} ${p.buyerName} ${p.makerName}`.toLowerCase().includes(q.toLowerCase())) && (chip === 'All' || (chip === 'Overdue' ? p.overdue : p.status === chip)));
  const s = sum.data;
  const canApprove = hasFlag('pattern.approve');

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Pattern Management" sub="Cutting patterns per style — versioned CAD/PDF files, review and approval, and an issue log of who took which version to cutting.">
        <Button onClick={() => setEditing('new')}><Plus size={17} /> New Pattern</Button>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={PatIcon} label="Patterns" value={s?.total ?? '—'} tone="brand" foot={`${s?.draft ?? 0} draft`} />
        <KpiTile icon={Shield} label="Pending Approval" value={s?.inReview ?? '—'} tone={s?.inReview ? 'gold' : 'teal'} foot={canApprove ? 'you can approve' : 'needs the pattern approver'} />
        <KpiTile icon={Check} label="Approved" value={s?.approved ?? '—'} tone="teal" foot="can be issued to cutting" />
        <KpiTile icon={Alert} label="Past TNA Date" value={s?.overdue.length ?? '—'} tone={s?.overdue.length ? 'bad' : 'teal'} foot={s?.overdue.join(' · ') || 'none overdue'} />
      </div>
      <Card>
        <Toolbar q={q} setQ={setQ} placeholder="Search pattern, style, buyer, maker…" chips={['All', 'Draft', 'In Review', 'Approved', 'Superseded', 'Overdue']} chip={chip} setChip={setChip} />
        {list.isLoading ? <div className="space-y-3 p-5">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
        : !rows.length ? <EmptyState title="No patterns" text="Create a pattern for a style, attach the DXF / PDF, then submit it for approval." />
        : <Table>
          <THead><Tr className="hover:bg-transparent"><Th>Pattern</Th><Th>Style · Buyer</Th><Th>Maker</Th><Th>Base · Range</Th><Th>Grading</Th><Th className="text-right">Marker eff.</Th><Th>Version</Th><Th>Due</Th><Th>Priority</Th><Th>Status</Th><Th className="text-right">Actions</Th></Tr></THead>
          <TBody>{rows.map((p) => (
            <Tr key={p.id} className={cn(p.status === 'Superseded' && 'opacity-50', p.overdue && 'bg-bad-soft/40 dark:bg-bad/5')}>
              <Td><div className="font-mono text-xs font-bold">{p.patternNo}</div><div className="text-[10.5px] text-muted-foreground">{fmtDate(p.date)}{p.sampleNo ? ` · from ${p.sampleNo} r${p.sampleRound}` : ''}</div></Td>
              <Td><div className="font-semibold">{p.styleNo}</div><div className="text-[11px] text-muted-foreground">{p.buyerName}</div></Td>
              <Td className="text-xs">{p.makerName}</Td><Td className="text-xs">{p.baseSize} · {p.sizeRange}</Td>
              <Td><Badge tone={p.gradingStatus === 'Graded' ? 'ok' : p.gradingStatus === 'In progress' ? 'info' : 'mute'}>{p.gradingStatus}</Badge></Td>
              <Td className="num text-right">{p.markerEff ? `${p.markerEff}%` : '—'}</Td>
              <Td className="text-xs">{p.currentVersion ? <><b>v{p.currentVersion.version}</b> · {p.currentVersion.fileName}</> : <span className="text-muted-foreground">no file</span>}</Td>
              <Td className={cn('text-xs', p.overdue && 'font-semibold text-bad')}>{fmtDate(p.dueDate)}</Td>
              <Td><StatusPill value={p.priority} /></Td><Td><StatusPill value={p.status} /></Td>
              <Td><div className="flex justify-end gap-1.5"><Button size="sm" variant="secondary" onClick={() => setView(p)}><Eye size={13} /></Button>{p.status !== 'Superseded' && <Button size="sm" variant="secondary" onClick={() => setEditing(p)}><Edit size={13} /></Button>}</div></Td>
            </Tr>))}</TBody>
        </Table>}
      </Card>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent wide meta={cf.meta}>
          <DialogHeader><DialogTitle>{editing === 'new' ? 'New Pattern' : `Edit ${editing?.patternNo}`}</DialogTitle><DialogDescription>The technical asset between sampling and cutting. Attach files from the pattern's detail view.</DialogDescription></DialogHeader>
          <DialogBody><div className="grid gap-4 sm:grid-cols-3">
            <Field label="Style" className="sm:col-span-2"><Select value={f.styleId} onValueChange={(v) => setF({ ...f, styleId: v })} disabled={editing !== 'new'}><SelectTrigger><SelectValue placeholder="Select style…" /></SelectTrigger><SelectContent>{(styles.data?.items ?? []).map((x) => <SelectItem key={x.id} value={x.id}>{x.styleNo} · {x.description} · {x.buyerName}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Linked sample round"><Select value={f.sampleId || 'none'} onValueChange={(v) => setF({ ...f, sampleId: v === 'none' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">— none —</SelectItem>{(samples.data?.items ?? []).filter((x) => !f.styleId || x.styleId === f.styleId).map((x) => <SelectItem key={x.id} value={x.id}>{x.sampleNo} · round {x.round} · {x.status}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Pattern maker"><Select value={f.makerUid || 'me'} onValueChange={(v) => setF({ ...f, makerUid: v === 'me' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="me">Me</SelectItem>{(users.data?.items ?? []).filter((u) => u.status === 'Active').map((u) => <SelectItem key={u.uid} value={u.uid}>{u.name} · {u.role}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Base size"><Select value={f.baseSize} onValueChange={(v) => setF({ ...f, baseSize: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['XS', 'S', 'M', 'L', 'XL'].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Size range"><Input value={f.sizeRange} onChange={(e) => setF({ ...f, sizeRange: e.target.value })} /></Field>
            <Field label="Grading"><Select value={f.gradingStatus} onValueChange={(v) => setF({ ...f, gradingStatus: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['Not started', 'In progress', 'Graded'].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Marker efficiency %"><Input type="number" step="0.1" value={f.markerEff} onChange={(e) => setF({ ...f, markerEff: +e.target.value })} /></Field>
            <Field label="Priority"><Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['Urgent', 'High', 'Normal', 'Low'].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Approval due (TNA)"><Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
            <Field label="Remarks" className="sm:col-span-2"><Input value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} placeholder="Fit comments applied, seam allowances, notches…" /></Field>
          </div>{cf.node}</DialogBody>
          <DialogFooter><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button disabled={save.isPending || !f.styleId || !cf.ok} onClick={() => save.mutate({ id: editing && editing !== 'new' ? editing.id : undefined, body: { ...f, custom: cf.value, sampleId: f.sampleId || undefined, makerUid: f.makerUid || undefined, dueDate: f.dueDate || undefined } })}><Check size={15} /> Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <PatternDetail p={view ? all.find((x) => x.id === view.id) ?? view : null} onClose={() => setView(null)} />
    </div>
  );
}

function PatternDetail({ p, onClose }: { p: Pattern | null; onClose: () => void }) {
  const { hasFlag, hasModule } = useAuth();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [note, setNote] = React.useState('');
  const [issueOrder, setIssueOrder] = React.useState('');
  const [issuedTo, setIssuedTo] = React.useState('Cutting');
  const orders = useList<OrderLite>('/orders', { size: 200, status: 'Open' }, !!p && hasModule('orders'));
  const act = useAction<Pattern>(['/patterns', '/tna', '/orders', '/alerts', '/mywork'], (r) => toast.success(`${r.patternNo} · ${r.status}`));
  const upload = async (file?: File) => {
    if (!file || !p) return;
    try { const r = await uploadFile(file, 'pattern', p.id); act.mutate({ url: `/patterns/${p.id}/version`, body: { fileId: r.id, note } }); setNote(''); }
    catch (e) { toast.error(apiMessage(e)); } finally { if (fileRef.current) fileRef.current.value = ''; }
  };
  if (!p) return null;
  const canApprove = hasFlag('pattern.approve');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide>
        <DialogHeader><DialogTitle className="flex items-center gap-2">{p.patternNo} · {p.styleNo} <StatusPill value={p.status} />{p.overdue && <Badge tone="bad">past TNA date</Badge>}</DialogTitle>
          <DialogDescription>{p.buyerName} · maker {p.makerName} · base {p.baseSize} · {p.sizeRange} · grading {p.gradingStatus}{p.markerEff ? ` · marker ${p.markerEff}%` : ''}{p.approvedBy ? ` · approved by ${p.approvedBy} ${fmtDate(p.approvedAt)}` : ''}</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          {p.reviewNote && <div className={cn('rounded-xl border px-4 py-3 text-[12.5px]', p.status === 'Draft' ? 'border-bad/40 bg-bad-soft text-bad dark:bg-bad/10' : 'bg-secondary')}><b>{p.status === 'Draft' ? 'Returned: ' : 'Note: '}</b>{p.reviewNote}</div>}
          <div className="overflow-hidden rounded-xl border">
            <div className="flex items-center justify-between border-b bg-secondary px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Files — versions{p.status !== 'Superseded' && <span className="flex items-center gap-2 normal-case tracking-normal"><Input className="h-7 w-56 text-xs" placeholder="change note for the next version" value={note} onChange={(e) => setNote(e.target.value)} /><Button size="sm" className="h-7" onClick={() => fileRef.current?.click()}><Upload size={13} /> Add version</Button><input ref={fileRef} type="file" accept=".dxf,.plt,.pdf,.png,.jpg,.jpeg,.webp" hidden onChange={(e) => upload(e.target.files?.[0])} /></span>}</div>
            {!p.versions.length ? <div className="px-4 py-5 text-center text-sm text-muted-foreground">No file yet — attach the DXF / PLT / PDF.</div>
            : [...p.versions].reverse().map((v) => (
              <div key={v.version} className="flex items-center gap-3 border-b px-4 py-2 text-[13px] last:border-0"><FileIcon size={16} className="text-muted-foreground" />
                <div className="min-w-0 flex-1"><div className="truncate font-semibold">v{v.version} · {v.fileName} <Badge tone="plain">{v.kind}</Badge></div><div className="text-[11px] text-muted-foreground">{v.note || 'no note'} · {v.by} · {fmtDate(v.at)}</div></div>
                {v.version === p.versions.length && <Badge tone="ok">current</Badge>}
                {v.fileId && <><Button size="sm" variant="secondary" onClick={() => openFile(v.fileId!, v.fileName)}><Eye size={13} /></Button><Button size="sm" variant="secondary" onClick={() => openFile(v.fileId!, v.fileName, true)}><Download size={13} /></Button></>}
              </div>))}
          </div>
          <div className="overflow-hidden rounded-xl border">
            <div className="border-b bg-secondary px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Issue log — who took which version to cutting</div>
            {!p.issues.length ? <div className="px-4 py-4 text-center text-xs text-muted-foreground">Not issued yet.</div>
            : p.issues.map((i, k) => <div key={k} className="border-b px-4 py-2 text-[12.5px] last:border-0"><b>v{i.version}</b> → {i.issuedTo}{i.orderId ? <> for <OrderLink id={i.orderId} className="font-mono text-brand">{i.orderNo}</OrderLink></> : ''} · {i.by} · {fmtDate(i.at)}</div>)}
            {p.status === 'Approved' && <div className="flex flex-wrap items-center gap-2 border-t bg-secondary/60 px-4 py-2">
              <Select value={issueOrder || 'none'} onValueChange={(v) => setIssueOrder(v === 'none' ? '' : v)}><SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">— no order —</SelectItem>{(orders.data?.items ?? []).filter((o) => o.styleId === p.styleId || true).map((o) => <SelectItem key={o.id} value={o.id}>{o.orderNo} · {o.styleNo}</SelectItem>)}</SelectContent></Select>
              <Input className="h-8 w-48" value={issuedTo} onChange={(e) => setIssuedTo(e.target.value)} placeholder="issued to" />
              <Button size="sm" onClick={() => act.mutate({ url: `/patterns/${p.id}/issue`, body: { orderId: issueOrder || undefined, issuedTo } })}><Login size={13} /> Issue v{p.versions.length}</Button></div>}
          </div>
        </DialogBody>
        <DialogFooter className="flex-wrap">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {p.status === 'Draft' && <Button disabled={!p.versions.length || act.isPending} onClick={() => act.mutate({ url: `/patterns/${p.id}/submit` })}><Shield size={15} /> Submit for Review</Button>}
          {p.status === 'In Review' && canApprove && <><Button variant="destructive" disabled={act.isPending} onClick={() => { const n = window.prompt('Reason for returning to draft:'); if (n) act.mutate({ url: `/patterns/${p.id}/reject`, body: { note: n } }); }}>Return to Draft</Button>
            <Button disabled={act.isPending} onClick={() => act.mutate({ url: `/patterns/${p.id}/approve`, body: {} })}><Check size={15} /> Approve</Button></>}
          {p.status === 'In Review' && !canApprove && <Badge tone="warn">Awaiting the pattern approver</Badge>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
