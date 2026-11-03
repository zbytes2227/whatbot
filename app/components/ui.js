'use client';

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, MoreHorizontal, Search, X } from 'lucide-react';

export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

// --- formatting ----------------------------------------------------------------

export const formatNumber = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-IN') : '—');

export function timeAgo(value) {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  const future = diff < 0;
  const s = Math.abs(diff) / 1000;
  const units = [[86400 * 365, 'y'], [86400 * 30, 'mo'], [86400, 'd'], [3600, 'h'], [60, 'm']];
  for (const [size, label] of units) {
    if (s >= size) return future ? `in ${Math.floor(s / size)}${label}` : `${Math.floor(s / size)}${label} ago`;
  }
  return future ? 'in a moment' : 'just now';
}

export function formatDateTime(value, opts = {}) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', ...opts });
}

export function formatDuration(ms) {
  if (!ms && ms !== 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = s / 60;
  if (m < 60) return `${Math.round(m)}m`;
  return `${(m / 60).toFixed(1)}h`;
}

// --- presence (mount/unmount with exit animation) --------------------------

export function usePresence(open, exitMs = 180) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    const raf = requestAnimationFrame(() => setVisible(false));
    const t = setTimeout(() => setMounted(false), exitMs);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [open, exitMs]);
  return { mounted: mounted || open, visible: open && visible };
}

function useEscape(active, handler) {
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => e.key === 'Escape' && handler();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, handler]);
}

function useScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

const noopSubscribe = () => () => {};

function Portal({ children }) {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return isClient ? createPortal(children, document.body) : null;
}

// --- primitives ------------------------------------------------------------------

const BUTTON_VARIANTS = {
  primary: 'bg-brand-600 text-white shadow-sm shadow-brand-600/20 hover:bg-brand-700 active:bg-brand-800 dark:bg-brand-500 dark:text-zinc-950 dark:hover:bg-brand-400',
  secondary: 'border border-zinc-200 bg-white text-zinc-800 shadow-sm hover:bg-zinc-50 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800',
  ghost: 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800',
  'danger-ghost': 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10',
  dark: 'bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200',
};
const BUTTON_SIZES = {
  xs: 'h-7 gap-1 rounded-lg px-2 text-xs',
  sm: 'h-8 gap-1.5 rounded-lg px-3 text-xs',
  md: 'h-10 gap-2 rounded-xl px-4 text-sm',
  lg: 'h-11 gap-2 rounded-xl px-5 text-sm',
  icon: 'h-9 w-9 rounded-xl',
  'icon-sm': 'h-8 w-8 rounded-lg',
};

export function Button({ variant = 'primary', size = 'md', loading = false, icon: Icon, iconRight: IconRight, className, children, disabled, type = 'button', ...props }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className={size.startsWith('icon') ? 'h-4 w-4' : 'h-4 w-4 -ml-0.5'} /> : null}
      {children}
      {IconRight && !loading && <IconRight className="h-4 w-4 -mr-0.5" />}
    </button>
  );
}

export function Spinner({ className }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin text-zinc-400', className)} />;
}

