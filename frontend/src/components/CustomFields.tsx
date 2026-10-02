import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiMessage } from '@/lib/api';
import { toInputDate, uploadFile, openFile } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field } from '@/components/shared';
import { FormMetaCtx, keyOf, type FormMeta, type Override } from '@/components/form-meta';
import { Upload, Trash, Eye, FileIcon } from '@/icons/icons';

/* Admin-defined extra inputs (Settings → Form Fields). One hook per dialog: `const cf = useCustomFields('po', existing, resetKey)`,
   pass `meta={cf.meta}` to <DialogContent>, render `{cf.node}` inside the body, send `custom: cf.value`, disable Save while `!cf.ok`. */
export type FieldType = 'text' | 'textarea' | 'number' | 'money' | 'percent' | 'date' | 'datetime' | 'time' | 'select' | 'radio' | 'multiselect' | 'checkbox' | 'rating' | 'email' | 'phone' | 'url' | 'color' | 'file';
export type FormField = { key?: string; label: string; type: FieldType; options?: string[]; required?: boolean; placeholder?: string; hint?: string };
export type BuiltinField = { key: string; label: string; type: string; required: boolean; builtin: true; aliases: string[]; fixed: boolean };
export type FormDef = { key: string; label: string; group: string; page: string; fields: BuiltinField[] };
export type Overrides = Record<string, Record<string, Override>>;
export const FIELD_TYPES: [FieldType, string, string][] = [
  ['text', 'Short text', 'one line'], ['textarea', 'Long text', 'multi-line notes'], ['number', 'Number', 'plain number'], ['money', 'Amount (₹)', 'currency, 2 decimals'], ['percent', 'Percent', '0 – 100'],
  ['date', 'Date', ''], ['datetime', 'Date & time', ''], ['time', 'Time', 'HH:MM'], ['select', 'Dropdown', 'pick one'], ['radio', 'Choice buttons', 'pick one, all visible'], ['multiselect', 'Multi-select', 'tick several'],
  ['checkbox', 'Yes / No', 'single tick'], ['rating', 'Rating', '0 – 5 stars'], ['email', 'E-mail', 'validated'], ['phone', 'Phone', 'validated'], ['url', 'Web link', 'http(s)://'], ['color', 'Colour', 'swatch + hex'], ['file', 'File upload', 'PDF, image, sheet'],
];
export const NEEDS_OPTIONS: FieldType[] = ['select', 'radio', 'multiselect'];
export type CustomValues = Record<string, unknown>;
type Company = { formFields?: Record<string, FormField[]>; fieldOverrides?: Overrides };

