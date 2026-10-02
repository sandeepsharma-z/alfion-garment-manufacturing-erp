import * as React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useAuth } from '@/features/auth/AuthProvider';
import { NAV, flatNav, moduleOf } from '@/app/nav';
import { cn, initials } from '@/lib/utils';
import { Badge } from '@/components/ui/misc';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, Bell, Moon, Sun, Logout, Key, Collapse, Menu, ChevronRight } from '@/icons/icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Link } from 'react-router-dom';

export default function AppShell() {
  const { user, logout, hasModule } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [rail, setRail] = React.useState(() => localStorage.getItem('afion-rail') === '1');
  const [dark, setDark] = React.useState(() => localStorage.getItem('afion-theme') === 'dark');
  const [drawer, setDrawer] = React.useState(false);
  const alerts = useQuery<{ items: { id: string; severity: string; message: string; link: string; acknowledgedAt?: string }[]; total: number; red: number; unacknowledged: number }>({ queryKey: ['/alerts', 'bell'], queryFn: async () => (await api.get('/alerts')).data, refetchInterval: 60_000 });
  const work = useQuery<{ overdue: number; today: number; total: number }>({ queryKey: ['/mywork', 'count'], queryFn: async () => (await api.get('/mywork/count')).data, refetchInterval: 60_000 });

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('afion-theme', dark ? 'dark' : 'light');
  }, [dark]);
  React.useEffect(() => { localStorage.setItem('afion-rail', rail ? '1' : ''); }, [rail]);
  React.useEffect(() => { setDrawer(false); }, [loc.pathname]);

  const current = flatNav.find((i) => i.path === loc.pathname) || flatNav.find((i) => i.path !== '/' && loc.pathname.startsWith(i.path));

  return (
    <div className="flex min-h-screen">
      {/* ===== Sidebar (light surface, theme-aware) ===== */}
      <aside className={cn(
        'fixed z-40 flex h-screen flex-col bg-card text-foreground',
        'border-r transition-[width,transform] duration-200',
        rail ? 'w-[76px]' : 'w-[264px]',
        'max-lg:w-[264px] max-lg:-translate-x-full',
        drawer && 'max-lg:translate-x-0',
      )}>
        <div className={cn('flex items-center gap-3 border-b px-4 py-4', rail && 'lg:justify-center lg:px-0')}>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary font-slab text-[13px] font-extrabold text-primary-foreground shadow-lg shadow-brand/30">
            AI
          </div>
          {!rail && (
            <div className="leading-tight lg:block">
              <div className="font-slab text-sm font-bold">Afion International</div>
              <div className="text-[10px] uppercase tracking-widest font-bold">Apparel Export ERP</div>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV.map((group) => {
            const visible = group.items.filter((i) => i.everyone || hasModule(moduleOf(i)));
            if (!visible.length) return null;
            return (
              <div key={group.label}>
                {rail
                  ? <div className="mx-3 my-2.5 hidden h-px bg-border lg:block" />
                  : null}
                <div className={cn('px-3 pb-1 pt-3 text-[9.5px] font-bold uppercase tracking-[1.4px] font-bold/70', rail && 'lg:hidden')}>
                  {group.label}
                </div>
                {visible.map((item) => (
                  <NavLink
                    key={item.key}
                    to={item.path}
                    title={rail ? item.label : undefined}
                    className={({ isActive }) => cn(
                      'group relative my-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all',
                      rail && 'lg:justify-center lg:px-0',
                      isActive
                        ? 'bg-brand-soft font-semibold text-brand dark:bg-accent before:absolute before:-left-2.5 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r before:bg-brand'
                        : 'font-bold hover:translate-x-0.5 hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon size={rail ? 20 : 18} className={cn('shrink-0 opacity-75 group-hover:opacity-100', isActive && 'text-brand opacity-100')} />
                        <span className={cn(rail && 'lg:hidden')}>{item.label}</span>
                        {item.key === 'mywork' && !rail && (work.data?.total ?? 0) > 0 && (
                          <span className={cn('ml-auto hidden rounded-md px-1.5 text-[9.5px] font-bold lg:inline', work.data?.overdue ? 'bg-bad text-white' : 'bg-brand-soft text-brand dark:bg-accent')}>{work.data?.overdue || work.data?.total}</span>
                        )}
                        {item.phase && !rail && (
                          <span className={cn(
                            'ml-auto hidden rounded-md border px-1.5 text-[9.5px] font-bold lg:inline',
                            isActive ? 'border-brand/30 bg-card text-brand' : 'bg-secondary font-bold',
                          )}>
                            P{item.phase}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>
      {drawer && <div className="fixed inset-0 z-30 bg-ink/50 lg:hidden" onClick={() => setDrawer(false)} />}

      {/* ===== Main ===== */}
      <div className={cn('flex min-w-0 flex-1 flex-col transition-[margin] duration-200', rail ? 'lg:ml-[76px]' : 'lg:ml-[264px]')}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-card/85 px-5 backdrop-blur-md">
          <button className="rounded-lg border p-2 font-bold hover:text-foreground lg:hidden" onClick={() => setDrawer(true)}>
            <Menu size={18} />
          </button>
          <button
            className="hidden rounded-lg border p-2 font-bold transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand dark:hover:bg-accent lg:block"
            title={rail ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setRail(!rail)}
          >
            <Collapse size={18} />
          </button>
          <div className="hidden text-[13px] font-bold md:block">
            Afion ERP <span className="mx-1.5 text-border">/</span>
            <b className="font-semibold text-foreground">{current?.label ?? 'Dashboard'}</b>
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            <div className="hidden h-[38px] w-72 items-center gap-2 rounded-lg border bg-secondary px-3 md:flex">
              <Search size={16} className="font-bold" />
              <input placeholder="Search order, style, vendor…" className="w-full bg-transparent text-[13px] outline-none placeholder:font-bold" />
              <kbd className="rounded border bg-card px-1.5 text-[10px] font-bold">Ctrl K</kbd>
            </div>
            <button className="rounded-lg border p-2 font-bold transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand dark:hover:bg-accent"
              title="Toggle theme" onClick={() => setDark(!dark)}>
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger className="relative rounded-lg border p-2 font-bold outline-none transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand dark:hover:bg-accent" title="Alerts">
                <Bell size={18} />
                {(alerts.data?.unacknowledged ?? 0) > 0 && <i className={cn('absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold not-italic text-white', alerts.data?.red ? 'bg-bad' : 'bg-gold-vivid')}>{alerts.data?.unacknowledged}</i>}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-96">
                <div className="flex items-center justify-between px-3 py-2"><div className="text-[13px] font-semibold">Alerts</div><span className="text-[11px] font-bold">{alerts.data?.total ?? 0} open · {alerts.data?.red ?? 0} red</span></div>
                <DropdownMenuSeparator />
                {!(alerts.data?.items ?? []).length ? <div className="px-3 py-4 text-center text-xs font-bold">Nothing needs your attention.</div>
                : (alerts.data?.items ?? []).filter((a) => !a.acknowledgedAt).slice(0, 6).map((a) => (
                  <DropdownMenuItem key={a.id} onClick={() => nav(a.link || '/alerts')} className="items-start">
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', a.severity === 'red' ? 'bg-bad' : a.severity === 'amber' ? 'bg-gold-vivid' : 'bg-info')} />
                    <span className="line-clamp-2 text-[12.5px]">{a.message}</span>
                  </DropdownMenuItem>))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => nav('/alerts')}><span className="flex w-full items-center justify-between text-[12.5px] font-semibold text-brand">Open Alert Center <ChevronRight size={14} /></span></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-lg border-l pl-3 outline-none">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
                  {initials(user?.name || '?')}
                </div>
                <div className="hidden text-left leading-tight md:block">
                  <div className="text-[12.5px] font-semibold">{user?.name}</div>
                  <div className="text-[10.5px] font-bold">{user?.role}</div>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="px-3 py-2">
                  <div className="text-[13px] font-semibold">{user?.name}</div>
                  <div className="text-[11px] font-bold">{user?.uid}@afionintl.com</div>
                  <Badge tone="brand" className="mt-1.5">{user?.role}</Badge>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => nav('/change-password')}>
                  <Key size={16} /> Change password
                </DropdownMenuItem>
                <DropdownMenuItem danger onClick={logout}>
                  <Logout size={16} /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1560px] flex-1 px-6 py-6 pb-16">
          <ErrorBoundary key={loc.pathname}><Outlet /></ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
