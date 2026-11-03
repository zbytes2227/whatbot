'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Check, CheckCircle2, LogOut, Pencil, QrCode, RotateCcw, ScrollText, Smartphone, Wifi } from 'lucide-react';
import { api } from '@/lib/clientApi';
import { formatPhone } from '@/lib/phone';
import { useApi, useBusy } from '@/app/components/hooks';
import { useSession } from '@/app/components/AppShell';
import { Button, Card, CardHeader, Input, Modal, PageHeader, ProfileStatusBadge, Spinner, Toggle, cn, timeAgo, useConfirm } from '@/app/components/ui';

function QrModal({ profile, onClose, onConnected }) {
  const [state, setState] = useState({ qr: null, status: 'initializing', error: null });
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!profile) return undefined;
    connectedRef.current = false;
    setState({ qr: null, status: 'initializing', error: null });
    let cancelled = false;
    let timer;
    const poll = async () => {
      try {
        const res = await api.get(`/api/whatsapp?action=qr&clientId=${profile.id}`);
        if (cancelled) return;
        setState({ qr: res.qrCode, status: res.client.status, error: res.client.error });
        if (res.client.ready && !connectedRef.current) {
          connectedRef.current = true;
          onConnected();
          setTimeout(() => !cancelled && onClose(), 1800);
          return;
        }
      } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, error: err.message }));
      }
      if (!cancelled) timer = setTimeout(poll, 2500);
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = state.status === 'ready';
  const expired = ['disconnected', 'logged_out', 'error'].includes(state.status) && !state.qr;
  return (
    <Modal open={!!profile} onClose={onClose} size="sm" title={`Link ${profile?.name || ''}`} description="Open WhatsApp on your phone → Settings → Linked devices → Link a device.">
      <div className="flex flex-col items-center py-2">
        <div className="relative flex h-72 w-72 items-center justify-center overflow-hidden rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-700">
          {done ? (
            <div className="flex animate-pop flex-col items-center gap-3 text-brand-600">
              <CheckCircle2 className="h-16 w-16" />
              <p className="text-sm font-semibold">Connected!</p>
            </div>
          ) : state.qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={state.qr} src={state.qr} alt="WhatsApp QR code" className="h-full w-full animate-fade-in" />
          ) : expired ? (
            <div className="px-6 text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
              <p className="mt-2 text-sm text-zinc-600">{state.error || 'The QR code expired.'}</p>
              <Button size="sm" className="mt-4" icon={RotateCcw} onClick={async () => { await api.post('/api/whatsapp', { action: 'connect', clientId: profile.id }).catch(() => {}); setState({ qr: null, status: 'initializing', error: null }); }}>Get a new code</Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-zinc-500"><Spinner className="h-7 w-7" /><p className="text-sm">Generating secure code…</p></div>
          )}
        </div>
        {!done && state.qr && <p className="mt-4 text-center text-xs text-zinc-500">The code refreshes automatically. Keep this window open until it says connected.</p>}
      </div>
    </Modal>
  );
}

