'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCheck,
  Clock,
  Copy,
  Download,
  Eye,
  FileText,
  MessageCircleReply,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Send,
  ShieldOff,
  Square,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useApi } from '@/app/components/hooks';
import {
  ActionMenu,
  Button,
  CampaignStatusBadge,
  DeliveryBadge,
  Drawer,
  Input,
  Modal,
  Pagination,
  Progress,
  Tabs,
  cn,
  formatDateTime,
  formatDuration,
  formatNumber,
  timeAgo,
} from '@/app/components/ui';
import { formatPhone } from '@/lib/phone';
import { availableActions, useCampaignActions } from './useCampaignActions';

const LOG_TABS = [
  { value: 'all', label: 'All' },
  { value: 'sent', label: 'Sent' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'read', label: 'Read' },
  { value: 'replied', label: 'Replied' },
  { value: 'failed', label: 'Failed' },
  { value: 'unknown', label: 'Uncertain' },
  { value: 'skipped', label: 'Opted out' },
];

function Metric({ icon: Icon, label, value, tone }) {
  const tones = { green: 'text-brand-600 dark:text-brand-400', violet: 'text-violet-600 dark:text-violet-400', sky: 'text-sky-600 dark:text-sky-400', red: 'text-red-600 dark:text-red-400', amber: 'text-amber-600 dark:text-amber-400', gray: 'text-zinc-500' };
  return (
    <div className="rounded-xl border border-zinc-200/80 p-3 dark:border-zinc-800">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500"><Icon className={cn('h-3.5 w-3.5', tones[tone])} />{label}</div>
      <p className="mt-1 text-lg font-semibold tabular-nums">{formatNumber(value)}</p>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right font-medium text-zinc-800 dark:text-zinc-200">{children}</span>
    </div>
  );
}

function pauseExplanation(c) {
  if (c.status !== 'paused') return null;
  if (c.pauseReason === 'outside_hours') return `Outside sending hours. Resumes ${c.nextResumeAt ? formatDateTime(c.nextResumeAt) : 'next window'}.`;
  if (c.pauseReason === 'daily_limit') return `Daily limit of ${formatNumber(c.dailyLimit)} reached. Resumes ${c.nextResumeAt ? formatDateTime(c.nextResumeAt) : 'tomorrow'}.`;
  return c.nextResumeAt ? `Resumes ${formatDateTime(c.nextResumeAt)}.` : 'Paused manually.';
}

