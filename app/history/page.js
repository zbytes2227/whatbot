'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '../components/Layout';
import { authFetch } from '@/lib/clientApi';
import {
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  RefreshCw,
  MessageSquare,
  AlertCircle,
  Filter,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Download,
  Phone,
  FileText,
  X,
  Radio,
  SlidersHorizontal,
} from 'lucide-react';

const LIMIT = 20;

export default function MessageHistory() {
  const router = useRouter();

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [authError, setAuthError] = useState(null);

  // UI State
  const [messages, setMessages] = useState([]);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1, totalMessages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // Filters / Search
  const [search, setSearch] = useState('');
  const [deliveryStatus, setDeliveryStatus] = useState('all');
  const [source, setSource] = useState('all');
  const [clientUsed, setClientUsed] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  // Selected message detail modal
  const [selectedMessage, setSelectedMessage] = useState(null);

  // Authentication check
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await authFetch('/api/auth', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.valid) {
            setIsAuthenticated(true);
          } else {
            setIsAuthenticated(false);
            router.replace('/login');
          }
        } else {
          setIsAuthenticated(false);
          router.replace('/login');
        }
      } catch {
        setAuthError('Authentication verification failed.');
        setTimeout(() => router.replace('/login'), 2000);
      }
    }
    checkAuth();
  }, [router]);

  // Data fetch
  const fetchHistory = useCallback(
    async (page = 1) => {
      if (!isAuthenticated) return;
      setLoading(true);
      setError('');

      const params = new URLSearchParams({
        page,
        limit: LIMIT,
        sortBy: 'sentTime',
        sortOrder: 'desc',
      });

      if (search) params.append('search', search);
      if (deliveryStatus !== 'all') params.append('deliveryStatus', deliveryStatus);
      if (source !== 'all') params.append('source', source);
      if (clientUsed !== 'all') params.append('clientUsed', clientUsed);

      try {
        const res = await authFetch(`/api/messageHistory?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json();

        if (!json.success) throw new Error(json.msg || 'Load failed');

        setMessages(json.data.messages || []);
        setStats(json.data.stats || null);
        setPagination(json.data.pagination || { currentPage: page, totalPages: 1, totalMessages: 0 });
        setLastUpdate(new Date());
      } catch (err) {
        setError(err.message || 'Error loading message history');
      } finally {
        setLoading(false);
      }
    },
    [search, deliveryStatus, source, clientUsed, isAuthenticated]
  );

  useEffect(() => {
    if (isAuthenticated) {
      fetchHistory(1);
    }
  }, [fetchHistory, isAuthenticated]);

  const changePage = (newPage) => {
    setPagination((p) => ({ ...p, currentPage: newPage }));
    fetchHistory(newPage);
  };

  // Export history table to CSV
  const exportHistoryCSV = () => {
    if (!messages.length) return;
    const headers = ['Phone Number', 'Status', 'Sender Profile', 'Source', 'Has Media', 'Message Text', 'Sent Time'];
    const rows = messages.map((m) => [
      m.number || m.phoneNumber || m.originalNumber || '',
      m.deliveryStatus || '',
      m.clientUsed || '',
      m.source || '',
      m.hasMedia ? 'Yes' : 'No',
      (m.message || m.messageText || '').replace(/"/g, '""'),
      new Date(m.sentTime || Date.now()).toLocaleString(),
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map(String).map((v) => `"${v.replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whatsapp_history_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 0);
  };

  if (isAuthenticated === null) {
    return (
      <Layout>
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-6 w-6 animate-spin text-emerald-600" />
            <p className="text-xs font-semibold text-zinc-500">Checking authentication...</p>
            {authError && <p className="text-xs text-red-600">{authError}</p>}
          </div>
        </div>
      </Layout>
    );
  }

  if (isAuthenticated === false) return null;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 pb-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">Message Dispatch Log</h1>
            <p className="mt-1 text-xs text-zinc-500 flex items-center gap-2">
              <span>Complete audit logs for all outbound WhatsApp broadcasts and direct messages.</span>
              <span>•</span>
              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                <Radio className="h-3 w-3 animate-pulse text-emerald-600" />
                Updated {lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => fetchHistory(pagination.currentPage)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 disabled:opacity-50 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-emerald-600' : 'text-zinc-500'}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={exportHistoryCSV}
              disabled={!messages.length}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Total Dispatched</span>
              <p className="mt-1 text-2xl font-bold text-zinc-900">{stats.totalMessages?.toLocaleString() || 0}</p>
              <p className="mt-1 text-[11px] text-zinc-500">Outbound records</p>
            </div>

            <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Delivered</span>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{stats.deliveredMessages?.toLocaleString() || 0}</p>
              <p className="mt-1 text-[11px] text-zinc-500">Confirmed recipients</p>
            </div>

            <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Failed</span>
              <p className="mt-1 text-2xl font-bold text-red-600">{stats.failedMessages?.toLocaleString() || 0}</p>
              <p className="mt-1 text-[11px] text-zinc-500">Errors or blocked</p>
            </div>

            <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Success Rate</span>
              <p className="mt-1 text-2xl font-bold text-zinc-900">{stats.successRate || 0}%</p>
              <p className="mt-1 text-[11px] text-zinc-500">Delivery reliability</p>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-xs text-red-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => fetchHistory(pagination.currentPage)} className="font-semibold underline hover:text-red-950">
              Retry
            </button>
          </div>
        )}

        {/* Search and Filters Bar */}
        <div className="space-y-3 bg-white p-3.5 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search phone number or message..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200/80 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                  showFilters || deliveryStatus !== 'all' || source !== 'all' || clientUsed !== 'all'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-zinc-50 text-zinc-600 border-zinc-200/80 hover:bg-zinc-100'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Filters</span>
                {(deliveryStatus !== 'all' || source !== 'all' || clientUsed !== 'all') && (
                  <span className="flex h-2 w-2 rounded-full bg-emerald-600" />
                )}
              </button>

              <span className="text-xs text-zinc-400">
                Page {pagination.currentPage} of {pagination.totalPages || 1}
              </span>
            </div>
          </div>

          {/* Expandable Filter Controls */}
          {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-zinc-100 text-xs">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                  Delivery Status
                </label>
                <select
                  value={deliveryStatus}
                  onChange={(e) => setDeliveryStatus(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                >
                  <option value="all">All Statuses</option>
                  <option value="sent">Sent / Delivered</option>
                  <option value="failed">Failed</option>
                  <option value="pending">Pending</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                  Source / Type
                </label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                >
                  <option value="all">All Sources</option>
                  <option value="campaign">Campaign Broadcast</option>
                  <option value="direct">Direct Message</option>
                  <option value="api">API Dispatch</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                  Sender Profile
                </label>
                <select
                  value={clientUsed}
                  onChange={(e) => setClientUsed(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                >
                  <option value="all">All Profiles</option>
                  <option value="client1">Profile 1</option>
                  <option value="client2">Profile 2</option>
                  <option value="client3">Profile 3</option>
                  <option value="client4">Profile 4</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Message Table */}
        {loading && messages.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-12 text-center">
            <RefreshCw className="h-6 w-6 animate-spin text-emerald-600 mx-auto mb-3" />
            <p className="text-xs font-semibold text-zinc-600">Loading message dispatch logs...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
            <MessageSquare className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-zinc-900">No message logs recorded</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
              Outbound messages from campaigns and direct dispatch will appear here with live delivery status.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-xs">
            <table className="w-full text-left text-xs text-zinc-600">
              <thead className="border-b border-zinc-100 bg-zinc-50/80 font-bold uppercase tracking-wider text-zinc-500 text-[10px]">
                <tr>
                  <th className="px-4 py-3">Recipient</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Sender Profile</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Message Preview</th>
                  <th className="px-4 py-3">Sent Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-medium">
                {messages.map((m) => {
                  const isSent = m.deliveryStatus === 'sent' || m.deliveryStatus === 'delivered' || m.deliveryStatus === 'success';
                  const isFailed = m.deliveryStatus === 'failed';
                  const displayPhone = m.number || m.phoneNumber || m.originalNumber || 'Unknown';
                  const msgPreview = m.message || m.messageText || '';

                  return (
                    <tr
                      key={m._id}
                      onClick={() => setSelectedMessage(m)}
                      className="hover:bg-zinc-50/60 transition cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                          <span className="font-mono text-xs font-bold text-zinc-900">{displayPhone}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {isSent ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200/80">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            Delivered
                          </span>
                        ) : isFailed ? (
                          <span className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-800 border border-red-200/80">
                            <XCircle className="h-3 w-3 text-red-600" />
                            Failed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200/80">
                            <Clock className="h-3 w-3 text-amber-600" />
                            Pending
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">
                          {m.clientUsed || 'Default'}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-zinc-500 capitalize">{m.source || 'Campaign'}</td>

                      <td className="px-4 py-3 max-w-xs truncate text-zinc-700">
                        {m.hasMedia && (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 text-emerald-800 px-1.5 py-0.5 text-[10px] font-semibold mr-1.5 border border-emerald-200">
                            📷 Media
                          </span>
                        )}
                        {msgPreview || <span className="italic text-zinc-400">(Media attachment only)</span>}
                      </td>

                      <td className="px-4 py-3 text-zinc-400 text-[11px] whitespace-nowrap">
                        {new Date(m.sentTime || Date.now()).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination footer */}
            <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-3.5 bg-zinc-50/50 text-xs">
              <span className="text-zinc-500">
                Showing page <strong className="text-zinc-800">{pagination.currentPage}</strong> of{' '}
                <strong className="text-zinc-800">{pagination.totalPages || 1}</strong>
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => changePage(pagination.currentPage - 1)}
                  disabled={pagination.currentPage <= 1 || loading}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-200/80 bg-white px-3 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 transition"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Previous</span>
                </button>
                <button
                  onClick={() => changePage(pagination.currentPage + 1)}
                  disabled={pagination.currentPage >= pagination.totalPages || loading}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-200/80 bg-white px-3 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 transition"
                >
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Message Detail */}
        {selectedMessage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-zinc-200 overflow-hidden">
              <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 bg-zinc-50/50">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-sm font-bold text-zinc-900">Message Details</h3>
                </div>
                <button
                  onClick={() => setSelectedMessage(null)}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3 bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-400">Recipient Phone</span>
                    <p className="font-mono font-bold text-zinc-900 mt-0.5">
                      {selectedMessage.number || selectedMessage.phoneNumber || selectedMessage.originalNumber || '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-400">Status</span>
                    <p className="font-bold text-zinc-900 mt-0.5 capitalize">{selectedMessage.deliveryStatus}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-400">Sender Profile</span>
                    <p className="font-semibold text-zinc-800 mt-0.5">{selectedMessage.clientUsed || 'Default'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-400">Sent At</span>
                    <p className="text-zinc-600 mt-0.5">
                      {new Date(selectedMessage.sentTime || Date.now()).toLocaleString()}
                    </p>
                  </div>
                </div>

                {selectedMessage.hasMedia && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-emerald-900 flex items-center justify-between">
                    <div>
                      <span className="font-bold">Media Attachment:</span>
                      <p className="text-[11px] text-emerald-800 mt-0.5">
                        {selectedMessage.mediaName || selectedMessage.mediaType || 'Image Attachment'}
                      </p>
                    </div>
                    <span className="text-xs bg-emerald-100 px-2 py-0.5 rounded font-semibold text-emerald-800">
                      {selectedMessage.mediaType || 'image'}
                    </span>
                  </div>
                )}

                {(selectedMessage.errorMessage || selectedMessage.error) && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
                    <span className="font-bold">Error details:</span>
                    <p className="mt-1 font-mono text-[11px]">{selectedMessage.errorMessage || selectedMessage.error}</p>
                  </div>
                )}

                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                    Message Body
                  </span>
                  <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3.5 font-mono text-xs text-zinc-800 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {selectedMessage.message || selectedMessage.messageText || '<No Text Content>'}
                  </div>
                </div>
              </div>

              <div className="flex justify-end border-t border-zinc-100 p-4 bg-zinc-50/50">
                <button
                  onClick={() => setSelectedMessage(null)}
                  className="rounded-xl border border-zinc-200/80 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
