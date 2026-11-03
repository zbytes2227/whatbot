'use client';

import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, Download, Filter, History, RefreshCw, X } from 'lucide-react';
import { download } from '@/lib/clientApi';
import { formatPhone } from '@/lib/phone';
import { useApi, useDebounced } from '@/app/components/hooks';
import { useSession } from '@/app/components/AppShell';
import {
  Badge,
  Button,
  Card,
  DeliveryBadge,
  EmptyState,
  Input,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  cn,
  formatDateTime,
  formatDuration,
  formatNumber,
} from '@/app/components/ui';

const STATUSES = [
  ['all', 'All statuses'], ['sent', 'Sent'], ['delivered', 'Delivered'], ['read', 'Read'], ['replied', 'Replied'],
  ['failed', 'Failed'], ['unknown', 'Uncertain'], ['pending', 'Pending'], ['skipped', 'Opted out'],
];
const SOURCES = [['all', 'All sources'], ['campaign', 'Campaigns'], ['api', 'API'], ['manual', 'Quick send']];
const EMPTY = { deliveryStatus: 'all', source: 'all', clientUsed: 'all', from: '', to: '' };

function MiniStat({ label, value, tone }) {
  const tones = { green: 'text-brand-600 dark:text-brand-400', red: 'text-red-600 dark:text-red-400', violet: 'text-violet-600 dark:text-violet-400', blue: 'text-sky-600 dark:text-sky-400', gray: 'text-zinc-900 dark:text-white' };
  return (
    <div className="px-5 py-4">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className={cn('mt-1 text-xl font-semibold tabular-nums', tones[tone])}>{value}</p>
    </div>
  );
}

