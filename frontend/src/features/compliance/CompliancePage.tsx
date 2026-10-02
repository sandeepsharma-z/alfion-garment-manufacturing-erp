import * as React from 'react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useList, uploadFile, openFile, fmtDate, toInputDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { useCustomFields } from '@/components/CustomFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton, Table, THead, TBody, Tr, Th, Td, Badge } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader, KpiTile, Toolbar, Field, StatusPill, EmptyState } from '@/components/shared';
import { AlertStrip } from '@/components/AlertStrip';
import { Compliance as CompIcon, Alert, Clock, FileIcon, Plus, Edit, Eye, Download, Upload, Check, Print, Shield } from '@/icons/icons';

type Doc = { custom?: Record<string, unknown>; id: string; docNo: string; title: string; category: string; authority: string; number: string; issueDate?: string; expiryDate?: string; ownerUid: string; ownerName: string; confidential: boolean; renewalInProgress: boolean;
  versions: { version: number; fileId?: string; fileName: string; note: string; expiryDate?: string; by: string; at: string }[];
  attachments?: { fileId: string; fileName: string; size?: number; by: string; at: string }[]; currentVersion: { version: number; fileName: string; fileId?: string } | null;
  reminders: { offsetDays: number; sentAt: string }[]; dismissed?: { until?: string; reason?: string; by?: string }; dismissedActive: boolean; notes: string; status: string; state: string; daysLeft: number | null; canManage: boolean };
type Summary = { total: number; expiringSoon: number; expired: number; renewalInProgress: number; formats: number; next: { title: string; daysLeft: number; expiryDate: string }[]; reminderDays: number[] };
type UserLite = { uid: string; name: string; role: string; status: string };
const STATE_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'info' | 'mute'> = { Valid: 'ok', Expiring: 'warn', Expired: 'bad', 'Renewal in progress': 'info', 'No expiry': 'mute' };
const D0 = { title: '', category: 'Company licence', authority: '', number: '', issueDate: '', expiryDate: '', ownerUid: '', confidential: false, notes: '' };

