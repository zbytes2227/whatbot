'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCheck,
  Eye,
  Megaphone,
  MessageCircleReply,
  Plus,
  Send,
  ShieldOff,
  Smartphone,
  Users,
  XCircle,
} from 'lucide-react';
import { useApi } from '@/app/components/hooks';
import QuickSend from '@/app/components/QuickSend';
import {
  Button,
  Card,
  CardHeader,
  CampaignStatusBadge,
  DeliveryBadge,
  EmptyState,
  PageHeader,
  ProfileStatusBadge,
  Progress,
  StatCard,
  cn,
  formatNumber,
  timeAgo,
} from '@/app/components/ui';
import { formatPhone } from '@/lib/phone';

function TrendChart({ data = [] }) {
  const max = Math.max(1, ...data.map((d) => d.sent + d.failed));
  return (
    <div className="flex h-48 items-end gap-1.5 sm:gap-2">
      {data.map((d, i) => {
        const total = d.sent + d.failed;
        const height = (total / max) * 100;
        const date = new Date(`${d.date}T12:00:00`);
        return (
          <div key={d.date} className="group relative flex h-full flex-1 flex-col items-center justify-end">
            <div className="pointer-events-none absolute -top-2 z-10 -translate-y-full whitespace-nowrap rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[11px] text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-white dark:text-zinc-900">
              <p className="font-semibold">{date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
              <p>{formatNumber(d.sent)} sent · {formatNumber(d.failed)} failed</p>
            </div>
            <div className="flex w-full flex-col justify-end overflow-hidden rounded-md transition-all duration-500 ease-out" style={{ height: `${Math.max(height, total ? 3 : 1.5)}%`, transitionDelay: `${i * 25}ms` }}>
              {d.failed > 0 && <div className="w-full bg-red-400/80 dark:bg-red-500/70" style={{ height: `${(d.failed / total) * 100}%` }} />}
              <div className={cn('w-full flex-1 transition-colors', total ? 'bg-brand-500 group-hover:bg-brand-600' : 'bg-zinc-200 dark:bg-zinc-800')} />
            </div>
            <span className={cn('mt-2 text-[10px] tabular-nums text-zinc-400', i % 2 === 1 && 'max-sm:invisible')}>{date.getDate()}</span>
          </div>
        );
      })}
    </div>
  );
}

function RateRing({ label, value, color, icon: Icon }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-16 w-16 shrink-0">
        <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
          <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-zinc-100 dark:stroke-zinc-800" />
          <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" strokeLinecap="round" stroke={color} strokeDasharray={c} strokeDashoffset={c - (Math.min(100, value) / 100) * c} className="transition-[stroke-dashoffset] duration-1000 ease-out" />
        </svg>
        <Icon className="absolute inset-0 m-auto h-4 w-4 text-zinc-400" />
      </div>
      <div>
        <p className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-white">{value}%</p>
        <p className="text-xs text-zinc-500">{label}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data, loading } = useApi('/api/dashboard', { interval: 15000, select: (d) => d.data });
  const [quickSend, setQuickSend] = useState(false);
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }, []);

  const d = data || {};
  const connected = (d.profiles || []).filter((p) => p.ready).length;

  return (
    <>
      <PageHeader
        title={greeting}
        description="Here is what is happening with your WhatsApp outreach."
        actions={
          <>
            <Button variant="secondary" icon={Send} onClick={() => setQuickSend(true)}>Quick send</Button>
            <Link href="/campaigns?new=1"><Button icon={Plus}>New campaign</Button></Link>
          </>
        }
      />

      {d.campaigns?.needsReview > 0 && (
        <Link href="/campaigns?status=needs_review" className="mb-6 flex animate-fade-in items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 transition hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1"><b>{d.campaigns.needsReview}</b> campaign(s) paused because a delivery outcome is uncertain. Review to continue.</span>
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      )}

      {!loading && connected === 0 && (
        <Link href="/whatsapp" className="mb-6 flex animate-fade-in items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
          <Smartphone className="h-4 w-4 shrink-0" />
          <span className="flex-1">No WhatsApp profile is connected. Campaigns will wait until one is online.</span>
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sent today" value={formatNumber(d.sentToday)} icon={Send} tone="green" loading={loading} hint={d.failedToday ? `${formatNumber(d.failedToday)} failed today` : 'No failures today'} />
        <StatCard label="Active campaigns" value={formatNumber((d.campaigns?.running || 0) + (d.campaigns?.paused || 0))} icon={Megaphone} tone="blue" loading={loading} hint={`${d.campaigns?.scheduled || 0} scheduled · ${d.campaigns?.completed || 0} completed`} />
        <StatCard label="Success rate (30d)" value={`${d.last30?.successRate ?? 0}%`} icon={CheckCheck} tone="violet" loading={loading} hint={`${formatNumber(d.last30?.sent)} sent · ${formatNumber(d.last30?.failed)} failed`} />
        <StatCard label="Connected profiles" value={`${connected}/${d.profiles?.length || 0}`} icon={Smartphone} tone={connected ? 'green' : 'amber'} loading={loading} hint={`${formatNumber(d.contactLists)} lists · ${formatNumber(d.optOuts)} opt-outs`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Messages, last 14 days" description={`Daily totals in ${d.timezone || 'local time'}`} action={
            <div className="flex items-center gap-3 text-[11px] text-zinc-500">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-brand-500" />Sent</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-red-400" />Failed</span>
            </div>
          } />
          <div className="px-5 pb-4 pt-10">{loading ? <div className="skeleton h-48 w-full" /> : <TrendChart data={d.trend} />}</div>
        </Card>

        <Card>
          <CardHeader title="Engagement (30 days)" description="Based on WhatsApp receipts" />
          <div className="grid gap-5 p-5">
            <RateRing label="Delivered" value={d.last30?.deliveryRate ?? 0} color="#10b981" icon={CheckCheck} />
            <RateRing label="Read" value={d.last30?.readRate ?? 0} color="#8b5cf6" icon={Eye} />
            <RateRing label="Replied" value={d.last30?.replyRate ?? 0} color="#0ea5e9" icon={MessageCircleReply} />
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Recent campaigns" action={<Link href="/campaigns" className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">View all</Link>} />
          {loading ? (
            <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 w-full" />)}</div>
          ) : !d.recentCampaigns?.length ? (
            <EmptyState icon={Megaphone} title="No campaigns yet" description="Create your first campaign to start reaching your contacts." action={<Link href="/campaigns?new=1"><Button size="sm" icon={Plus}>New campaign</Button></Link>} />
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {d.recentCampaigns.map((c) => (
                <li key={c.campaignId}>
                  <Link href={`/campaigns?open=${c.campaignId}`} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{c.campaignName}</p>
                        <CampaignStatusBadge status={c.status} />
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <Progress value={c.processedNumbers} max={c.totalNumbers} size="sm" striped={c.status === 'running'} className="max-w-xs" />
                        <span className="text-xs tabular-nums text-zinc-500">{formatNumber(c.processedNumbers)}/{formatNumber(c.totalNumbers)}</span>
                      </div>
                    </div>
                    <div className="hidden text-right text-xs sm:block">
                      <p className="font-medium text-brand-600 dark:text-brand-400">{formatNumber(c.successCount)} sent</p>
                      <p className="text-zinc-500">{formatNumber(c.failedCount)} failed</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="WhatsApp profiles" action={<Link href="/whatsapp" className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">Manage</Link>} />
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {(d.profiles || []).map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <div className={cn('flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold', p.ready ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800')}>
                    {p.name.trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="truncate text-xs text-zinc-500">{p.accountInfo?.number ? formatPhone(p.accountInfo.number) : 'Not linked'}</p>
                  </div>
                  <ProfileStatusBadge profile={p} />
                </li>
              ))}
              {loading && <li className="p-5"><div className="skeleton h-24 w-full" /></li>}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Latest activity" action={<Link href="/history" className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">Logs</Link>} />
            {!loading && !d.recentMessages?.length ? (
              <p className="px-5 py-8 text-center text-sm text-zinc-500">No messages yet.</p>
            ) : (
              <ul className="space-y-0.5 p-2">
                {(d.recentMessages || []).map((m) => (
                  <li key={m._id} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                    {['failed', 'unknown'].includes(m.deliveryStatus) ? <XCircle className="h-4 w-4 shrink-0 text-red-500" /> : m.deliveryStatus === 'skipped' ? <ShieldOff className="h-4 w-4 shrink-0 text-zinc-400" /> : <Send className="h-4 w-4 shrink-0 text-brand-500" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium tabular-nums">{formatPhone(m.number)}</p>
                      <p className="text-[11px] text-zinc-500">{timeAgo(m.sentTime)} · {m.source}</p>
                    </div>
                    <DeliveryBadge status={m.deliveryStatus} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { href: '/contacts', icon: Users, title: 'Import contacts', text: 'Paste numbers or upload a CSV' },
          { href: '/groups', icon: Users, title: 'Extract from groups', text: 'Turn group members into a list' },
          { href: '/whatsapp', icon: Smartphone, title: 'Link a profile', text: 'Scan a QR code to connect' },
        ].map((a) => (
          <Link key={a.href} href={a.href} className="card group flex items-center gap-4 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 transition-colors group-hover:bg-brand-50 group-hover:text-brand-600 dark:bg-zinc-800 dark:text-zinc-300 dark:group-hover:bg-brand-500/10 dark:group-hover:text-brand-400"><a.icon className="h-5 w-5" /></div>
            <div className="flex-1">
              <p className="text-sm font-semibold">{a.title}</p>
              <p className="text-xs text-zinc-500">{a.text}</p>
            </div>
            <ArrowUpRight className="h-4 w-4 text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-zinc-500" />
          </Link>
        ))}
      </div>

      <QuickSend open={quickSend} onClose={() => setQuickSend(false)} />
    </>
  );
}