const useCompany = (enabled = true) => useQuery<Company>({ queryKey: ['/settings/company'], queryFn: async () => (await api.get('/settings/company')).data, enabled, staleTime: 60_000 });
export function useFormFields(form: string, enabled = true): FormField[] {
  const q = useCompany(enabled);
  return React.useMemo(() => q.data?.formFields?.[form] ?? [], [q.data, form]);
}
export const isEmpty = (f: FormField, v: unknown) => (f.type === 'checkbox' ? !v : v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length));
export const missingRequired = (fields: FormField[], value: CustomValues) => fields.filter((f) => f.required && isEmpty(f, value[f.key!])).map((f) => f.label);
export const formatCustom = (f: FormField, v: unknown): string => {
  if (v === undefined || v === null || v === '') return '';
  switch (f.type) {
    case 'checkbox': return v ? 'Yes' : 'No';
    case 'date': return new Date(String(v)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    case 'datetime': return new Date(String(v)).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    case 'money': return `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'percent': return `${v}%`;
    case 'rating': return `${v} / 5`;
    case 'multiselect': return Array.isArray(v) ? v.join(', ') : String(v);
    case 'file': return typeof v === 'object' && v ? String((v as { name?: string }).name || 'file') : String(v);
    default: return String(v);
  }
};

const TA = 'w-full rounded-md border border-input bg-secondary px-3 py-2 text-sm outline-none focus-visible:border-brand focus-visible:bg-card';
const chip = (on: boolean) => cn('rounded-md border px-2.5 py-1.5 text-[12px] font-semibold transition-colors', on ? 'border-brand bg-brand text-white' : 'border-border bg-secondary text-muted-foreground hover:border-brand/60 hover:text-foreground');

function FileInput({ value, onChange, miss }: { value?: { id: string; name: string; size?: number }; onChange: (v: unknown) => void; miss?: boolean }) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const pick = async (file?: File) => { if (!file) return; setBusy(true); try { const r = await uploadFile(file, 'custom'); onChange({ id: r.id, name: r.name, size: r.size }); } catch (e) { toast.error(apiMessage(e)); } finally { setBusy(false); } };
  return (
    <div className={cn('flex h-[38px] items-center gap-2 rounded-md border bg-secondary px-2 text-[12.5px]', miss && 'border-gold-vivid/70')}>
      <input ref={ref} type="file" hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      {value?.id ? <><FileIcon size={14} className="shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate" title={value.name}>{value.name || 'file'}</span>
        <button type="button" title="Open" onClick={() => openFile(value.id, value.name || 'file')} className="rounded p-1 hover:bg-card"><Eye size={13} /></button>
        <button type="button" title="Remove" onClick={() => onChange(undefined)} className="rounded p-1 text-bad hover:bg-card"><Trash size={13} /></button></>
        : <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="flex flex-1 items-center gap-2 text-muted-foreground hover:text-foreground"><Upload size={14} /> {busy ? 'Uploading…' : 'Choose file'}</button>}
    </div>
  );
}

export function CustomFieldsGrid({ fields, value, onChange, cols = 3, disabled }: { fields: FormField[]; value: CustomValues; onChange: (v: CustomValues) => void; cols?: 2 | 3 | 4; disabled?: boolean }) {
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });
  const span = cols === 2 ? 'sm:col-span-2' : cols === 4 ? 'sm:col-span-4' : 'sm:col-span-3';
  return (
    <fieldset disabled={disabled} className={cn('grid gap-4', cols === 2 ? 'sm:grid-cols-2' : cols === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3')}>
      {fields.map((fd) => {
        const k = fd.key!; const v = value[k]; const label = fd.required ? `${fd.label} *` : fd.label; const miss = fd.required && isEmpty(fd, v); const err = miss && 'border-gold-vivid/70';
        const opts = fd.options ?? [];
        switch (fd.type) {
          case 'checkbox': return <Field key={k} label={label} hint={fd.hint}><label className={cn('flex h-[38px] items-center gap-2 rounded-md border bg-secondary px-3 text-[13px]', err)}><input type="checkbox" checked={!!v} onChange={(e) => set(k, e.target.checked)} className="h-4 w-4 accent-brand" /> {fd.placeholder || 'Yes'}</label></Field>;
          case 'select': return <Field key={k} label={label} hint={fd.hint}><Select value={(v as string) || undefined} onValueChange={(x) => set(k, x)}><SelectTrigger className={cn(err)}><SelectValue placeholder={fd.placeholder || 'Select'} /></SelectTrigger><SelectContent>{opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></Field>;
          case 'radio': return <Field key={k} label={label} hint={fd.hint} className={opts.length > 3 ? span : undefined}><div className={cn('flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-md border border-transparent', err)}>{opts.map((o) => <button key={o} type="button" onClick={() => set(k, v === o ? undefined : o)} className={chip(v === o)}>{o}</button>)}</div></Field>;
          case 'multiselect': { const arr = Array.isArray(v) ? (v as string[]) : []; return <Field key={k} label={label} hint={fd.hint} className={opts.length > 3 ? span : undefined}><div className={cn('flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-md border border-transparent', err)}>{opts.map((o) => <button key={o} type="button" onClick={() => set(k, arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o])} className={chip(arr.includes(o))}>{o}</button>)}</div></Field>; }
          case 'textarea': return <Field key={k} label={label} hint={fd.hint} className={span}><textarea rows={3} value={(v as string) ?? ''} onChange={(e) => set(k, e.target.value)} placeholder={fd.placeholder} className={cn(TA, err)} /></Field>;
          case 'rating': return <Field key={k} label={label} hint={fd.hint}><div className={cn('flex h-[38px] items-center gap-1 rounded-md border bg-secondary px-2', err)}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" onClick={() => set(k, v === n ? 0 : n)} className={cn('text-[20px] leading-none transition-colors', Number(v) >= n ? 'text-gold-vivid' : 'text-border hover:text-gold')} aria-label={`${n} star`}>★</button>)}<span className="ml-auto text-[11px] text-muted-foreground">{Number(v) || 0} / 5</span></div></Field>;
          case 'money': return <Field key={k} label={label} hint={fd.hint}><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">₹</span><Input type="number" step="0.01" min={0} value={(v as number) ?? ''} onChange={(e) => set(k, e.target.value)} placeholder={fd.placeholder || '0.00'} className={cn('pl-7', err)} /></div></Field>;
          case 'percent': return <Field key={k} label={label} hint={fd.hint}><div className="relative"><Input type="number" step="0.1" min={0} max={100} value={(v as number) ?? ''} onChange={(e) => set(k, e.target.value)} placeholder={fd.placeholder || '0'} className={cn('pr-8', err)} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">%</span></div></Field>;
          case 'color': return <Field key={k} label={label} hint={fd.hint}><div className="flex items-center gap-2"><input type="color" value={(v as string) || '#8ba9c9'} onChange={(e) => set(k, e.target.value)} className="h-[38px] w-14 cursor-pointer rounded-md border bg-secondary p-1" /><Input value={(v as string) ?? ''} onChange={(e) => set(k, e.target.value)} placeholder="#a05aff" className={cn('font-mono', err)} /></div></Field>;
          case 'file': return <Field key={k} label={label} hint={fd.hint}><FileInput value={v as { id: string; name: string } | undefined} onChange={(x) => set(k, x)} miss={miss} /></Field>;
          case 'datetime': return <Field key={k} label={label} hint={fd.hint}><Input type="datetime-local" value={v ? new Date(String(v)).toISOString().slice(0, 16) : ''} onChange={(e) => set(k, e.target.value)} className={cn(err)} /></Field>;
          default: {
            const type = fd.type === 'number' ? 'number' : fd.type === 'date' ? 'date' : fd.type === 'time' ? 'time' : fd.type === 'email' ? 'email' : fd.type === 'phone' ? 'tel' : fd.type === 'url' ? 'url' : 'text';
            return <Field key={k} label={label} hint={fd.hint}><Input type={type} value={fd.type === 'date' ? toInputDate(v as string) : ((v as string | number) ?? '')} onChange={(e) => set(k, e.target.value)} placeholder={fd.placeholder || (fd.type === 'url' ? 'https://' : fd.type === 'email' ? 'name@company.com' : fd.type === 'phone' ? '+91 98xxx xxxxx' : undefined)} className={cn(err)} /></Field>;
          }
        }
      })}
    </fieldset>
  );
}

/** Section wrapper used inside dialogs. */
export function CustomFieldsSection({ fields, value, onChange, cols, title = 'Additional details' }: { fields: FormField[]; value: CustomValues; onChange: (v: CustomValues) => void; cols?: 2 | 3 | 4; title?: string }) {
  if (!fields.length) return null;
  return (
    <div className="mt-5 border-t pt-4">
      <div className="mb-3 flex items-center gap-2"><span className="h-5 w-1 rounded-full bg-brand" /><div><div className="text-[13px] font-semibold">{title}</div><div className="text-[11px] text-muted-foreground">Extra fields configured in Settings → Form Fields</div></div></div>
      <CustomFieldsGrid fields={fields} value={value} onChange={onChange} cols={cols} />
    </div>
  );
}

/** Overrides for the built-in fields of a form, keyed by every label they can appear under (key + aliases). */
export function useFieldOverrides(form: string, enabled = true): Record<string, Override> {
  const company = useCompany(enabled);
  const forms = useQuery<{ forms: FormDef[] }>({ queryKey: ['/settings/forms'], queryFn: async () => (await api.get('/settings/forms')).data, staleTime: Infinity, enabled });
  return React.useMemo(() => {
    const ov = company.data?.fieldOverrides?.[form]; if (!ov) return {};
    const def = forms.data?.forms.find((f) => f.key === form);
    const map: Record<string, Override> = {};
    for (const [key, o] of Object.entries(ov)) { map[key] = o; def?.fields.find((f) => f.key === key)?.aliases.forEach((a) => { map[a] = o; }); }
    return map;
  }, [company.data, forms.data, form]);
}

/**
 * @param form      form key from the Settings registry (e.g. 'po')
 * @param initial   values already stored on the record being edited (null for a new one)
 * @param resetKey  primitive or stable object that changes when the dialog (re)opens — the values reset to `initial` then
 */
export function useCustomFields(form: string, initial?: CustomValues | null, resetKey?: unknown, cols?: 2 | 3 | 4) {
  const fields = useFormFields(form);
  const overrides = useFieldOverrides(form);
  const [value, setValue] = React.useState<CustomValues>(initial ?? {});
  React.useEffect(() => { setValue(initial ?? {}); }, [resetKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [builtinMissing, setBuiltinMissing] = React.useState<string[]>([]);
  const missingRef = React.useRef(new Set<string>());
  const meta = React.useMemo<FormMeta>(() => ({
    form,
    lookup: (label) => overrides[keyOf(label)],
    report: (key, missing) => {
      const had = missingRef.current.has(key); if (had === missing) return;
      if (missing) missingRef.current.add(key); else missingRef.current.delete(key);
      setBuiltinMissing([...missingRef.current]);
    },
  }), [form, overrides]);
  const missing = [...missingRequired(fields, value), ...builtinMissing.map((k) => overrides[k]?.label || k.replace(/_/g, ' '))];
  const node = <CustomFieldsSection fields={fields} value={value} onChange={setValue} cols={cols} />;
  return { fields, value, setValue, missing, ok: missing.length === 0, node, meta };
}

/** Wrap a non-dialog form (e.g. the Gate Entry card) so its <Field>s pick up the overrides. */
export const FormMetaProvider = ({ meta, children }: { meta: FormMeta; children: React.ReactNode }) => <FormMetaCtx.Provider value={meta}>{children}</FormMetaCtx.Provider>;

/** Read-only rendering of stored values (detail views, print sheets). */
export function CustomValuesList({ form, value, className }: { form: string; value?: CustomValues | null; className?: string }) {
  const fields = useFormFields(form);
  const rows = fields.filter((f) => !isEmpty(f, value?.[f.key!]));
  if (!rows.length) return null;
  return <dl className={cn('grid gap-x-4 gap-y-1.5 text-[12.5px] sm:grid-cols-2', className)}>{rows.map((f) => <div key={f.key} className="flex justify-between gap-3 border-b border-dashed py-1"><dt className="text-muted-foreground">{f.label}</dt><dd className="text-right font-medium">{formatCustom(f, value![f.key!])}</dd></div>)}</dl>;
}
