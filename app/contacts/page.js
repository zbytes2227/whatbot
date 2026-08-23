'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  Plus,
  Search,
  Trash2,
  Edit3,
  Download,
  Upload,
  Phone,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  Clock,
  ChevronRight,
  Filter,
  Check,
  HelpCircle,
  Hash,
} from 'lucide-react';
import Layout from '../components/Layout';
import { authFetch } from '@/lib/clientApi';

export default function Contacts() {
  const router = useRouter();

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [authError, setAuthError] = useState(null);

  // Data states
  const [contactLists, setContactLists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  // Form states
  const [formOpen, setFormOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formSuccess, setFormSuccess] = useState(null);
  const [listName, setListName] = useState('');
  const [phoneNumbers, setPhoneNumbers] = useState('');
  const [editingListId, setEditingListId] = useState(null);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [listToDelete, setListToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // View numbers modal
  const [viewListModal, setViewListModal] = useState(null);

  // File upload ref
  const fileInputRef = useRef(null);

  // === AUTHENTICATION CHECK ===
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
        setAuthError('Failed to verify authentication. Redirecting to login...');
        setTimeout(() => router.replace('/login'), 2000);
      }
    }
    checkAuth();
  }, [router]);

  // Fetch contact lists only if authenticated
  const fetchContactLists = useCallback(async () => {
    if (!isAuthenticated) return;

    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/contacts');
      const data = await res.json();
      if (data.success) {
        setContactLists(data.lists || []);
      } else {
        setError(data.msg || 'Failed to load contact lists');
      }
    } catch {
      setError('Error fetching contact lists');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchContactLists();
    }
  }, [fetchContactLists, isAuthenticated]);

  // Open form to add or edit list
  const openForm = (list = null) => {
    setFormError(null);
    setFormSuccess(null);
    if (list) {
      setListName(list.name || '');
      setEditingListId(list._id);
      setPhoneNumbers(list.contacts ? list.contacts.join('\n') : '');
    } else {
      setListName('');
      setPhoneNumbers('');
      setEditingListId(null);
    }
    setFormOpen(true);
  };

  // Open delete confirmation
  const confirmDelete = (list) => {
    setListToDelete(list);
    setDeleteModalOpen(true);
  };

  // Execute delete
  const handleDelete = async () => {
    if (!listToDelete) return;
    setDeleteLoading(true);
    try {
      const res = await authFetch(`/api/contacts?listId=${listToDelete._id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setDeleteModalOpen(false);
        setListToDelete(null);
        fetchContactLists();
      } else {
        setError(data.msg || 'Failed to delete contact list');
      }
    } catch {
      setError('Error deleting contact list');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Parse phone numbers from file
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        // Extract numbers from CSV or plain text
        const matches = text
          .split(/[\r\n,]+/)
          .map((line) => line.trim().replace(/[^0-9+]/g, ''))
          .filter((num) => num.length >= 8);

        if (matches.length > 0) {
          setPhoneNumbers((prev) => (prev ? `${prev}\n${matches.join('\n')}` : matches.join('\n')));
        }
      }
    };
    reader.readAsText(file);
  };

  // Export list to CSV
  const exportListCsv = (list) => {
    if (!list.contacts || !list.contacts.length) return;
    const csvContent = 'Phone Number\n' + list.contacts.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${list.name.replace(/\s+/g, '_')}_contacts.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Count valid phone numbers
  const getValidNumbersCount = (text) => {
    if (!text) return 0;
    const list = text
      .split(/[,\n\r]+/)
      .map((num) => num.trim().replace(/[^0-9]/g, ''))
      .filter((num) => num.length >= 8);
    return new Set(list).size;
  };

  // Submit form
  const submitForm = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);
    setFormSuccess(null);

    const validCount = getValidNumbersCount(phoneNumbers);
    if (validCount === 0) {
      setFormError('Please enter at least one valid phone number (minimum 8 digits)');
      setFormLoading(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('action', editingListId ? 'update' : 'import');
      if (editingListId) {
        formData.append('listId', editingListId);
        formData.append('name', listName);
      } else {
        formData.append('listName', listName);
      }
      formData.append('numbers', phoneNumbers);

      const res = await authFetch('/api/contacts', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setFormSuccess(data.msg || (editingListId ? 'Contact list updated successfully' : 'New contact list created'));
        fetchContactLists();
        setTimeout(() => {
          setFormOpen(false);
          setEditingListId(null);
          setListName('');
          setPhoneNumbers('');
        }, 1200);
      } else {
        setFormError(data.msg || 'Failed to save contact list');
      }
    } catch {
      setFormError('Error saving contact list');
    } finally {
      setFormLoading(false);
    }
  };

  const filteredLists = contactLists.filter((list) =>
    (list.name || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalNumbersAllLists = contactLists.reduce((acc, curr) => acc + (curr.contacts?.length || 0), 0);

  // Show loading during auth check
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

  if (isAuthenticated === false) {
    return null;
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 pb-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">Contact Lists</h1>
            <p className="mt-1 text-xs text-zinc-500">
              Manage recipient databases, import phone numbers, and segment audiences for broadcast campaigns.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={fetchContactLists}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 disabled:opacity-50 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-emerald-600' : 'text-zinc-500'}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={() => openForm()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Contact List</span>
            </button>
          </div>
        </div>

        {/* Overview Stats Row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Total Lists</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <FileSpreadsheet className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-zinc-900">{contactLists.length}</p>
            <p className="mt-1 text-[11px] text-zinc-500">Configured target segments</p>
          </div>

          <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Total Contacts</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Users className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-zinc-900">{totalNumbersAllLists.toLocaleString()}</p>
            <p className="mt-1 text-[11px] text-zinc-500">Across all lists</p>
          </div>

          <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Average List Size</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Hash className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-zinc-900">
              {contactLists.length ? Math.round(totalNumbersAllLists / contactLists.length).toLocaleString() : 0}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">Recipients per list</p>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-xs text-red-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={fetchContactLists} className="font-semibold underline hover:text-red-950">
              Retry
            </button>
          </div>
        )}

        {/* Filter / Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-zinc-200/80 shadow-2xs">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search contact lists..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200/80 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
            />
          </div>
          <div className="text-xs text-zinc-500 font-medium self-end sm:self-center">
            Showing <span className="text-zinc-900 font-bold">{filteredLists.length}</span> of {contactLists.length} lists
          </div>
        </div>

        {/* Lists Content */}
        {loading && contactLists.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-12 text-center">
            <RefreshCw className="h-6 w-6 animate-spin text-emerald-600 mx-auto mb-3" />
            <p className="text-xs font-semibold text-zinc-600">Loading contact lists...</p>
          </div>
        ) : filteredLists.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
            <FileSpreadsheet className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-zinc-900">No contact lists found</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1 mb-4">
              {search ? 'No lists matched your search query.' : 'Create your first contact list to start sending WhatsApp broadcast campaigns.'}
            </p>
            <button
              onClick={() => openForm()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Contact List</span>
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-xs">
            <table className="w-full text-left text-xs text-zinc-600">
              <thead className="border-b border-zinc-100 bg-zinc-50/80 font-bold uppercase tracking-wider text-zinc-500 text-[10px]">
                <tr>
                  <th className="px-5 py-3.5">List Details</th>
                  <th className="px-5 py-3.5">Recipients</th>
                  <th className="px-5 py-3.5">Sample Numbers</th>
                  <th className="px-5 py-3.5">Created Date</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-medium">
                {filteredLists.map((list) => (
                  <tr key={list._id} className="hover:bg-zinc-50/60 transition">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 font-bold text-emerald-700">
                          {(list.name || 'L').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-zinc-900 text-sm">{list.name}</p>
                          <p className="text-[11px] text-zinc-400">ID: {list._id}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200/80">
                        <Users className="h-3 w-3 text-emerald-600" />
                        {list.contacts?.length || 0} numbers
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      {list.contacts && list.contacts.length > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded">
                            {list.contacts[0]}
                          </span>
                          {list.contacts.length > 1 && (
                            <button
                              onClick={() => setViewListModal(list)}
                              className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
                            >
                              +{list.contacts.length - 1} more
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-zinc-400 italic">No numbers</span>
                      )}
                    </td>

                    <td className="px-5 py-4 text-[11px] text-zinc-500">
                      {new Date(list.createdAt || Date.now()).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => exportListCsv(list)}
                          title="Export CSV"
                          className="rounded-lg border border-zinc-200/80 p-1.5 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100 transition"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => openForm(list)}
                          title="Edit List"
                          className="rounded-lg border border-zinc-200/80 p-1.5 text-zinc-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => confirmDelete(list)}
                          title="Delete List"
                          className="rounded-lg border border-zinc-200/80 p-1.5 text-zinc-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal: Create or Edit Contact List */}
        {formOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-xl border border-zinc-200">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <FileSpreadsheet className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-zinc-900">
                      {editingListId ? 'Edit Contact List' : 'New Contact List'}
                    </h2>
                    <p className="text-xs text-zinc-500">
                      {editingListId ? 'Update contacts and recipient names' : 'Add phone numbers manually or import via CSV file'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setFormOpen(false)}
                  disabled={formLoading}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {formError && (
                  <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                    <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {formSuccess && (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>{formSuccess}</span>
                  </div>
                )}

                {/* List Name Input */}
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                    List Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. VIP Clients, Summer Promo 2026"
                    value={listName}
                    onChange={(e) => setListName(e.target.value)}
                    disabled={formLoading}
                    className="w-full px-3.5 py-2 text-xs border border-zinc-200/80 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
                  />
                </div>

                {/* Quick File Import helper */}
                <div className="flex items-center justify-between rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 p-3.5">
                  <div className="flex items-center gap-2.5">
                    <Upload className="h-4 w-4 text-emerald-600" />
                    <div>
                      <p className="text-xs font-semibold text-zinc-800">Import numbers from file</p>
                      <p className="text-[11px] text-zinc-400">Supports .txt and .csv with one phone per row</p>
                    </div>
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".csv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 shadow-2xs transition"
                  >
                    Select File
                  </button>
                </div>

                {/* Phone Numbers Text Area */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-zinc-700">
                      Phone Numbers <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                      {getValidNumbersCount(phoneNumbers)} Unique Numbers
                    </span>
                  </div>
                  <textarea
                    rows={8}
                    required
                    placeholder="Enter phone numbers with country code:&#10;14155552671&#10;447700900077&#10;919876543210&#10;(Comma or newline separated)"
                    value={phoneNumbers}
                    onChange={(e) => setPhoneNumbers(e.target.value)}
                    disabled={formLoading}
                    className="w-full px-3.5 py-2.5 text-xs font-mono border border-zinc-200/80 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 transition resize-y"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2.5 border-t border-zinc-100 px-6 py-4 bg-zinc-50/50 rounded-b-2xl">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  disabled={formLoading}
                  className="rounded-xl border border-zinc-200/80 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitForm}
                  disabled={formLoading || !listName.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition"
                >
                  {formLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>{editingListId ? 'Save Changes' : 'Create List'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: View Full List Numbers */}
        {viewListModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-xl border border-zinc-200">
              <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">{viewListModal.name}</h3>
                  <p className="text-xs text-zinc-400">{viewListModal.contacts?.length || 0} phone numbers</p>
                </div>
                <button
                  onClick={() => setViewListModal(null)}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 font-mono text-xs text-zinc-700 space-y-1 divide-y divide-zinc-100">
                {viewListModal.contacts?.map((num, i) => (
                  <div key={i} className="py-1.5 flex items-center justify-between">
                    <span>{num}</span>
                    <span className="text-[10px] text-zinc-400">#{i + 1}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-end border-t border-zinc-100 p-4 bg-zinc-50/50 rounded-b-2xl">
                <button
                  onClick={() => setViewListModal(null)}
                  className="rounded-xl border border-zinc-200/80 bg-white px-4 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Delete Confirmation */}
        {deleteModalOpen && listToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-zinc-200 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600 mb-4">
                <Trash2 className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-zinc-900">Delete Contact List?</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Are you sure you want to delete <span className="font-semibold text-zinc-800">"{listToDelete.name}"</span>? This action cannot be undone.
              </p>
              <div className="mt-5 flex items-center justify-center gap-2.5">
                <button
                  onClick={() => setDeleteModalOpen(false)}
                  disabled={deleteLoading}
                  className="rounded-xl border border-zinc-200/80 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteLoading}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-red-700 disabled:opacity-50 transition"
                >
                  {deleteLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>Delete List</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
