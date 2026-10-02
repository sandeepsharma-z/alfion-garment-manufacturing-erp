import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiMessage } from '@/lib/api';
import type { User } from '@/features/auth/AuthProvider';
import { cn } from '@/lib/utils';
import { flatNav } from '@/app/nav';
import { useCustomFields } from '@/components/CustomFields';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/shared';
import { Input } from '@/components/ui/input';
import { Label, Checkbox } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Check, Key } from '@/icons/icons';

export type Meta = { modules: string[]; roleTemplates: Record<string, string[]>; flags?: { key: string; label: string }[] };

const label = (key: string) => flatNav.find((n) => n.key === key)?.label ?? key;

export default function UserDialog({ open, user, meta, onClose }: {
  open: boolean; user: User | null; meta?: Meta; onClose: () => void;
}) {
  const qc = useQueryClient();
  const isNew = !user;
  const [form, setForm] = React.useState({ name: '', uid: '', password: '', role: 'Custom', status: 'Active', email: '', phone: '' });
  const [mods, setMods] = React.useState<Set<string>>(new Set());
  const [flags, setFlags] = React.useState<Set<string>>(new Set());
  const cf = useCustomFields('users', user?.custom ?? null, open ? (user?.id ?? 'new') : 'closed');

  React.useEffect(() => {
    if (!open) return;
    if (user) {
      setForm({ name: user.name, uid: user.uid, password: '', role: user.role, status: user.status, email: user.email || '', phone: user.phone || '' });
      setMods(new Set(user.modules[0] === '*' ? meta?.modules ?? [] : user.modules));
      setFlags(new Set(user.flags || []));
    } else {
      setForm({ name: '', uid: '', password: '', role: 'Custom', status: 'Active', email: '', phone: '' });
      setMods(new Set());
      setFlags(new Set());
    }
  }, [open, user, meta]);

  const applyRole = (role: string) => {
    const t = meta?.roleTemplates[role] ?? [];
    setForm((f) => ({ ...f, role }));
    setMods(new Set(t[0] === '*' ? meta?.modules ?? [] : t));
  };

  const genPassword = () => {
    const pw = 'Afion@' + Math.floor(1000 + Math.random() * 9000);
    setForm((f) => ({ ...f, password: pw }));
    toast.info(`Password generated: ${pw} — share it with the user`);
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, modules: [...mods], flags: [...flags], custom: cf.value };
      if (isNew) return (await api.post('/users', payload)).data;
      const body: Record<string, unknown> = { ...payload };
      if (!form.password) delete body.password;
      return (await api.patch(`/users/${user!.id}`, body)).data;
    },
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success(isNew ? `User created · ID: ${u.uid}` : `${u.name} updated`);
      onClose();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const toggleMod = (key: string) => {
    const next = new Set(mods);
    if (next.has(key)) next.delete(key); else next.add(key);
    setMods(next);
    if (form.role !== 'Custom' && form.role !== 'Admin') setForm((f) => ({ ...f, role: f.role }));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide meta={cf.meta}>
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add New User' : `Edit User — ${user?.name}`}</DialogTitle>
          <DialogDescription>Set the ID and password, pick a role, and tick the modules this user should see</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full Name">
              <Input placeholder="e.g. Rakesh Sharma" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="User ID (login)">
              <Input placeholder="e.g. rakesh" value={form.uid} readOnly={!isNew}
                onChange={(e) => setForm({ ...form, uid: e.target.value.toLowerCase() })} />
            </Field>
            <Field label="Password">
              <div className="flex gap-2">
                <Input placeholder={isNew ? 'Minimum 6 characters' : 'Leave blank to keep current'}
                  value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <Button type="button" variant="secondary" size="sm" className="h-[38px]" onClick={genPassword}>
                  <Key size={14} /> Generate
                </Button>
              </div>
            </Field>
            <Field label="Role">
              <Select value={form.role} onValueChange={applyRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(meta?.roleTemplates ?? {}).map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Active', 'Invited', 'Disabled'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Phone (optional)">
              <Input placeholder="+91 98xxx xxxxx" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
          </div>

          <div>
            <Label>Module Access — the screens this user will see</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(meta?.modules ?? []).map((m) => {
                const on = mods.has(m);
                return (
                  <div key={m} role="checkbox" aria-checked={on} tabIndex={0}
                    onClick={() => toggleMod(m)}
                    onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), toggleMod(m))}
                    className={cn(
                      'flex cursor-pointer select-none items-center gap-2.5 rounded-lg border px-3 py-2 text-[12.5px] font-semibold transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      on ? 'border-brand/40 bg-brand-soft text-brand dark:bg-accent' : 'bg-secondary text-foreground hover:border-brand/40',
                    )}>
                    <Checkbox checked={on} className="pointer-events-none" tabIndex={-1} />
                    {label(m)}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Changing the role resets the ticks to its template — you can still adjust them manually. Admin = every module.
            </p>
          </div>

          {form.role !== 'Admin' && (meta?.flags?.length ?? 0) > 0 && (
            <div>
              <Label>Confidential Access — extra permissions beyond modules</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {meta!.flags!.map((f) => {
                  const on = flags.has(f.key);
                  return (
                    <div key={f.key} role="checkbox" aria-checked={on} tabIndex={0}
                      onClick={() => { const n = new Set(flags); n.has(f.key) ? n.delete(f.key) : n.add(f.key); setFlags(n); }}
                      className={cn(
                        'flex cursor-pointer select-none items-center gap-2.5 rounded-lg border px-3 py-2 text-[12.5px] font-semibold transition-colors',
                        on ? 'border-teal/40 bg-teal-soft text-teal dark:bg-teal/15' : 'bg-secondary text-foreground hover:border-teal/40',
                      )}>
                      <Checkbox checked={on} className="pointer-events-none data-[state=checked]:bg-teal data-[state=checked]:border-teal" tabIndex={-1} />
                      <span><span className="block">{f.label}</span><span className="font-mono text-[10px] font-normal text-muted-foreground">{f.key}</span></span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Buyer and vendor identities stay hidden (alias only) unless the matching flag is ticked. Admins always see everything.</p>
            </div>
          )}
          {cf.node}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={save.isPending || !cf.ok} onClick={() => save.mutate()}>
            <Check size={16} /> {save.isPending ? 'Saving…' : isNew ? 'Create User' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
