'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarClock, Copy, Download, Megaphone, Pause, Pencil, Play, Plus, RotateCcw, Square, Trash2 } from 'lucide-react';
import { api } from '@/lib/clientApi';
import { useApi, useDebounced } from '@/app/components/hooks';
import {
  ActionMenu,
  Button,
  Card,
  CampaignStatusBadge,
  EmptyState,
  PageHeader,
  Progress,
  SearchInput,
  Tabs,
  cn,
  formatDateTime,
  formatNumber,
  timeAgo,
} from '@/app/components/ui';
import toast from 'react-hot-toast';
import CampaignDetail from './CampaignDetail';
import CampaignForm from './CampaignForm';
import { availableActions, useCampaignActions } from './useCampaignActions';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active', match: ['running', 'pending', 'paused'] },
  { value: 'scheduled', label: 'Scheduled', match: ['scheduled'] },
  { value: 'needs_review', label: 'Needs review', match: ['needs_review', 'error'] },
  { value: 'draft', label: 'Drafts', match: ['draft'] },
  { value: 'done', label: 'Finished', match: ['completed', 'stopped'] },
];

function subtitle(c) {
  if (c.status === 'scheduled' && c.scheduledStartAt) return `Starts ${formatDateTime(c.scheduledStartAt)}`;
  if (c.status === 'paused' && c.nextResumeAt) return `Resumes ${formatDateTime(c.nextResumeAt)}`;
  if (c.status === 'running' && c.lastSentAt) return `Last sent ${timeAgo(c.lastSentAt)}`;
  if (c.status === 'completed' && c.endTime) return `Finished ${timeAgo(c.endTime)}`;
  if (c.lastError && ['running', 'error', 'needs_review'].includes(c.status)) return c.lastError;
  return `Created ${timeAgo(c.createdAt)}`;
}

function CampaignRow({ c, actions, isBusy, onOpen, onEdit, index }) {
  const allowed = availableActions(c.status);
  const pct = c.totalNumbers ? Math.round((c.processedNumbers / c.totalNumbers) * 100) : 0;
  const warn = ['needs_review', 'error'].includes(c.status);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(c.campaignId)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(c.campaignId)}
      className="group flex animate-fade-up cursor-pointer flex-col gap-4 px-5 py-4 transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 md:flex-row md:items-center"
      style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">{c.campaignName}</p>
          <CampaignStatusBadge status={c.status} />
        </div>
        <p className={cn('mt-1 truncate text-xs', warn ? 'text-red-600 dark:text-red-400' : 'text-zinc-500')}>
          {c.contactList?.name ? `${c.contactList.name} · ` : ''}{subtitle(c)}
        </p>
      </div>

      <div className="w-full md:w-56">
        <div className="mb-1.5 flex justify-between text-xs tabular-nums text-zinc-500">
          <span>{formatNumber(c.processedNumbers)} / {formatNumber(c.totalNumbers)}</span>
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{pct}%</span>
        </div>
        <Progress value={c.processedNumbers} max={c.totalNumbers} size="sm" striped={c.status === 'running'} tone={warn ? 'red' : c.status === 'paused' ? 'amber' : 'green'} />
      </div>

      <div className="flex w-full items-center gap-6 text-xs tabular-nums md:w-40 md:justify-end">
        <span><span className="font-semibold text-brand-600 dark:text-brand-400">{formatNumber(c.successCount)}</span> <span className="text-zinc-500">sent</span></span>
        <span><span className="font-semibold text-red-500">{formatNumber(c.failedCount)}</span> <span className="text-zinc-500">failed</span></span>
      </div>

      <div className="flex items-center gap-1 md:w-28 md:justify-end" onClick={(e) => e.stopPropagation()}>
        {allowed.canPause && <Button variant="ghost" size="icon-sm" icon={Pause} title="Pause" aria-label="Pause" loading={isBusy(c, 'pause')} onClick={() => actions.pause(c)} />}
        {(allowed.canResume || allowed.canStart) && <Button variant="ghost" size="icon-sm" icon={Play} title="Start" aria-label="Start" loading={isBusy(c, 'resume') || isBusy(c, 'start')} onClick={() => (allowed.canStart ? actions.start(c) : actions.resume(c))} />}
        <ActionMenu items={[
          { label: 'Edit', icon: Pencil, onClick: () => onEdit(c), hidden: !allowed.canEdit },
          { label: 'Duplicate', icon: Copy, onClick: () => actions.duplicate(c) },
          { label: 'Run again', icon: RotateCcw, onClick: () => actions.rerun(c), hidden: !allowed.canRerun },
          { label: 'Stop', icon: Square, onClick: () => actions.stop(c), hidden: !allowed.canStop || c.status === 'draft' },
          { label: 'Export CSV', icon: Download, onClick: () => actions.exportCsv(c, 'all') },
          { divider: true },
          { label: 'Delete', icon: Trash2, danger: true, onClick: () => actions.remove(c) },
        ]} />
      </div>
    </div>
  );
}

function CampaignsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [filter, setFilter] = useState(params.get('status') === 'needs_review' ? 'needs_review' : 'all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 150);
  const [formState, setFormState] = useState(() => ({ open: params.get('new') === '1', campaign: null }));
  const [openId, setOpenId] = useState(params.get('open'));
  const { data: campaigns, loading, refresh } = useApi('/api/campaigns', { interval: 6000, select: (d) => d.campaigns });
  const { actions, isBusy } = useCampaignActions(useCallback((res) => {
    refresh();
    if (res?.campaignId && res?.msg?.includes('duplicated')) setOpenId(res.campaignId);
  }, [refresh]));

  useEffect(() => {
    if (params.get('new') === '1' || params.get('open') || params.get('status')) router.replace('/campaigns', { scroll: false });
  }, [params, router]);

  const counts = useMemo(() => {
    const out = { all: campaigns?.length || 0 };
    for (const f of FILTERS.slice(1)) out[f.value] = (campaigns || []).filter((c) => f.match.includes(c.status)).length;
    return out;
  }, [campaigns]);

  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.value === filter);
    const q = debouncedSearch.trim().toLowerCase();
    return (campaigns || []).filter((c) => (!f?.match || f.match.includes(c.status)) && (!q || c.campaignName.toLowerCase().includes(q) || c.contactList?.name?.toLowerCase().includes(q)));
  }, [campaigns, filter, debouncedSearch]);

  const openEdit = async (c) => {
    try {
      const res = await api.get(`/api/campaigns?campaignId=${encodeURIComponent(c.campaignId)}`);
      setFormState({ open: true, campaign: res.campaign });
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Create, schedule and monitor bulk WhatsApp campaigns."
        actions={<Button icon={Plus} onClick={() => setFormState({ open: true, campaign: null })}>New campaign</Button>}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs tabs={FILTERS.map((f) => ({ ...f, count: counts[f.value] }))} value={filter} onChange={setFilter} />
        <SearchInput value={search} onChange={setSearch} placeholder="Search campaigns or lists…" className="lg:w-72" />
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-6 px-5 py-5">
                <div className="flex-1 space-y-2"><div className="skeleton h-4 w-48" /><div className="skeleton h-3 w-32" /></div>
                <div className="skeleton hidden h-2 w-56 md:block" />
              </div>
            ))}
          </div>
        ) : !visible.length ? (
          campaigns?.length ? (
            <EmptyState icon={Megaphone} title="No campaigns match" description="Try a different filter or search." action={<Button variant="secondary" size="sm" onClick={() => { setFilter('all'); setSearch(''); }}>Clear filters</Button>} />
          ) : (
            <EmptyState icon={Megaphone} title="Launch your first campaign" description="Pick a contact list, write a few message variations and let WhatBot handle pacing and delivery." action={<Button icon={Plus} onClick={() => setFormState({ open: true, campaign: null })}>New campaign</Button>} />
          )
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {visible.map((c, i) => (
              <CampaignRow key={c.campaignId} c={c} index={i} actions={actions} isBusy={isBusy} onOpen={setOpenId} onEdit={openEdit} />
            ))}
          </div>
        )}
      </Card>

      {visible.some((c) => c.status === 'scheduled') && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500"><CalendarClock className="h-3.5 w-3.5" />Scheduled campaigns start automatically, even if this page is closed.</p>
      )}

      <CampaignForm open={formState.open} campaign={formState.campaign} onClose={() => setFormState({ open: false, campaign: null })} onSaved={refresh} />
      <CampaignDetail campaignId={openId} onClose={() => setOpenId(null)} onEdit={openEdit} onChanged={refresh} />
    </>
  );
}

export default function CampaignsPage() {
  return (
    <Suspense fallback={<div className="skeleton h-96 w-full" />}>
      <CampaignsContent />
    </Suspense>
  );
}