export function Card({ className, children, ...props }) {
  return (
    <div className={cn('card', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action, icon: Icon, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            <Icon className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

const BADGE_TONES = {
  gray: 'bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700',
  green: 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20',
  red: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/20',
};
const DOT_TONES = { gray: 'bg-zinc-400', green: 'bg-brand-500', blue: 'bg-sky-500', amber: 'bg-amber-500', red: 'bg-red-500', violet: 'bg-violet-500' };

export function Badge({ tone = 'gray', dot = false, pulse = false, className, children }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', BADGE_TONES[tone], className)}>
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', DOT_TONES[tone])} />}
          <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', DOT_TONES[tone])} />
        </span>
      )}
      {children}
    </span>
  );
}

export const CAMPAIGN_STATUS = {
  running: { label: 'Running', tone: 'green', pulse: true },
  pending: { label: 'Starting', tone: 'blue', pulse: true },
  scheduled: { label: 'Scheduled', tone: 'violet' },
  paused: { label: 'Paused', tone: 'amber' },
  needs_review: { label: 'Needs review', tone: 'red', pulse: true },
  completed: { label: 'Completed', tone: 'gray' },
  stopped: { label: 'Stopped', tone: 'gray' },
  error: { label: 'Error', tone: 'red' },
  draft: { label: 'Draft', tone: 'gray' },
};

export function CampaignStatusBadge({ status }) {
  const s = CAMPAIGN_STATUS[status] || { label: status, tone: 'gray' };
  return (
    <Badge tone={s.tone} dot pulse={s.pulse}>
      {s.label}
    </Badge>
  );
}

export const DELIVERY_STATUS = {
  pending: { label: 'Pending', tone: 'blue' },
  sent: { label: 'Sent', tone: 'green' },
  delivered: { label: 'Delivered', tone: 'green' },
  read: { label: 'Read', tone: 'violet' },
  failed: { label: 'Failed', tone: 'red' },
  unknown: { label: 'Uncertain', tone: 'amber' },
  skipped: { label: 'Opted out', tone: 'gray' },
  client_unavailable: { label: 'Failed', tone: 'red' },
};

export function DeliveryBadge({ status }) {
  const s = DELIVERY_STATUS[status] || { label: status || '—', tone: 'gray' };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export const PROFILE_STATUS = {
  ready: { label: 'Connected', tone: 'green', pulse: true },
  qr_ready: { label: 'Scan QR', tone: 'blue', pulse: true },
  initializing: { label: 'Connecting', tone: 'blue', pulse: true },
  reconnecting: { label: 'Reconnecting', tone: 'amber', pulse: true },
  disconnected: { label: 'Offline', tone: 'gray' },
  logged_out: { label: 'Logged out', tone: 'amber' },
  error: { label: 'Error', tone: 'red' },
};

export function ProfileStatusBadge({ profile }) {
  const key = !profile?.enabled ? 'disconnected' : profile.status;
  const s = PROFILE_STATUS[key] || { label: key, tone: 'gray' };
  return (
    <Badge tone={s.tone} dot pulse={s.pulse}>
      {profile?.enabled ? s.label : 'Off'}
    </Badge>
  );
}

// --- form controls ---------------------------------------------------------------

export function Field({ label, hint, error, required, children, className, htmlFor }) {
  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {children}
      {error ? <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function Input({ className, ...props }) {
  return <input className={cn('input', className)} {...props} />;
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn('input min-h-[96px] resize-y leading-relaxed', className)} {...props} />;
}

export function Select({ className, children, ...props }) {
  return (
    <select className={cn('input cursor-pointer appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9', className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2371717a' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")" }}
      {...props}
    >
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, disabled, label, size = 'md' }) {
  const dims = size === 'sm' ? ['h-5 w-9', 'h-4 w-4', 'translate-x-4'] : ['h-6 w-11', 'h-5 w-5', 'translate-x-5'];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('relative inline-flex shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50', dims[0], checked ? 'bg-brand-600 dark:bg-brand-500' : 'bg-zinc-300 dark:bg-zinc-700')}
    >
      <span className={cn('inline-block rounded-full bg-white shadow-sm transition-transform duration-200 ease-out', dims[1], checked ? dims[2] : 'translate-x-0')} />
    </button>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
      <input className="input pl-9 pr-8" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value && (
        <button type="button" onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800" aria-label="Clear search">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// --- layout pieces ---------------------------------------------------------------

export function PageHeader({ title, description, actions, children }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">{title}</h1>
        {description && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, hint, tone = 'gray', loading, className }) {
  const tones = {
    gray: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
    green: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400',
    blue: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
    red: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400',
  };
  return (
    <Card className={cn('group p-5 transition-shadow duration-200 hover:shadow-lift', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
        {Icon && (
          <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110', tones[tone])}>
            <Icon className="h-[18px] w-[18px]" />
          </div>
        )}
      </div>
      {loading ? <div className="skeleton mt-2 h-8 w-24" /> : <p className="mt-1 text-[28px] font-semibold leading-tight tracking-tight tabular-nums text-zinc-900 dark:text-white">{value}</p>}
      {hint && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>}
    </Card>
  );
}

export function Progress({ value = 0, max = 100, tone = 'green', striped = false, className, size = 'md' }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const colors = { green: 'bg-brand-500', amber: 'bg-amber-500', red: 'bg-red-500', blue: 'bg-sky-500', gray: 'bg-zinc-400', violet: 'bg-violet-500' };
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800', size === 'sm' ? 'h-1.5' : 'h-2', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-700 ease-out', colors[tone], striped && 'progress-striped animate-progress-stripes')} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center animate-fade-in', className)}>
      {Icon && (
        <div className="relative mb-4">
          <div className="absolute inset-0 scale-150 rounded-full bg-brand-500/10 blur-xl" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-500 shadow-soft dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
            <Icon className="h-6 w-6" />
          </div>
        </div>
      )}
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cn('inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900', className)} role="tablist">
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200',
              active ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            )}
          >
            {tab.icon && <tab.icon className="h-3.5 w-3.5" />}
            {tab.label}
            {tab.count != null && (
              <span className={cn('rounded-md px-1.5 py-px text-[10px] tabular-nums', active ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200' : 'bg-zinc-200/70 text-zinc-500 dark:bg-zinc-800')}>{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Pagination({ page, pages, total, onChange }) {
  if (pages <= 1) return total != null ? <p className="px-1 text-xs text-zinc-500">{formatNumber(total)} {total === 1 ? 'record' : 'records'}</p> : null;
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Page <span className="font-semibold text-zinc-700 dark:text-zinc-200">{page}</span> of {pages}
        {total != null && <> · {formatNumber(total)} records</>}
      </p>
      <div className="flex gap-1.5">
        <Button variant="secondary" size="icon-sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page" />
        <Button variant="secondary" size="icon-sm" icon={ChevronRight} disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page" />
      </div>
    </div>
  );
}

// --- overlays --------------------------------------------------------------------

export function Modal({ open, onClose, title, description, children, footer, size = 'md', dismissible = true }) {
  const { mounted, visible } = usePresence(open);
  const titleId = useId();
  const panelRef = useRef(null);
  const close = useCallback(() => dismissible && onClose?.(), [dismissible, onClose]);
  useEscape(mounted, close);
  useScrollLock(mounted);
  useEffect(() => {
    if (visible) panelRef.current?.querySelector('input,textarea,select,button[data-autofocus]')?.focus();
  }, [visible]);
  if (!mounted) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={cn('absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px] transition-opacity duration-200', visible ? 'opacity-100' : 'opacity-0')} onClick={close} />
        <div
          ref={panelRef}
          className={cn(
            'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl transition-all duration-200 ease-out dark:border-zinc-800 dark:bg-zinc-900 sm:rounded-2xl',
            widths[size],
            visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-4 scale-[0.97] opacity-0'
          )}
        >
          {(title || dismissible) && (
            <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
              <div>
                {title && <h2 id={titleId} className="text-base font-semibold text-zinc-900 dark:text-white">{title}</h2>}
                {description && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
              </div>
              {dismissible && <Button variant="ghost" size="icon-sm" icon={X} onClick={close} aria-label="Close" className="-mr-2 -mt-1" />}
            </div>
          )}
          <div className="overflow-y-auto px-6 py-4">{children}</div>
          {footer && <div className="flex flex-col-reverse gap-2 border-t border-zinc-100 bg-zinc-50/60 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:justify-end">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}

export function Drawer({ open, onClose, title, description, children, footer, width = 'max-w-2xl', headerExtra }) {
  const { mounted, visible } = usePresence(open, 260);
  const titleId = useId();
  useEscape(mounted, onClose);
  useScrollLock(mounted);
  if (!mounted) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[55] flex justify-end" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={cn('absolute inset-0 bg-zinc-950/30 backdrop-blur-[2px] transition-opacity duration-300', visible ? 'opacity-100' : 'opacity-0')} onClick={onClose} />
        <div className={cn('relative flex h-full w-full flex-col border-l border-zinc-200 bg-white shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] dark:border-zinc-800 dark:bg-zinc-950', width, visible ? 'translate-x-0' : 'translate-x-full')}>
          <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-5 dark:border-zinc-800">
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-lg font-semibold text-zinc-900 dark:text-white">{title}</h2>
              {description && <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</div>}
            </div>
            <div className="flex items-center gap-2">
              {headerExtra}
              <Button variant="ghost" size="icon-sm" icon={X} onClick={onClose} aria-label="Close" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
          {footer && <div className="flex flex-col-reverse gap-2 border-t border-zinc-100 bg-white/80 px-6 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80 sm:flex-row sm:justify-end">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}

export function ActionMenu({ items, label = 'Actions', align = 'right', trigger }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const visibleItems = items.filter((i) => i && !i.hidden);
  if (!visibleItems.length) return null;
  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      {trigger ? trigger({ open, toggle: () => setOpen((o) => !o) }) : (
        <Button variant="ghost" size="icon-sm" icon={MoreHorizontal} aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)} />
      )}
      {open && (
        <div className={cn('absolute z-40 mt-1.5 min-w-[200px] origin-top-right animate-scale-in rounded-xl border border-zinc-200 bg-white p-1 shadow-lift dark:border-zinc-700 dark:bg-zinc-900', align === 'right' ? 'right-0' : 'left-0')} role="menu">
          {visibleItems.map((item, i) =>
            item.divider ? (
              <div key={`d${i}`} className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors disabled:opacity-40',
                  item.danger ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10' : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800'
                )}
              >
                {item.icon && <item.icon className="h-4 w-4 opacity-70" />}
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

// --- confirm dialog (promise based) -------------------------------------------

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const [checked, setChecked] = useState(false);
  const resolver = useRef(null);

  const confirm = useCallback((options) => {
    setChecked(!!options.checkboxDefault);
    setState(options);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = (result) => {
    resolver.current?.(result);
    resolver.current = null;
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => finish(false)}
        size="sm"
        title={
          <span className="flex items-center gap-2.5">
            {state?.tone === 'danger' && (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
              </span>
            )}
            {state?.title}
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => finish(false)}>{state?.cancelText || 'Cancel'}</Button>
            <Button variant={state?.tone === 'danger' ? 'danger' : 'primary'} data-autofocus onClick={() => finish(state?.checkbox ? { checked } : true)}>
              {state?.confirmText || 'Confirm'}
            </Button>
          </>
        }
      >
        <div className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{state?.message}</div>
        {state?.checkbox && (
          <label className="mt-4 flex cursor-pointer items-center gap-2.5 rounded-xl border border-zinc-200 p-3 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
            <input type="checkbox" className="h-4 w-4 rounded accent-red-600" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            {state.checkbox}
          </label>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
