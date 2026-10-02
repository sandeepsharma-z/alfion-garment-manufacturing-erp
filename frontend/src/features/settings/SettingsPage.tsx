import * as React from 'react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { uploadFile, openFile } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton, Badge } from '@/components/ui/misc';
import { PageHeader, Field } from '@/components/shared';
import { CustomFieldsGrid, FIELD_TYPES, NEEDS_OPTIONS, type FormField, type FormDef, type CustomValues, type Overrides, type BuiltinField } from '@/components/CustomFields';
import { TEXT_DISPLAY, type Override } from '@/components/form-meta';
import { Save, Upload, Eye, EyeOff, Shield, Plus, Trash, ChevronDown, Building, Stock, Production, Quality, Ship, Note, Refresh, Key, Edit, Check } from '@/icons/icons';

export type { FormField } from '@/components/CustomFields';
type Company = { legalName: string; iec: string; gstin: string; currency: string; defaultPort: string; financialYear: string; address: string; phone: string; email: string; letterheadFileId?: string; poApprovalLimit: number; godowns: string[]; lines: string[]; lineTarget: number; tnaAmberDays: number; tnaAutoApply: boolean; dhuLimit: number; fabricPointsLimit: number; aqlLevel: string; sampleWaitDays: number; escalateHours: number; defects: { code: string; name: string; severity: string }[]; complianceReminderDays: number[]; invoicePrefix: string; defaultPortOfDischarge?: string; portalBaseUrl?: string; portalDefaultDays?: number; formFields?: Record<string, FormField[]>; fieldOverrides?: Overrides;
  adCode?: string; sizeSets?: { name: string; sizes: string[] }[]; cutExtraPct?: number; defaultCurrency?: string; fxRate?: number; igstPct?: number; formatNos?: Record<string, string>; approvalItems?: string[] };
const FORMAT_LABELS: [string, string][] = [['fabricInspection', 'Fabric 4-point inspection'], ['cuttingReport', 'Daily cutting report'], ['bladeRegister', 'Blade register'], ['stitchingWip', 'Stitching WIP'], ['loadingPlan', 'Loading plan'], ['needleRegister', 'Broken needle register'], ['invoice', 'Commercial invoice'], ['packingList', 'Packing list / carton marks'], ['finalInspection', 'Final inspection (AQL)'], ['measurementInspection', 'Measurement inspection'], ['hourlyOutput', 'Hourly output'], ['specSheet', 'Specification sheet'], ['measurementSheet', 'Sample measurement sheet']];
const KEYS: (keyof Company)[] = ['legalName', 'iec', 'gstin', 'currency', 'defaultPort', 'financialYear', 'address', 'phone', 'email', 'poApprovalLimit', 'godowns', 'lines', 'lineTarget', 'tnaAmberDays', 'tnaAutoApply', 'dhuLimit', 'fabricPointsLimit', 'aqlLevel', 'sampleWaitDays', 'escalateHours', 'defects', 'complianceReminderDays', 'invoicePrefix', 'defaultPortOfDischarge', 'portalBaseUrl', 'portalDefaultDays', 'formFields', 'fieldOverrides', 'adCode', 'sizeSets', 'cutExtraPct', 'defaultCurrency', 'fxRate', 'igstPct', 'formatNos', 'approvalItems'];
const pick = (c: Company) => Object.fromEntries(KEYS.map((k) => [k, c[k]]));

const TABS = [
  { key: 'company', label: 'Company', icon: Building, sub: 'Profile, letterhead, numbering' },
  { key: 'stores', label: 'Stores & Procurement', icon: Stock, sub: 'PO approval, godowns' },
  { key: 'production', label: 'Production', icon: Production, sub: 'Lines, targets' },
  { key: 'quality', label: 'TNA · Quality · Alerts', icon: Quality, sub: 'Windows, limits, defect master' },
  { key: 'export', label: 'Export & Portal', icon: Ship, sub: 'Invoices, buyer tracking' },
  { key: 'forms', label: 'Form Fields', icon: Note, sub: 'Extra inputs on every form' },
] as const;
type TabKey = typeof TABS[number]['key'];
const TA = 'w-full rounded-md border border-input bg-secondary px-3 py-2 text-sm outline-none focus-visible:border-brand focus-visible:bg-card';
const SEL = 'h-[38px] w-full rounded-md border border-input bg-secondary px-3 text-sm';

