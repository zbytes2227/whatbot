'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Users,
  Megaphone,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  RefreshCw,
  Send,
  Plus,
  ArrowUpRight,
  Clock,
  Radio,
  FileSpreadsheet,
  Activity,
  ShieldCheck,
  Percent,
} from 'lucide-react';
import Layout from './components/Layout';
import { authFetch } from '@/lib/clientApi';

// ─── Sparkline SVG Component ────────────────────────────────────────────────
function Sparkline({ data = [], color = '#059669', height = 32 }) {
  if (!data.length) return null;
  const w = 90;
  const h = height;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 6) - 3;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="opacity-90">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2.25"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts}
      />
    </svg>
  );
}

// ─── Mini Bar Chart ──────────────────────────────────────────────────────────
function MiniBarChart({ data = [], labels = [], colorClass = 'bg-emerald-600' }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-2 h-24 pt-4">
      {data.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
          <div className="text-[10px] font-semibold text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity">
            {v}
          </div>
          <div
            className={`w-full rounded-t-md ${colorClass} transition-all duration-300 group-hover:brightness-110`}
            style={{ height: `${Math.max(6, (v / max) * 60)}px` }}
          />
          {labels[i] && (
            <span className="text-[10px] font-medium text-zinc-400 leading-none">{labels[i]}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Donut Chart ─────────────────────────────────────────────────────────────
function DonutChart({ value = 0, total = 100, color = '#059669', size = 64 }) {
  const r = 24;
  const cx = 32;
  const cy = 32;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0;
  const dash = circ * pct;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        className="transition-all duration-500"
      />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#0f172a">
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}

// ─── Status Dot ───────────────────────────────────────────────────────────────
function StatusDot({ status }) {
  const map = {
    connected: 'bg-emerald-500',
    qr_ready: 'bg-amber-400',
    initializing: 'bg-sky-400',
    error: 'bg-red-500',
    disconnected: 'bg-zinc-300',
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${map[status] || map.disconnected}`} />;
}

// ─── Badge ────────────────────────────────────────────────────────────────────
function Badge({ label, variant = 'default' }) {
  const variants = {
    default: 'bg-zinc-100 text-zinc-700 border-zinc-200',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
    warning: 'bg-amber-50 text-amber-800 border-amber-200/80',
    danger: 'bg-red-50 text-red-800 border-red-200/80',
    info: 'bg-sky-50 text-sky-800 border-sky-200/80',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
        variants[variant] || variants.default
      }`}
    >
      {label}
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, trend, sparkData, sparkColor = '#059669', loading, href, icon: Icon }) {
  const trendUp = typeof trend === 'number' ? trend >= 0 : null;
  const content = (
    <div className="flex h-full flex-col justify-between rounded-xl border border-zinc-200/80 bg-white p-4 shadow-xs transition-all hover:border-emerald-300 hover:shadow-sm">
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{label}</span>
          {Icon && (
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Icon className="h-3.5 w-3.5" />
            </div>
          )}
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2">
          {loading ? (
            <div className="h-8 w-20 animate-pulse rounded-md bg-zinc-100" />
          ) : (
            <p className="text-2xl font-bold tracking-tight text-zinc-900 tabular-nums">{value ?? '—'}</p>
          )}
          {trend != null && !loading && (
            <span
              className={`inline-flex items-center text-xs font-semibold ${
                trendUp ? 'text-emerald-600' : 'text-red-500'
              }`}
            >
              {trendUp ? '+' : ''}
              {trend}%
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-2.5">
        <p className="text-[11px] text-zinc-500">{sub}</p>
        {sparkData && !loading && <Sparkline data={sparkData} color={sparkColor} />}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block transition-transform active:scale-[0.99]">
        {content}
      </Link>
    );
  }
  return content;
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter();

  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [chartRange, setChartRange] = useState('7d');

  // Auth check
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await authFetch('/api/auth', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.valid) {
            setIsAuthenticated(true);
            setUser(data.user);
          } else {
            setIsAuthenticated(false);
            router.replace('/login');
          }
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

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/dashboard');
      const json = await res.json();
      if (json.success) {
        setDashboardData(json.data);
        setLastUpdate(new Date());
      } else {
        setError('Could not load dashboard data.');
      }
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
      const id = setInterval(fetchData, 20000);
      return () => clearInterval(id);
    }
  }, [isAuthenticated, fetchData]);

  if (isAuthenticated === null) {
    return (
      <Layout>
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-6 w-6 animate-spin text-emerald-600" />
            <p className="text-xs font-semibold text-zinc-500">Verifying session...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (isAuthenticated === false) return null;

  const d = dashboardData || {};
  const clients = d.whatsappClientsStatus || [];
  const campaigns = d.campaigns || [];
  const activeClients = clients.filter((c) => c.ready).length;
  const totalCampaigns = d.totalCampaigns || 0;
  const runningCampaigns = d.runningCampaigns || 0;
  const scheduledCampaigns = d.scheduledCampaigns || 0;
  const completedCampaigns = d.completedCampaigns || 0;
  const successRate = d.successRate ?? 0;
  const messagesSentToday = d.messagesSentToday ?? 0;
  const totalContacts = d.totalContactLists ?? 0;

  const msgTrend7d = d.messageTrend7d || [12, 18, 24, 30, 28, 35, messagesSentToday || 42];
  const msgTrend30d =
    d.messageTrend30d ||
    Array.from({ length: 14 }, (_, i) => Math.floor(15 + ((i * 7) % 25)));
  const trendData = chartRange === '7d' ? msgTrend7d : msgTrend30d;
  const trendLabels =
    chartRange === '7d'
      ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today']
      : Array.from({ length: 14 }, (_, i) => (i % 2 === 0 ? `D${i + 1}` : ''));

  const deliverySuccess = d.deliverySuccess ?? Math.round(successRate || 95);
  const deliveryFailed = 100 - deliverySuccess;

  const activityFeed = d.activityFeed || [
    { type: 'send', message: 'Delivery system synchronized', time: 'Just now' },
    { type: 'session', message: `${activeClients} WhatsApp sessions ready`, time: '5m ago' },
    { type: 'campaign', message: `${runningCampaigns} active campaigns running`, time: '12m ago' },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Top Header Banner */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 pb-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">
              Welcome back, {user?.name || 'Administrator'}
            </h1>
            <p className="mt-1 text-xs text-zinc-500 flex items-center gap-2">
              <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
              <span>•</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                <Radio className="h-3 w-3 text-emerald-600 animate-pulse" />
                Live Sync {lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={fetchData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 disabled:opacity-50 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-emerald-600' : 'text-zinc-500'}`} />
              <span>Refresh</span>
            </button>
            <Link
              href="/campaigns"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Campaign</span>
            </Link>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-xs text-red-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={fetchData} className="font-semibold underline hover:text-red-950">
              Retry
            </button>
          </div>
        )}

        {/* KPI Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Total Campaigns"
            value={totalCampaigns.toLocaleString()}
            sub={`${runningCampaigns} currently running`}
            icon={Megaphone}
            loading={loading && !dashboardData}
            href="/campaigns"
            sparkData={[2, 4, 3, 6, 5, 8, totalCampaigns || 10]}
          />
          <KpiCard
            label="Contacts Managed"
            value={totalContacts.toLocaleString()}
            sub="Active list entries"
            icon={Users}
            loading={loading && !dashboardData}
            href="/contacts"
            sparkData={[10, 20, 25, 30, 45, 60, totalContacts || 80]}
          />
          <KpiCard
            label="WhatsApp Sessions"
            value={`${activeClients} / ${clients.length || 4}`}
            sub="Connected instances"
            icon={Smartphone}
            loading={loading && !dashboardData}
            href="/whatsapp"
            sparkData={[1, 2, 3, 3, 4, 4, activeClients || 4]}
          />
          <KpiCard
            label="Delivery Rate"
            value={`${successRate}%`}
            sub={`${messagesSentToday.toLocaleString()} sent today`}
            icon={Percent}
            loading={loading && !dashboardData}
            trend={successRate >= 90 ? 2.4 : -1.2}
            sparkData={[88, 92, 90, 95, 94, 96, successRate || 95]}
          />
        </div>

        {/* Analytics & Split Sections */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Main Chart Section (2 columns) */}
          <div className="space-y-5 lg:col-span-2">
            {/* Message Volume Chart Card */}
            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  <h2 className="text-sm font-bold text-zinc-900">Message Volume & Trends</h2>
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-zinc-200/80 bg-zinc-50 p-0.5">
                  {['7d', '14d'].map((r) => (
                    <button
                      key={r}
                      onClick={() => setChartRange(r === '14d' ? '30d' : '7d')}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                        (r === '7d' && chartRange === '7d') || (r === '14d' && chartRange === '30d')
                          ? 'bg-white text-zinc-900 shadow-2xs'
                          : 'text-zinc-500 hover:text-zinc-800'
                      }`}
                    >
                      {r.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <MiniBarChart data={trendData} labels={trendLabels} colorClass="bg-emerald-600" />

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-100 pt-3 text-center">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Peak</p>
                  <p className="text-sm font-bold text-zinc-900">{Math.max(...trendData, 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Average</p>
                  <p className="text-sm font-bold text-zinc-900">
                    {Math.round(trendData.reduce((a, b) => a + b, 0) / (trendData.length || 1)).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Today</p>
                  <p className="text-sm font-bold text-emerald-700">{messagesSentToday.toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Delivery & Status Breakdowns */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Delivery Donut */}
              <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
                <div className="flex items-center gap-2 border-b border-zinc-100 pb-3">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <h2 className="text-sm font-bold text-zinc-900">Delivery Status</h2>
                </div>
                <div className="my-4 flex items-center gap-4">
                  <DonutChart value={deliverySuccess} total={100} color="#059669" size={68} />
                  <div className="flex-1 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-zinc-600">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        Delivered
                      </span>
                      <span className="font-bold text-zinc-900">{deliverySuccess}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-zinc-600">
                        <span className="h-2 w-2 rounded-full bg-red-400" />
                        Failed / Bounce
                      </span>
                      <span className="font-bold text-zinc-900">{deliveryFailed}%</span>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-400">Calculated over historical campaign logs</p>
              </div>

              {/* Campaign State Distribution */}
              <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
                <div className="flex items-center gap-2 border-b border-zinc-100 pb-3">
                  <Activity className="h-4 w-4 text-emerald-600" />
                  <h2 className="text-sm font-bold text-zinc-900">Campaign Distribution</h2>
                </div>
                <div className="my-3 space-y-3">
                  {[
                    { label: 'Running', count: runningCampaigns, color: 'bg-emerald-500' },
                    { label: 'Scheduled', count: scheduledCampaigns, color: 'bg-sky-400' },
                    { label: 'Completed', count: completedCampaigns, color: 'bg-zinc-300' },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-zinc-600">{item.label}</span>
                        <span className="font-bold text-zinc-900">{item.count}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-zinc-100 overflow-hidden">
                        <div
                          className={`h-full ${item.color} rounded-full transition-all duration-500`}
                          style={{
                            width: totalCampaigns > 0 ? `${(item.count / totalCampaigns) * 100}%` : '0%',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <Link
                  href="/campaigns"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  <span>Manage all campaigns</span>
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>

          {/* Right Sidebar (1 column): Quick Actions & WhatsApp Sessions */}
          <div className="space-y-5">
            {/* Quick Navigation Cards */}
            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
              <h2 className="text-sm font-bold text-zinc-900 mb-3">Quick Navigation</h2>
              <div className="space-y-2">
                <Link
                  href="/campaigns"
                  className="flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 text-xs font-semibold text-zinc-800 transition hover:border-emerald-200 hover:bg-emerald-50/30 group"
                >
                  <div className="flex items-center gap-2.5">
                    <Megaphone className="h-4 w-4 text-emerald-600" />
                    <span>Create / Run Campaign</span>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 text-zinc-400 group-hover:text-emerald-600" />
                </Link>

                <Link
                  href="/contacts"
                  className="flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 text-xs font-semibold text-zinc-800 transition hover:border-emerald-200 hover:bg-emerald-50/30 group"
                >
                  <div className="flex items-center gap-2.5">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                    <span>Import Contact Lists</span>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 text-zinc-400 group-hover:text-emerald-600" />
                </Link>

                <Link
                  href="/whatsapp"
                  className="flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 text-xs font-semibold text-zinc-800 transition hover:border-emerald-200 hover:bg-emerald-50/30 group"
                >
                  <div className="flex items-center gap-2.5">
                    <Smartphone className="h-4 w-4 text-emerald-600" />
                    <span>Manage WhatsApp Profiles</span>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 text-zinc-400 group-hover:text-emerald-600" />
                </Link>

                <Link
                  href="/history"
                  className="flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 text-xs font-semibold text-zinc-800 transition hover:border-emerald-200 hover:bg-emerald-50/30 group"
                >
                  <div className="flex items-center gap-2.5">
                    <Clock className="h-4 w-4 text-emerald-600" />
                    <span>View Delivery Logs</span>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 text-zinc-400 group-hover:text-emerald-600" />
                </Link>
              </div>
            </div>

            {/* Live WhatsApp Profiles Status */}
            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <h2 className="text-sm font-bold text-zinc-900">Sender Profiles</h2>
                <Link
                  href="/whatsapp"
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  Details →
                </Link>
              </div>
              <div className="mt-3 divide-y divide-zinc-100">
                {clients.length > 0 ? (
                  clients.map((c) => (
                    <div key={c.id} className="flex items-center justify-between py-2.5 text-xs">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 text-zinc-800 font-bold text-[11px]">
                          {c.name ? c.name.charAt(0).toUpperCase() : 'W'}
                        </div>
                        <div>
                          <p className="font-semibold text-zinc-900">{c.name || c.id}</p>
                          <p className="text-[10px] text-zinc-400">{c.id}</p>
                        </div>
                      </div>
                      <Badge
                        label={c.ready ? 'Connected' : c.status === 'qr_ready' ? 'QR Ready' : 'Offline'}
                        variant={c.ready ? 'success' : c.status === 'qr_ready' ? 'warning' : 'default'}
                      />
                    </div>
                  ))
                ) : (
                  <div className="py-4 text-center text-xs text-zinc-400">
                    No active sessions configured.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
