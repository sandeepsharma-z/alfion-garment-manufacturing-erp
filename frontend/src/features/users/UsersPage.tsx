import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiMessage } from '@/lib/api';
import type { User } from '@/features/auth/AuthProvider';
import { initials, timeAgo, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge, Skeleton, Table, THead, TBody, Tr, Th, Td } from '@/components/ui/misc';
import UserDialog, { type Meta } from './UserDialog';
import { Plus, Edit, Power, Search, UsersIcon, Check, Clock, Alert } from '@/icons/icons';

const KpiTile = ({ icon: Icon, label, value, tone }: { icon: typeof UsersIcon; label: string; value: number; tone: string }) => (
  <Card className="p-4">
    <div className="flex items-center gap-3">
      <div className={cn('grid h-10 w-10 place-items-center rounded-lg', tone)}><Icon size={19} /></div>
      <div>
        <div className="num font-slab text-2xl font-bold leading-none">{value}</div>
        <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      </div>
    </div>
  </Card>
);

export default function UsersPage() {
  const qc = useQueryClient();
  const [q, setQ] = React.useState('');
  const [chip, setChip] = React.useState('All');
  const [editing, setEditing] = React.useState<User | null | 'new'>(null);

  const { data: meta } = useQuery<Meta>({ queryKey: ['users-meta'], queryFn: async () => (await api.get('/users/meta')).data });
  const { data, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users?size=100')).data as { items: User[] },
  });

  const toggle = useMutation({
    mutationFn: async (u: User) => (await api.post(`/users/${u.id}/toggle-status`)).data,
    onSuccess: (u) => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success(`${u.name} is now ${u.status}`); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const users = (data?.items ?? []).filter((u) => {
    const text = `${u.name} ${u.uid} ${u.role}`.toLowerCase();
    if (q && !text.includes(q.toLowerCase())) return false;
    if (chip !== 'All' && u.status !== chip && u.role !== chip) return false;
    return true;
  });
  const all = data?.items ?? [];

  return (
    <div className="space-y-5 animate-rise">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="font-slab text-[22px] font-bold">Users &amp; Roles</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Create users, set their ID and password, and tick exactly which modules each one can see
          </p>
        </div>
        <div className="ml-auto">
          <Button onClick={() => setEditing('new')}><Plus size={17} /> Add User</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={UsersIcon} label="Total Users" value={all.length} tone="bg-brand-soft text-brand dark:bg-accent" />
        <KpiTile icon={Check} label="Active" value={all.filter((u) => u.status === 'Active').length} tone="bg-teal-soft text-teal dark:bg-teal/15" />
        <KpiTile icon={Clock} label="Invited" value={all.filter((u) => u.status === 'Invited').length} tone="bg-gold-soft text-gold dark:bg-gold-vivid/15 dark:text-gold-vivid" />
        <KpiTile icon={Alert} label="Disabled" value={all.filter((u) => u.status === 'Disabled').length} tone="bg-bad-soft text-bad dark:bg-bad/15" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2.5 border-b px-4 py-3">
          <div className="flex h-9 min-w-56 items-center gap-2 rounded-lg border bg-secondary px-3">
            <Search size={15} className="text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, ID or role…"
              className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground" />
          </div>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {['All', 'Active', 'Invited', 'Disabled', 'Admin'].map((c) => (
              <button key={c} onClick={() => setChip(c)}
                className={cn('h-9 rounded-lg border px-3 text-xs font-semibold transition-colors',
                  chip === c ? 'border-brand/40 bg-brand-soft text-brand dark:bg-accent' : 'text-muted-foreground hover:border-brand/40 hover:text-foreground')}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3 p-5">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : error ? (
          <div className="flex items-center gap-3 p-6 text-sm text-bad"><Alert size={18} /> {apiMessage(error)}</div>
        ) : (
          <Table>
            <THead>
              <Tr className="hover:bg-transparent">
                <Th>User</Th><Th>Login ID</Th><Th>Role</Th><Th>Module Access</Th>
                <Th>Last Login</Th><Th>Status</Th><Th className="text-right">Actions</Th>
              </Tr>
            </THead>
            <TBody>
              {users.map((u) => (
                <Tr key={u.id} className={u.status === 'Disabled' ? 'opacity-50' : ''}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-[11px] font-bold text-primary-foreground">
                        {initials(u.name)}
                      </div>
                      <div>
                        <div className="font-semibold">{u.name}</div>
                        <div className="text-[11px] text-muted-foreground">{u.uid}@afionintl.com</div>
                      </div>
                    </div>
                  </Td>
                  <Td className="font-mono text-[12.5px] font-semibold">{u.uid}</Td>
                  <Td><Badge tone="plain" className="bg-secondary">{u.role}</Badge></Td>
                  <Td>
                    {u.modules[0] === '*' ? (
                      <Badge tone="warn">All modules</Badge>
                    ) : (
                      <span title={u.modules.join(' · ')}>
                        <Badge tone="info">{u.modules.length} modules</Badge>
                      </span>
                    )}
                  </Td>
                  <Td className="text-xs text-muted-foreground">{timeAgo(u.lastLoginAt)}</Td>
                  <Td>
                    <Badge tone={u.status === 'Active' ? 'ok' : u.status === 'Invited' ? 'warn' : 'mute'}>{u.status}</Badge>
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      <Button variant="secondary" size="sm" onClick={() => setEditing(u)}><Edit size={14} /> Edit</Button>
                      <Button variant={u.status === 'Disabled' ? 'secondary' : 'destructive'} size="sm"
                        disabled={toggle.isPending} onClick={() => toggle.mutate(u)}>
                        <Power size={14} /> {u.status === 'Disabled' ? 'Enable' : 'Disable'}
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
              {!users.length && (
                <Tr><Td colSpan={7} className="py-10 text-center text-muted-foreground">No users match this filter</Td></Tr>
              )}
            </TBody>
          </Table>
        )}
      </Card>

      {/* role templates */}
      {meta && (
        <Card className="p-5">
          <h3 className="font-slab text-[15px] font-bold">Role Templates</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Selecting a role pre-fills module access — it can still be adjusted per user</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(meta.roleTemplates).filter(([r]) => r !== 'Custom').map(([role, mods]) => (
              <div key={role} className="rounded-xl border bg-secondary p-3.5">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-bold">{role}</div>
                  <Badge tone="plain" className="text-[10px]">{all.filter((u) => u.role === role).length} users</Badge>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {mods[0] === '*' ? <Badge tone="warn" className="text-[10px]">Full access</Badge>
                    : mods.map((m) => <Badge key={m} tone="plain" className="bg-card text-[10px]">{m}</Badge>)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <UserDialog
        open={editing !== null}
        user={editing === 'new' ? null : editing}
        meta={meta}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