export default function SettingsPage() {
  const { hasModule } = useAuth();
  const canEdit = hasModule('settings');
  const qc = useQueryClient();
  const [tab, setTab] = React.useState<TabKey>('company');
  const [f, setF] = React.useState<Company | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const q = useQuery<Company>({ queryKey: ['/settings/company'], queryFn: async () => (await api.get('/settings/company')).data });
  const tnaStages = useQuery<{ stages: { name: string }[] }>({ queryKey: ['/tna', 'stages'], queryFn: async () => (await api.get('/tna/stages')).data, staleTime: 30_000 });
  React.useEffect(() => { if (q.data && !f) setF(q.data); }, [q.data, f]);
  const save = useMutation({
    mutationFn: async (body: Partial<Company>) => (await api.put('/settings/company', body)).data,
    onSuccess: (d: Company) => { setF(d); qc.invalidateQueries({ queryKey: ['/settings/company'] }); toast.success('Settings saved'); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const upload = async (file?: File) => {
    if (!file) return;
    try { const r = await uploadFile(file, 'settings', 'company'); save.mutate({ letterheadFileId: r.id }); }
    catch (e) { toast.error(apiMessage(e)); }
  };
  if (!f) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  const dirty = !!q.data && JSON.stringify(pick(f)) !== JSON.stringify(pick(q.data));
  const set = (k: keyof Company) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const fieldCount = Object.values(f.formFields ?? {}).reduce((a, l) => a + (l?.length ?? 0), 0) + Object.values(f.fieldOverrides ?? {}).reduce((a, m) => a + Object.keys(m ?? {}).length, 0);

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title="Settings" sub="Company setup, working parameters and the extra fields on every form. Printed documents pick these up automatically.">
        {canEdit && <div className="flex items-center gap-2">
          {dirty && <Button variant="secondary" onClick={() => setF(q.data!)}><Refresh size={15} /> Discard</Button>}
          <Button disabled={save.isPending || !dirty} onClick={() => save.mutate(pick(f))}><Save size={16} /> {save.isPending ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}</Button>
        </div>}
      </PageHeader>

      {!canEdit && <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info-soft px-4 py-3 text-[12.5px] text-info dark:bg-info/10"><Shield size={17} className="mt-0.5 shrink-0" /><div>Read-only. Only users with the Settings module can change these values.</div></div>}

      {/* tab bar */}
      <div className="grid gap-1 rounded-xl border bg-card p-1.5 shadow-card sm:grid-cols-3 xl:grid-cols-6">
        {TABS.map((t) => { const Icon = t.icon; const on = tab === t.key; return (
          <button key={t.key} onClick={() => setTab(t.key)} className={cn('flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors', on ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')}>
            <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', on ? 'bg-brand text-white' : 'bg-secondary')}><Icon size={16} /></span>
            <span className="min-w-0"><span className="block truncate text-[12.5px] font-semibold">{t.label}{t.key === 'forms' && fieldCount > 0 && <span className="ml-1.5 rounded-full bg-brand px-1.5 py-0.5 text-[9.5px] font-bold text-white">{fieldCount}</span>}</span><span className="block truncate text-[10.5px] opacity-70">{t.sub}</span></span>
          </button>); })}
      </div>

      <fieldset disabled={!canEdit} className="space-y-5">
        {tab === 'company' && (
          <div className="grid gap-5 xl:grid-cols-3">
            <Section title="Company profile" sub="Legal identity printed on invoices, challans and specification sheets" className="xl:col-span-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Legal Name" className="sm:col-span-2"><Input value={f.legalName} onChange={set('legalName')} /></Field>
                <Field label="IEC (Import Export Code)"><Input value={f.iec} onChange={set('iec')} placeholder="0512345678" /></Field>
                <Field label="GSTIN"><Input value={f.gstin} onChange={set('gstin')} placeholder="06AAACA1234A1Z5" /></Field>
                <Field label="AD code (bank)" hint="printed on the invoice / shipping bill"><Input value={f.adCode ?? ''} onChange={(e) => setF({ ...f, adCode: e.target.value })} placeholder="0510012-3400009" /></Field>
                <Field label="Base Currency"><Input value={f.currency} onChange={set('currency')} /></Field>
                <Field label="Financial Year"><Input value={f.financialYear} onChange={set('financialYear')} placeholder="2026-27" /></Field>
                <Field label="Registered Address" className="sm:col-span-2"><Input value={f.address} onChange={set('address')} placeholder="Plot No., Sector, Noida, Uttar Pradesh" /></Field>
                <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
                <Field label="Email"><Input value={f.email} onChange={set('email')} /></Field>
              </div>
            </Section>
            <div className="space-y-5">
              <Section title="Letterhead" sub="Optional logo / letterhead image on printed documents">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  {f.letterheadFileId ? <><Badge tone="ok">Uploaded</Badge><Button size="sm" variant="secondary" onClick={() => openFile(f.letterheadFileId!, 'letterhead')}><Eye size={14} /> View</Button></> : <Badge tone="mute">Not uploaded</Badge>}
                  {canEdit && <><Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}><Upload size={14} /> {f.letterheadFileId ? 'Replace' : 'Upload'}</Button>
                    <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp,.pdf" hidden onChange={(e) => upload(e.target.files?.[0])} /></>}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">PNG, JPG or PDF. Saved immediately on upload.</p>
              </Section>
              <Section title="Numbering" sub="Sequences are issued by the server and never reused" icon={Key}>
                <div className="space-y-1.5 text-[12.5px]">
                  {[['Samples', 'SMP-###'], ['Orders', 'AFI-####'], ['Buyers / Vendors (alias)', 'B-## / V-##'], ['Purchase Orders', 'PO-####'], ['Gate Entry / GRN', 'GE-#### / GRN-####'], ['Job Work Challans', 'JW-####'], ['Patterns', 'PT-####'], ['Inspections', 'FI-#### / QI-####'], ['Export invoices', 'AFI/EXP/FY/####'], ['Compliance docs', 'CD-####'], ['Tracking codes', 'XXXX-XXXX']].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between border-b border-dashed py-1 last:border-0"><span className="text-muted-foreground">{k}</span><span className="font-mono font-semibold">{v}</span></div>))}
                </div>
              </Section>
            </div>
          </div>
        )}

        {tab === 'stores' && (
          <div className="grid gap-5 xl:grid-cols-2">
            <Section title="Purchase approval" sub="POs above the limit wait for a user with the “Approve purchase orders” flag">
              <Field label="PO approval limit (₹)" hint="0 switches approval off."><Input type="number" value={f.poApprovalLimit ?? 0} onChange={(e) => setF({ ...f, poApprovalLimit: +e.target.value })} /></Field>
              <Field label="Default port of loading" className="mt-4"><Input value={f.defaultPort} onChange={set('defaultPort')} /></Field>
            </Section>
            <Section title="Godowns / store locations" sub="Offered at Gate Entry and stock adjustments — one per line">
              <textarea rows={8} value={(f.godowns ?? []).join('\n')} onChange={(e) => setF({ ...f, godowns: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} className={TA} />
              <p className="mt-1.5 text-[11px] text-muted-foreground">{(f.godowns ?? []).length} locations</p>
            </Section>
          </div>
        )}

        {tab === 'production' && (
          <div className="grid gap-5 xl:grid-cols-2">
            <Section title="Lines / sections" sub="Offered when logging production and planning in-house operations — one per line">
              <textarea rows={10} value={(f.lines ?? []).join('\n')} onChange={(e) => setF({ ...f, lines: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} className={TA} />
              <p className="mt-1.5 text-[11px] text-muted-foreground">{(f.lines ?? []).length} lines</p>
            </Section>
            <Section title="Targets" sub="Line efficiency = today's output ÷ target">
              <div className="grid gap-4 sm:grid-cols-2"><Field label="Daily target per line (pcs)"><Input type="number" value={f.lineTarget ?? 800} onChange={(e) => setF({ ...f, lineTarget: +e.target.value })} /></Field>
              <Field label="Cutting extra %" hint="cut qty = order qty + this %"><Input type="number" step="0.5" value={f.cutExtraPct ?? 5} onChange={(e) => setF({ ...f, cutExtraPct: +e.target.value })} /></Field></div>
            </Section>
            <Section title="Size sets" sub="Offered on orders and measurement specs — one per line as  Name: S, M, L, XL">
              <textarea rows={8} value={(f.sizeSets ?? []).map((s) => `${s.name}: ${s.sizes.join(', ')}`).join('\n')} onChange={(e) => setF({ ...f, sizeSets: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [name, rest] = l.split(':'); return { name: (name || '').trim(), sizes: (rest || '').split(/[,/]/).map((x) => x.trim()).filter(Boolean) }; }).filter((s) => s.name && s.sizes.length) })} className={TA} />
              <p className="mt-1.5 text-[11px] text-muted-foreground">{(f.sizeSets ?? []).length} sets · e.g. Japan M – 3L: M, L, LL, 3L</p>
            </Section>
            <Section title="Approvals board rows" sub="Default items on every style's approvals board (Sample Development → Approvals)">
              <textarea rows={8} value={(f.approvalItems ?? []).join('\n')} onChange={(e) => setF({ ...f, approvalItems: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} className={TA} />
            </Section>
          </div>
        )}

        {tab === 'quality' && (
          <div className="grid gap-5 xl:grid-cols-2">
            <Section title="Time & Action" sub="How the TNA board colours tasks and when new orders get a plan">
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-secondary/60 px-3 py-2 text-[12px]"><span className="font-semibold">Pipeline stages:</span>{(tnaStages.data?.stages ?? []).map((st, i) => <span key={st.name} className="flex items-center gap-1"><span className="font-mono text-[10px] text-muted-foreground">{i + 1}</span>{st.name}{i < (tnaStages.data?.stages.length ?? 0) - 1 && <span className="text-border">→</span>}</span>)}<Link to="/tna" className="ml-auto text-[11.5px] font-semibold text-brand hover:underline">Manage on the TNA page →</Link></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Amber window (days before due)"><Input type="number" value={f.tnaAmberDays ?? 3} onChange={(e) => setF({ ...f, tnaAmberDays: +e.target.value })} /></Field>
                <Field label="Auto-apply TNA to new orders"><select className={SEL} value={f.tnaAutoApply === false ? 'no' : 'yes'} onChange={(e) => setF({ ...f, tnaAutoApply: e.target.value === 'yes' })}><option value="yes">Yes</option><option value="no">No</option></select></Field>
              </div>
            </Section>
            <Section title="Quality limits" sub="Thresholds that raise alerts and block dispatch">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="DHU limit (%)"><Input type="number" step="0.1" value={f.dhuLimit ?? 5} onChange={(e) => setF({ ...f, dhuLimit: +e.target.value })} /></Field>
                <Field label="Fabric points / 100 sq m"><Input type="number" value={f.fabricPointsLimit ?? 20} onChange={(e) => setF({ ...f, fabricPointsLimit: +e.target.value })} /></Field>
                <Field label="AQL level"><select className={SEL} value={f.aqlLevel || '2.5'} onChange={(e) => setF({ ...f, aqlLevel: e.target.value })}><option>2.5</option><option>4.0</option></select></Field>
              </div>
            </Section>
            <Section title="Alerts & reminders" sub="Waiting periods and escalation">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Sample with buyer → alert after (days)"><Input type="number" value={f.sampleWaitDays ?? 7} onChange={(e) => setF({ ...f, sampleWaitDays: +e.target.value })} /></Field>
                <Field label="Escalate red alerts after (hours)"><Input type="number" value={f.escalateHours ?? 24} onChange={(e) => setF({ ...f, escalateHours: +e.target.value })} /></Field>
                <Field label="Compliance reminders (days before expiry)" hint="comma separated"><Input value={(f.complianceReminderDays ?? [60, 30, 15, 7, 1]).join(', ')} onChange={(e) => setF({ ...f, complianceReminderDays: e.target.value.split(',').map((x) => +x.trim()).filter((x) => x > 0) })} /></Field>
              </div>
            </Section>
            <Section title="Defect master" sub="code | name | Major/Minor per line — leave empty to use the built-in list">
              <textarea rows={6} value={(f.defects ?? []).map((d) => `${d.code} | ${d.name} | ${d.severity}`).join('\n')} onChange={(e) => setF({ ...f, defects: e.target.value.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p[0] && p[1]).map(([code, name, severity]) => ({ code: code.toUpperCase(), name, severity: severity === 'Minor' ? 'Minor' : 'Major' })) })}
                className={cn(TA, 'font-mono text-xs')} placeholder="BS | Broken stitch | Major" />
            </Section>
          </div>
        )}

        {tab === 'export' && (
          <div className="grid gap-5 xl:grid-cols-2">
            <Section title="Export documents" sub="Defaults used when an invoice is created">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Invoice prefix" hint="invoice = prefix / FY / number"><Input value={f.invoicePrefix ?? 'AFI/EXP'} onChange={(e) => setF({ ...f, invoicePrefix: e.target.value })} /></Field>
                <Field label="Default port of discharge"><Input value={f.defaultPortOfDischarge ?? ''} onChange={(e) => setF({ ...f, defaultPortOfDischarge: e.target.value })} placeholder="Tokyo (JPTYO)" /></Field>
                <Field label="Order / invoice currency"><Select value={f.defaultCurrency ?? 'USD'} onValueChange={(v) => setF({ ...f, defaultCurrency: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['USD', 'EUR', 'GBP', 'JPY', 'INR'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Exchange rate (₹ per unit)" hint="default on new orders / invoices"><Input type="number" step="0.01" value={f.fxRate ?? 83} onChange={(e) => setF({ ...f, fxRate: +e.target.value })} /></Field>
                <Field label="IGST % on export invoice" hint="0 = under LUT"><Input type="number" step="0.5" value={f.igstPct ?? 5} onChange={(e) => setF({ ...f, igstPct: +e.target.value })} /></Field>
              </div>
            </Section>
            <Section title="Format numbers" sub="The client's document format numbers — printed in the header of each generated document">
              <div className="grid gap-3 sm:grid-cols-2">{FORMAT_LABELS.map(([k, l]) => <Field key={k} label={l}><Input className="h-8" value={f.formatNos?.[k] ?? ''} onChange={(e) => setF({ ...f, formatNos: { ...(f.formatNos ?? {}), [k]: e.target.value } })} placeholder="AFN/00" /></Field>)}</div>
            </Section>
            <Section title="Buyer tracking portal" sub="Read-only links buyers open without logging in">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Portal base URL" hint="links become <base>/track/CODE — empty = this frontend"><Input value={f.portalBaseUrl ?? ''} placeholder={window.location.origin} onChange={(e) => setF({ ...f, portalBaseUrl: e.target.value })} /></Field>
                <Field label="Link validity (days)"><Input type="number" value={f.portalDefaultDays ?? 90} onChange={(e) => setF({ ...f, portalDefaultDays: +e.target.value })} /></Field>
              </div>
            </Section>
          </div>
        )}

        {tab === 'forms' && <FormFieldsTab value={f.formFields ?? {}} onChange={(formFields) => setF({ ...f, formFields })} overrides={f.fieldOverrides ?? {}} onOverrides={(fieldOverrides) => setF({ ...f, fieldOverrides })} canEdit={canEdit} />}
      </fieldset>
    </div>
  );
}

const Section = ({ title, sub, icon: Icon, className, children }: { title: string; sub?: string; icon?: React.ComponentType<{ size?: number; className?: string }>; className?: string; children: React.ReactNode }) => (
  <Card className={className}>
    <div className="flex items-start gap-3 border-b px-5 py-3.5">
      {Icon && <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><Icon size={16} /></span>}
      <div><div className="font-slab text-[14.5px] font-bold">{title}</div>{sub && <div className="text-[11.5px] text-muted-foreground">{sub}</div>}</div>
    </div>
    <CardContent className="pt-4">{children}</CardContent>
  </Card>
);

/* ---------- Form Fields: built-in fields (rename, placeholder, help, required, hide) + extra inputs for every form ---------- */
const GROUP_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = { Merchandising: Building, Materials: Stock, Production: Production, Quality: Quality, Outward: Ship, System: Key };
const TYPE_LABEL: Record<string, string> = Object.fromEntries([...FIELD_TYPES.map(([v, l]) => [v, l]), ['list', 'Grid / list'], ['file', 'File']]);
const keyOf = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

function FormFieldsTab({ value, onChange, overrides, onOverrides, canEdit }: { value: Record<string, FormField[]>; onChange: (v: Record<string, FormField[]>) => void; overrides: Overrides; onOverrides: (v: Overrides) => void; canEdit: boolean }) {
  const forms = useQuery<{ forms: FormDef[] }>({ queryKey: ['/settings/forms'], queryFn: async () => (await api.get('/settings/forms')).data, staleTime: Infinity });
  const list = forms.data?.forms ?? [];
  const [sel, setSel] = React.useState('samples');
  const [preview, setPreview] = React.useState<CustomValues>({});
  const [showBuiltin, setShowBuiltin] = React.useState(true);
  const [editing, setEditing] = React.useState<string | null>(null);   // built-in key being edited
  const fields = value[sel] ?? [];
  const setFields = (next: FormField[]) => onChange({ ...value, [sel]: next });
  const upd = (i: number, p: Partial<FormField>) => setFields(fields.map((x, n) => (n === i ? { ...x, ...p } : x)));
  const move = (i: number, d: number) => { const a = [...fields]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setFields(a); };
  const groups = [...new Set(list.map((x) => x.group))];
  const def = list.find((x) => x.key === sel);
  const builtin = def?.fields ?? [];
  const ovs = overrides[sel] ?? {};
  const setOv = (key: string, p: Partial<Override> | null) => {
    const next: Record<string, Override> = { ...ovs };
    if (p === null) delete next[key]; else { const merged: Override = { ...(next[key] ?? {}), ...p }; if (merged.type === 'text') { delete merged.type; delete merged.options; } if (merged.type !== 'select') delete merged.options; (Object.keys(merged) as (keyof Override)[]).forEach((k) => { if (merged[k] === undefined || merged[k] === '' || merged[k] === false) delete merged[k]; }); if (Object.keys(merged).length) next[key] = merged; else delete next[key]; }
    const all = { ...overrides, [sel]: next }; if (!Object.keys(next).length) delete all[sel];
    onOverrides(all);
  };
  const totalFor = (k: string) => (value[k]?.length ?? 0) + Object.keys(overrides[k] ?? {}).length;
  const invalid = fields.filter((x) => !x.label.trim() || (NEEDS_OPTIONS.includes(x.type) && !(x.options ?? []).some(Boolean))).length;
  const changed = Object.keys(ovs).length;

  return (
    <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
      {/* ---- form picker ---- */}
      <Card className="self-start overflow-hidden">
        <div className="border-b bg-gradient-to-br from-ink to-[#2e2837] px-4 py-3.5 text-white">
          <div className="font-slab text-[15px] font-bold">Forms</div>
          <div className="text-[11.5px] text-white/60">{list.length} forms · {Object.values(value).reduce((a, l) => a + (l?.length ?? 0), 0)} extra fields · {Object.values(overrides).reduce((a, m) => a + Object.keys(m ?? {}).length, 0)} built-in edits</div>
        </div>
        <div className="max-h-[72vh] overflow-y-auto">
          {groups.map((g) => { const GIcon = GROUP_ICON[g] ?? Note; const items = list.filter((x) => x.group === g); const n = items.reduce((a, x) => a + totalFor(x.key), 0); return (
            <div key={g} className="border-b last:border-0">
              <div className="flex items-center gap-2 bg-secondary/80 px-4 py-2">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-brand text-white"><GIcon size={13} /></span>
                <span className="font-slab text-[12.5px] font-bold uppercase tracking-wide">{g}</span>
                <span className="ml-auto flex items-center gap-1.5 text-[10.5px] font-semibold text-muted-foreground">{items.length} form{items.length > 1 ? 's' : ''}{n > 0 && <span className="rounded-full bg-teal-soft px-1.5 py-0.5 text-[10px] font-bold text-teal">+{n}</span>}</span>
              </div>
              <div className="py-1">
                {items.map((x) => { const on = sel === x.key; return (
                  <button key={x.key} onClick={() => { setSel(x.key); setPreview({}); setEditing(null); }} className={cn('group flex w-full items-center gap-2.5 py-2 pl-5 pr-3 text-left text-[13px] transition-colors', on ? 'bg-brand-soft font-semibold text-brand' : 'text-foreground/85 hover:bg-secondary')}>
                    <span className={cn('h-4 w-0.5 shrink-0 rounded-full', on ? 'bg-brand' : 'bg-border group-hover:bg-muted-foreground/50')} />
                    <span className="min-w-0 flex-1 truncate">{x.label}</span>
                    <span className="text-[10px] text-muted-foreground">{x.fields.length}</span>
                    {totalFor(x.key) > 0 && <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold', on ? 'bg-brand text-white' : 'bg-teal-soft text-teal')}>+{totalFor(x.key)}</span>}
                    <ChevronDown size={13} className={cn('-rotate-90 shrink-0', on ? 'text-brand' : 'text-transparent group-hover:text-muted-foreground')} />
                  </button>); })}
              </div>
            </div>); })}
        </div>
      </Card>

      {/* ---- editor ---- */}
      <div className="space-y-5">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div className="flex items-center gap-3">
              {def && <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">{React.createElement(GROUP_ICON[def.group] ?? Note, { size: 18 })}</span>}
              <div>
                <div className="font-slab text-[16px] font-bold">{def?.label ?? sel}</div>
                <div className="text-[11.5px] text-muted-foreground">Shown on <b>{def?.page}</b> · <b>{builtin.length}</b> built-in field{builtin.length === 1 ? '' : 's'}{changed ? <> (<b>{changed}</b> edited)</> : null} · <b>{fields.length}</b> extra</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowBuiltin(!showBuiltin)} className="rounded-md border bg-secondary px-2.5 py-1.5 text-[11.5px] font-semibold text-muted-foreground hover:text-foreground">{showBuiltin ? 'Hide' : 'Show'} built-in fields</button>
              {canEdit && <Button size="sm" onClick={() => setFields([...fields, { label: '', type: 'text', required: false }])}><Plus size={14} /> Add field</Button>}
            </div>
          </div>

          {showBuiltin && (
            <div className="border-b bg-secondary/40 px-5 py-4">
              <div className="mb-2.5 flex flex-wrap items-center gap-2"><Shield size={14} className="text-muted-foreground" /><span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Built-in fields</span><span className="text-[11px] text-muted-foreground">— Edit to rename, change how a text field is shown, add a placeholder or help text, or make it required · Remove takes it off the form (Restore brings it back). Locked fields drive system logic and always stay.</span></div>
              <div className="divide-y rounded-xl border bg-card">
                {builtin.map((b, i) => <BuiltinRow key={b.key} n={i + 1} b={b} ov={ovs[b.key]} open={editing === b.key} onOpen={() => setEditing(editing === b.key ? null : b.key)} onChange={(p) => setOv(b.key, p)} canEdit={canEdit} />)}
              </div>
            </div>)}

          <div className="px-5 pb-1 pt-4"><div className="flex items-center gap-2"><Plus size={14} className="text-brand" /><span className="text-[11px] font-bold uppercase tracking-wider text-brand">Extra fields</span><span className="text-[11px] text-muted-foreground">— added by you, shown in an “Additional details” block · {FIELD_TYPES.length} field types</span></div></div>
          {!fields.length ? <div className="mx-5 mb-5 mt-3 rounded-xl border-2 border-dashed px-5 py-8 text-center text-sm text-muted-foreground">No extra fields on this form yet. Click <b>Add field</b> to create one — label, type, options and whether it is required.</div>
          : <div className="space-y-3 p-5 pt-3">
            {fields.map((fd, i) => { const needsOpts = NEEDS_OPTIONS.includes(fd.type); const bad = !fd.label.trim() || (needsOpts && !(fd.options ?? []).some(Boolean)); return (
              <div key={i} className={cn('rounded-xl border bg-card p-4 shadow-card', bad && 'border-gold-vivid/60')}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-md bg-brand font-slab text-[11px] font-bold text-white">{builtin.length + i + 1}</span>
                  <span className="text-[13px] font-semibold">{fd.label.trim() || 'New field'}</span>
                  <Badge tone="plain" className="text-[10px]">{TYPE_LABEL[fd.type] ?? fd.type}</Badge>
                  {fd.key && <span className="font-mono text-[10.5px] text-muted-foreground">key {fd.key}</span>}
                  {fd.required && <Badge tone="warn" className="text-[10px]">required</Badge>}
                  <span className="ml-auto flex items-center gap-0.5">
                    <button type="button" title="Move up" onClick={() => move(i, -1)} disabled={i === 0} className="rounded-md border bg-secondary p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown size={13} className="rotate-180" /></button>
                    <button type="button" title="Move down" onClick={() => move(i, 1)} disabled={i === fields.length - 1} className="rounded-md border bg-secondary p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown size={13} /></button>
                    {canEdit && <Button type="button" variant="secondary" size="sm" className="ml-1 text-bad" title="Delete field" onClick={() => setFields(fields.filter((_, n) => n !== i))}><Trash size={13} /> Delete</Button>}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.3fr_170px_1.3fr_1fr_auto] xl:items-start">
                  <Field label="Label" hint={fd.key ? undefined : 'key is derived from the label'}><Input value={fd.label} onChange={(e) => upd(i, { label: e.target.value })} placeholder="e.g. Wash type" className={cn(!fd.label.trim() && 'border-gold-vivid/70')} /></Field>
                  <Field label="Type" hint={FIELD_TYPES.find(([v]) => v === fd.type)?.[2] || undefined}><select className={SEL} value={fd.type} onChange={(e) => upd(i, { type: e.target.value as FormField['type'] })}>{FIELD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                  {needsOpts
                    ? <Field label="Options" hint="comma separated"><Input value={(fd.options ?? []).join(', ')} onChange={(e) => upd(i, { options: e.target.value.split(',').map((x) => x.trim()) })} placeholder="Garment wash, Enzyme, Stone" className={cn(!(fd.options ?? []).some(Boolean) && 'border-gold-vivid/70')} /></Field>
                    : <Field label="Placeholder" hint="shown inside the empty input"><Input value={fd.placeholder ?? ''} onChange={(e) => upd(i, { placeholder: e.target.value })} /></Field>}
                  <Field label="Help text" hint="small note under the input"><Input value={fd.hint ?? ''} onChange={(e) => upd(i, { hint: e.target.value })} /></Field>
                  <label className="flex h-[38px] items-center gap-2 whitespace-nowrap rounded-md border bg-secondary px-2.5 text-[12.5px] xl:mt-6"><input type="checkbox" checked={!!fd.required} onChange={(e) => upd(i, { required: e.target.checked })} className="h-4 w-4 accent-brand" /> Required</label>
                </div>
              </div>); })}
          </div>}
          {(fields.length > 0 || changed > 0) && <div className="border-t bg-secondary/50 px-5 py-2.5 text-[11.5px] text-muted-foreground">{invalid ? <span className="font-semibold text-gold">{invalid} field{invalid > 1 ? 's' : ''} incomplete — give it a label (and options where needed). </span> : null}Use <b>Save Changes</b> at the top to apply. Deleting an extra field hides it from the form; values already stored on records are kept. Renaming an extra field's label changes its key, so treat it as a new field.</div>}
        </Card>

        {fields.some((x) => x.label.trim()) && (
          <Card>
            <div className="flex items-center gap-2 border-b px-5 py-3"><Eye size={15} className="text-brand" /><div><div className="font-slab text-[14.5px] font-bold">Preview</div><div className="text-[11.5px] text-muted-foreground">Exactly how the “Additional details” block will look on the {def?.label} form</div></div></div>
            <CardContent className="pt-4"><CustomFieldsGrid fields={fields.filter((x) => x.label.trim()).map((x) => ({ ...x, key: x.key || keyOf(x.label) }))} value={preview} onChange={setPreview} /></CardContent>
          </Card>)}
      </div>
    </div>
  );
}

function BuiltinRow({ n, b, ov, open, onOpen, onChange, canEdit }: { n: number; b: BuiltinField; ov?: Override; open: boolean; onOpen: () => void; onChange: (p: Partial<Override> | null) => void; canEdit: boolean }) {
  const edited = !!ov && Object.keys(ov).length > 0;
  const required = ov?.required ?? b.required;
  const hidden = !!ov?.hidden;
  const type = ov?.type ?? b.type;
  const canRetype = b.type === 'text' && !b.fixed;
  const lockTitle = b.required ? 'Needed by the system — cannot be removed or made optional' : undefined;
  return (
    <div className={cn(open && 'bg-brand-soft/30')}>
      <div className={cn('flex flex-wrap items-center gap-2 px-3 py-2 text-[12.5px]', hidden && 'opacity-60')}>
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-secondary font-mono text-[10px] font-bold text-muted-foreground">{n}</span>
        <span className="min-w-0 flex-1 truncate"><span className={cn('font-medium', hidden && 'line-through')}>{ov?.label || b.label}</span>{required && <span className="ml-0.5 text-bad">*</span>}{ov?.label && <span className="ml-1.5 text-[10.5px] text-muted-foreground">was “{b.label}”</span>}</span>
        <Badge tone="plain" className="shrink-0 text-[10px]">{TYPE_LABEL[type] ?? type}{ov?.type && <span className="ml-1 opacity-70">← {TYPE_LABEL[b.type] ?? b.type}</span>}</Badge>
        {b.fixed ? <Badge tone="mute" className="text-[10px]" title="Drawn by the system — not a plain input">system</Badge> : <>
          {b.required && <Badge tone="warn" className="text-[10px]" title={lockTitle}>locked</Badge>}
          {edited && !hidden && <Badge tone="ok" className="text-[10px]">edited</Badge>}
          {hidden && <Badge tone="bad" className="text-[10px]">removed</Badge>}
          {canEdit && <span className="flex items-center gap-1">
            <button type="button" onClick={onOpen} title={open ? 'Close editor' : 'Edit label, type, placeholder, help text, required'} className={cn('flex h-7 items-center gap-1 rounded-md border px-2 text-[11.5px] font-semibold transition-colors', open ? 'border-brand bg-brand text-white' : 'bg-secondary text-muted-foreground hover:text-foreground')}><Edit size={12} /> Edit</button>
            {hidden
              ? <button type="button" onClick={() => onChange({ hidden: false })} title="Put this field back on the form" className="flex h-7 items-center gap-1 rounded-md border border-teal/40 bg-teal-soft px-2 text-[11.5px] font-semibold text-teal"><Refresh size={12} /> Restore</button>
              : <button type="button" disabled={b.required} onClick={() => onChange({ hidden: true })} title={lockTitle ?? 'Remove this field from the form (values already saved are kept)'} className="flex h-7 items-center gap-1 rounded-md border bg-secondary px-2 text-[11.5px] font-semibold text-bad transition-colors hover:border-bad/40 hover:bg-bad-soft disabled:cursor-not-allowed disabled:opacity-35"><Trash size={12} /> Remove</button>}
          </span>}
        </>}
      </div>
      {open && !b.fixed && (
        <div className="space-y-3 border-t border-brand/15 bg-card px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Label" hint={`default: ${b.label}`}><Input value={ov?.label ?? ''} onChange={(e) => onChange({ label: e.target.value })} placeholder={b.label} /></Field>
            <Field label="Placeholder" hint="grey text inside the empty input"><Input value={ov?.placeholder ?? ''} onChange={(e) => onChange({ placeholder: e.target.value })} placeholder="e.g. DHL, FedEx…" /></Field>
            <Field label="Help text" hint="small note under the input"><Input value={ov?.hint ?? ''} onChange={(e) => onChange({ hint: e.target.value })} placeholder="e.g. as printed on the AWB" /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Field type" hint={canRetype ? 'plain text fields can be shown differently' : `fixed — a ${TYPE_LABEL[b.type] ?? b.type} field drives system logic`}>
              <select className={SEL} value={type} disabled={!canRetype} onChange={(e) => onChange({ type: e.target.value as Override['type'], options: e.target.value === 'select' ? ov?.options : undefined })}>
                {canRetype ? TEXT_DISPLAY.map(([v, l]) => <option key={v} value={v}>{l}</option>) : <option value={b.type}>{TYPE_LABEL[b.type] ?? b.type}</option>}
              </select></Field>
            {type === 'select' && canRetype && <Field label="Options" hint="comma separated — the form shows a dropdown of these" className="sm:col-span-2"><Input value={(ov?.options ?? []).join(', ')} onChange={(e) => onChange({ options: e.target.value.split(',').map((x) => x.trim()) })} placeholder="DHL Express, FedEx, Blue Dart" className={cn(!(ov?.options ?? []).some(Boolean) && 'border-gold-vivid/70')} /></Field>}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <label className={cn('flex h-9 items-center gap-2 whitespace-nowrap rounded-md border px-3 text-[12.5px]', b.required ? 'bg-secondary/60 text-muted-foreground' : 'bg-secondary')} title={lockTitle}><input type="checkbox" disabled={b.required} checked={required} onChange={(e) => onChange({ required: e.target.checked })} className="h-4 w-4 accent-brand" /> Required</label>
            <span className={cn('flex h-9 items-center gap-1.5 rounded-md border px-3 text-[12.5px]', hidden ? 'border-bad/40 bg-bad-soft text-bad' : 'bg-secondary text-muted-foreground')}>{hidden ? <EyeOff size={13} /> : <Eye size={13} />} {hidden ? 'Removed from form' : 'Visible on form'}</span>
            {edited && <button type="button" onClick={() => onChange(null)} className="flex h-9 items-center gap-1.5 rounded-md border bg-secondary px-3 text-[12.5px] text-muted-foreground hover:text-foreground" title="Reset to default"><Refresh size={13} /> Reset to default</button>}
            <span className="ml-auto flex items-center gap-1 text-[11px] text-teal"><Check size={13} /> applies when you click Save Changes</span>
          </div>
        </div>)}
    </div>
  );
}
