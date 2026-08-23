'use client';

import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { authFetch } from '@/lib/clientApi';

const EMPTY_MESSAGES = ['', '', '', ''];

// ─── Status config ──────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:   { label: 'Pending',   dot: 'bg-sky-400',     badge: 'bg-sky-50 text-sky-700 ring-sky-200' },
  running:   { label: 'Running',   dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  paused:    { label: 'Paused',    dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 ring-amber-200' },
  completed: { label: 'Completed', dot: 'bg-zinc-400',    badge: 'bg-zinc-100 text-zinc-600 ring-zinc-200' },
  stopped:   { label: 'Stopped',   dot: 'bg-red-400',     badge: 'bg-red-50 text-red-700 ring-red-200' },
  scheduled: { label: 'Scheduled', dot: 'bg-violet-400',  badge: 'bg-violet-50 text-violet-700 ring-violet-200' },
  error:     { label: 'Error',     dot: 'bg-red-400',     badge: 'bg-red-50 text-red-700 ring-red-200' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.completed;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cfg.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Stat card ──────────────────────────────────────────────────────────────
function StatCard({ label, value, accent = false }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? 'border-zinc-200 bg-zinc-900 text-white' : 'border-zinc-200 bg-white'}`}>
      <p className={`text-xs font-medium uppercase tracking-wider ${accent ? 'text-zinc-400' : 'text-zinc-500'}`}>{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent ? 'text-white' : 'text-zinc-900'}`}>{value}</p>
    </div>
  );
}

// ─── Toast ──────────────────────────────────────────────────────────────────
function Toast({ notice, onDismiss }) {
  if (!notice.message) return null;
  const isError = notice.type === 'error';
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
      isError
        ? 'border-red-200 bg-red-50 text-red-800'
        : 'border-emerald-200 bg-emerald-50 text-emerald-800'
    }`}>
      <svg className={`mt-0.5 h-4 w-4 flex-shrink-0 ${isError ? 'text-red-500' : 'text-emerald-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {isError
          ? <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          : <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        }
      </svg>
      <span className="flex-1">{notice.message}</span>
      <button onClick={onDismiss} className="ml-2 text-current opacity-50 hover:opacity-100">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ─── Loading skeleton ────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <Layout>
      <div className="space-y-5">
        <div className="h-16 animate-pulse rounded-xl bg-zinc-100" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-100" />
          ))}
        </div>
        <div className="h-12 animate-pulse rounded-xl bg-zinc-100" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-100" />
        ))}
      </div>
    </Layout>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────
function EmptyState({ hasFilters, onClear, onCreate }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100">
        <svg className="h-6 w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
        </svg>
      </div>
      {hasFilters ? (
        <>
          <p className="mt-3 text-sm font-medium text-zinc-900">No campaigns match your filters</p>
          <p className="mt-1 text-sm text-zinc-500">Try adjusting your search or status filter.</p>
          <button onClick={onClear} className="mt-4 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            Clear filters
          </button>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm font-medium text-zinc-900">No campaigns yet</p>
          <p className="mt-1 text-sm text-zinc-500">Create your first campaign to start sending messages.</p>
          <button onClick={onCreate} className="mt-4 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
            Create campaign
          </button>
        </>
      )}
    </div>
  );
}

// ─── Field components ────────────────────────────────────────────────────────
function FieldLabel({ children, required }) {
  return (
    <label className="mb-1 block text-xs font-medium text-zinc-600">
      {children}{required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
  );
}

function InputField({ label, value, onChange, type = 'text', required = false, disabled = false, placeholder = '' }) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-zinc-200 px-3 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 disabled:bg-zinc-50 disabled:text-zinc-400"
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options, required = false }) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="h-9 w-full rounded-lg border border-zinc-200 px-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
      >
        <option value="">Select…</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Campaign form (shared by create + edit) ─────────────────────────────────
