import * as React from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/AuthProvider';
import { useList, useSave, useAction, useItem } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { useCustomFields } from '@/components/CustomFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton, Table, THead, TBody, Tr, Th, Td, Badge } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader, KpiTile, Toolbar, Field, MaskedNote, StatusPill, Bar, EmptyState } from '@/components/shared';
import { Vendors, Plus, Edit, Power, Check, Building } from '@/icons/icons';

type Vendor = { custom?: Record<string, unknown>; id: string; alias: string; name?: string; category: string; location?: string; gstin?: string; rate?: string;
  capacity?: string; onTimePct: number; rating: number; status: string; displayName: string; masked: boolean;
  contacts?: { name: string; phone: string; email: string }[] };
type Supplier = { custom?: Record<string, unknown>; id: string; name: string; category: string; location: string; gstin?: string; paymentTerms: string;
  leadTimeDays: number; status: string; contacts?: { name: string; phone: string; email: string }[] };

const V0 = { name: '', category: 'Dyeing', location: '', gstin: '', rate: '', capacity: '', onTimePct: 90, rating: 4, contactName: '', contactPhone: '' };
const S0 = { name: '', category: 'Fabric', location: '', gstin: '', paymentTerms: '30 days credit', leadTimeDays: 7, contactName: '', contactPhone: '' };