export default function CampaignDetail({ campaignId, onClose, onEdit, onChanged }) {
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const [reschedule, setReschedule] = useState(null);
  const { data, refresh } = useApi(campaignId ? `/api/campaigns?campaignId=${encodeURIComponent(campaignId)}` : null, { interval: 4000 });
  const { data: logs, refresh: refreshLogs } = useApi(
    campaignId ? `/api/campaigns?campaignId=${encodeURIComponent(campaignId)}&action=messages&page=${page}&limit=20${tab !== 'all' ? `&status=${tab}` : ''}` : null,
    { interval: 6000, keepPrevious: true }
  );
  const { actions, isBusy } = useCampaignActions((res) => {
    refresh();
    refreshLogs();
    onChanged?.();
    if (res?.deleted) onClose();
  });

  const c = data?.campaign;
  const stats = data?.stats || {};
  const allowed = c ? availableActions(c.status) : {};
  const pct = c?.totalNumbers ? Math.round((c.processedNumbers / c.totalNumbers) * 100) : 0;

  return (
    <Drawer
      open={!!campaignId}
      onClose={onClose}
      width="max-w-3xl"
      title={c?.campaignName || 'Loading…'}
      description={c && (
        <span className="flex flex-wrap items-center gap-2">
          <CampaignStatusBadge status={c.status} />
          <span>Run #{c.runNumber || 1}</span>
          <span>·</span>
          <span>Created {timeAgo(c.createdAt)}</span>
        </span>
      )}
      headerExtra={c && (
        <ActionMenu items={[
          { label: 'Edit', icon: Pencil, onClick: () => onEdit(c), hidden: !allowed.canEdit },
          { label: 'Reschedule', icon: CalendarClock, onClick: () => setReschedule({ date: '', time: '09:00' }), hidden: !allowed.canReschedule },
          { label: 'Duplicate', icon: Copy, onClick: () => actions.duplicate(c) },
          { label: 'Run again', icon: RotateCcw, onClick: () => actions.rerun(c), hidden: !allowed.canRerun },
          { divider: true },
          { label: 'Export all', icon: Download, onClick: () => actions.exportCsv(c, 'all') },
          { label: 'Export sent', icon: Download, onClick: () => actions.exportCsv(c, 'sent') },
          { label: 'Export failed', icon: Download, onClick: () => actions.exportCsv(c, 'failed') },
          { label: 'Export not yet sent', icon: Download, onClick: () => actions.exportCsv(c, 'unsent') },
          { divider: true },
          { label: 'Delete', icon: Trash2, danger: true, onClick: () => actions.remove(c) },
        ]} />
      )}
    >
      {!c ? (
        <div className="space-y-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24 w-full" />)}</div>
      ) : (
        <div className="space-y-6">
          {c.status === 'needs_review' && (
            <div className="animate-fade-in rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-500/20 dark:bg-red-500/10">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-red-900 dark:text-red-200">Delivery outcome uncertain</p>
                  <p className="mt-1 text-sm text-red-800/90 dark:text-red-300/90">
                    The message to <b className="tabular-nums">{formatPhone(c.review?.number)}</b> may or may not have been delivered
                    {c.review?.reason ? ` (${c.review.reason})` : ''}. Check WhatsApp on the sending phone, then choose how to continue.
                  </p>
                  {data.reviewMessage && ['delivered', 'read'].includes(data.reviewMessage.deliveryStatus) && (
                    <p className="mt-2 text-sm font-medium text-brand-700 dark:text-brand-300">A delivery receipt has arrived for this message since. It is safe to mark it as sent.</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" icon={CheckCheck} loading={isBusy(c, 'resolve')} onClick={() => actions.resolve(c, 'mark_sent')}>It was sent, continue</Button>
                    <Button size="sm" variant="secondary" icon={Send} onClick={() => actions.resolve(c, 'resend')}>Resend it</Button>
                    <Button size="sm" variant="secondary" onClick={() => actions.resolve(c, 'skip')}>Skip this contact</Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-zinc-200/80 bg-gradient-to-br from-white to-zinc-50 p-5 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-900/40">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-zinc-500">Progress</p>
                <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">{pct}%</p>
                <p className="mt-1 text-sm text-zinc-500">{formatNumber(c.processedNumbers)} of {formatNumber(c.totalNumbers)} contacts processed</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {allowed.canStart && <Button icon={Play} loading={isBusy(c, 'start')} onClick={() => actions.start(c)}>Start now</Button>}
                {allowed.canPause && <Button variant="secondary" icon={Pause} loading={isBusy(c, 'pause')} onClick={() => actions.pause(c)}>Pause</Button>}
                {allowed.canResume && <Button icon={Play} loading={isBusy(c, 'resume')} onClick={() => actions.resume(c)}>Resume</Button>}
                {c.status === 'completed' && <Button variant="secondary" icon={RotateCcw} onClick={() => actions.rerun(c)}>Run again</Button>}
                {allowed.canStop && c.status !== 'draft' && <Button variant="danger-ghost" icon={Square} onClick={() => actions.stop(c)}>Stop</Button>}
              </div>
            </div>
            <Progress className="mt-4" value={c.processedNumbers} max={c.totalNumbers} striped={c.status === 'running'} tone={c.status === 'needs_review' || c.status === 'error' ? 'red' : c.status === 'paused' ? 'amber' : 'green'} />
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500">
              {c.status === 'scheduled' && c.scheduledStartAt && <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />Starts {formatDateTime(c.scheduledStartAt)}</span>}
              {c.lastSentAt && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Last sent {timeAgo(c.lastSentAt)}</span>}
              {pauseExplanation(c) && <span className="text-amber-600 dark:text-amber-400">{pauseExplanation(c)}</span>}
              {c.lastError && c.status !== 'needs_review' && <span className="text-amber-600 dark:text-amber-400">{c.lastError}</span>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric icon={Send} label="Sent" value={stats.sentTotal} tone="green" />
            <Metric icon={CheckCheck} label="Delivered" value={(stats.delivered || 0) + (stats.read || 0)} tone="sky" />
            <Metric icon={Eye} label="Read" value={stats.read} tone="violet" />
            <Metric icon={MessageCircleReply} label="Replied" value={stats.replied} tone="sky" />
            <Metric icon={XCircle} label="Failed" value={stats.failed} tone="red" />
            <Metric icon={AlertTriangle} label="Uncertain" value={stats.unknown} tone="amber" />
            <Metric icon={ShieldOff} label="Opted out" value={stats.skipped} tone="gray" />
            <Metric icon={Clock} label="Remaining" value={Math.max(0, (c.totalNumbers || 0) - (c.processedNumbers || 0))} tone="gray" />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Settings</h4>
              <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200/80 px-4 dark:divide-zinc-800 dark:border-zinc-800">
                <Row label="Contact list">{c.contactList?.name || '—'}</Row>
                <Row label="Profiles">{(c.selectedClients || []).map((id) => c.clientNames?.[id] || id).join(', ')}</Row>
                <Row label="Delay">{c.delaySettings?.minDelay}–{c.delaySettings?.maxDelay} {c.delaySettings?.unit || 'minutes'}</Row>
                <Row label="Daily limit">{c.dailyLimit ? `${formatNumber(c.dailyLimit)} / day` : 'Unlimited'}</Row>
                <Row label="Sending hours">{c.scheduling?.windowEnabled !== false && c.scheduling?.startTime ? `${c.scheduling.startTime}–${c.scheduling.endTime}` : 'Any time'}</Row>
                <Row label="Time zone">{c.scheduling?.timezone || '—'}</Row>
                {c.summary?.averageDeliveryTime > 0 && <Row label="Avg. send time">{formatDuration(c.summary.averageDeliveryTime)}</Row>}
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Message variations</h4>
              <div className="space-y-2">
                {(c.messages || []).map((m, i) => (
                  <div key={i} className="rounded-xl border border-zinc-200/80 p-3 dark:border-zinc-800">
                    <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-zinc-500">
                      <span>#{i + 1}</span>
                      {m.hasMedia && <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{m.mediaName || 'attachment'}</span>}
                    </div>
                    <p className="line-clamp-3 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{m.text || <i className="text-zinc-400">No text</i>}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Delivery log</h4>
              <Tabs tabs={LOG_TABS} value={tab} onChange={(v) => { setTab(v); setPage(1); }} />
            </div>
            <div className="overflow-hidden rounded-xl border border-zinc-200/80 dark:border-zinc-800">
              <table className="w-full">
                <thead className="bg-zinc-50 dark:bg-zinc-900">
                  <tr>
                    <th className="th">Recipient</th>
                    <th className="th">Status</th>
                    <th className="th hidden sm:table-cell">Profile</th>
                    <th className="th text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {(logs?.messages || []).map((m) => (
                    <tr key={m._id} className="animate-fade-in hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
                      <td className="td">
                        <p className="font-medium tabular-nums">{formatPhone(m.number)}</p>
                        {m.error && <p className="mt-0.5 max-w-xs truncate text-xs text-red-500" title={m.error}>{m.error}</p>}
                      </td>
                      <td className="td"><div className="flex flex-wrap items-center gap-1"><DeliveryBadge status={m.deliveryStatus} />{m.repliedAt && <span className="text-[11px] font-medium text-sky-600">↩ replied</span>}</div></td>
                      <td className="td hidden text-zinc-500 sm:table-cell">{c.clientNames?.[m.clientUsed] || m.clientUsed}</td>
                      <td className="td text-right text-xs text-zinc-500">{timeAgo(m.sentTime)}</td>
                    </tr>
                  ))}
                  {logs && !logs.messages?.length && (
                    <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-zinc-500">No messages here yet.</td></tr>
                  )}
                  {!logs && <tr><td colSpan={4} className="p-4"><div className="skeleton h-24 w-full" /></td></tr>}
                </tbody>
              </table>
            </div>
            {logs && <div className="mt-3"><Pagination page={logs.page} pages={logs.pages} total={logs.total} onChange={setPage} /></div>}
          </div>
        </div>
      )}

      <Modal
        open={!!reschedule}
        onClose={() => setReschedule(null)}
        size="sm"
        title="Reschedule campaign"
        description={`Times are in ${c?.scheduling?.timezone || 'the campaign time zone'}.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReschedule(null)}>Cancel</Button>
            <Button disabled={!reschedule?.date || !reschedule?.time} loading={c && isBusy(c, 'reschedule')} onClick={async () => { await actions.reschedule(c, reschedule.date, reschedule.time); setReschedule(null); }}>Save</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Input type="date" value={reschedule?.date || ''} onChange={(e) => setReschedule((r) => ({ ...r, date: e.target.value }))} />
          <Input type="time" value={reschedule?.time || ''} onChange={(e) => setReschedule((r) => ({ ...r, time: e.target.value }))} />
        </div>
      </Modal>
    </Drawer>
  );
}