function ProfileCard({ profile, busy, onAction, onShowQr, index }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(profile.name);
  const confirm = useConfirm();
  const linked = !!profile.accountInfo?.number;

  const saveName = async () => {
    setRenaming(false);
    if (name.trim() && name.trim() !== profile.name) await onAction('rename', { name: name.trim() });
  };

  return (
    <Card className="flex animate-fade-up flex-col overflow-hidden" style={{ animationDelay: `${index * 60}ms` }}>
      <div className={cn('h-1 w-full transition-colors', profile.ready ? 'bg-brand-500' : profile.enabled ? 'bg-amber-400' : 'bg-zinc-200 dark:bg-zinc-800')} />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start gap-4">
          <div className={cn('relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold', profile.ready ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800')}>
            <Smartphone className="h-6 w-6" />
            {profile.ready && <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 ring-2 ring-white dark:ring-zinc-900"><Check className="h-2.5 w-2.5 text-white" /></span>}
          </div>
          <div className="min-w-0 flex-1">
            {renaming ? (
              <Input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setName(profile.name); setRenaming(false); } }} className="h-8 py-1" />
            ) : (
              <button type="button" onClick={() => { setName(profile.name); setRenaming(true); }} className="group flex max-w-full items-center gap-1.5 text-left">
                <span className="truncate font-semibold text-zinc-900 dark:text-white">{profile.name}</span>
                <Pencil className="h-3 w-3 shrink-0 text-zinc-300 opacity-0 transition group-hover:opacity-100" />
              </button>
            )}
            <p className="mt-0.5 truncate text-sm text-zinc-500">{linked ? `${formatPhone(profile.accountInfo.number)}${profile.accountInfo.name ? ` · ${profile.accountInfo.name}` : ''}` : 'No phone linked'}</p>
          </div>
          <Toggle checked={profile.enabled} disabled={busy.toggle} onChange={(v) => onAction('toggle', { enabled: v })} label={`Turn ${profile.name} ${profile.enabled ? 'off' : 'on'}`} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <ProfileStatusBadge profile={profile} />
          {profile.ready && profile.lastSuccessfulSend && <span>Last send {timeAgo(profile.lastSuccessfulSend)}</span>}
          {profile.queueLength > 0 && <span>{profile.queueLength} queued</span>}
        </div>
        {profile.error && profile.enabled && !profile.ready && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">{profile.error}</p>}

        <div className="mt-auto flex flex-wrap gap-2 pt-5">
          {!profile.ready && (
            <Button size="sm" icon={QrCode} loading={busy.connect} onClick={onShowQr}>{profile.status === 'qr_ready' ? 'Show QR code' : linked ? 'Reconnect' : 'Link phone'}</Button>
          )}
          {profile.enabled && <Button variant="secondary" size="sm" icon={RotateCcw} loading={busy.restart} onClick={() => onAction('restart')}>Restart</Button>}
          {(linked || profile.ready) && (
            <Button variant="danger-ghost" size="sm" icon={LogOut} loading={busy.logout} onClick={async () => {
              const ok = await confirm({ title: `Log out ${profile.name}?`, message: 'This unlinks the device from WhatsApp. Campaigns using this profile will wait for another one. You will need to scan a QR code to link it again.', confirmText: 'Log out', tone: 'danger' });
              if (ok) onAction('logout');
            }}>Log out</Button>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function WhatsAppPage() {
  const { profiles, refreshProfiles } = useSession();
  const { data: logs } = useApi('/api/whatsapp?action=logs&level=warn&limit=30', { interval: 20000, select: (d) => d.logs });
  const [busy, run] = useBusy();
  const [qrProfile, setQrProfile] = useState(null);
  const connected = profiles.filter((p) => p.ready).length;

  const action = (profile) => (name, extra = {}) => run(`${profile.id}:${name}`, async () => {
    try {
      await api.post('/api/whatsapp', { action: name, clientId: profile.id, ...extra });
      if (name === 'logout') toast.success(`${profile.name} logged out`);
      if (name === 'restart') toast.success(`Restarting ${profile.name}…`);
      if (name === 'toggle') toast.success(`${profile.name} turned ${extra.enabled ? 'on' : 'off'}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      refreshProfiles();
    }
  });

  const showQr = (profile) => run(`${profile.id}:connect`, async () => {
    try {
      if (!profile.enabled || ['disconnected', 'logged_out', 'error'].includes(profile.status)) await api.post('/api/whatsapp', { action: 'connect', clientId: profile.id });
      setQrProfile(profile);
    } catch (err) {
      toast.error(err.message);
    }
  });

  const busyFor = (id) => Object.fromEntries(['toggle', 'restart', 'logout', 'connect'].map((k) => [k, !!busy[`${id}:${k}`]]));

  return (
    <>
      <PageHeader
        title="WhatsApp profiles"
        description="Link phones as WhatsApp Web devices. Campaigns rotate across connected profiles."
        actions={<span className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"><Wifi className={cn('h-4 w-4', connected ? 'text-brand-500' : 'text-zinc-400')} />{connected} of {profiles.length} connected</span>}
      />

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {!profiles.length && [0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-56" />)}
        {profiles.map((p, i) => (
          <ProfileCard key={p.id} index={i} profile={p} busy={busyFor(p.id)} onAction={action(p)} onShowQr={() => showQr(p)} />
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader icon={ScrollText} title="Recent issues" description="Warnings and errors from the WhatsApp connection and campaign runner." />
          <div className="max-h-80 overflow-y-auto">
            {!logs?.length ? (
              <p className="px-5 py-10 text-center text-sm text-zinc-500">All quiet. No warnings recorded since the server started.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 font-mono text-xs dark:divide-zinc-800">
                {[...logs].reverse().map((l, i) => (
                  <li key={`${l.ts}-${i}`} className="flex gap-3 px-5 py-2.5">
                    <span className={cn('mt-0.5 h-2 w-2 shrink-0 rounded-full', l.level === 'error' ? 'bg-red-500' : 'bg-amber-500')} />
                    <span className="shrink-0 text-zinc-400">{new Date(l.ts).toLocaleTimeString()}</span>
                    <span className="min-w-0 break-words text-zinc-700 dark:text-zinc-300">{l.message}{l.clientId ? ` · ${l.clientId}` : ''}{l.campaignId ? ` · ${l.campaignId}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold">Staying safe</h3>
          <ul className="mt-3 space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
            {[
              'Use numbers that have been active on WhatsApp for a while.',
              'Keep delays generous and set a daily limit for new numbers.',
              'Use several message variations and spintax.',
              'Only message people who expect to hear from you.',
            ].map((t) => <li key={t} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />{t}</li>)}
          </ul>
        </Card>
      </div>

      <QrModal profile={qrProfile} onClose={() => setQrProfile(null)} onConnected={() => { refreshProfiles(); toast.success('WhatsApp connected'); }} />
    </>
  );
}
