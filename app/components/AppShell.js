'use client';

import { createContext, useContext, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  History,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Monitor,
  Moon,
  Smartphone,
  Sun,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import { useTheme } from '@/app/providers';
import { useApi } from '@/app/components/hooks';
import { cn } from '@/app/components/ui';
import { logout } from '@/lib/clientApi';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/history', label: 'Message logs', icon: History },
  { href: '/whatsapp', label: 'WhatsApp profiles', icon: Smartphone },
  { href: '/groups', label: 'Group extractor', icon: UsersRound },
];

const SessionContext = createContext({ user: null, profiles: [], refreshProfiles: () => {} });
export const useSession = () => useContext(SessionContext);

function isActive(pathname, href) {
  return href === '/' ? pathname === '/' : pathname?.startsWith(href);
}

function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const options = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'system', icon: Monitor, label: 'System' },
    { value: 'dark', icon: Moon, label: 'Dark' },
  ];
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800/80">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setTheme(o.value)}
          aria-label={`${o.label} theme`}
          title={`${o.label} theme`}
          className={cn('flex h-7 flex-1 items-center justify-center rounded-md transition-all', theme === o.value ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200')}
        >
          <o.icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}

function Sidebar({ pathname, profiles, user, onNavigate }) {
  const ready = profiles.filter((p) => p.ready).length;
  const enabled = profiles.filter((p) => p.enabled).length;
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <Image src="/logo.png" alt="" width={32} height={32} className="rounded-xl shadow-sm" priority />
        <div>
          <p className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-white">WhatBot</p>
          <p className="-mt-0.5 text-[11px] text-zinc-500">Campaign manager</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3" aria-label="Main">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150',
                active ? 'bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100'
              )}
            >
              <item.icon className={cn('h-[18px] w-[18px] shrink-0 transition-transform duration-150 group-hover:scale-110', active ? '' : 'text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200')} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 p-3">
        <Link href="/whatsapp" onClick={onNavigate} className="block rounded-xl border border-zinc-200 bg-gradient-to-br from-white to-zinc-50 p-3.5 transition hover:border-zinc-300 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-900/40 dark:hover:border-zinc-700">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">WhatsApp</p>
            <span className={cn('relative flex h-2 w-2')}>
              {ready > 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />}
              <span className={cn('relative inline-flex h-2 w-2 rounded-full', ready > 0 ? 'bg-brand-500' : enabled ? 'bg-amber-500' : 'bg-zinc-400')} />
            </span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            {ready} of {profiles.length || 0} profiles connected
          </p>
          <div className="mt-2.5 flex gap-1">
            {profiles.map((p) => (
              <span key={p.id} title={`${p.name}: ${p.ready ? 'connected' : p.enabled ? p.status : 'off'}`} className={cn('h-1.5 flex-1 rounded-full transition-colors', p.ready ? 'bg-brand-500' : p.enabled ? 'bg-amber-400' : 'bg-zinc-200 dark:bg-zinc-700')} />
            ))}
          </div>
        </Link>

        <ThemeSwitcher />

        <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-emerald-700 text-xs font-bold uppercase text-white">
            {(user?.username || 'A').slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-200">{user?.username || 'Administrator'}</p>
            <p className="text-[11px] text-zinc-500">Administrator</p>
          </div>
          <button type="button" onClick={logout} className="rounded-lg p-2 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10" title="Sign out" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: auth } = useApi('/api/auth');
  const { data: profiles, refresh: refreshProfiles } = useApi('/api/whatsapp?action=status', { interval: 8000, select: (d) => d.clients });

  const current = NAV.find((n) => isActive(pathname, n.href));

  return (
    <SessionContext.Provider value={{ user: auth?.user, profiles: profiles || [], refreshProfiles }}>
      <div className="min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-zinc-200/80 bg-white/80 backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/80 lg:block">
          <Sidebar pathname={pathname} profiles={profiles || []} user={auth?.user} />
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 animate-fade-in bg-zinc-950/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            <aside className="relative h-full w-72 animate-slide-in-left border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <button type="button" onClick={() => setMobileOpen(false)} className="absolute right-3 top-4 rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Close menu">
                <X className="h-4 w-4" />
              </button>
              <Sidebar pathname={pathname} profiles={profiles || []} user={auth?.user} onNavigate={() => setMobileOpen(false)} />
            </aside>
          </div>
        )}

        <div className="lg:pl-64">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-zinc-200/80 bg-white/80 px-4 backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/80 lg:hidden">
            <button type="button" onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <Image src="/logo.png" alt="" width={24} height={24} className="rounded-lg" />
            <span className="text-sm font-semibold">{current?.label || 'WhatBot'}</span>
          </header>

          <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
            <div key={pathname} className="animate-fade-up">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SessionContext.Provider>
  );
}