export default function HistoryPage() {
  const { profiles } = useSession();
  const [filters, setFilters] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const debouncedSearch = useDebounced(search, 350);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && v !== 'all' && p.set(k, v));
    if (debouncedSearch.trim()) p.set('search', debouncedSearch.trim());
    return p;
  }, [filters, debouncedSearch]);

  const { data, loading, refreshing, refresh } = useApi(`/api/messageHistory?${query.toString()}&page=${page}&limit=25`, { interval: 15000, select: (d) => d.data, keepPrevious: true });
  const setFilter = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const activeFilters = Object.entries(filters).filter(([k, v]) => v && v !== EMPTY[k]).length;
  const stats = data?.stats;
  const profileNames = data?.profiles || {};

  return (
    <>
      <PageHeader
        title="Message logs"
        description="Every message sent from campaigns, the API and quick send."
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} onClick={refresh} loading={refreshing}>Refresh</Button>
            <Button variant="secondary" icon={Download} onClick={() => download(`/api/messageHistory?${query.toString()}&format=csv`)}>Export CSV</Button>
          </>
        }
      />

      <Card className="mb-4 grid grid-cols-2 divide-x divide-y divide-zinc-100 overflow-hidden dark:divide-zinc-800 sm:grid-cols-5 sm:divide-y-0">
        <MiniStat label="Total" value={stats ? formatNumber(stats.total) : '—'} tone="gray" />
        <MiniStat label="Sent" value={stats ? formatNumber(stats.sent) : '—'} tone="green" />
        <MiniStat label="Read" value={stats ? formatNumber(stats.read) : '—'} tone="violet" />
        <MiniStat label="Failed" value={stats ? formatNumber(stats.failed) : '—'} tone="red" />
        <MiniStat label="Avg. send time" value={stats?.avgDeliveryTime ? formatDuration(stats.avgDeliveryTime) : '—'} tone="blue" />
      </Card>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search number or message text…" className="flex-1" />
        <div className="flex gap-2">
          <Select value={filters.deliveryStatus} onChange={(e) => setFilter({ deliveryStatus: e.target.value })} className="w-40">
            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Button variant={showFilters || activeFilters > 1 ? 'dark' : 'secondary'} icon={Filter} onClick={() => setShowFilters((s) => !s)}>
            Filters{activeFilters > 0 && <span className="rounded-md bg-white/20 px-1.5 text-[11px]">{activeFilters}</span>}
          </Button>
        </div>
      </div>

      {showFilters && (
        <Card className="mb-4 grid animate-fade-up gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <Select value={filters.source} onChange={(e) => setFilter({ source: e.target.value })}>{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          <Select value={filters.clientUsed} onChange={(e) => setFilter({ clientUsed: e.target.value })}>
            <option value="all">All profiles</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Input type="date" value={filters.from} onChange={(e) => setFilter({ from: e.target.value })} aria-label="From date" />
          <Input type="date" value={filters.to} onChange={(e) => setFilter({ to: e.target.value })} aria-label="To date" />
          <Button variant="ghost" icon={X} onClick={() => { setFilters(EMPTY); setSearch(''); setPage(1); }}>Reset</Button>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th className="th">Recipient</th>
                <th className="th">Message</th>
                <th className="th">Status</th>
                <th className="th">Source</th>
                <th className="th">Profile</th>
                <th className="th text-right">Sent</th>
                <th className="th w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading && [0, 1, 2, 3, 4].map((i) => <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="skeleton h-6 w-full" /></td></tr>)}
              {(data?.messages || []).map((m) => (
                <Fragment key={m._id}>
                  <tr className="cursor-pointer transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-800/30" onClick={() => setExpanded(expanded === m._id ? null : m._id)}>
                    <td className="td whitespace-nowrap font-medium tabular-nums">{formatPhone(m.number)}</td>
                    <td className="td max-w-xs"><p className="truncate text-zinc-600 dark:text-zinc-400">{m.hasMedia && '📎 '}{m.message || <i className="text-zinc-400">—</i>}</p></td>
                    <td className="td"><div className="flex items-center gap-1"><DeliveryBadge status={m.deliveryStatus} />{m.repliedAt && <Badge tone="blue">Replied</Badge>}</div></td>
                    <td className="td capitalize text-zinc-500">{m.source === 'manual' ? 'Quick send' : m.source}</td>
                    <td className="td whitespace-nowrap text-zinc-500">{profileNames[m.clientUsed] || m.clientUsed}</td>
                    <td className="td whitespace-nowrap text-right text-xs text-zinc-500">{formatDateTime(m.sentTime)}</td>
                    <td className="td"><ChevronDown className={cn('h-4 w-4 text-zinc-400 transition-transform', expanded === m._id && 'rotate-180')} /></td>
                  </tr>
                  {expanded === m._id && (
                    <tr className="bg-zinc-50/60 dark:bg-zinc-900/60">
                      <td colSpan={7} className="px-4 py-4">
                        <div className="grid animate-fade-in gap-4 text-sm md:grid-cols-3">
                          <div className="md:col-span-2">
                            <p className="mb-1 text-xs font-semibold text-zinc-500">Message</p>
                            <p className="whitespace-pre-wrap rounded-lg bg-white p-3 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{m.message || '—'}</p>
                            {m.error && <p className="mt-2 rounded-lg bg-red-50 p-3 text-red-700 dark:bg-red-500/10 dark:text-red-300">{m.error}</p>}
                          </div>
                          <dl className="space-y-1.5 text-xs">
                            {[
                              ['Original input', m.originalNumber],
                              ['Campaign', m.campaignId],
                              ['Attachment', m.mediaName],
                              ['Send time', m.deliveryTime ? formatDuration(m.deliveryTime) : null],
                              ['Delivered', m.deliveredAt && formatDateTime(m.deliveredAt)],
                              ['Read', m.readAt && formatDateTime(m.readAt)],
                              ['Replied', m.repliedAt && formatDateTime(m.repliedAt)],
                            ].filter(([, v]) => v).map(([k, v]) => (
                              <div key={k} className="flex justify-between gap-3"><dt className="text-zinc-500">{k}</dt><dd className="truncate font-medium">{v}</dd></div>
                            ))}
                          </dl>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {data && !data.messages.length && <EmptyState icon={History} title="No messages found" description={activeFilters || search ? 'Try adjusting your filters.' : 'Messages appear here as soon as they are sent.'} />}
      </Card>
      {data && <div className="mt-3"><Pagination page={data.pagination.currentPage} pages={data.pagination.totalPages} total={data.pagination.totalItems} onChange={setPage} /></div>}
    </>
  );
}