export default function CompliancePage() {
  const { hasFlag } = useAuth();
  const canManage = hasFlag('compliance.manage');
  const [q, setQ] = React.useState('');
  const [chip, setChip] = React.useState('All');
  const [editing, setEditing] = React.useState<Doc | null | 'new'>(null);
  const [view, setView] = React.useState<Doc | null>(null);
  const [f, setF] = React.useState(D0);
  const cf = useCustomFields('compliance', editing && editing !== 'new' ? editing.custom : null, editing);
  const [files, setFiles] = React.useState<File[]>([]);   // chosen in the form: first = the document itself (v1), the rest = attachments; on an existing doc all go as attachments unless it has no file yet
  const fileRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { if (editing !== null) setFiles([]); }, [editing]);
  const list = useList<Doc>('/compliance', {});
  const sum = useQuery<Summary>({ queryKey: ['/compliance', 'summary'], queryFn: async () => (await api.get('/compliance/summary')).data });
  const meta = useQuery<{ categories: string[] }>({ queryKey: ['/compliance/meta'], queryFn: async () => (await api.get('/compliance/meta')).data });
  const users = useList<UserLite>('/users', { size: 100 }, editing !== null);
  const qc = useQueryClient();
  const save = useMutation({ mutationFn: async () => {
      let d: Doc = (editing === 'new' ? await api.post('/compliance', { ...f, custom: cf.value, ownerUid: f.ownerUid || undefined }) : await api.patch(`/compliance/${(editing as Doc).id}`, { ...f, custom: cf.value, ownerUid: f.ownerUid || undefined })).data;
      if (files.length) {
        const uploaded = [];
        for (const file of files) uploaded.push(await uploadFile(file, 'compliance', d.id));
        const hasVersion = d.versions?.length > 0;
        const [first, ...rest] = uploaded;
        if (!hasVersion) d = (await api.post(`/compliance/${d.id}/version`, { fileId: first.id, note: 'uploaded with the form', expiryDate: f.expiryDate || undefined })).data;
        const extra = hasVersion ? uploaded : rest;
        if (extra.length) d = (await api.post(`/compliance/${d.id}/attachments`, { fileIds: extra.map((u) => u.id) })).data;
      }
      return d;
    },
    onSuccess: (d: Doc) => { toast.success(`${d.docNo} · ${d.title} saved${files.length ? ` · ${files.length} file${files.length > 1 ? 's' : ''} attached` : ''}`); qc.invalidateQueries({ queryKey: ['/compliance'] }); qc.invalidateQueries({ queryKey: ['/alerts'] }); setEditing(null); setFiles([]); }, onError: (e) => toast.error(apiMessage(e)) });
  React.useEffect(() => { if (editing && editing !== 'new') setF({ title: editing.title, category: editing.category, authority: editing.authority, number: editing.number, issueDate: toInputDate(editing.issueDate), expiryDate: toInputDate(editing.expiryDate), ownerUid: editing.ownerUid, confidential: editing.confidential, notes: editing.notes }); else setF(D0); }, [editing]);
  const all = list.data?.items ?? [];
  const rows = all.filter((d) => (!q || `${d.docNo} ${d.title} ${d.category} ${d.authority} ${d.number} ${d.ownerName}`.toLowerCase().includes(q.toLowerCase())) && (chip === 'All' || d.state === chip || d.category === chip || (chip === 'Formats' && d.category === 'Format / Template') || (chip === 'Confidential' && d.confidential)));
  const s = sum.data;
  const printRegister = async () => {
    try {
      const { data } = await api.get('/compliance/register');
      const w = window.open('', '_blank'); if (!w) throw new Error('Pop-up blocked');
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Compliance expiry register</title><style>body{font:12px Arial;margin:28px}h1{font-size:18px;margin:0 0 4px}table{border-collapse:collapse;width:100%;margin-top:10px}th,td{border:1px solid #ccc;padding:5px 7px;text-align:left}th{background:#f5f6f8}.bad{color:#c02b3f;font-weight:700}.warn{color:#a8850a;font-weight:700}</style></head><body><h1>${data.company} — Compliance expiry register</h1><small>${new Date().toLocaleString('en-IN')} · ${data.total} documents with an expiry date</small>
        <table><tr><th>Doc</th><th>Title</th><th>Category</th><th>Authority</th><th>Number</th><th>Issued</th><th>Expiry</th><th>Days left</th><th>State</th><th>Owner</th><th>Reminders</th></tr>${data.items.map((d: { docNo: string; title: string; category: string; authority: string; number: string; issueDate?: string; expiryDate?: string; daysLeft: number; state: string; ownerName: string; reminders: number }) => `<tr><td>${d.docNo}</td><td>${d.title}</td><td>${d.category}</td><td>${d.authority}</td><td>${d.number}</td><td>${fmtDate(d.issueDate)}</td><td>${fmtDate(d.expiryDate)}</td><td class="${d.daysLeft < 0 ? 'bad' : d.daysLeft <= 30 ? 'warn' : ''}">${d.daysLeft}</td><td>${d.state}</td><td>${d.ownerName}</td><td>${d.reminders}</td></tr>`).join('')}</table><script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`); w.document.close();
    } catch (e) { toast.error(apiMessage(e)); }
  };
  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Compliance" sub={`Licences, insurance, certifications, buyer audits, bank / IEC / GST documents and reusable formats — with automatic renewal reminders at ${(s?.reminderDays ?? [60, 30, 15, 7, 1]).join(' / ')} days before expiry.`}>
        <Button variant="secondary" onClick={printRegister}><Print size={16} /> Expiry Register</Button>
        {canManage && <Button onClick={() => setEditing('new')}><Plus size={17} /> Add Document</Button>}
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={Alert} label="Expired" value={s?.expired ?? '—'} tone={s?.expired ? 'bad' : 'teal'} foot="renew now" />
        <KpiTile icon={Clock} label="Expiring Soon" value={s?.expiringSoon ?? '—'} tone={s?.expiringSoon ? 'gold' : 'teal'} foot={s?.next[0] ? `${s.next[0].title} · ${s.next[0].daysLeft} d` : 'nothing within the reminder window'} />
        <KpiTile icon={Shield} label="Renewal In Progress" value={s?.renewalInProgress ?? '—'} tone="info" foot="application filed" />
        <KpiTile icon={FileIcon} label="Formats & Templates" value={s?.formats ?? '—'} tone="brand" foot={`${s?.total ?? 0} documents in the repository`} />
      </div>
      <AlertStrip module="compliance" />
      <Card>
        <Toolbar q={q} setQ={setQ} placeholder="Search title, number, authority, owner…" chips={['All', 'Expired', 'Expiring', 'Renewal in progress', 'Valid', 'Formats', 'Confidential']} chip={chip} setChip={setChip} />
        {list.isLoading ? <div className="space-y-3 p-5">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
        : !rows.length ? <EmptyState title="No documents" text="Add licences, policies and certificates with their expiry dates — reminders start automatically." />
        : <Table>
          <THead><Tr className="hover:bg-transparent"><Th>Document</Th><Th>Category</Th><Th>Authority · Number</Th><Th>Owner</Th><Th>Issued</Th><Th>Expiry</Th><Th className="text-right">Days left</Th><Th>State</Th><Th>File</Th><Th /></Tr></THead>
          <TBody>{rows.map((d) => (
            <Tr key={d.id} className={cn(d.state === 'Expired' && 'bg-bad-soft/40 dark:bg-bad/5')}>
              <Td><div className="font-semibold">{d.title}{d.confidential && <Shield size={12} className="ml-1 inline text-muted-foreground" />}</div><div className="font-mono text-[10.5px] text-muted-foreground">{d.docNo}</div></Td>
              <Td><Badge tone={d.category === 'Format / Template' ? 'info' : 'plain'}>{d.category}</Badge></Td>
              <Td className="text-xs">{d.authority || '—'}<div className="font-mono text-[10.5px] text-muted-foreground">{d.number}</div></Td><Td className="text-xs">{d.ownerName}</Td>
              <Td className="text-xs">{fmtDate(d.issueDate)}</Td><Td className={cn('text-xs', d.state === 'Expired' && 'font-semibold text-bad')}>{fmtDate(d.expiryDate)}</Td>
              <Td className={cn('num text-right', d.daysLeft !== null && d.daysLeft < 0 && 'font-bold text-bad', d.daysLeft !== null && d.daysLeft >= 0 && d.daysLeft <= 30 && 'font-semibold text-gold')}>{d.daysLeft === null ? '—' : d.daysLeft}</Td>
              <Td><Badge tone={STATE_TONE[d.state] || 'mute'}>{d.state}</Badge>{d.dismissedActive && <div className="text-[10px] text-muted-foreground">reminders paused</div>}</Td>
              <Td>{d.currentVersion ? <div className="flex items-center gap-1 text-xs">v{d.currentVersion.version}{d.currentVersion.fileId && <><Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => openFile(d.currentVersion!.fileId!, d.currentVersion!.fileName)}><Eye size={12} /></Button><Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => openFile(d.currentVersion!.fileId!, d.currentVersion!.fileName, true)}><Download size={12} /></Button></>}</div> : <span className="text-[11px] text-muted-foreground">no file</span>}</Td>
              <Td><div className="flex justify-end gap-1"><Button size="sm" variant="secondary" onClick={() => setView(d)}><Eye size={13} /></Button>{canManage && <Button size="sm" variant="secondary" onClick={() => setEditing(d)}><Edit size={13} /></Button>}</div></Td>
            </Tr>))}</TBody>
        </Table>}
      </Card>

      <Dialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent wide meta={cf.meta}>
          <DialogHeader><DialogTitle>{editing === 'new' ? 'Add Compliance Document' : `Edit ${editing?.docNo}`}</DialogTitle><DialogDescription>Give it an expiry date and reminders run automatically until it is renewed with a new version.</DialogDescription></DialogHeader>
          <DialogBody><div className="grid gap-4 sm:grid-cols-3">
            <Field label="Title" className="sm:col-span-2"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Factory Licence" /></Field>
            <Field label="Category"><Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(meta.data?.categories ?? [f.category]).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Issuing authority"><Input value={f.authority} onChange={(e) => setF({ ...f, authority: e.target.value })} /></Field>
            <Field label="Number"><Input value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} /></Field>
            <Field label="Responsible user"><Select value={f.ownerUid || 'me'} onValueChange={(v) => setF({ ...f, ownerUid: v === 'me' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="me">Me</SelectItem>{(users.data?.items ?? []).filter((u) => u.status === 'Active').map((u) => <SelectItem key={u.uid} value={u.uid}>{u.name} · {u.role}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Issue date"><Input type="date" value={f.issueDate} onChange={(e) => setF({ ...f, issueDate: e.target.value })} /></Field>
            <Field label="Expiry / renewal date" hint="leave empty for formats and permanent documents"><Input type="date" value={f.expiryDate} onChange={(e) => setF({ ...f, expiryDate: e.target.value })} /></Field>
            <Field label="Confidential"><label className="flex h-[38px] items-center gap-2 rounded-md border bg-secondary px-3 text-[13px]"><input type="checkbox" checked={f.confidential} onChange={(e) => setF({ ...f, confidential: e.target.checked })} className="h-4 w-4 accent-[#a05aff]" /> only the confidential flag can see it</label></Field>
            <Field label="Notes" className="sm:col-span-3"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
            <Field label="Document file(s)" className="sm:col-span-3" hint={editing === 'new' || !(editing as Doc)?.versions?.length ? 'first file = the document (v1); more files = annexures / supporting pages' : 'files added here become attachments; use Renew in the document view for a new version'}>
              <div className="rounded-xl border border-dashed bg-secondary/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()}><Upload size={14} /> Choose files</Button>
                  <span className="text-[11.5px] text-muted-foreground">PDF, images, Word, Excel · one or many</span>
                  <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" hidden onChange={(e) => { const picked = Array.from(e.target.files ?? []); setFiles((x) => [...x, ...picked.filter((p) => !x.some((y) => y.name === p.name && y.size === p.size))]); e.target.value = ''; }} />
                </div>
                {files.length > 0 && <ul className="mt-2 divide-y rounded-lg border bg-card">{files.map((file, i) => <li key={`${file.name}-${file.size}`} className="flex items-center gap-2 px-3 py-1.5 text-[12.5px]"><FileIcon size={14} className="shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{file.name}</span><span className="text-[10.5px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB{i === 0 && (editing === 'new' || !(editing as Doc)?.versions?.length) ? ' · v1' : ' · attachment'}</span><button type="button" className="text-muted-foreground hover:text-bad" title="Remove" onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button></li>)}</ul>}
              </div>
            </Field>
          </div>{cf.node}</DialogBody>
          <DialogFooter><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button disabled={!f.title || save.isPending || !cf.ok} onClick={() => save.mutate()}><Check size={15} /> {save.isPending && files.length ? 'Uploading…' : 'Save'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <DocDetail d={view ? all.find((x) => x.id === view.id) ?? view : null} onClose={() => setView(null)} />
    </div>
  );
}

function DocDetail({ d, onClose }: { d: Doc | null; onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [ren, setRen] = React.useState({ note: '', expiryDate: '', issueDate: '', number: '' });
  const [dismiss, setDismiss] = React.useState({ reason: '', days: 7 });
  const inv = () => ['/compliance', '/alerts', '/mywork'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const act = useMutation({ mutationFn: async ({ url, body }: { url: string; body?: unknown }) => (await api.post(url, body ?? {})).data, onSuccess: (r: Doc) => { toast.success(`${r.docNo} · ${r.state}`); inv(); }, onError: (e) => toast.error(apiMessage(e)) });
  const patch = useMutation({ mutationFn: async (body: unknown) => (await api.patch(`/compliance/${d!.id}`, body)).data, onSuccess: () => { toast.success('Updated'); inv(); }, onError: (e) => toast.error(apiMessage(e)) });
  const attRef = React.useRef<HTMLInputElement>(null);
  const attach = async (picked: File[]) => { if (!picked.length || !d) return; try { const ids = []; for (const file of picked) ids.push((await uploadFile(file, 'compliance', d.id)).id); act.mutate({ url: `/compliance/${d.id}/attachments`, body: { fileIds: ids } }); } catch (e) { toast.error(apiMessage(e)); } };
  const detach = useMutation({ mutationFn: async (fileId: string) => (await api.delete(`/compliance/${d!.id}/attachments/${fileId}`)).data, onSuccess: () => { toast.success('Attachment removed'); inv(); }, onError: (e) => toast.error(apiMessage(e)) });
  const upload = async (file?: File) => { if (!file || !d) return; try { const r = await uploadFile(file, 'compliance', d.id); act.mutate({ url: `/compliance/${d.id}/version`, body: { fileId: r.id, ...ren, expiryDate: ren.expiryDate || undefined, issueDate: ren.issueDate || undefined, number: ren.number || undefined } }); setRen({ note: '', expiryDate: '', issueDate: '', number: '' }); } catch (e) { toast.error(apiMessage(e)); } finally { if (fileRef.current) fileRef.current.value = ''; } };
  if (!d) return null;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent wide>
        <DialogHeader><DialogTitle className="flex flex-wrap items-center gap-2">{d.title} <Badge tone={STATE_TONE[d.state] || 'mute'}>{d.state}</Badge>{d.confidential && <Badge tone="warn"><Shield size={11} /> confidential</Badge>}</DialogTitle>
          <DialogDescription>{d.docNo} · {d.category} · {d.authority || '—'} · {d.number || '—'} · owner {d.ownerName} · issued {fmtDate(d.issueDate)} · expiry {fmtDate(d.expiryDate)}{d.daysLeft !== null ? ` (${d.daysLeft} days)` : ''}</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          {d.notes && <div className="rounded-xl border bg-secondary px-4 py-3 text-[12.5px]">{d.notes}</div>}
          {d.dismissedActive && <div className="rounded-xl border border-gold-vivid/40 bg-gold-soft px-4 py-3 text-[12.5px] text-gold dark:bg-gold-vivid/10 dark:text-gold-vivid">Reminders paused until {fmtDate(d.dismissed?.until)} — {d.dismissed?.reason} ({d.dismissed?.by})</div>}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="overflow-hidden rounded-xl border">
              <div className="border-b bg-secondary px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Versions · latest first</div>
              {!d.versions.length ? <div className="px-4 py-4 text-center text-xs text-muted-foreground">No file attached yet.</div>
              : [...d.versions].reverse().map((v) => <div key={v.version} className="flex items-center gap-2 border-b px-4 py-2 text-[12.5px] last:border-0"><FileIcon size={15} className="text-muted-foreground" /><div className="min-w-0 flex-1"><div className="truncate font-semibold">v{v.version} · {v.fileName}</div><div className="text-[10.5px] text-muted-foreground">{v.note || 'no note'}{v.expiryDate ? ` · valid to ${fmtDate(v.expiryDate)}` : ''} · {v.by} · {fmtDate(v.at)}</div></div>{v.fileId && <><Button size="sm" variant="secondary" onClick={() => openFile(v.fileId!, v.fileName)}><Eye size={12} /></Button><Button size="sm" variant="secondary" onClick={() => openFile(v.fileId!, v.fileName, true)}><Download size={12} /></Button></>}</div>)}
              {d.canManage && <div className="space-y-2 border-t bg-secondary/60 p-3"><div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Renew / add version</div>
                <div className="grid grid-cols-2 gap-2"><Input className="h-8" placeholder="note" value={ren.note} onChange={(e) => setRen({ ...ren, note: e.target.value })} /><Input className="h-8" placeholder="new number (optional)" value={ren.number} onChange={(e) => setRen({ ...ren, number: e.target.value })} /><Input type="date" className="h-8" value={ren.issueDate} onChange={(e) => setRen({ ...ren, issueDate: e.target.value })} title="new issue date" /><Input type="date" className="h-8" value={ren.expiryDate} onChange={(e) => setRen({ ...ren, expiryDate: e.target.value })} title="new expiry date" /></div>
                <Button size="sm" onClick={() => fileRef.current?.click()}><Upload size={13} /> Upload file{ren.expiryDate ? ' & renew' : ''}</Button><input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" hidden onChange={(e) => upload(e.target.files?.[0])} /></div>}
            </div>
            <div className="space-y-4">
              <div className="overflow-hidden rounded-xl border"><div className="flex items-center justify-between border-b bg-secondary px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"><span>Attachments · {d.attachments?.length ?? 0}</span>{d.canManage && <><button type="button" className="font-normal normal-case text-brand hover:underline" onClick={() => attRef.current?.click()}>+ add files</button><input ref={attRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" hidden onChange={(e) => { attach(Array.from(e.target.files ?? [])); e.target.value = ''; }} /></>}</div>
                {!d.attachments?.length ? <div className="px-4 py-3 text-xs text-muted-foreground">No annexures / supporting files.</div>
                : d.attachments.map((a) => <div key={a.fileId} className="flex items-center gap-2 border-b px-4 py-1.5 text-[12px] last:border-0"><FileIcon size={14} className="shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{a.fileName}</span><span className="text-[10.5px] text-muted-foreground">{a.by} · {fmtDate(a.at)}</span><Button size="sm" variant="ghost" className="h-6 px-1" title="Open" onClick={() => openFile(a.fileId, a.fileName)}><Eye size={13} /></Button><Button size="sm" variant="ghost" className="h-6 px-1" title="Download" onClick={() => openFile(a.fileId, a.fileName, true)}><Download size={13} /></Button>{d.canManage && <Button size="sm" variant="ghost" className="h-6 px-1 text-bad" title="Remove" onClick={() => detach.mutate(a.fileId)}>✕</Button>}</div>)}</div>
              <div className="overflow-hidden rounded-xl border"><div className="border-b bg-secondary px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Reminders sent (in-app)</div>
                {!d.reminders.length ? <div className="px-4 py-3 text-xs text-muted-foreground">None yet{d.expiryDate ? ' — the first fires at the configured offset' : ' — no expiry date'}.</div>
                : d.reminders.map((r, i) => <div key={i} className="border-b px-4 py-1.5 text-[12px] last:border-0">{r.offsetDays}-day reminder · {fmtDate(r.sentAt)}</div>)}</div>
              {d.canManage && d.expiryDate && d.state !== 'No expiry' && <div className="space-y-2 rounded-xl border p-3">
                <label className="flex items-center gap-2 text-[13px] font-semibold"><input type="checkbox" checked={d.renewalInProgress} onChange={(e) => patch.mutate({ renewalInProgress: e.target.checked })} className="h-4 w-4 accent-[#279e97]" /> Renewal in progress</label>
                <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Pause reminders (with reason)</div>
                <div className="flex gap-2"><Input className="h-8 flex-1" placeholder="reason — application filed, awaiting inspection" value={dismiss.reason} onChange={(e) => setDismiss({ ...dismiss, reason: e.target.value })} /><Input type="number" className="h-8 w-20" value={dismiss.days} onChange={(e) => setDismiss({ ...dismiss, days: +e.target.value })} /><Button size="sm" variant="secondary" disabled={!dismiss.reason} onClick={() => act.mutate({ url: `/compliance/${d.id}/dismiss`, body: dismiss })}>Pause</Button></div></div>}
            </div>
          </div>
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
