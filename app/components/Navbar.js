'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  Menu,
  ChevronDown,
  LogOut,
  Shield,
  Activity,
  AlertCircle,
} from 'lucide-react';
import { authFetch, clearAuthSession } from '@/lib/clientApi';

const PAGE_LABELS = {
  '/': 'Dashboard Overview',
  '/campaigns': 'Campaigns Manager',
  '/contacts': 'Contact Lists',
  '/history': 'Message History & Logs',
  '/whatsapp': 'WhatsApp Profiles',
  '/groups': 'Group Contacts Extractor',
};

function getPageLabel(pathname) {
  if (!pathname || pathname === '/') return 'Dashboard Overview';
  for (const [key, label] of Object.entries(PAGE_LABELS)) {
    if (key !== '/' && pathname.startsWith(key)) return label;
  }
  return 'Workspace';
}

export default function Navbar({ sidebarOpen, setSidebarOpen }) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [clientCount, setClientCount] = useState({ ready: 0, total: 4 });
  const menuRef = useRef(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    function handleOutsideClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function checkStatus() {
      try {
        const res = await authFetch('/api/whatsapp?action=status');
        if (res.ok) {
          const data = await res.json();
          if (data.clients && mounted) {
            const list = Object.values(data.clients);
            const readyCount = list.filter((c) => c.ready).length;
            setClientCount({ ready: readyCount, total: list.length || 4 });
          }
        }
      } catch {
        // silent
      }
    }
    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  async function handleLogout() {
    setUserMenuOpen(false);
    clearAuthSession();
    router.push('/login');
  }

  const pageLabel = getPageLabel(pathname);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: hamburger + breadcrumb */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 lg:hidden"
            aria-label="Toggle navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Logo mark (desktop only) */}
          <div className="hidden items-center gap-2 lg:flex">
            <Image src="/logo.png" alt="WhatBot" width={28} height={28} className="rounded-lg object-cover" priority />
            <span className="text-sm font-semibold tracking-tight text-zinc-900">WhatBot</span>
            <span className="text-zinc-300">/</span>
          </div>

          <span className="text-sm font-semibold text-zinc-800">{pageLabel}</span>
        </div>

        {/* Right: status pill + user menu */}
        <div className="flex items-center gap-3">
          <div
            className={`hidden items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium sm:flex ${
              clientCount.ready > 0
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            {clientCount.ready > 0 ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                </span>
                <span>
                  {clientCount.ready}/{clientCount.total} Ready
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                <span>No Sessions Connected</span>
              </>
            )}
          </div>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setUserMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-lg border border-zinc-200/80 bg-zinc-50 px-2.5 py-1.5 transition hover:bg-zinc-100"
              aria-label="Open user menu"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-700 text-[10px] font-bold text-white shadow-xs">
                AD
              </div>
              <span className="hidden text-xs font-semibold text-zinc-700 sm:inline">Admin</span>
              <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-48 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
                <div className="border-b border-zinc-100 bg-zinc-50 px-3.5 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-emerald-600" />
                    <p className="text-xs font-semibold text-zinc-900">Administrator</p>
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-500">WhatBot Production</p>
                </div>
                <div className="p-1">
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </header>
  );
}
