import * as React from 'react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { fmtDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge, Skeleton } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, Plus, Power, Check } from '@/icons/icons';

type Code = { id: string; token: string; url: string; kind: string; orderNo: string; buyerAlias: string; label: string; hasPin: boolean; secretLabel?: string; detail?: string; expiresAt?: string; status: string; viewCount: number; lastViewedAt?: string; createdBy: string; createdAt: string;
  views: { at: string; ip: string; ua: string; ok: boolean }[] };

/** Share-with-buyer card (FR-22.1/6): issue a code (+ optional PIN, expiry), copy the link, revoke, access log. */
export function ShareTracking({ orderId, buyerId, title, detail: detailDefault = 'stages' }: { orderId?: string; buyerId?: string; title?: string; detail?: 'stages' | 'full' }) {
  const qc = useQueryClient();
  const { hasModule } = useAuth();
  const [pin, setPin] = React.useState('');
  const [days, setDays] = React.useState(90);
  const [detail, setDetail] = React.useState<'stages' | 'full'>(detailDefault);
  const [showLog, setShowLog] = React.useState<string | null>(null);
  const params = orderId ? { orderId } : { buyerId };
  const q = useQuery<{ items: Code[] }>({ queryKey: ['/tracking', params], queryFn: async () => (await api.get('/tracking', { params })).data });
  /* a 4–6 digit value goes as a PIN, anything longer as a password — the buyer types whatever you set here */
  const isPin = /^\d{4,6}$/.test(pin.trim());
  const issue = useMutation({
    mutationFn: async () => (await api.post('/tracking', { kind: orderId ? 'order' : 'buyer', orderId, buyerId, detail,
      ...(pin.trim() ? (isPin ? { pin: pin.trim() } : { password: pin.trim() }) : {}), expiresInDays: days })).data,
    onSuccess: (c: Code) => { toast.success(`Link ${c.token} created${c.hasPin ? ` · ${c.secretLabel || 'PIN'} protected` : ''} — copied to the clipboard`); navigator.clipboard?.writeText(c.url).catch(() => undefined); setPin(''); qc.invalidateQueries({ queryKey: ['/tracking'] }); qc.invalidateQueries({ queryKey: [`/orders/${orderId}`] }); }, onError: (e) => toast.error(apiMessage(e)) });
  const revoke = useMutation({ mutationFn: async (id: string) => (await api.post(`/tracking/${id}/revoke`)).data, onSuccess: () => { toast.success('Link revoked — it stops working immediately'); qc.invalidateQueries({ queryKey: ['/tracking'] }); }, onError: (e) => toast.error(apiMessage(e)) });
  const items = q.data?.items ?? [];
  const canIssue = hasModule('orders');
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div><CardTitle>{title || 'Buyer Tracking Link'}</CardTitle><p className="text-xs text-muted-foreground">A read-only page the buyer opens without logging in — no ERP account. Set a password and share the link; prices, vendors, stock and costs are never sent.</p></div>
        {canIssue && <div className="flex flex-wrap items-center gap-2">
          <Select value={detail} onValueChange={(v) => setDetail(v as 'stages' | 'full')}>
            <SelectTrigger className="h-8 w-[196px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="stages">Stage board only</SelectItem><SelectItem value="full">Full T&amp;A plan (A–Z)</SelectItem></SelectContent>
          </Select>
          <Input className="h-8 w-40" placeholder="Password or 4–6 digit PIN" value={pin} onChange={(e) => setPin(e.target.value.slice(0, 40))} title="Leave empty for a link that needs no password" />
          <Input type="number" className="h-8 w-20" value={days} onChange={(e) => setDays(+e.target.value)} title="valid for days" />
          <Button size="sm" disabled={issue.isPending} onClick={() => issue.mutate()}><Plus size={13} /> New link</Button></div>}
      </CardHeader>
      <CardContent className="p-0">
        {q.isLoading ? <div className="p-5"><Skeleton className="h-9" /></div> : !items.length ? <div className="p-5 text-sm text-muted-foreground">No link yet. Set a password, create the link and send the URL (with the password) to the buyer.</div>
        : <div className="divide-y">{items.map((c) => (
          <div key={c.id} className={cn('px-4 py-3 text-[13px]', c.status !== 'Active' && 'opacity-60')}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[15px] font-bold tracking-wider">{c.token}</span>
              <Badge tone={c.status === 'Active' ? 'ok' : 'mute'}>{c.status}</Badge>{c.hasPin && <Badge tone="warn">{c.secretLabel || 'PIN'}</Badge>}<Badge tone={c.detail === 'full' ? 'brand' : 'plain'}>{c.detail === 'full' ? 'full T&A plan' : 'stage board'}</Badge><Badge tone="plain">{c.kind === 'buyer' ? `all live orders · ${c.buyerAlias}` : c.orderNo}</Badge>
              <span className="text-[11px] text-muted-foreground">valid to {fmtDate(c.expiresAt)} · {c.viewCount} view{c.viewCount === 1 ? '' : 's'}{c.lastViewedAt ? ` · last ${new Date(c.lastViewedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
              <div className="ml-auto flex gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText(c.url); toast.success('Link copied'); }}><Check size={13} /> Copy</Button>
                <Button size="sm" variant="secondary" asChild><a href={c.url} target="_blank" rel="noreferrer"><Eye size={13} /> Open</a></Button>
                <Button size="sm" variant="secondary" onClick={() => setShowLog(showLog === c.id ? null : c.id)}>Log</Button>
                {c.status === 'Active' && canIssue && <Button size="sm" variant="destructive" onClick={() => revoke.mutate(c.id)}><Power size={13} /></Button>}
              </div>
            </div>
            <div className="mt-1 truncate font-mono text-[11.5px] text-muted-foreground">{c.url}</div>
            {showLog === c.id && <div className="mt-2 rounded-lg border bg-secondary p-2 text-[11.5px]">{!c.views.length ? 'Not opened yet.' : c.views.map((v, i) => <div key={i} className={cn(!v.ok && 'text-bad')}>{new Date(v.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {v.ip || '—'} · {v.ua?.slice(0, 60)}{v.ok ? '' : ' · refused'}</div>)}</div>}
          </div>))}</div>}
      </CardContent>
    </Card>
  );
}
