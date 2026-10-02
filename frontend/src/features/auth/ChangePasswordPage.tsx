import * as React from 'react';
import { toast } from 'sonner';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/misc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Key } from '@/icons/icons';

export default function ChangePasswordPage() {
  const { refreshMe } = useAuth();
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return toast.error('New passwords do not match');
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      await refreshMe();
      toast.success('Password changed');
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err) { toast.error(apiMessage(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-md animate-rise">
      <Card>
        <CardHeader>
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-soft text-brand dark:bg-accent"><Key size={20} /></div>
          <div>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>Minimum 6 characters — use something only you know</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Current password</Label>
              <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>New password</Label>
              <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm new password</Label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy || !current || next.length < 6}>
              {busy ? 'Saving…' : 'Update Password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