function CampaignForm({
  title,
  formData,
  setFormField,
  setFormData,
  saving,
  contactLists,
  readyClients,
  mediaFiles,
  imagePreviews,
  handleImageChange,
  existingAttachments = [null, null, null, null],
  removedAttachments = [false, false, false, false],
  setRemovedAttachments,
  onSubmit,
  onClose,
  submitLabel,
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/40 backdrop-blur-sm sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 bg-white px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
            <p className="text-xs text-zinc-500">Configure your campaign message variants, media, and delivery schedule.</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-5 p-5">

          {/* Basic info */}
          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Campaign details</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <InputField
                label="Campaign name"
                value={formData.campaignName}
                onChange={(v) => setFormField('campaignName', v)}
                required
                placeholder="e.g. Summer Promo 2025"
              />
              <SelectField
                label="Contact list"
                value={formData.contactList}
                onChange={(v) => setFormField('contactList', v)}
                required
                options={contactLists.map((l) => ({ value: l._id, label: l.name }))}
              />
            </div>
          </section>

          {/* Messages */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Messages</p>
              <span className="text-xs text-zinc-400">Up to 4 variants</span>
            </div>
            {formData.messages.map((msg, idx) => {
              const hasExistingMedia = existingAttachments?.[idx]?.hasMedia && !removedAttachments?.[idx] && !imagePreviews[idx];

              return (
                <div key={idx} className="rounded-xl border border-zinc-200 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-500">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-medium text-zinc-600">Message {idx + 1}</span>
                    {idx > 0 && <span className="ml-auto text-[10px] text-zinc-400">optional</span>}
                  </div>
                  <textarea
                    value={msg}
                    onChange={(e) =>
                      setFormData((prev) => {
                        const msgs = [...prev.messages];
                        msgs[idx] = e.target.value;
                        return { ...prev, messages: msgs };
                      })
                    }
                    rows={3}
                    placeholder={`Enter message ${idx + 1}…`}
                    className="w-full resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
                  />

                  {/* Existing Preserved Media Banner */}
                  {hasExistingMedia && (
                    <div className="mt-2.5 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs">
                      <div className="flex items-center gap-2 text-emerald-900">
                        <span>📎</span>
                        <span className="font-semibold">{existingAttachments[idx].mediaName || 'Attached Media'}</span>
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                          Preserved
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer font-medium text-emerald-700 hover:underline">
                          <input
                            type="file"
                            accept="image/*,video/*"
                            className="hidden"
                            onChange={(e) => handleImageChange(idx, e)}
                          />
                          Replace
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            if (setRemovedAttachments) {
                              setRemovedAttachments((prev) => {
                                const next = [...prev];
                                next[idx] = true;
                                return next;
                              });
                            }
                          }}
                          className="font-medium text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Image upload / preview */}
                  <div className="mt-2 flex items-center gap-3">
                    {!hasExistingMedia && (
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="image/*,video/*"
                          className="hidden"
                          onChange={(e) => handleImageChange(idx, e)}
                        />
                        <span className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                          </svg>
                          {imagePreviews[idx] ? 'Change new media' : 'Attach media'}
                        </span>
                      </label>
                    )}
                    {imagePreviews[idx] && (
                      <div className="flex items-center gap-2">
                        <img src={imagePreviews[idx]} alt="" className="h-8 w-8 rounded object-cover border border-zinc-200" />
                        <button
                          type="button"
                          onClick={() => {
                            handleImageChange(idx, { target: { files: [] } });
                          }}
                          className="text-[11px] text-red-500 hover:underline"
                        >
                          Cancel new file
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </section>

          {/* WhatsApp sessions */}
          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">WhatsApp sessions</p>
            {readyClients.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                No active sessions available. Connect a WhatsApp client first.
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {readyClients.map(([clientId, client]) => {
                  const checked = formData.selectedClients.includes(clientId);
                  return (
                    <label
                      key={clientId}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                        checked ? 'border-zinc-300 bg-zinc-50' : 'border-zinc-200 hover:border-zinc-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
                        checked={checked}
                        onChange={(e) => {
                          setFormData((prev) => ({
                            ...prev,
                            selectedClients: e.target.checked
                              ? [...prev.selectedClients, clientId]
                              : prev.selectedClients.filter((id) => id !== clientId),
                          }));
                        }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-900">
                          {client.accountInfo?.name || clientId}
                        </p>
                        <p className="truncate text-xs text-zinc-500">
                          {client.accountInfo?.number ? `+${client.accountInfo.number}` : clientId}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          {/* Scheduling + delays */}
          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Schedule & delays</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <InputField
                label="Start date"
                type="date"
                value={formData.startDate}
                onChange={(v) => setFormField('startDate', v)}
              />
              <InputField
                label="Start time"
                type="time"
                value={formData.startTime}
                onChange={(v) => setFormField('startTime', v)}
              />
              <InputField
                label="End time"
                type="time"
                value={formData.endTime}
                onChange={(v) => setFormField('endTime', v)}
              />
              <InputField
                label="Min delay (min)"
                type="number"
                value={formData.minDelay}
                onChange={(v) => setFormData((p) => ({ ...p, minDelay: parseInt(v, 10) || 1 }))}
              />
              <InputField
                label="Max delay (min)"
                type="number"
                value={formData.maxDelay}
                onChange={(v) => setFormData((p) => ({ ...p, maxDelay: parseInt(v, 10) || 1 }))}
              />
            </div>
          </section>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 border-t border-zinc-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50"
            >
              {saving && (
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {saving ? 'Saving…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Report modal ─────────────────────────────────────────────────────────────
function ReportModal({ campaign, onClose, onRefresh, onExportCsv }) {
  const progress = campaign.totalNumbers
    ? Math.round((campaign.processedNumbers / campaign.totalNumbers) * 100)
    : 0;
  const successRate = campaign.processedNumbers
    ? Math.round((campaign.successCount / campaign.processedNumbers) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/40 backdrop-blur-sm sm:items-center p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-zinc-100 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-zinc-900">Campaign report</h2>
                <StatusBadge status={campaign.status} />
              </div>
              <p className="mt-0.5 text-sm text-zinc-500">{campaign.campaignName}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onExportCsv?.(campaign.campaignId, 'sent')}
                className="hidden rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 sm:inline-flex"
              >
                Export sent
              </button>
              <button
                onClick={() => onExportCsv?.(campaign.campaignId, 'unsent')}
                className="hidden rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 sm:inline-flex"
              >
                Export unsent
              </button>
              <button
                onClick={onRefresh}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </button>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-5">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: 'Total', value: campaign.totalNumbers || 0 },
              { label: 'Sent', value: campaign.successCount || 0 },
              { label: 'Failed', value: campaign.failedCount || 0 },
              { label: 'Processed', value: campaign.processedNumbers || 0 },
              { label: 'Success rate', value: `${successRate}%` },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-zinc-200 p-3">
                <p className="text-xs text-zinc-500">{label}</p>
                <p className="mt-0.5 text-xl font-semibold tabular-nums text-zinc-900">{value}</p>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="rounded-xl border border-zinc-200 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-700">Delivery progress</span>
              <span className="text-sm font-semibold tabular-nums text-zinc-900">{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-2 rounded-full bg-zinc-900 transition-all duration-500"
                style={{ width: `${Math.max(progress, 2)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              {campaign.processedNumbers || 0} of {campaign.totalNumbers || 0} contacts processed
            </p>
          </div>

          {/* Activity log */}
          <div className="rounded-xl border border-zinc-200">
            <div className="border-b border-zinc-100 px-4 py-3">
              <p className="text-sm font-medium text-zinc-900">Recent activity</p>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {campaign.numberReports?.length ? (
                <div className="divide-y divide-zinc-100">
                  {campaign.numberReports
                    .slice()
                    .reverse()
                    .slice(0, 100)
                    .map((report, idx) => (
                      <div
                        key={`${report.number}-${report.timestamp}-${idx}`}
                        className="flex items-center justify-between px-4 py-2.5"
                      >
                        <div>
                          <p className="text-sm font-medium text-zinc-900">+{report.number}</p>
                          <p className="text-xs text-zinc-500">
                            {report.client} · Msg {(report.messageIndex || 0) + 1}
                          </p>
                        </div>
                        <div className="text-right">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                              report.status === 'success'
                                ? 'bg-emerald-50 text-emerald-700'
                                : report.status === 'failed'
                                ? 'bg-red-50 text-red-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {report.status}
                          </span>
                          <p className="mt-0.5 text-xs text-zinc-400">
                            {new Date(report.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="flex items-center justify-center py-12 text-sm text-zinc-400">
                  No activity recorded yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page component ─────────────────────────────────────────────────────
export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [contactLists, setContactLists] = useState([]);
  const [whatsappClients, setWhatsappClients] = useState({});

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState({ type: '', message: '' });

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [editingCampaign, setEditingCampaign] = useState(null);

  const [formData, setFormData] = useState({
    campaignName: '',
    contactList: '',
    messages: [...EMPTY_MESSAGES],
    selectedClients: [],
    minDelay: 5,
    maxDelay: 25,
    startDate: '',
    startTime: '07:00',
    endTime: '21:00',
  });

  const [mediaFiles, setMediaFiles] = useState([null, null, null, null]);
  const [imagePreviews, setImagePreviews] = useState([null, null, null, null]);
  const [existingAttachments, setExistingAttachments] = useState([null, null, null, null]);
  const [removedAttachments, setRemovedAttachments] = useState([false, false, false, false]);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchCampaigns, 7000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let interval;
    if (showReportModal && selectedCampaign?.campaignId) {
      interval = setInterval(() => fetchCampaignReport(selectedCampaign.campaignId, false), 3500);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [showReportModal, selectedCampaign?.campaignId]);

  const readyClients = useMemo(
    () => Object.entries(whatsappClients).filter(([, client]) => client.ready),
    [whatsappClients]
  );

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const text = `${c.campaignName || ''} ${c.contactList?.name || ''} ${c.status || ''}`.toLowerCase();
      return text.includes(searchQuery.toLowerCase());
    });
  }, [campaigns, statusFilter, searchQuery]);

  const stats = useMemo(() => ({
    total: campaigns.length,
    running: campaigns.filter((c) => c.status === 'running').length,
    scheduled: campaigns.filter((c) => c.status === 'scheduled').length,
    completed: campaigns.filter((c) => c.status === 'completed').length,
  }), [campaigns]);

  // ── API helpers ──────────────────────────────────────────────────────────
  async function fetchAllData() {
    try {
      setError('');
      const [cRes, coRes, clRes] = await Promise.all([
        authFetch('/api/campaigns'),
        authFetch('/api/contacts'),
        authFetch('/api/whatsapp?action=status'),
      ]);
      const [cJson, coJson, clJson] = await Promise.all([cRes.json(), coRes.json(), clRes.json()]);
      if (!cRes.ok)  throw new Error(cJson?.msg  || 'Failed to load campaigns');
      if (!coRes.ok) throw new Error(coJson?.msg || 'Failed to load contact lists');
      if (!clRes.ok) throw new Error(clJson?.msg || 'Failed to load WhatsApp clients');
      setCampaigns(cJson.campaigns || []);
      setContactLists(coJson.lists || []);
      setWhatsappClients(clJson.clients || {});
    } catch (err) {
      setError(err.message || 'Failed to load workspace');
    } finally {
      setLoading(false);
    }
  }

  async function fetchCampaigns() {
    try {
      setRefreshing(true);
      const res = await authFetch('/api/campaigns');
      const json = await res.json();
      if (res.ok) setCampaigns(json.campaigns || []);
    } catch { /* silent */ } finally {
      setRefreshing(false);
    }
  }

  function setFormField(field, value) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function clearFormState() {
    imagePreviews.forEach((p) => { if (p) URL.revokeObjectURL(p); });
    setFormData({
      campaignName: '', contactList: '', messages: [...EMPTY_MESSAGES],
      selectedClients: [], minDelay: 5, maxDelay: 25,
      startDate: '', startTime: '07:00', endTime: '21:00',
    });
    setMediaFiles([null, null, null, null]);
    setImagePreviews([null, null, null, null]);
    setExistingAttachments([null, null, null, null]);
    setRemovedAttachments([false, false, false, false]);
  }

  function openCreateModal() {
    clearFormState();
    const now = new Date();
    setFormData((p) => ({
      ...p,
      startDate: now.toISOString().slice(0, 10),
      startTime: now.toTimeString().slice(0, 5),
    }));
    setShowCreateModal(true);
  }

  function openEditModal(campaign) {
    setEditingCampaign(campaign);
    setFormData({
      campaignName: campaign.campaignName || '',
      contactList: campaign.contactList?._id || campaign.contactList || '',
      messages: [...(campaign.messages || []).map((m) => m.text), ...EMPTY_MESSAGES].slice(0, 4),
      selectedClients: campaign.selectedClients || [],
      minDelay: campaign.delaySettings?.minDelay || 5,
      maxDelay: campaign.delaySettings?.maxDelay || 25,
      startDate: campaign.scheduling?.startDate
        ? new Date(campaign.scheduling.startDate).toISOString().slice(0, 10)
        : '',
      startTime: campaign.scheduling?.startTime || '07:00',
      endTime: campaign.scheduling?.endTime || '21:00',
    });

    const existing = [0, 1, 2, 3].map((i) => {
      const m = campaign.messages?.[i];
      return m?.hasMedia ? { hasMedia: true, mediaName: m.mediaName || 'Attached Media', mediaType: m.mediaType } : null;
    });
    setExistingAttachments(existing);
    setRemovedAttachments([false, false, false, false]);
    setMediaFiles([null, null, null, null]);
    setImagePreviews([null, null, null, null]);
    setShowEditModal(true);
  }

  function handleImageChange(index, event) {
    const file = event.target.files?.[0] || null;
    setMediaFiles((prev) => { const n = [...prev]; n[index] = file; return n; });
    setImagePreviews((prev) => {
      const n = [...prev];
      if (n[index]) URL.revokeObjectURL(n[index]);
      n[index] = file ? URL.createObjectURL(file) : null;
      return n;
    });
  }

  async function handleCreateCampaign(event) {
    event.preventDefault();
    setSaving(true);
    setNotice({ type: '', message: '' });
    try {
      const payload = new FormData();
      payload.append('campaignName', formData.campaignName);
      payload.append('contactList', formData.contactList);
      payload.append('selectedClients', JSON.stringify(formData.selectedClients));
      payload.append('minDelay', String(formData.minDelay));
      payload.append('maxDelay', String(formData.maxDelay));
      payload.append('startDate', formData.startDate);
      payload.append('startTime', formData.startTime);
      payload.append('endTime', formData.endTime);
      formData.messages.forEach((message, index) => {
        if (!message.trim()) return;
        payload.append(`message${index + 1}`, message);
        if (mediaFiles[index]) payload.append(`media${index + 1}`, mediaFiles[index]);
      });
      const res = await authFetch('/api/campaigns', { method: 'POST', body: payload });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.msg || 'Failed to create campaign');
      setNotice({ type: 'success', message: 'Campaign created.' });
      setShowCreateModal(false);
      clearFormState();
      fetchCampaigns();
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Unable to create campaign' });
    } finally {
      setSaving(false);
    }
  }

  async function handleEditCampaign(event) {
    event.preventDefault();
    if (!editingCampaign?.campaignId) return;
    setSaving(true);
    setNotice({ type: '', message: '' });
    try {
      const payload = new FormData();
      payload.append('action', 'edit');
      payload.append('campaignId', editingCampaign.campaignId);
      payload.append('campaignName', formData.campaignName);
      payload.append('contactList', formData.contactList);
      payload.append('selectedClients', JSON.stringify(formData.selectedClients));
      payload.append('minDelay', String(formData.minDelay));
      payload.append('maxDelay', String(formData.maxDelay));
      payload.append('startDate', formData.startDate || '');
      payload.append('startTime', formData.startTime || '');
      payload.append('endTime', formData.endTime || '');

      formData.messages.forEach((message, index) => {
        if (!message.trim()) return;
        payload.append(`message${index + 1}`, message);
        if (mediaFiles[index]) {
          payload.append(`media${index + 1}`, mediaFiles[index]);
        }
        if (removedAttachments?.[index]) {
          payload.append(`removeMedia${index + 1}`, 'true');
        }
      });

      const res = await authFetch(`/api/campaigns`, {
        method: 'POST',
        body: payload,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.msg || 'Failed to update campaign');
      setNotice({ type: 'success', message: 'Campaign updated successfully.' });
      setShowEditModal(false);
      setEditingCampaign(null);
      clearFormState();
      fetchCampaigns();
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Unable to update campaign' });
    } finally {
      setSaving(false);
    }
  }

  async function handleCampaignAction(campaignId, action) {
    setNotice({ type: '', message: '' });
    try {
      const res = await authFetch(`/api/campaigns?campaignId=${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.msg || `Unable to ${action} campaign`);
      setNotice({ type: 'success', message: `Campaign ${action} applied.` });
      fetchCampaigns();
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Action failed' });
    }
  }

  async function handleDeleteCampaign(campaignId) {
    if (!window.confirm('Delete this campaign? This cannot be undone.')) return;
    try {
      const res = await authFetch(`/api/campaigns?campaignId=${campaignId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.msg || 'Failed to delete campaign');
      setCampaigns((prev) => prev.filter((c) => c.campaignId !== campaignId));
      setNotice({ type: 'success', message: 'Campaign deleted.' });
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Unable to delete campaign' });
    }
  }

  async function fetchCampaignReport(campaignId, openModal = true) {
    try {
      const res = await authFetch(`/api/campaigns?campaignId=${campaignId}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.msg || 'Unable to fetch report');
      setSelectedCampaign(data.campaign);
      if (openModal) setShowReportModal(true);
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Failed to fetch report' });
    }
  }

  async function downloadCampaignCsv(campaignId, type = 'all') {
    try {
      const res = await authFetch(`/api/campaigns?campaignId=${campaignId}&action=exportCsv&type=${type}`);
      if (!res.ok) throw new Error('Failed to export CSV');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${campaignId}_${type}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'CSV export failed' });
    }
  }

  async function handleReschedulePrompt(campaign) {
    const currentDate = campaign?.scheduling?.startDate
      ? new Date(campaign.scheduling.startDate).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const startDate = window.prompt('New start date (YYYY-MM-DD):', currentDate);
    if (!startDate) return;
    const startTime = window.prompt('New start time (HH:mm):', campaign?.scheduling?.startTime || '07:00');
    if (!startTime) return;
    const endTime = window.prompt('End time (HH:mm):', campaign?.scheduling?.endTime || '21:00') || '21:00';
    try {
      const res = await fetch(`/api/campaigns?campaignId=${campaign.campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reschedule', startDate, startTime, endTime }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.msg || 'Failed to reschedule');
      setNotice({ type: 'success', message: data.msg || 'Campaign rescheduled.' });
      fetchCampaigns();
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Reschedule failed' });
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) return <LoadingSkeleton />;

  const hasFilters = searchQuery.trim() !== '' || statusFilter !== 'all';

  return (
    <Layout>
      <div className="space-y-5">

        {/* Page header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">Campaigns</h1>
            <p className="text-sm text-zinc-500">Send and manage WhatsApp broadcast campaigns.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchCampaigns}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
              disabled={refreshing}
            >
              <svg className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Refresh
            </button>
            <button
              onClick={openCreateModal}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New campaign
            </button>
          </div>
        </div>

        {/* Notices */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <p className="font-medium">Failed to load</p>
              <p className="text-red-700">{error}</p>
            </div>
            <button onClick={fetchAllData} className="ml-auto text-red-600 hover:text-red-800 text-xs font-medium underline">
              Retry
            </button>
          </div>
        )}
        <Toast notice={notice} onDismiss={() => setNotice({ type: '', message: '' })} />

        {/* Prerequisites warning */}
        {(contactLists.length === 0 || readyClients.length === 0) && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div className="text-sm">
              <p className="font-medium text-amber-800">Setup required before launching</p>
              <ul className="mt-1 space-y-0.5 text-amber-700">
                {contactLists.length === 0 && <li>Create a contact list in the Contacts section.</li>}
                {readyClients.length === 0 && <li>Connect a WhatsApp session in the WhatsApp section.</li>}
              </ul>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total" value={stats.total} accent />
          <StatCard label="Running" value={stats.running} />
          <StatCard label="Scheduled" value={stats.scheduled} />
          <StatCard label="Completed" value={stats.completed} />
        </div>

        {/* Table container */}
        <div className="rounded-xl border border-zinc-200">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 px-4 py-3">
            <div className="relative flex-1 min-w-[200px]">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search campaigns…"
                className="h-8 w-full rounded-lg border border-zinc-200 pl-9 pr-3 text-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 rounded-lg border border-zinc-200 px-2.5 text-sm outline-none transition focus:border-zinc-400"
            >
              <option value="all">All statuses</option>
              {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                <option key={val} value={val}>{cfg.label}</option>
              ))}
            </select>
            {hasFilters && (
              <button
                onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-700"
              >
                Clear
              </button>
            )}
            <span className="ml-auto text-xs text-zinc-400">{filteredCampaigns.length} campaign{filteredCampaigns.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Table / empty */}
          {filteredCampaigns.length === 0 ? (
            <EmptyState
              hasFilters={hasFilters}
              onClear={() => { setSearchQuery(''); setStatusFilter('all'); }}
              onCreate={openCreateModal}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-100">
                    {['Campaign', 'Status', 'List', 'Progress', 'Success', 'Scheduled', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-zinc-400">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredCampaigns.map((campaign) => {
                    const progressPct = campaign.totalNumbers
                      ? Math.round((campaign.processedNumbers / campaign.totalNumbers) * 100)
                      : 0;
                    const successPct = campaign.processedNumbers
                      ? Math.round((campaign.successCount / campaign.processedNumbers) * 100)
                      : 0;
                    return (
                      <tr key={campaign._id} className="group hover:bg-zinc-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-zinc-900">{campaign.campaignName}</p>
                          <p className="text-xs text-zinc-400">
                            {campaign.messages?.length || 0} variant{campaign.messages?.length !== 1 ? 's' : ''} · {new Date(campaign.createdAt).toLocaleDateString()}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={campaign.status} />
                        </td>
                        <td className="px-4 py-3 text-zinc-600">{campaign.contactList?.name || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="w-28">
                            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                              <div
                                className="h-1.5 rounded-full bg-zinc-800 transition-all"
                                style={{ width: `${Math.max(progressPct, 2)}%` }}
                              />
                            </div>
                            <p className="mt-1 text-xs tabular-nums text-zinc-400">
                              {campaign.processedNumbers || 0}/{campaign.totalNumbers || 0}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-sm font-medium tabular-nums ${successPct >= 80 ? 'text-emerald-700' : successPct >= 50 ? 'text-amber-700' : 'text-zinc-700'}`}>
                            {successPct}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-500">
                          {campaign.scheduledTime?.formatted || 'Immediate'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {/* Edit */}
                            <button
                              onClick={() => openEditModal(campaign)}
                              className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                            >
                              Edit
                            </button>
                            {/* Status actions */}
                            {campaign.status === 'running' && (
                              <button
                                onClick={() => handleCampaignAction(campaign.campaignId, 'pause')}
                                className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                              >
                                Pause
                              </button>
                            )}
                            {campaign.status === 'paused' && (
                              <button
                                onClick={() => handleCampaignAction(campaign.campaignId, 'resume')}
                                className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                              >
                                Resume
                              </button>
                            )}
                            {(campaign.status === 'running' || campaign.status === 'paused') && (
                              <button
                                onClick={() => handleCampaignAction(campaign.campaignId, 'stop')}
                                className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                              >
                                Stop
                              </button>
                            )}
                            {campaign.status === 'scheduled' && (
                              <button
                                onClick={() => handleReschedulePrompt(campaign)}
                                className="rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
                              >
                                Reschedule
                              </button>
                            )}
                            {/* Report */}
                            <button
                              onClick={() => fetchCampaignReport(campaign.campaignId)}
                              className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                            >
                              Report
                            </button>
                            {/* Delete */}
                            <button
                              onClick={() => handleDeleteCampaign(campaign.campaignId)}
                              className="rounded-md px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-red-50 hover:text-red-600"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* Modals */}
      {showCreateModal && (
        <CampaignForm
          title="New campaign"
          formData={formData}
          setFormField={setFormField}
          setFormData={setFormData}
          saving={saving}
          contactLists={contactLists}
          readyClients={readyClients}
          mediaFiles={mediaFiles}
          imagePreviews={imagePreviews}
          handleImageChange={handleImageChange}
          onSubmit={handleCreateCampaign}
          onClose={() => { setShowCreateModal(false); clearFormState(); }}
          submitLabel="Create campaign"
        />
      )}

      {showEditModal && (
        <CampaignForm
          title="Edit campaign"
          formData={formData}
          setFormField={setFormField}
          setFormData={setFormData}
          saving={saving}
          contactLists={contactLists}
          readyClients={readyClients}
          mediaFiles={mediaFiles}
          imagePreviews={imagePreviews}
          handleImageChange={handleImageChange}
          existingAttachments={existingAttachments}
          removedAttachments={removedAttachments}
          setRemovedAttachments={setRemovedAttachments}
          onSubmit={handleEditCampaign}
          onClose={() => { setShowEditModal(false); setEditingCampaign(null); clearFormState(); }}
          submitLabel="Save changes"
        />
      )}

      {showReportModal && selectedCampaign && (
        <ReportModal
          campaign={selectedCampaign}
          onClose={() => setShowReportModal(false)}
          onRefresh={() => fetchCampaignReport(selectedCampaign.campaignId, false)}
          onExportCsv={downloadCampaignCsv}
        />
      )}

    </Layout>
  );
}