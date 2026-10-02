import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from './AuthProvider';
import { apiMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/misc';
import { Login, Shield, Eye, EyeOff } from '@/icons/icons';

export default function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [uid, setUid] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(uid, password);
      toast.success('Welcome back');
      nav('/', { replace: true });
    } catch (err) {
      toast.error(apiMessage(err));
    } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* brand panel */}
      <div className="relative hidden overflow-hidden bg-ink text-white lg:flex lg:flex-col lg:justify-between p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-light/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/4 h-80 w-80 rounded-full bg-teal/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary font-slab text-sm font-extrabold text-primary-foreground shadow-lg shadow-brand/40">
            AI
          </div>
          <div>
            <div className="font-slab text-[15px] font-bold leading-tight">Afion International</div>
            <div className="text-[11px] uppercase tracking-widest text-white/50">Apparel Export ERP</div>
          </div>
        </div>
        <div className="relative">
          <h1 className="font-slab text-4xl font-bold leading-tight">
            Always know<br />where the <span className="text-brand-light">material</span> is.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/60">
            Sampling to payment — every metre, every piece, every vendor. One system for the
            whole export house: orders, stock, gate entry, job work, production and dispatch.
          </p>
        </div>
        <div className="relative flex items-center gap-2 text-xs text-white/40">
          <Shield size={15} className="text-teal" />
          Role-based access · every action audit-logged
        </div>
      </div>

      {/* form panel */}
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm animate-rise">
          <div className="mb-8 lg:hidden flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary font-slab text-sm font-extrabold text-primary-foreground">AI</div>
            <div className="font-slab font-bold">Afion International ERP</div>
          </div>
          <h2 className="font-slab text-2xl font-bold">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use the User ID and password given by your admin.</p>

          <div className="mt-7 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="uid">User ID</Label>
              <Input id="uid" autoFocus autoComplete="username" placeholder="e.g. vikram"
                value={uid} onChange={(e) => setUid(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw">Password</Label>
              <div className="relative">
                <Input id="pw" type={show ? 'text' : 'password'} autoComplete="current-password"
                  placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" onClick={() => setShow(!show)} tabIndex={-1}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={busy || !uid || !password}>
              <Login size={17} /> {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Forgot password? Ask your administrator to reset it from Users &amp; Roles.
          </p>
        </form>
      </div>
    </div>
  );
}
