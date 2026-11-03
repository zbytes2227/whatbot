'use client';

import { useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, Copy, Download, FileUp, ListPlus, Pencil, Plus, ShieldOff, Trash2, Upload, Users } from 'lucide-react';
import { api, download } from '@/lib/clientApi';
import { extractPhones, formatPhone } from '@/lib/phone';
import { useApi, useDebounced } from '@/app/components/hooks';
import {
  ActionMenu,
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Tabs,
  Textarea,
  formatNumber,
  timeAgo,
  useConfirm,
} from '@/app/components/ui';

const MAX_FILE_BYTES = 8 * 1024 * 1024;

function NumbersInput({ value, onChange, label = 'Phone numbers', hint }) {
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const parsed = useMemo(() => extractPhones(value), [value]);

  const readFile = (file) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return toast.error('File is larger than 8 MB');
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      onChange(value ? `${value}\n${text}` : text);
      toast.success(`Loaded ${file.name}`);
    };
    reader.onerror = () => toast.error('Could not read that file');
    reader.readAsText(file);
  };

  return (
    <Field label={label} hint={hint}>
      <div
        className={`relative rounded-xl transition ${dragging ? 'ring-4 ring-brand-500/20' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); readFile(e.dataTransfer.files?.[0]); }}
      >
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={8} className="font-mono text-[13px]" placeholder={'Paste numbers in any format, one per line or comma separated:\n98765 43210\n+91-91234-56789\n+1 415 555 0100'} />
        {dragging && <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl border-2 border-dashed border-brand-500 bg-brand-50/80 text-sm font-medium text-brand-700 dark:bg-brand-500/10">Drop CSV or TXT file</div>}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" className="hidden" onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ''; }} />
          <Button variant="secondary" size="xs" icon={FileUp} onClick={() => fileRef.current?.click()}>Import CSV / TXT</Button>
        </div>
        {value.trim() && (
          <div className="flex items-center gap-2 text-xs">
            <Badge tone="green">{formatNumber(parsed.numbers.length)} valid</Badge>
            {parsed.invalid > 0 && <Badge tone="amber">{formatNumber(parsed.invalid)} invalid</Badge>}
          </div>
        )}
      </div>
    </Field>
  );
}

function ListEditor({ state, onClose, onSaved }) {
  const mode = state?.mode;
  const list = state?.list;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [numbers, setNumbers] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastKey, setLastKey] = useState(null);

  const key = state ? `${mode}:${list?._id || 'new'}` : null;
  if (key !== lastKey) {
    setLastKey(key);
    setName(list?.name || '');
    setDescription(list?.description || '');
    setNumbers('');
  }

  const save = async () => {
    setSaving(true);
    try {
      let res;
      if (mode === 'create') res = await api.post('/api/contacts', { action: 'create', name, description, numbers });
      else if (mode === 'append') res = await api.post('/api/contacts', { action: 'append', listId: list._id, numbers });
      else res = await api.post('/api/contacts', { action: 'update', listId: list._id, name, description });
      toast.success(res.msg || 'Saved');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const titles = { create: 'New contact list', append: `Add numbers to “${list?.name}”`, rename: 'Edit list details' };
  return (
    <Modal
      open={!!state}
      onClose={onClose}
      size="lg"
      title={titles[mode]}
      description={mode === 'append' ? 'Duplicates are skipped automatically.' : mode === 'create' ? 'Numbers are cleaned, normalised with a country code and de-duplicated.' : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={save} disabled={mode !== 'append' && !name.trim()}>{mode === 'create' ? 'Create list' : mode === 'append' ? 'Add numbers' : 'Save'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {mode !== 'append' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="List name" required><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Mumbai customers" /></Field>
            <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="Optional" /></Field>
          </div>
        )}
        {mode !== 'rename' && <NumbersInput value={numbers} onChange={setNumbers} hint="10-digit numbers are treated as Indian (+91). Include + for other countries." />}
      </div>
    </Modal>
  );
}

function ListViewer({ listId, onClose, onChanged }) {
  const { data, refresh } = useApi(listId ? `/api/contacts?listId=${listId}` : null, { select: (d) => d.list });
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(200);
  const confirm = useConfirm();
  const q = search.replace(/[^0-9]/g, '');
  const filtered = useMemo(() => (data?.contacts || []).filter((n) => !q || String(n).includes(q)), [data, q]);

  const remove = async (number) => {
    const ok = await confirm({ title: 'Remove number?', message: `${formatPhone(number)} will be removed from this list.`, confirmText: 'Remove', tone: 'danger' });
    if (!ok) return;
    try {
      await api.post('/api/contacts', { action: 'removeNumbers', listId, numbers: [number] });
      toast.success('Number removed');
      refresh();
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Drawer
      open={!!listId}
      onClose={onClose}
      width="max-w-lg"
      title={data?.name || 'Loading…'}
      description={data ? `${formatNumber(data.contacts.length)} numbers · updated ${timeAgo(data.updatedAt)}` : null}
      headerExtra={data && (
        <>
          <Button variant="secondary" size="sm" icon={Copy} onClick={() => navigator.clipboard.writeText(data.contacts.join('\n')).then(() => toast.success('Copied to clipboard'))}>Copy</Button>
          <Button variant="secondary" size="sm" icon={Download} onClick={() => download(`/api/contacts?listId=${listId}&format=csv`)}>CSV</Button>
        </>
      )}
    >
      <SearchInput value={search} onChange={setSearch} placeholder="Search numbers…" className="mb-4" />
      {!data ? <div className="skeleton h-64 w-full" /> : (
        <>
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200/80 dark:divide-zinc-800 dark:border-zinc-800">
            {filtered.slice(0, limit).map((n) => (
              <li key={n} className="group flex items-center justify-between px-4 py-2 text-sm tabular-nums">
                <span>{formatPhone(n)}</span>
                <button type="button" onClick={() => remove(n)} className="rounded-md p-1 text-zinc-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-500/10" aria-label={`Remove ${n}`}><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
            {!filtered.length && <li className="px-4 py-8 text-center text-sm text-zinc-500">No matching numbers.</li>}
          </ul>
          {filtered.length > limit && <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => setLimit((l) => l + 500)}>Show more ({formatNumber(filtered.length - limit)} remaining)</Button>}
        </>
      )}
    </Drawer>
  );
}

function ListsTab() {
  const { data: lists, loading, refresh } = useApi('/api/contacts', { select: (d) => d.lists });
  const [editor, setEditor] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 150);
  const confirm = useConfirm();
  const visible = (lists || []).filter((l) => !debounced || l.name.toLowerCase().includes(debounced.toLowerCase()));
  const total = (lists || []).reduce((s, l) => s + l.count, 0);

  const remove = async (list) => {
    const ok = await confirm({ title: 'Delete contact list?', message: `“${list.name}” and its ${formatNumber(list.count)} numbers will be deleted. Campaigns that used it keep their logs.`, confirmText: 'Delete list', tone: 'danger' });
    if (!ok) return;
    try {
      await api.del(`/api/contacts?listId=${list._id}`);
      toast.success('List deleted');
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-500">{formatNumber(lists?.length || 0)} {lists?.length === 1 ? 'list' : 'lists'} · {formatNumber(total)} {total === 1 ? 'number' : 'numbers'}</p>
        <div className="flex gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Search lists…" className="sm:w-64" />
          <Button icon={Plus} onClick={() => setEditor({ mode: 'create' })}>New list</Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-40" />)}</div>
      ) : !visible.length ? (
        <Card><EmptyState icon={Users} title={lists?.length ? 'No lists match your search' : 'No contact lists yet'} description="Paste numbers, upload a CSV or extract them from a WhatsApp group." action={!lists?.length && <Button icon={Plus} onClick={() => setEditor({ mode: 'create' })}>Create a list</Button>} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((l, i) => (
            <Card key={l._id} className="group flex animate-fade-up cursor-pointer flex-col p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift" style={{ animationDelay: `${Math.min(i, 9) * 40}ms` }} onClick={() => setViewing(l._id)}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 dark:from-brand-500/10 dark:to-brand-500/5 dark:text-brand-400"><Users className="h-5 w-5" /></div>
                <ActionMenu items={[
                  { label: 'Add numbers', icon: ListPlus, onClick: () => setEditor({ mode: 'append', list: l }) },
                  { label: 'Edit details', icon: Pencil, onClick: () => setEditor({ mode: 'rename', list: l }) },
                  { label: 'Export CSV', icon: Download, onClick: () => download(`/api/contacts?listId=${l._id}&format=csv`) },
                  { divider: true },
                  { label: 'Delete', icon: Trash2, danger: true, onClick: () => remove(l) },
                ]} />
              </div>
              <p className="mt-4 truncate font-semibold text-zinc-900 dark:text-white">{l.name}</p>
              <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{l.description || 'No description'}</p>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{formatNumber(l.count)}</p>
                  <p className="text-xs text-zinc-500">numbers</p>
                </div>
                <div className="text-right text-xs text-zinc-500">
                  {l.activeCampaigns > 0 ? <Badge tone="green" dot pulse>{l.activeCampaigns} active</Badge> : l.campaigns > 0 ? <span>Used in {l.campaigns} campaign(s)</span> : <span>Unused</span>}
                  <p className="mt-1">Updated {timeAgo(l.updatedAt)}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ListEditor state={editor} onClose={() => setEditor(null)} onSaved={refresh} />
      <ListViewer listId={viewing} onClose={() => setViewing(null)} onChanged={refresh} />
    </>
  );
}

function OptOutsTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const { data, loading, refresh } = useApi(`/api/optouts?page=${page}&limit=25${debounced ? `&search=${encodeURIComponent(debounced)}` : ''}`, { keepPrevious: true });
  const [adding, setAdding] = useState(false);
  const [numbers, setNumbers] = useState('');
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();

  const add = async () => {
    setSaving(true);
    try {
      const res = await api.post('/api/optouts', { numbers });
      toast.success(`Added ${res.added} number(s)${res.existing ? `, ${res.existing} already listed` : ''}`);
      setNumbers('');
      setAdding(false);
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (n) => {
    const ok = await confirm({ title: 'Allow messages again?', message: `${formatPhone(n)} will be removed from the opt-out list and may receive future campaigns.`, confirmText: 'Remove' });
    if (!ok) return;
    try {
      await api.del(`/api/optouts?number=${n}`);
      toast.success('Removed from opt-outs');
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <Card className="mb-4 flex items-start gap-3 bg-gradient-to-r from-zinc-50 to-white p-4 dark:from-zinc-900 dark:to-zinc-900/40">
        <ShieldOff className="mt-0.5 h-5 w-5 shrink-0 text-zinc-500" />
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Campaigns never message numbers on this list. Recipients who reply <b>STOP</b> or <b>UNSUBSCRIBE</b> are added automatically.</p>
      </Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:justify-between">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search number…" className="sm:w-64" />
        <div className="flex gap-2">
          <Button variant="secondary" icon={Download} onClick={() => download('/api/optouts?format=csv')}>Export</Button>
          <Button icon={Plus} onClick={() => setAdding(true)}>Add numbers</Button>
        </div>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full">
          <thead className="bg-zinc-50 dark:bg-zinc-900"><tr><th className="th">Number</th><th className="th">Source</th><th className="th hidden md:table-cell">Reason</th><th className="th">Added</th><th className="th" /></tr></thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {(data?.items || []).map((o) => (
              <tr key={o._id} className="animate-fade-in">
                <td className="td font-medium tabular-nums">{formatPhone(o.number)}</td>
                <td className="td"><Badge tone={o.source === 'reply' ? 'violet' : 'gray'}>{o.source === 'reply' ? 'Replied STOP' : 'Manual'}</Badge></td>
                <td className="td hidden max-w-xs truncate text-zinc-500 md:table-cell">{o.reason}</td>
                <td className="td text-xs text-zinc-500">{timeAgo(o.createdAt)}</td>
                <td className="td text-right"><Button variant="ghost" size="xs" onClick={() => remove(o.number)}>Remove</Button></td>
              </tr>
            ))}
            {loading && <tr><td colSpan={5} className="p-4"><div className="skeleton h-24" /></td></tr>}
            {data && !data.items.length && <tr><td colSpan={5}><EmptyState icon={CheckCircle2} title="Nobody has opted out" description={debounced ? 'No numbers match your search.' : 'Numbers added here are excluded from every campaign.'} /></td></tr>}
          </tbody>
        </table>
      </Card>
      {data && <div className="mt-3"><Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} /></div>}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add to opt-out list" size="lg" footer={<><Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button icon={Upload} loading={saving} onClick={add}>Add numbers</Button></>}>
        <NumbersInput value={numbers} onChange={setNumbers} />
      </Modal>
    </>
  );
}

export default function ContactsPage() {
  const [tab, setTab] = useState('lists');
  return (
    <>
      <PageHeader title="Contacts" description="Manage the audiences your campaigns send to." />
      <Tabs className="mb-6" value={tab} onChange={setTab} tabs={[{ value: 'lists', label: 'Contact lists', icon: Users }, { value: 'optouts', label: 'Opt-outs', icon: ShieldOff }]} />
      <div key={tab} className="animate-fade-in">{tab === 'lists' ? <ListsTab /> : <OptOutsTab />}</div>
    </>
  );
}
