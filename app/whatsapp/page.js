'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Smartphone,
  QrCode,
  Power,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sliders,
  X,
  Copy,
  Terminal,
  Activity,
  ShieldCheck,
  Radio,
  Clock,
  ArrowRight,
  LogOut,
} from 'lucide-react';
import Layout from '../components/Layout';
import { authFetch } from '@/lib/clientApi';

// ─── Status configuration ───────────────────────────────────────────────────
const STATUS = {
  ready: { label: 'Connected', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200/80', dot: 'bg-emerald-500' },
  qr_ready: { label: 'QR Ready', badge: 'bg-amber-50 text-amber-800 border-amber-200/80', dot: 'bg-amber-500 animate-pulse' },
  reconnecting: { label: 'Reconnecting', badge: 'bg-sky-50 text-sky-800 border-sky-200/80', dot: 'bg-sky-500 animate-pulse' },
  disconnected: { label: 'Disconnected', badge: 'bg-zinc-100 text-zinc-700 border-zinc-200', dot: 'bg-zinc-400' },
  error: { label: 'Error', badge: 'bg-red-50 text-red-800 border-red-200/80', dot: 'bg-red-500' },
  initializing: { label: 'Starting', badge: 'bg-sky-50 text-sky-800 border-sky-200/80', dot: 'bg-sky-500 animate-pulse' },
  authenticating: { label: 'Authenticating', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200/80', dot: 'bg-emerald-500 animate-pulse' },
};

function statusConfig(status) {
  return STATUS[status] || STATUS.disconnected;
}

export default function WhatsAppPage() {
  const router = useRouter();

  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [authError, setAuthError] = useState('');
  const [clientsStatus, setClientsStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [recentErrorLogs, setRecentErrorLogs] = useState([]);
  const [qrClientId, setQrClientId] = useState('');

  // Confirmation dialog modal
  const [confirmModal, setConfirmModal] = useState(null); // { action: 'logout' | 'restart', clientId: string, title: string, desc: string }

  // Auth check
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await authFetch('/api/auth', { cache: 'no-store' });
        const data = await res.json();
        if (res.ok && data.success && data.valid) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
          router.replace('/login');
        }
      } catch {
        setAuthError('Authentication failed. Redirecting...');
        setTimeout(() => router.replace('/login'), 2000);
      }
    }
    checkAuth();
  }, [router]);

  const fetchClientsStatus = useCallback(async () => {
    try {
      const res = await authFetch('/api/whatsapp?action=status');
      const data = await res.json();
      if (!res.ok || !data.success || !data.clients) throw new Error(data.msg || 'Failed to load status');
      setClientsStatus(data.clients);
      setError('');
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRecentErrorLogs = useCallback(async () => {
    try {
      const res = await authFetch('/api/whatsapp?action=logs&level=error&limit=12');
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.logs)) {
        setRecentErrorLogs(data.logs);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Polling
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchClientsStatus();
    fetchRecentErrorLogs();
    const id = setInterval(() => {
      fetchClientsStatus();
      fetchRecentErrorLogs();
      setLastUpdate(new Date());
    }, 5000);
    return () => clearInterval(id);
  }, [isAuthenticated, fetchClientsStatus, fetchRecentErrorLogs]);

  const summary = useMemo(() => {
    const vals = Object.values(clientsStatus);
    return {
      total: vals.length,
      enabled: vals.filter((c) => c.enabled).length,
      connected: vals.filter((c) => c.ready).length,
      reconnecting: vals.filter((c) => c.status === 'reconnecting').length,
    };
  }, [clientsStatus]);

  const orderedClients = useMemo(() => {
    return Object.entries(clientsStatus).sort(([a], [b]) => a.localeCompare(b));
  }, [clientsStatus]);

  const qrClient = qrClientId ? clientsStatus[qrClientId] : null;

  // Actions
  async function toggleClient(clientId, enabled) {
    if (actionLoading) return;
    setActionLoading(clientId);
    try {
      const res = await authFetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', clientId, enabled }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.msg || 'Toggle failed');
      await fetchClientsStatus();
    } catch (err) {
      setError(err.message || 'Failed to toggle client');
    } finally {
      setActionLoading('');
    }
  }

  async function generateQR(clientId) {
    if (actionLoading) return;
    if (!clientsStatus[clientId]?.enabled) {
      setError('Please enable this profile before requesting a QR code.');
      return;
    }
    setActionLoading(clientId);
    try {
      const res = await authFetch(`/api/whatsapp?action=qr&clientId=${clientId}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.msg || 'Failed to generate QR');
      setClientsStatus((prev) => ({ ...prev, [clientId]: { ...prev[clientId], ...data } }));
      if (data.qrCode) setQrClientId(clientId);
      setTimeout(fetchClientsStatus, 1000);
    } catch (err) {
      setError(err.message || 'QR request failed');
    } finally {
      setActionLoading('');
    }
  }

  async function executeConfirmAction() {
    if (!confirmModal || actionLoading) return;
    const { action, clientId } = confirmModal;
    setConfirmModal(null);
    setActionLoading(clientId);

    try {
      const res = await authFetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, clientId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.msg || `${action} failed`);
      await fetchClientsStatus();
    } catch (err) {
      setError(err.message || `Failed to perform ${action}`);
    } finally {
      setActionLoading('');
    }
  }

  if (isAuthenticated === null || loading) {
    return (
      <Layout>
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-6 w-6 animate-spin text-emerald-600" />
            <p className="text-xs font-semibold text-zinc-500">Checking WhatsApp session states...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (isAuthenticated === false) return null;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 pb-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">WhatsApp Sender Profiles</h1>
            <p className="mt-1 text-xs text-zinc-500 flex items-center gap-2">
              <span>Manage active multi-device sessions, link QR codes, and supervise background reconnects.</span>
              <span>•</span>
              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                <Radio className="h-3 w-3 animate-pulse text-emerald-600" />
                Live {lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                fetchClientsStatus();
                fetchRecentErrorLogs();
              }}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 disabled:opacity-50 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-emerald-600' : 'text-zinc-500'}`} />
              <span>Refresh Status</span>
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-xs text-red-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError('')} className="font-semibold underline hover:text-red-950">
              Dismiss
            </button>
          </div>
        )}

        {/* Summary Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Total Configured</span>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{summary.total}</p>
            <p className="mt-1 text-[11px] text-zinc-500">Sender slots</p>
          </div>
          <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Enabled</span>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{summary.enabled}</p>
            <p className="mt-1 text-[11px] text-zinc-500">Ready for dispatch</p>
          </div>
          <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Connected</span>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{summary.connected}</p>
            <p className="mt-1 text-[11px] text-zinc-500">Live WhatsApp Web links</p>
          </div>
          <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Reconnecting</span>
            <p className="mt-1 text-2xl font-bold text-amber-600">{summary.reconnecting}</p>
            <p className="mt-1 text-[11px] text-zinc-500">Auto-recovery pending</p>
          </div>
        </div>

        {/* Profiles Grid */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {orderedClients.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
              <Smartphone className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-zinc-900">No WhatsApp profiles configured</h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
                Configure profiles in environment variables or configuration files to enable WhatsApp dispatch.
              </p>
            </div>
          ) : (
            orderedClients.map(([clientId, client]) => {
              const busy = actionLoading === clientId;
              const cfg = statusConfig(client.status);
              const displayName = client.accountInfo?.name || clientId;
              const displayPhone = client.accountInfo?.number ? `+${client.accountInfo.number}` : clientId;

              return (
                <div
                  key={clientId}
                  className="flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs transition hover:border-emerald-300 hover:shadow-sm"
                >
                  <div>
                    {/* Top Row: Avatar + Info + Badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {client.accountInfo?.profilePicUrl ? (
                          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 shadow-2xs">
                            <img
                              src={client.accountInfo.profilePicUrl}
                              alt={displayName}
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.parentElement.innerHTML = `<div class="flex h-full w-full items-center justify-center bg-emerald-50 text-emerald-800 font-bold text-sm">${displayName.charAt(0).toUpperCase()}</div>`;
                              }}
                            />
                          </div>
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 font-bold text-sm">
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <h2 className="text-sm font-bold text-zinc-900">{displayName}</h2>
                          <p className="font-mono text-[11px] text-zinc-400">{displayPhone}</p>
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${cfg.badge}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                    </div>

                    {/* Stats pills */}
                    <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-zinc-50/80 p-2.5 text-center text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-400">Enabled</span>
                        <p className="font-bold text-zinc-800 mt-0.5">{client.enabled ? 'Yes' : 'No'}</p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-400">Session</span>
                        <p className="font-bold text-zinc-800 mt-0.5">{client.sessionExists ? 'Saved' : 'None'}</p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-400">Attempts</span>
                        <p className="font-bold text-zinc-800 mt-0.5">{client.reconnectAttempts ?? 0}</p>
                      </div>
                    </div>

                    {/* Detailed Status or Warning */}
                    {client.detailedStatus && (
                      <p className="mt-3 rounded-lg border border-zinc-100 bg-zinc-50/50 p-2 text-[11px] text-zinc-600 leading-relaxed">
                        {client.detailedStatus}
                      </p>
                    )}
                  </div>

                  {/* Bottom Actions Row */}
                  <div className="mt-5 border-t border-zinc-100 pt-4 flex items-center justify-between gap-2">
                    {/* Toggle */}
                    <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-zinc-700">
                      <input
                        type="checkbox"
                        checked={client.enabled}
                        disabled={busy}
                        onChange={(e) => toggleClient(clientId, e.target.checked)}
                        className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 border-zinc-300 cursor-pointer"
                      />
                      <span>Active</span>
                    </label>

                    {/* Button Controls */}
                    <div className="flex items-center gap-1.5">
                      {/* QR Button */}
                      <button
                        onClick={() => generateQR(clientId)}
                        disabled={busy || !client.enabled}
                        title="Scan QR Code"
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200/80 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 transition"
                      >
                        <QrCode className="h-3.5 w-3.5 text-emerald-600" />
                        <span>QR</span>
                      </button>

                      {/* Restart Button */}
                      <button
                        onClick={() =>
                          setConfirmModal({
                            action: 'restart',
                            clientId,
                            title: `Restart ${displayName}?`,
                            desc: 'This will recycle the background Puppeteer browser instance and re-authenticate.',
                          })
                        }
                        disabled={busy}
                        title="Restart Session"
                        className="rounded-lg border border-zinc-200/80 p-1.5 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 transition"
                      >
                        <RotateCcw className="h-3.5 w-3.5 text-zinc-600" />
                      </button>

                      {/* Logout Button */}
                      <button
                        onClick={() =>
                          setConfirmModal({
                            action: 'logout',
                            clientId,
                            title: `Disconnect ${displayName}?`,
                            desc: 'This will log out the WhatsApp Web session and clear stored tokens for this profile.',
                          })
                        }
                        disabled={busy}
                        title="Log Out"
                        className="rounded-lg border border-zinc-200/80 p-1.5 text-zinc-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-40 transition"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Live Error Logs Console */}
        {recentErrorLogs.length > 0 && (
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-zinc-500" />
                <h2 className="text-sm font-bold text-zinc-900">Recent Service Diagnostics</h2>
              </div>
              <span className="text-[11px] font-semibold text-zinc-400">Last 12 captured events</span>
            </div>
            <div className="mt-3 max-h-48 overflow-y-auto font-mono text-[11px] space-y-1.5 divide-y divide-zinc-100">
              {recentErrorLogs.map((log, idx) => (
                <div key={idx} className="pt-1.5 flex items-start gap-2 text-zinc-700">
                  <span className="text-zinc-400 shrink-0">
                    {new Date(log.timestamp || Date.now()).toLocaleTimeString()}
                  </span>
                  <span className="font-semibold text-red-600 shrink-0">[{log.level || 'ERROR'}]</span>
                  <span className="text-zinc-800 break-all">{log.message || JSON.stringify(log)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal: QR Code Scanner Display */}
        {qrClient && qrClient.qrCode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-zinc-200 text-center">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3 mb-4">
                <div className="text-left">
                  <h3 className="text-sm font-bold text-zinc-900">Scan WhatsApp QR Code</h3>
                  <p className="text-xs text-zinc-400">Profile: {qrClientId}</p>
                </div>
                <button
                  onClick={() => setQrClientId('')}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="my-3 flex items-center justify-center rounded-xl bg-zinc-50 p-4 border border-zinc-100">
                <img
                  src={qrClient.qrCode}
                  alt="WhatsApp QR Code"
                  className="h-56 w-56 rounded-lg object-contain shadow-2xs"
                />
              </div>

              <p className="text-xs text-zinc-600 leading-relaxed mb-4">
                Open WhatsApp on your phone → Settings → Linked Devices → Link a Device, then point your camera at this code.
              </p>

              <button
                onClick={() => setQrClientId('')}
                className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
              >
                Done Scanning
              </button>
            </div>
          </div>
        )}

        {/* Modal: Confirmation Dialog */}
        {confirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-zinc-200 text-center">
              <div
                className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full mb-4 ${
                  confirmModal.action === 'logout' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                }`}
              >
                {confirmModal.action === 'logout' ? <LogOut className="h-5 w-5" /> : <RotateCcw className="h-5 w-5" />}
              </div>
              <h3 className="text-sm font-bold text-zinc-900">{confirmModal.title}</h3>
              <p className="mt-1 text-xs text-zinc-500">{confirmModal.desc}</p>
              <div className="mt-5 flex items-center justify-center gap-2.5">
                <button
                  onClick={() => setConfirmModal(null)}
                  disabled={!!actionLoading}
                  className="rounded-xl border border-zinc-200/80 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={executeConfirmAction}
                  disabled={!!actionLoading}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-xs transition ${
                    confirmModal.action === 'logout'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {actionLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>Confirm</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
