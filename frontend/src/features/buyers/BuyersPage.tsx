import * as React from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/AuthProvider';
import { useList, useSave, useAction, fmtInr, fmtN, fmtDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { useCustomFields } from '@/components/CustomFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton, Table, THead, TBody, Tr, Th, Td, Badge } from '@/components/ui/misc';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader, KpiTile, Toolbar, Field, MaskedNote, StatusPill, EmptyState } from '@/components/shared';
import { Building, Plus, Edit, Power, Check, Shield, Eye, EyeOff, Payments, ChevronDown, ChevronRight } from '@/icons/icons';
import { ShareTracking } from '@/features/portal/ShareTracking';
import { ReceivableStrip, BuyerAccountPanel, DueIn, useBuyerAccounts } from './BuyerAccount';

type Buyer = { custom?: Record<string, unknown>;
  id: string; alias: string; brand?: string; legalName?: string; country?: string; currency?: string; shipping?: Partial<Record<keyof typeof SHIP0, string | number>>;
  paymentTerms?: string; address?: string; notes?: string; displayName: string; masked: boolean; status: string; portalMasterLink?: boolean;
  contacts?: { name: string; role: string; email: string; phone: string }[];
};

const EMPTY = { brand: '', legalName: '', country: '', currency: 'USD', paymentTerms: '', address: '', notes: '',
  contactName: '', contactRole: '', contactEmail: '', contactPhone: '' };
/* filled once per buyer — every invoice / packing list starts from these */
const SHIP0 = { consigneeName: '', consigneeAddress: '', consigneeCountry: '', notifyParty: '', preCarriage: '', placeOfReceipt: '',
  portOfLoading: '', portOfDischarge: '', placeOfDelivery: '', finalDestination: '', mode: '', incoterm: '', paymentMethod: '',
  hsCode: '', marksAndNos: '', pcsPerCarton: '', cartonDims: '', grossPerCartonKg: '', netPerCartonKg: '' };
type Ship = typeof SHIP0;

export default function BuyersPage() {
  const { hasFlag } = useAuth();
  const canEdit = hasFlag('buyer.confidential');
  const [q, setQ] = React.useState('');
  const [chip, setChip] = React.useState('All');
  const [editing, setEditing] = React.useState<Buyer | null | 'new'>(null);
  const [form, setForm] = React.useState(EMPTY);
  const [ship, setShip] = React.useState<Ship>(SHIP0);
  const cf = useCustomFields('buyers', editing && editing !== 'new' ? editing.custom : null, editing, 2);
  const [portalFor, setPortalFor] = React.useState<Buyer | null>(null);

  const { data, isLoading } = useList<Buyer>('/buyers', { size: 200 });
  /* what each buyer still owes us — the account opens right under the row */
  const accounts = useBuyerAccounts();
  const accOf = (id: string) => (accounts.data?.items ?? []).find((x) => x.id === id);
  const showMoney = !!accounts.data?.money;
  const [openAcc, setOpenAcc] = React.useState<string | null>(null);
  const save = useSave<Buyer>('/buyers', ['/buyers'], (b) => { toast.success(`${b.displayName} saved`); setEditing(null); });
  const toggle = useAction<Buyer>(['/buyers'], (b) => toast.success(`${b.displayName} is now ${b.status}`));

  React.useEffect(() => {
    if (editing && editing !== 'new') {
      const c = editing.contacts?.[0];
      setForm({ brand: editing.brand || '', legalName: editing.legalName || '', country: editing.country || '',
        currency: editing.currency || 'USD', paymentTerms: editing.paymentTerms || '', address: editing.address || '',
        notes: editing.notes || '', contactName: c?.name || '', contactRole: c?.role || '', contactEmail: c?.email || '', contactPhone: c?.phone || '' });
      setShip({ ...SHIP0, ...Object.fromEntries(Object.keys(SHIP0).map((k) => [k, editing.shipping?.[k as keyof Ship] ?? ''])) } as Ship);
    } else { setForm(EMPTY); setShip(SHIP0); }
  }, [editing]);

  const all = data?.items ?? [];
  const rows = all.filter((b) => {
    const t = `${b.displayName} ${b.legalName || ''} ${b.country || ''}`.toLowerCase();
    return (!q || t.includes(q.toLowerCase())) && (chip === 'All' || b.status === chip);
  });

  const submit = () => {
    const { contactName, contactRole, contactEmail, contactPhone, ...rest } = form;
    const shipping = Object.fromEntries(Object.entries(ship).map(([k, v]) => [k, ['pcsPerCarton', 'grossPerCartonKg', 'netPerCartonKg'].includes(k) ? Number(v) || 0 : v]));
    const body = { ...rest, shipping, custom: cf.value, contacts: contactName ? [{ name: contactName, role: contactRole, email: contactEmail, phone: contactPhone }] : [] };
    save.mutate({ id: editing && editing !== 'new' ? editing.id : undefined, body });
  };

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Buyers" sub="Buyer master — identity and commercial terms are confidential; other users see only the alias">
        {canEdit && <Button onClick={() => setEditing('new')}><Plus size={17} /> Add Buyer</Button>}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={Building} label="Buyers" value={all.length} tone="brand" foot={`${new Set(all.map((b) => b.country).filter(Boolean)).size} countries`} />
        <KpiTile icon={Check} label="Active" value={all.filter((b) => b.status === 'Active').length} tone="teal" />
        {showMoney
          ? (() => { const due = (accounts.data?.items ?? []).reduce((a, x) => a + (x.outstanding || 0), 0); const open = (accounts.data?.items ?? []).reduce((a, x) => a + x.openInvoices, 0);
            return <KpiTile icon={Payments} label="Still to Receive" value={fmtInr(due)} tone={due ? 'bad' : 'teal'} foot={open ? `${open} open invoice${open === 1 ? '' : 's'}` : 'every invoice realised'} />; })()
          : <KpiTile icon={Building} label="Countries" value={new Set(all.map((b) => b.country).filter(Boolean)).size} tone="info" />}
        <KpiTile icon={Shield} label="Your View" value={canEdit ? 'Full' : 'Masked'} tone={canEdit ? 'gold' : 'mute'} foot={canEdit ? 'confidential flag on' : 'alias + country only'} />
      </div>

      {!canEdit && <MaskedNote what="Brand names, legal entities, contacts, bank details and payment terms" />}

      {/* money still to come in, the live order book, and who we are waiting on */}
      <ReceivableStrip onOpen={(id) => setOpenAcc(id)} />

      <Card>
        <Toolbar q={q} setQ={setQ} placeholder="Search buyer, country…" chips={['All', 'Active', 'Inactive']} chip={chip} setChip={setChip} />
        {isLoading ? <div className="space-y-3 p-5">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
        : !rows.length ? <EmptyState title="No buyers yet" text="Add your first buyer — samples and orders hang off the buyer master." />
        : (
          <Table>
            <THead><Tr className="hover:bg-transparent">
              {showMoney && <Th />}<Th>Buyer</Th><Th>Country · terms</Th>
              {showMoney
                ? <><Th>Live orders</Th><Th className="text-right">Order value</Th><Th className="text-right">Received</Th><Th className="text-right">Still to receive</Th></>
                : canEdit && <><Th>Currency</Th><Th>Payment Terms</Th><Th>Contact</Th></>}
              <Th>Status</Th>{canEdit && <Th className="text-right">Actions</Th>}
            </Tr></THead>
            <TBody>
              {rows.map((b) => { const acc = accOf(b.id); const open = openAcc === b.id; return (
                <React.Fragment key={b.id}>
                <Tr className={cn(b.status === 'Inactive' && 'opacity-50', showMoney && 'cursor-pointer', open && 'bg-brand-soft/40 dark:bg-accent/40')}
                  onClick={showMoney ? () => setOpenAcc(open ? null : b.id) : undefined}>
                  {showMoney && <Td className="w-6 text-muted-foreground">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</Td>}
                  <Td>
                    <div className="font-semibold">{b.masked ? b.alias : b.brand}</div>
                    <div className="text-[11px] text-muted-foreground"><span className="font-mono">{b.alias}</span>{!b.masked && b.legalName ? ` · ${b.legalName}` : ''}</div>
                  </Td>
                  <Td className="text-xs">{b.country || '—'}<div className="text-[11px] text-muted-foreground">{b.currency}{canEdit && b.paymentTerms ? ` · ${b.paymentTerms}` : ''}</div></Td>
                  {showMoney
                    ? <>
                      <Td className="text-xs">{acc?.liveOrders ? <>{acc.liveOrders} live<div className="text-[11px] text-muted-foreground">{fmtN(acc.liveQty)} pcs{acc.nextShip ? ` · next ${fmtDate(acc.nextShip.date)}` : ''}</div></> : <span className="text-muted-foreground">no live order</span>}</Td>
                      <Td className="num text-right">{fmtInr(acc?.liveValue)}<div className="text-[10.5px] font-normal text-muted-foreground">{acc?.toInvoice ? `${fmtInr(acc.toInvoice)} yet to invoice` : acc?.invoiced ? `invoiced ${fmtInr(acc.invoiced)}` : ''}</div></Td>
                      <Td className="num text-right text-teal">{fmtInr(acc?.received)}<div className="text-[10.5px] font-normal text-muted-foreground">{acc?.advance ? `${fmtInr(acc.advance)} advance` : acc?.lastReceipt ? `last ${fmtDate(acc.lastReceipt.date)}` : ''}</div></Td>
                      <Td className="text-right"><DueIn amount={acc?.invoices ? acc.outstanding : undefined} empty="not invoiced yet" />{acc?.overdue ? <div className="text-[10.5px] font-semibold text-bad">{fmtInr(acc.overdue)} overdue</div> : null}</Td>
                    </>
                    : canEdit && <>
                      <Td><Badge tone="plain">{b.currency}</Badge></Td>
                      <Td className="text-xs">{b.paymentTerms || '—'}</Td>
                      <Td className="text-xs">{b.contacts?.[0] ? <>{b.contacts[0].name}<div className="text-muted-foreground">{b.contacts[0].email}</div></> : '—'}</Td>
                    </>}
                  <Td><StatusPill value={b.status} /></Td>
                  {canEdit && <Td onClick={(e) => e.stopPropagation()}><div className="flex justify-end gap-1.5">
                    <Button variant="secondary" size="sm" onClick={() => setEditing(b)}><Edit size={14} /></Button>
                    <Button variant="secondary" size="sm" title={b.portalMasterLink === false ? 'Buyer-wise tracking link is switched off — click to open the portal card anyway' : 'Buyer-wise tracking link (all live orders)'} onClick={() => setPortalFor(b)}>{b.portalMasterLink === false ? <EyeOff size={14} /> : <Eye size={14} />}</Button>
                    <Button variant={b.status === 'Inactive' ? 'secondary' : 'destructive'} size="sm" onClick={() => toggle.mutate({ url: `/buyers/${b.id}/toggle` })}><Power size={14} /></Button>
                  </div></Td>}
                </Tr>
                {open && <Tr className="hover:bg-transparent"><Td colSpan={canEdit ? 8 : 7} className="bg-secondary/40 p-3"><BuyerAccountPanel id={b.id} onClose={() => setOpenAcc(null)} /></Td></Tr>}
                </React.Fragment>); })}
            </TBody>
          </Table>
        )}
      </Card>

      <Dialog open={!!portalFor} onOpenChange={(o) => !o && setPortalFor(null)}>
        <DialogContent className="portal-dialog max-w-3xl">
          <DialogHeader><DialogTitle>Buyer tracking · {portalFor?.displayName}</DialogTitle><DialogDescription>One master link shows every live order of this buyer. Switch it off to allow order-wise links only.</DialogDescription></DialogHeader>
          <DialogBody className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border bg-secondary px-3 py-2 text-[13px]">
              <span>Buyer-wise master link: <b>{portalFor?.portalMasterLink === false ? 'Off' : 'On'}</b></span>
              {portalFor && <Button size="sm" variant={portalFor.portalMasterLink === false ? 'default' : 'destructive'} onClick={() => save.mutate({ id: portalFor.id, body: { portalMasterLink: portalFor.portalMasterLink === false } }, { onSuccess: (b) => setPortalFor(b) })}>{portalFor.portalMasterLink === false ? 'Switch on' : 'Switch off'}</Button>}
            </div>
            {portalFor && <ShareTracking buyerId={portalFor.id} title="Master tracking links" />}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent wide meta={cf.meta}>
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'Add Buyer' : `Edit Buyer — ${editing?.displayName}`}</DialogTitle>
            <DialogDescription>Alias is generated automatically and is what non-privileged users see</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Brand / Trading Name"><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="e.g. Zara Home" /></Field>
              <Field label="Legal Entity"><Input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} placeholder="e.g. Inditex S.A." /></Field>
              <Field label="Country"><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></Field>
              <Field label="Currency"><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></Field>
              <Field label="Payment Terms" className="sm:col-span-2"><Input value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} placeholder="e.g. LC 60 days from BL" /></Field>
              <Field label="Primary Contact"><Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="Name" /></Field>
              <Field label="Contact Role"><Input value={form.contactRole} onChange={(e) => setForm({ ...form, contactRole: e.target.value })} placeholder="e.g. Sourcing Manager" /></Field>
              <Field label="Contact Email"><Input value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} /></Field>
              <Field label="Contact Phone"><Input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} /></Field>
              <Field label="Address" className="sm:col-span-2"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
              <Field label="Notes" className="sm:col-span-2"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Buyer manual, audit requirements…" /></Field>
            </div>
            {/* one-time shipping & document details — they prefill every invoice and packing list of this buyer */}
            <div className="mt-5 overflow-hidden rounded-xl border">
              <div className="border-b bg-secondary px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Shipping &amp; documents · filled once, used on every invoice</div>
              <div className="grid gap-4 p-4 sm:grid-cols-3">
                <Field label="Consignee name" className="sm:col-span-2"><Input value={ship.consigneeName} onChange={(e) => setShip({ ...ship, consigneeName: e.target.value })} placeholder="blank = buyer's legal name" /></Field>
                <Field label="Consignee country"><Input value={ship.consigneeCountry} onChange={(e) => setShip({ ...ship, consigneeCountry: e.target.value })} /></Field>
                <Field label="Consignee address" className="sm:col-span-3"><Input value={ship.consigneeAddress} onChange={(e) => setShip({ ...ship, consigneeAddress: e.target.value })} /></Field>
                <Field label="Buyer if other than consignee"><Input value={ship.notifyParty} onChange={(e) => setShip({ ...ship, notifyParty: e.target.value })} placeholder="SAME AS CONSIGNEE" /></Field>
                <Field label="Pre-carriage by"><Input value={ship.preCarriage} onChange={(e) => setShip({ ...ship, preCarriage: e.target.value })} placeholder="BY AIR / BY ROAD" /></Field>
                <Field label="Place of receipt"><Input value={ship.placeOfReceipt} onChange={(e) => setShip({ ...ship, placeOfReceipt: e.target.value })} placeholder="NEW DELHI" /></Field>
                <Field label="Port of loading"><Input value={ship.portOfLoading} onChange={(e) => setShip({ ...ship, portOfLoading: e.target.value })} placeholder="IGI Airport" /></Field>
                <Field label="Port of discharge"><Input value={ship.portOfDischarge} onChange={(e) => setShip({ ...ship, portOfDischarge: e.target.value })} placeholder="Las Vegas" /></Field>
                <Field label="Place of delivery"><Input value={ship.placeOfDelivery} onChange={(e) => setShip({ ...ship, placeOfDelivery: e.target.value })} placeholder="USA" /></Field>
                <Field label="Mode"><Input value={ship.mode} onChange={(e) => setShip({ ...ship, mode: e.target.value })} placeholder="Air / Sea" /></Field>
                <Field label="Incoterm"><Input value={ship.incoterm} onChange={(e) => setShip({ ...ship, incoterm: e.target.value })} placeholder="FOB" /></Field>
                <Field label="Payment method"><Input value={ship.paymentMethod} onChange={(e) => setShip({ ...ship, paymentMethod: e.target.value })} placeholder="T/T or LC" /></Field>
                <Field label="Default HS code"><Input value={ship.hsCode} onChange={(e) => setShip({ ...ship, hsCode: e.target.value })} placeholder="6209.20.5035" /></Field>
                <Field label="Pcs / carton"><Input type="number" value={ship.pcsPerCarton} onChange={(e) => setShip({ ...ship, pcsPerCarton: e.target.value })} /></Field>
                <Field label="Measurements / carton"><Input value={ship.cartonDims} onChange={(e) => setShip({ ...ship, cartonDims: e.target.value })} placeholder="60X40X30" /></Field>
                <Field label="Gross kg / carton"><Input type="number" step="0.1" value={ship.grossPerCartonKg} onChange={(e) => setShip({ ...ship, grossPerCartonKg: e.target.value })} /></Field>
                <Field label="Net kg / carton"><Input type="number" step="0.1" value={ship.netPerCartonKg} onChange={(e) => setShip({ ...ship, netPerCartonKg: e.target.value })} /></Field>
                <Field label="Marks &amp; nos" className="sm:col-span-3"><Input value={ship.marksAndNos} onChange={(e) => setShip({ ...ship, marksAndNos: e.target.value })} placeholder="buyer · order no · C/No. 1–105 · MADE IN INDIA" /></Field>
              </div>
            </div>
            {cf.node}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={save.isPending || !form.brand || !cf.ok} onClick={submit}><Check size={16} /> {editing === 'new' ? 'Create Buyer' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
