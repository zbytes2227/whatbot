'use client';

import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { api, download } from '@/lib/clientApi';
import { useBusy } from '@/app/components/hooks';
import { useConfirm } from '@/app/components/ui';

export function useCampaignActions(onChanged) {
  const confirm = useConfirm();
  const [busy, run] = useBusy();

  const act = useCallback(async (campaign, action, extra = {}) => {
    const key = `${campaign.campaignId}:${action}`;
    return run(key, async () => {
      try {
        const res = await api.patch(`/api/campaigns?campaignId=${encodeURIComponent(campaign.campaignId)}`, { action, ...extra });
        toast.success(res.msg || 'Done');
        onChanged?.(res);
        return res;
      } catch (err) {
        toast.error(err.message);
        return null;
      }
    });
  }, [run, onChanged]);

  const actions = {
    start: (c) => act(c, 'start'),
    pause: (c) => act(c, 'pause'),
    resume: (c) => act(c, 'resume'),
    duplicate: (c) => act(c, 'duplicate'),
    reschedule: (c, date, time) => act(c, 'reschedule', { date, time }),
    resolve: (c, mode) => act(c, 'resolve', { mode }),
    stop: async (c) => {
      const ok = await confirm({ title: 'Stop campaign?', message: `“${c.campaignName}” will stop sending. You can resume it later from where it stopped.`, confirmText: 'Stop campaign', tone: 'danger' });
      if (ok) await act(c, 'stop');
    },
    rerun: async (c) => {
      const ok = await confirm({
        title: 'Run campaign again?',
        message: 'This starts a fresh run from the first contact. Everyone in the list will be messaged again. Logs from previous runs are kept.',
        confirmText: 'Start new run',
      });
      if (ok) await act(c, 'rerun');
    },
    remove: async (c) => {
      const result = await confirm({
        title: 'Delete campaign?',
        message: `“${c.campaignName}” will be permanently deleted. This cannot be undone.`,
        confirmText: 'Delete',
        tone: 'danger',
        checkbox: 'Also delete its message logs',
      });
      if (!result) return;
      await run(`${c.campaignId}:delete`, async () => {
        try {
          await api.del(`/api/campaigns?campaignId=${encodeURIComponent(c.campaignId)}${result.checked ? '&deleteHistory=1' : ''}`);
          toast.success('Campaign deleted');
          onChanged?.({ deleted: c.campaignId });
        } catch (err) {
          toast.error(err.message);
        }
      });
    },
    exportCsv: (c, type = 'all') => download(`/api/campaigns?campaignId=${encodeURIComponent(c.campaignId)}&action=exportCsv&type=${type}`),
  };

  const isBusy = (c, action) => !!busy[`${c.campaignId}:${action}`];
  return { actions, isBusy };
}

/** Which primary actions make sense for a status. */
export function availableActions(status) {
  return {
    canStart: ['draft', 'scheduled'].includes(status),
    canPause: ['running', 'pending'].includes(status),
    canResume: ['paused', 'stopped', 'error'].includes(status),
    canStop: ['running', 'pending', 'paused', 'scheduled', 'needs_review', 'error', 'draft'].includes(status),
    canRerun: ['completed', 'stopped', 'error'].includes(status),
    canEdit: status !== 'completed',
    canReschedule: ['scheduled', 'pending', 'paused', 'stopped', 'error', 'draft'].includes(status),
  };
}
