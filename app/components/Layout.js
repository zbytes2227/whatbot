'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Megaphone,
  Users,
  History,
  Smartphone,
  UsersRound,
  Activity,
  X,
  Radio,
} from 'lucide-react';
import Navbar from './Navbar';

const NAV_ITEMS = [
  {
    href: '/',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    href: '/campaigns',
    label: 'Campaigns',
    icon: Megaphone,
  },
  {
    href: '/contacts',
    label: 'Contact Lists',
    icon: Users,
  },
  {
    href: '/history',
    label: 'Message Logs',
    icon: History,
  },
  {
    href: '/whatsapp',
    label: 'WhatsApp Profiles',
    icon: Smartphone,
  },
  {
    href: '/groups',
    label: 'Group Extractor',
    icon: UsersRound,
  },
];

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  const activeIndex = useMemo(() => {
    const idx = NAV_ITEMS.findIndex(
      (item) => pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href))
    );
    return idx === -1 ? 0 : idx;
  }, [pathname]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-zinc-900 antialiased">
      <Navbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <div className="mx-auto flex w-full max-w-[1600px] gap-5 px-4 py-5 sm:px-6 lg:px-8">
        {/* Sidebar */}
        <aside
          className={`
            fixed inset-y-0 left-0 z-50 w-64 border-r border-zinc-200/80 bg-white/95 backdrop-blur-md px-3.5 py-4 transition-transform duration-300
            lg:sticky lg:top-[calc(3.5rem+1.25rem)] lg:h-[calc(100vh-3.5rem-2.5rem)] lg:translate-x-0 lg:rounded-2xl lg:border lg:border-zinc-200/80 lg:shadow-xs
            ${sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
          `}
          aria-label="Primary Navigation"
        >
          <div className="flex h-full flex-col justify-between">
            <div>
              {/* Mobile header */}
              <div className="mb-4 flex items-center justify-between lg:hidden">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs">
                    <Activity className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-bold text-zinc-900">WhatMot</span>
                </div>
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                  onClick={() => setSidebarOpen(false)}
                  aria-label="Close sidebar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Navigation Group Header */}
              <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Menu
              </p>

              {/* Nav items */}
              <nav className="space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href ||
                    (item.href !== '/' && pathname?.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-150 ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-900 font-bold shadow-xs border border-emerald-200/60'
                          : 'text-zinc-600 hover:bg-zinc-100/70 hover:text-zinc-900'
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 transition-colors ${
                          isActive
                            ? 'text-emerald-600'
                            : 'text-zinc-400 group-hover:text-zinc-600'
                        }`}
                      />
                      <span>{item.label}</span>
                      {isActive && (
                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-600" />
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Bottom Status Card */}
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3.5">
              <div className="flex items-center gap-2">
                <Radio className="h-3.5 w-3.5 text-emerald-600 animate-pulse" />
                <p className="text-xs font-semibold text-emerald-950">WhatsApp Automation</p>
              </div>
              <p className="mt-1 text-[11px] text-zinc-500 leading-relaxed">
                Background campaign runner & message sync active. V3
              </p>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1">
          <div className="min-h-[calc(100vh-3.5rem-2.5rem)] rounded-2xl border border-zinc-200/80 bg-white shadow-xs">
            <div className="h-full p-5 sm:p-7">
              {children}
            </div>
          </div>
        </main>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <button
          className="fixed inset-0 z-40 bg-zinc-900/30 backdrop-blur-xs lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar overlay"
        />
      )}
    </div>
  );
}