export default function VendorsPage() {
  const { hasFlag } = useAuth();
  const canEdit = hasFlag('vendor.confidential');
  const [tab, setTab] = React.useState<'vendors' | 'suppliers'>('vendors');
  const [q, setQ] = React.useState('');
  const [chip, setChip] = React.useState('All');
  const [editV, setEditV] = React.useState<Vendor | null | 'new'>(null);
  const [editS, setEditS] = React.useState<Supplier | null | 'new'>(null);
  const [vf, setVf] = React.useState(V0);
  const [sf, setSf] = React.useState(S0);
  const vendors = useList<Vendor>('/vendors', { size: 200 });
  const suppliers = useList<Supplier>('/suppliers', { size: 200 });
  const meta = useItem<{ processes: string[] }>('/vendors/meta/processes');
  const saveV = useSave<Vendor>('/vendors', ['/vendors'], (v) => { toast.success(`${v.displayName} saved`); setEditV(null); });
  const saveS = useSave<Supplier>('/suppliers', ['/suppliers'], (s) => { toast.success(`${s.name} saved`); setEditS(null); });
  const cfV = useCustomFields('vendors', editV && editV !== 'new' ? editV.custom : null, editV, 2);
  const cfS = useCustomFields('suppliers', editS && editS !== 'new' ? editS.custom : null, editS, 2);
  const toggleV = useAction<Vendor>(['/vendors'], (v) => toast.success(`${v.displayName} is now ${v.status}`));
  const toggleS = useAction<Supplier>(['/suppliers'], (s) => toast.success(`${s.name} is now ${s.status}`));

  React.useEffect(() => {
    if (editV && editV !== 'new') setVf({ name: editV.name || '', category: editV.category, location: editV.location || '', gstin: editV.gstin || '',
      rate: editV.rate || '', capacity: editV.capacity || '', onTimePct: editV.onTimePct, rating: editV.rating,
      contactName: editV.contacts?.[0]?.name || '', contactPhone: editV.contacts?.[0]?.phone || '' });
    else setVf(V0);
  }, [editV]);
  React.useEffect(() => {
    if (editS && editS !== 'new') setSf({ name: editS.name, category: editS.category, location: editS.location || '', gstin: editS.gstin || '',
      paymentTerms: editS.paymentTerms, leadTimeDays: editS.leadTimeDays, contactName: editS.contacts?.[0]?.name || '', contactPhone: editS.contacts?.[0]?.phone || '' });
    else setSf(S0);
  }, [editS]);

  const vAll = vendors.data?.items ?? [], sAll = suppliers.data?.items ?? [];
  const processes = meta.data?.processes ?? [];
  const vRows = vAll.filter((v) => (!q || `${v.displayName} ${v.location} ${v.category}`.toLowerCase().includes(q.toLowerCase())) && (chip === 'All' || v.category === chip || v.status === chip));
  const sRows = sAll.filter((s) => (!q || `${s.name} ${s.location} ${s.category}`.toLowerCase().includes(q.toLowerCase())) && (chip === 'All' || s.category === chip || s.status === chip));

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Vendors & Suppliers" sub="Job-work partners by process, and the mills / trim houses you buy material from">
        {tab === 'vendors'
          ? canEdit && <Button onClick={() => setEditV('new')}><Plus size={17} /> Add Vendor</Button>
          : <Button onClick={() => setEditS('new')}><Plus size={17} /> Add Supplier</Button>}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={Vendors} label="Job-work Vendors" value={vAll.length} tone="brand" foot={`${new Set(vAll.map((v) => v.category)).size} process categories`} />
        <KpiTile icon={Check} label="Avg On-Time" value={vAll.length ? Math.round(vAll.reduce((a, v) => a + (v.onTimePct || 0), 0) / vAll.length) + '%' : '—'} tone="teal" />
        <KpiTile icon={Building} label="Material Suppliers" value={sAll.length} tone="info" />
        <KpiTile icon={Vendors} label="Your View" value={canEdit ? 'Full' : 'Masked'} tone={canEdit ? 'gold' : 'mute'} foot={canEdit ? 'vendor identities visible' : 'alias + process only'} />
      </div>

      <div className="flex gap-1 rounded-lg border bg-secondary p-1 w-fit">
        {(['vendors', 'suppliers'] as const).map((t) => (
          <button key={t} onClick={() => { setTab(t); setChip('All'); }}
            className={cn('rounded-md px-4 py-1.5 text-[13px] font-semibold capitalize transition-colors', tab === t ? 'bg-card text-brand shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {t === 'vendors' ? 'Job-work Vendors' : 'Material Suppliers'}
          </button>
        ))}
      </div>

      {tab === 'vendors' && !canEdit && <MaskedNote what="Vendor names, contacts, GSTIN, rates and bank details" />}

      {tab === 'vendors' ? (
        <Card>
          <Toolbar q={q} setQ={setQ} placeholder="Search vendor, process, city…" chips={['All', ...processes]} chip={chip} setChip={setChip} />
          {vendors.isLoading ? <div className="space-y-3 p-5">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
          : !vRows.length ? <EmptyState title="No vendors" />
          : <Table>
            <THead><Tr className="hover:bg-transparent">
              <Th>Vendor</Th><Th>Process</Th>{canEdit && <Th>Rate</Th>}<Th>Capacity</Th><Th className="w-32">On-Time</Th><Th>Rating</Th><Th>Status</Th>{canEdit && <Th className="text-right">Actions</Th>}
            </Tr></THead>
            <TBody>{vRows.map((v) => (
              <Tr key={v.id} className={cn(v.status === 'Inactive' && 'opacity-50')}>
                <Td><div className="font-semibold">{v.masked ? v.alias : v.name}</div><div className="text-[11px] text-muted-foreground"><span className="font-mono">{v.alias}</span>{v.location ? ` · ${v.location}` : ''}{!v.masked && v.gstin ? ` · ${v.gstin}` : ''}</div></Td>
                <Td><Badge tone="brand">{v.category}</Badge></Td>
                {canEdit && <Td className="text-xs">{v.rate || '—'}</Td>}
                <Td className="text-xs">{v.capacity || '—'}</Td>
                <Td className="min-w-28"><Bar pct={v.onTimePct} tone={v.onTimePct >= 93 ? 'ok' : v.onTimePct >= 88 ? 'warn' : 'bad'} /></Td>
                <Td className="text-xs font-semibold text-gold-vivid">★ {v.rating || 0}</Td>
                <Td><StatusPill value={v.status} /></Td>
                {canEdit && <Td><div className="flex justify-end gap-1.5">
                  <Button variant="secondary" size="sm" onClick={() => setEditV(v)}><Edit size={14} /></Button>
                  <Button variant={v.status === 'Inactive' ? 'secondary' : 'destructive'} size="sm" onClick={() => toggleV.mutate({ url: `/vendors/${v.id}/toggle` })}><Power size={14} /></Button>
                </div></Td>}
              </Tr>))}
            </TBody>
          </Table>}
        </Card>
      ) : (
        <Card>
          <Toolbar q={q} setQ={setQ} placeholder="Search supplier, city…" chips={['All', 'Fabric', 'Accessory', 'Packing']} chip={chip} setChip={setChip} />
          {suppliers.isLoading ? <div className="space-y-3 p-5">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
          : !sRows.length ? <EmptyState title="No suppliers" />
          : <Table>
            <THead><Tr className="hover:bg-transparent"><Th>Supplier</Th><Th>Category</Th><Th>Terms</Th><Th>Lead Time</Th><Th>Contact</Th><Th>Status</Th><Th className="text-right">Actions</Th></Tr></THead>
            <TBody>{sRows.map((s) => (
              <Tr key={s.id} className={cn(s.status === 'Inactive' && 'opacity-50')}>
                <Td><div className="font-semibold">{s.name}</div><div className="text-[11px] text-muted-foreground">{s.location || '—'}{s.gstin ? ` · ${s.gstin}` : ''}</div></Td>
                <Td><Badge tone={s.category === 'Fabric' ? 'brand' : s.category === 'Accessory' ? 'info' : 'warn'}>{s.category}</Badge></Td>
                <Td className="text-xs">{s.paymentTerms}</Td>
                <Td className="text-xs">{s.leadTimeDays} days</Td>
                <Td className="text-xs">{s.contacts?.[0] ? <>{s.contacts[0].name}<div className="text-[11px] text-muted-foreground">{s.contacts[0].phone}</div></> : '—'}</Td>
                <Td><StatusPill value={s.status} /></Td>
                <Td><div className="flex justify-end gap-1.5">
                  <Button variant="secondary" size="sm" onClick={() => setEditS(s)}><Edit size={14} /></Button>
                  <Button variant={s.status === 'Inactive' ? 'secondary' : 'destructive'} size="sm" onClick={() => toggleS.mutate({ url: `/suppliers/${s.id}/toggle` })}><Power size={14} /></Button>
                </div></Td>
              </Tr>))}
            </TBody>
          </Table>}
        </Card>
      )}

      {/* vendor dialog */}
      <Dialog open={editV !== null} onOpenChange={(o) => !o && setEditV(null)}>
        <DialogContent wide meta={cfV.meta}>
          <DialogHeader><DialogTitle>{editV === 'new' ? 'Add Vendor' : `Edit Vendor — ${editV?.displayName}`}</DialogTitle>
            <DialogDescription>Alias (V-xx) is generated automatically; identity fields stay confidential</DialogDescription></DialogHeader>
          <DialogBody><div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vendor Name"><Input value={vf.name} onChange={(e) => setVf({ ...vf, name: e.target.value })} placeholder="e.g. Shakti Dyeing Works" /></Field>
            <Field label="Process Category"><Select value={vf.category} onValueChange={(v) => setVf({ ...vf, category: v })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{processes.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Location"><Input value={vf.location} onChange={(e) => setVf({ ...vf, location: e.target.value })} /></Field>
            <Field label="GSTIN"><Input value={vf.gstin} onChange={(e) => setVf({ ...vf, gstin: e.target.value.toUpperCase() })} /></Field>
            <Field label="Rate" hint="e.g. ₹34 / kg or ₹4 / pc"><Input value={vf.rate} onChange={(e) => setVf({ ...vf, rate: e.target.value })} /></Field>
            <Field label="Daily Capacity"><Input value={vf.capacity} onChange={(e) => setVf({ ...vf, capacity: e.target.value })} placeholder="12 T/day" /></Field>
            <Field label="On-Time %"><Input type="number" value={vf.onTimePct} onChange={(e) => setVf({ ...vf, onTimePct: +e.target.value })} /></Field>
            <Field label="Rating (0–5)"><Input type="number" step="0.1" value={vf.rating} onChange={(e) => setVf({ ...vf, rating: +e.target.value })} /></Field>
            <Field label="Contact Person"><Input value={vf.contactName} onChange={(e) => setVf({ ...vf, contactName: e.target.value })} /></Field>
            <Field label="Phone"><Input value={vf.contactPhone} onChange={(e) => setVf({ ...vf, contactPhone: e.target.value })} /></Field>
          </div>{cfV.node}</DialogBody>
          <DialogFooter><Button variant="secondary" onClick={() => setEditV(null)}>Cancel</Button>
            <Button disabled={saveV.isPending || !vf.name || !cfV.ok} onClick={() => { const { contactName, contactPhone, ...rest } = vf;
              saveV.mutate({ id: editV && editV !== 'new' ? editV.id : undefined, body: { ...rest, custom: cfV.value, contacts: contactName ? [{ name: contactName, phone: contactPhone }] : [] } }); }}>
              <Check size={16} /> Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* supplier dialog */}
      <Dialog open={editS !== null} onOpenChange={(o) => !o && setEditS(null)}>
        <DialogContent meta={cfS.meta}>
          <DialogHeader><DialogTitle>{editS === 'new' ? 'Add Supplier' : `Edit Supplier — ${editS?.name}`}</DialogTitle>
            <DialogDescription>Material supplier — used on purchase orders and material master</DialogDescription></DialogHeader>
          <DialogBody><div className="grid gap-4 sm:grid-cols-2">
            <Field label="Supplier Name" className="sm:col-span-2"><Input value={sf.name} onChange={(e) => setSf({ ...sf, name: e.target.value })} /></Field>
            <Field label="Category"><Select value={sf.category} onValueChange={(v) => setSf({ ...sf, category: v })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{['Fabric', 'Accessory', 'Packing', 'Mixed'].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Location"><Input value={sf.location} onChange={(e) => setSf({ ...sf, location: e.target.value })} /></Field>
            <Field label="GSTIN"><Input value={sf.gstin} onChange={(e) => setSf({ ...sf, gstin: e.target.value.toUpperCase() })} /></Field>
            <Field label="Payment Terms"><Input value={sf.paymentTerms} onChange={(e) => setSf({ ...sf, paymentTerms: e.target.value })} /></Field>
            <Field label="Lead Time (days)"><Input type="number" value={sf.leadTimeDays} onChange={(e) => setSf({ ...sf, leadTimeDays: +e.target.value })} /></Field>
            <Field label="Contact Person"><Input value={sf.contactName} onChange={(e) => setSf({ ...sf, contactName: e.target.value })} /></Field>
            <Field label="Phone" className="sm:col-span-2"><Input value={sf.contactPhone} onChange={(e) => setSf({ ...sf, contactPhone: e.target.value })} /></Field>
          </div>{cfS.node}</DialogBody>
          <DialogFooter><Button variant="secondary" onClick={() => setEditS(null)}>Cancel</Button>
            <Button disabled={saveS.isPending || !sf.name || !cfS.ok} onClick={() => { const { contactName, contactPhone, ...rest } = sf;
              saveS.mutate({ id: editS && editS !== 'new' ? editS.id : undefined, body: { ...rest, custom: cfS.value, contacts: contactName ? [{ name: contactName, phone: contactPhone }] : [] } }); }}>
              <Check size={16} /> Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
