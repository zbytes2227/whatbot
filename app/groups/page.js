'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  Download,
  Copy,
  Check,
  Search,
  ChevronDown,
  RefreshCw,
  AlertCircle,
  Phone,
  ShieldCheck,
  CheckCircle2,
  FileSpreadsheet,
  ArrowRight,
  UserCheck,
  Star,
} from 'lucide-react';
import Layout from '../components/Layout';
import { authFetch } from '@/lib/clientApi';

function exportCSV(data, filename = 'contacts.csv') {
  if (!data?.length) return;
  const headers = ['Name', 'Phone Number', 'Admin', 'Status'];
  const rows = data.map((p) => [
    (p.name || '').replace(/"/g, '""'),
    p.formattedNumber || '',
    p.isAdmin ? 'Yes' : 'No',
    p.status || '',
  ]);
  const csvContent = [headers, ...rows]
    .map((row) => row.map(String).map((v) => `"${v.replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 0);
}

export default function GroupsPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [authError, setAuthError] = useState(null);

  const [profiles, setProfiles] = useState([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesError, setProfilesError] = useState(null);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [profileDropOpen, setProfileDropOpen] = useState(false);

  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupDropOpen, setGroupDropOpen] = useState(false);
  const [groupSearch, setGroupSearch] = useState('');

  const [participants, setParticipants] = useState([]);
  const [participantStats, setParticipantStats] = useState({});
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError, setParticipantsError] = useState(null);

  const [copied, setCopied] = useState(false);
  const [importingToList, setImportingToList] = useState(false);
  const [importSuccess, setImportSuccess] = useState(null);

  // Auth check
  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/api/auth', { cache: 'no-store' });
        const json = await res.json();
        if (res.ok && json.success && json.valid) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
          router.replace('/login');
        }
      } catch {
        setIsAuthenticated(false);
        setAuthError('Authentication error. Redirecting to login...');
        setTimeout(() => router.replace('/login'), 2000);
      }
    })();
  }, [router]);

  // Fetch profiles
  useEffect(() => {
    if (!isAuthenticated) return;
    setProfilesLoading(true);
    authFetch('/api/groups?action=profiles')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setProfiles(d.profiles || []);
        else setProfilesError(d.msg || 'Failed to fetch profiles');
      })
      .catch(() => setProfilesError('Network error loading profiles'))
      .finally(() => setProfilesLoading(false));
  }, [isAuthenticated]);

  // Fetch groups when profile changes
  useEffect(() => {
    if (!selectedProfile) {
      setGroups([]);
      setSelectedGroup(null);
      return;
    }
    setGroupsLoading(true);
    setGroupsError(null);
    authFetch(`/api/groups?action=list&clientId=${encodeURIComponent(selectedProfile.clientId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setGroups(d.groups || []);
        else setGroupsError(d.msg || 'Failed to load groups');
      })
      .catch(() => setGroupsError('Network error loading groups'))
      .finally(() => setGroupsLoading(false));
  }, [selectedProfile]);

  // Fetch participants when group changes
  useEffect(() => {
    if (!selectedProfile || !selectedGroup) {
      setParticipants([]);
      setParticipantStats({});
      return;
    }
    setParticipantsLoading(true);
    setParticipantsError(null);
    setImportSuccess(null);
    authFetch(
      `/api/groups?action=participants&clientId=${encodeURIComponent(
        selectedProfile.clientId
      )}&groupId=${encodeURIComponent(selectedGroup.groupId)}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setParticipants(d.participants || []);
          setParticipantStats(d.summary || {});
        } else setParticipantsError(d.msg || 'Failed to load contacts');
      })
      .catch(() => setParticipantsError('Network error loading contacts'))
      .finally(() => setParticipantsLoading(false));
  }, [selectedProfile, selectedGroup]);

  // Copy numbers to clipboard
  const copyPhones = () => {
    if (!participants.length) return;
    const nums = participants.map((p) => p.formattedNumber).filter(Boolean).join('\n');
    navigator.clipboard.writeText(nums);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Create new contact list directly from group participants
  const saveAsContactList = async () => {
    if (!participants.length || !selectedGroup) return;
    setImportingToList(true);
    setImportSuccess(null);
    try {
      const numbers = participants.map((p) => p.formattedNumber).filter(Boolean).join('\n');
      const listName = `Group: ${selectedGroup.name || 'WhatsApp Group'}`;

      const formData = new FormData();
      formData.append('action', 'import');
      formData.append('listName', listName);
      formData.append('numbers', numbers);

      const res = await authFetch('/api/contacts', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        setImportSuccess(`Created contact list "${listName}" with ${participants.length} numbers!`);
      } else {
        alert(data.msg || 'Failed to save contact list');
      }
    } catch {
      alert('Error saving contact list');
    } finally {
      setImportingToList(false);
    }
  };

  // Profile dropdown ref
  const profileDropRef = useRef(null);
  useEffect(() => {
    if (!profileDropOpen) return;
    function handler(e) {
      if (profileDropRef.current && !profileDropRef.current.contains(e.target)) setProfileDropOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileDropOpen]);

  // Group dropdown ref
  const groupDropRef = useRef(null);
  useEffect(() => {
    if (!groupDropOpen) return;
    function handler(e) {
      if (groupDropRef.current && !groupDropRef.current.contains(e.target)) setGroupDropOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [groupDropOpen]);

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

  const filteredGroups = groups.filter((g) =>
    (g.name || '').toLowerCase().includes(groupSearch.toLowerCase())
  );

  return (
    <Layout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 pb-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">Group Contact Extractor</h1>
            <p className="mt-1 text-xs text-zinc-500">
              Extract and export participants from WhatsApp groups into CSV, clipboard, or target contact lists.
            </p>
          </div>
        </div>

        {/* Step 1 & 2 Selector Card */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xs space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Step 1: Select Profile */}
            <div className="space-y-2" ref={profileDropRef}>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500">
                1. Select Connected WhatsApp Profile
              </label>

              {profilesLoading ? (
                <div className="h-10 animate-pulse rounded-xl bg-zinc-100" />
              ) : profilesError ? (
                <div className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
                  {profilesError}
                </div>
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setProfileDropOpen(!profileDropOpen)}
                    disabled={!profiles.length}
                    className="flex w-full items-center justify-between rounded-xl border border-zinc-200/80 bg-zinc-50 px-4 py-2.5 text-left text-xs font-semibold text-zinc-800 hover:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
                  >
                    <span>
                      {selectedProfile ? selectedProfile.name || selectedProfile.clientId : '— Choose Profile —'}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform ${profileDropOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {profileDropOpen && (
                    <div className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-lg text-xs">
                      {profiles.map((p) => (
                        <button
                          key={p.clientId}
                          type="button"
                          onClick={() => {
                            setSelectedProfile(p);
                            setProfileDropOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-medium transition hover:bg-emerald-50 hover:text-emerald-900 ${
                            selectedProfile?.clientId === p.clientId ? 'bg-emerald-50 font-bold text-emerald-800' : 'text-zinc-700'
                          }`}
                        >
                          <span>{p.name || p.clientId}</span>
                          <span className="flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Connected
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <p className="text-[11px] text-zinc-400">Only live connected WhatsApp sessions are listed.</p>
            </div>

            {/* Step 2: Select Group */}
            <div className="space-y-2" ref={groupDropRef}>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500">
                2. Select Target Group
              </label>

              {!selectedProfile ? (
                <div className="flex h-10 items-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-4 text-xs text-zinc-400">
                  Select a profile first
                </div>
              ) : groupsLoading ? (
                <div className="h-10 animate-pulse rounded-xl bg-zinc-100" />
              ) : groupsError ? (
                <div className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
                  {groupsError}
                </div>
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setGroupDropOpen(!groupDropOpen)}
                    disabled={!groups.length}
                    className="flex w-full items-center justify-between rounded-xl border border-zinc-200/80 bg-zinc-50 px-4 py-2.5 text-left text-xs font-semibold text-zinc-800 hover:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
                  >
                    <span className="truncate">
                      {selectedGroup ? `${selectedGroup.name} (${selectedGroup.participantCount || 0})` : '— Choose Group —'}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform ${groupDropOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {groupDropOpen && (
                    <div className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-2 shadow-lg text-xs space-y-1">
                      <div className="relative pb-1">
                        <input
                          type="text"
                          placeholder="Search groups..."
                          value={groupSearch}
                          onChange={(e) => setGroupSearch(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                      {filteredGroups.map((g) => (
                        <button
                          key={g.groupId}
                          type="button"
                          onClick={() => {
                            setSelectedGroup(g);
                            setGroupDropOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left font-medium transition hover:bg-emerald-50 hover:text-emerald-900 ${
                            selectedGroup?.groupId === g.groupId ? 'bg-emerald-50 font-bold text-emerald-800' : 'text-zinc-700'
                          }`}
                        >
                          <span className="truncate pr-2">{g.name}</span>
                          <span className="text-[11px] font-semibold text-zinc-400 shrink-0">
                            {g.participantCount} members
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <p className="text-[11px] text-zinc-400">
                {groups.length > 0 ? `${groups.length} groups found for this profile` : 'Waiting for group list...'}
              </p>
            </div>
          </div>
        </div>

        {/* Step 3: Extracted Participants Section */}
        {selectedGroup && (
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xs space-y-4">
            {/* Header + Stats & Actions */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 pb-4">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                  <Users className="h-4 w-4 text-emerald-600" />
                  <span>Participants for "{selectedGroup.name}"</span>
                </h3>
                <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                  <span>
                    Total: <strong className="text-zinc-800">{participantStats.totalParticipants || participants.length}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Admins: <strong className="text-zinc-800">{participantStats.admins || participants.filter((p) => p.isAdmin).length}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Valid Numbers: <strong className="text-emerald-700">{participantStats.validPhoneNumbers || participants.length}</strong>
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={copyPhones}
                  disabled={!participants.length}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 disabled:opacity-50 transition"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-zinc-500" />}
                  <span>{copied ? 'Copied!' : 'Copy Numbers'}</span>
                </button>

                <button
                  onClick={() =>
                    exportCSV(
                      participants,
                      `wa_group_${(selectedGroup.name || '').replace(/\s+/g, '_').substring(0, 20)}.csv`
                    )
                  }
                  disabled={!participants.length}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 disabled:opacity-50 transition"
                >
                  <Download className="h-3.5 w-3.5 text-zinc-500" />
                  <span>Export CSV</span>
                </button>

                <button
                  onClick={saveAsContactList}
                  disabled={!participants.length || importingToList}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition"
                >
                  {importingToList ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
                  <span>Save to Contact List</span>
                </button>
              </div>
            </div>

            {/* Success notification */}
            {importSuccess && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{importSuccess}</span>
              </div>
            )}

            {/* Error banner */}
            {participantsError && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                <span>{participantsError}</span>
              </div>
            )}

            {/* Participants Table */}
            {participantsLoading ? (
              <div className="p-12 text-center">
                <RefreshCw className="h-6 w-6 animate-spin text-emerald-600 mx-auto mb-2" />
                <p className="text-xs font-semibold text-zinc-500">Extracting group participants...</p>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto rounded-xl border border-zinc-200/80">
                <table className="w-full text-left text-xs text-zinc-600">
                  <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50/90 backdrop-blur-xs font-bold uppercase tracking-wider text-zinc-500 text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Member Name / Handle</th>
                      <th className="px-4 py-3">Phone Number</th>
                      <th className="px-4 py-3">Admin</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 font-medium">
                    {participants.map((p) => (
                      <tr key={p.id} className="hover:bg-zinc-50/60 transition">
                        <td className="px-4 py-2.5 font-bold text-zinc-900">
                          {p.name || p.phoneNumber || 'WhatsApp User'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-zinc-700">{p.formattedNumber || p.id}</td>
                        <td className="px-4 py-2.5">
                          {p.isAdmin ? (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200/80">
                              <Star className="h-3 w-3 text-amber-500 fill-amber-400" />
                              Admin
                            </span>
                          ) : (
                            <span className="text-zinc-400 text-[11px]">Member</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-500">{p.status || 'Active'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
