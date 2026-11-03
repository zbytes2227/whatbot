'use client';

import { Suspense, useState } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowRight, BarChart3, Eye, EyeOff, Lock, ShieldCheck, User, Zap } from 'lucide-react';
import { api } from '@/lib/clientApi';
import { Button, cn } from '@/app/components/ui';

function safeNext(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/login') ? value : '/';
}

function LoginForm() {
  const params = useSearchParams();
  const [form, setForm] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.username.trim() || !form.password) {
      setError('Enter your username and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/api/login', form);
      window.location.assign(safeNext(params.get('next')));
    } catch (err) {
      setError(err.message);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className={cn('space-y-5', shake && 'animate-shake')} noValidate>
      {error && (
        <div className="flex animate-fade-in items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div>
        <label htmlFor="username" className="label">Username</label>
        <div className="relative">
          <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input id="username" name="username" autoComplete="username" autoFocus className="input h-11 pl-10" placeholder="admin" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} disabled={loading} />
        </div>
      </div>

      <div>
        <label htmlFor="password" className="label">Password</label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" className="input h-11 pl-10 pr-11" placeholder="••••••••" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} disabled={loading} />
          <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800" aria-label={showPassword ? 'Hide password' : 'Show password'}>
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button type="submit" size="lg" className="w-full" loading={loading} iconRight={ArrowRight}>
        {loading ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}

const FEATURES = [
  { icon: Zap, title: 'Smart pacing', text: 'Randomised delays, sending hours and daily caps keep accounts healthy.' },
  { icon: BarChart3, title: 'Live delivery insights', text: 'Track sent, delivered, read and replied for every campaign.' },
  { icon: ShieldCheck, title: 'Safe by design', text: 'Never double-sends, honours opt-outs, recovers from restarts.' },
];

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-zinc-950 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.35),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(5,150,105,0.25),transparent_50%)]" />
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="" width={40} height={40} className="rounded-xl" priority />
            <span className="text-lg font-semibold tracking-tight">WhatBot</span>
          </div>
          <div className="max-w-md">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">Reach your audience on WhatsApp, reliably.</h1>
            <p className="mt-4 text-zinc-400">Run multi-profile campaigns with scheduling, rotation and delivery tracking from one dashboard.</p>
            <div className="mt-10 space-y-5">
              {FEATURES.map((f, i) => (
                <div key={f.title} className="flex animate-fade-up gap-4" style={{ animationDelay: `${150 + i * 100}ms` }}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur">
                    <f.icon className="h-5 w-5 text-brand-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{f.title}</p>
                    <p className="mt-0.5 text-sm text-zinc-400">{f.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-zinc-500">© {new Date().getFullYear()} WhatBot</p>
        </div>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Image src="/logo.png" alt="" width={36} height={36} className="rounded-xl" priority />
            <span className="text-lg font-semibold">WhatBot</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Welcome back</h2>
          <p className="mb-8 mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">Sign in to manage your campaigns.</p>
          <Suspense fallback={<div className="skeleton h-64 w-full" />}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
