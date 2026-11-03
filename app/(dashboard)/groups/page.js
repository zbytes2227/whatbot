'use client';

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, Copy, Crown, Download, EyeOff, ListPlus, Lock, RefreshCw, Smartphone, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/clientApi';
import { formatPhone } from '@/lib/phone';
import { useApi, useDebounced } from '@/app/components/hooks';
import { useSession } from '@/app/components/AppShell';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, SearchInput, Select, cn, formatNumber } from '@/app/components/ui';

function downloadCsv(name, numbers) {
  const blob = new Blob([`﻿number\n${numbers.join('\n')}\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^\w-]+/g, '_') || 'group'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function SaveToListModal({ open, onClose, numbers, groupName }) {
  const { data: lists } = useApi(open ? '/api/contacts' : null, { select: (d) => d.lists });
  const [target, setTarget] = useState('new');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTarget('new');
      setName(groupName ? `${groupName} members` : '');
    }
  }

  const save = async () => {
    setSaving(true);
    try {
      const res = target === 'new'
        ? await api.post('/api/contacts', { action: 'create', name, description: `Extracted from WhatsApp group “${groupName}”`, numbers })
        : await api.post('/api/contacts', { action: 'append', listId: target, numbers });
      toast.success(res.msg);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="sm" title="Save to contact list" description={`${formatNumber(numbers.length)} numbers selected`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} disabled={target === 'new' && !name.trim()} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Destination">
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="new">Create a new list</option>
            {(lists || []).map((l) => <option key={l._id} value={l._id}>Add to “{l.name}” ({formatNumber(l.count)})</option>)}
          </Select>
        </Field>
        {target === 'new' && <Field label="List name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>}
      </div>
    </Modal>
  );
}

function Participants({ clientId, group, onBack }) {
  const { data, loading, error, refresh } = useApi(`/api/groups?action=participants&clientId=${clientId}&groupId=${encodeURIComponent(group.groupId)}`);
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [seenData, setSeenData] = useState(null);
  if (data && data !== seenData) {
    setSeenData(data);
    setSelected(new Set(data.phoneNumbers));
  }

  const visible = useMemo(() => (data?.participants || []).filter((p) => !search || (p.phoneNumber || '').includes(search.replace(/\D/g, ''))), [data, search]);
  const chosen = [...selected];
  const toggle = (n) => setSelected((s) => {
    const next = new Set(s);
    next.has(n) ? next.delete(n) : next.add(n);
    return next;
  });

  return (
    <div className="animate-fade-up">
      <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack} className="mb-4 -ml-2">All groups</Button>
      <Card className="mb-4 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{group.name}</h2>
            {data && (
              <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
                <Badge>{formatNumber(data.summary.total)} members</Badge>
                <Badge tone="green">{formatNumber(data.summary.withNumber)} with numbers</Badge>
                {data.summary.hidden > 0 && <Badge tone="amber">{formatNumber(data.summary.hidden)} hidden</Badge>}
                <Badge tone="violet">{data.summary.admins} admins</Badge>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" icon={Copy} disabled={!chosen.length} onClick={() => navigator.clipboard.writeText(chosen.join('\n')).then(() => toast.success(`Copied ${chosen.length} numbers`))}>Copy</Button>
            <Button variant="secondary" size="sm" icon={Download} disabled={!chosen.length} onClick={() => downloadCsv(group.name, chosen)}>CSV</Button>
            <Button size="sm" icon={ListPlus} disabled={!chosen.length} onClick={() => setSaving(true)}>Save {formatNumber(chosen.length)} to list</Button>
          </div>
        </div>
        {data?.summary.hidden > 0 && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            WhatsApp hides the phone numbers of some members (privacy/LID addressing). They cannot be exported.
          </p>
        )}
      </Card>

      {loading ? <div className="skeleton h-80" /> : error ? (
        <Card><EmptyState icon={UsersRound} title="Could not load members" description={error.message} action={<Button variant="secondary" size="sm" icon={RefreshCw} onClick={refresh}>Try again</Button>} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-100 p-3 dark:border-zinc-800">
            <label className="flex items-center gap-2 px-2 text-sm font-medium">
              <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={chosen.length > 0 && chosen.length === data.phoneNumbers.length} onChange={(e) => setSelected(new Set(e.target.checked ? data.phoneNumbers : []))} />
              Select all
            </label>
            <SearchInput value={search} onChange={setSearch} placeholder="Search number…" className="w-56" />
          </div>
          <ul className="max-h-[60vh] divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800">
            {visible.map((p) => (
              <li key={p.id}>
                <label className={cn('flex items-center gap-3 px-5 py-2.5 text-sm', p.phoneNumber && !p.isMe ? 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/30' : 'opacity-60')}>
                  <input type="checkbox" className="h-4 w-4 accent-emerald-600" disabled={!p.phoneNumber || p.isMe} checked={!!p.phoneNumber && selected.has(p.phoneNumber)} onChange={() => p.phoneNumber && toggle(p.phoneNumber)} />
                  <span className="flex-1 tabular-nums">{p.phoneNumber ? formatPhone(p.phoneNumber) : <span className="flex items-center gap-1.5 text-zinc-400"><Lock className="h-3.5 w-3.5" />Hidden number</span>}</span>
                  {p.isMe && <Badge tone="blue">You</Badge>}
                  {p.isSuperAdmin ? <Badge tone="violet"><Crown className="h-3 w-3" />Owner</Badge> : p.isAdmin && <Badge tone="violet">Admin</Badge>}
                </label>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <SaveToListModal open={saving} onClose={() => setSaving(false)} numbers={chosen} groupName={group.name} />
    </div>
  );
}

export default function GroupsPage() {
  const { profiles } = useSession();
  const ready = profiles.filter((p) => p.ready);
  const [chosenClient, setClientId] = useState('');
  const clientId = ready.some((p) => p.id === chosenClient) ? chosenClient : ready[0]?.id || '';
  const [group, setGroup] = useState(null);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 150);

  const { data: groups, loading, error, refresh, refreshing } = useApi(clientId ? `/api/groups?action=list&clientId=${clientId}` : null, { select: (d) => d.groups });
  const visible = (groups || []).filter((g) => !debounced || g.name.toLowerCase().includes(debounced.toLowerCase()));

  return (
    <>
      <PageHeader title="Group extractor" description="Turn members of your WhatsApp groups into contact lists." />

      {!ready.length ? (
        <Card><EmptyState icon={Smartphone} title="Connect a WhatsApp profile first" description="Groups are read from a linked phone." action={<Link href="/whatsapp"><Button>Go to profiles</Button></Link>} /></Card>
      ) : group ? (
        <Participants clientId={clientId} group={group} onBack={() => setGroup(null)} />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)} className="sm:w-64">
              {ready.map((p) => <option key={p.id} value={p.id}>{p.name}{p.accountInfo?.number ? ` (+${p.accountInfo.number})` : ''}</option>)}
            </Select>
            <SearchInput value={search} onChange={setSearch} placeholder="Search groups…" className="flex-1" />
            <Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={refresh}>Refresh</Button>
          </div>
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-24" />)}</div>
          ) : error ? (
            <Card><EmptyState icon={UsersRound} title="Could not load groups" description={error.message} action={<Button variant="secondary" size="sm" onClick={refresh}>Try again</Button>} /></Card>
          ) : !visible.length ? (
            <Card><EmptyState icon={UsersRound} title={groups?.length ? 'No groups match' : 'This profile is not in any groups'} /></Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((g, i) => (
                <button key={g.groupId} type="button" onClick={() => setGroup(g)} className="card group flex animate-fade-up items-center gap-4 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-zinc-100 to-zinc-200 text-sm font-semibold text-zinc-600 dark:from-zinc-800 dark:to-zinc-700 dark:text-zinc-300">{g.name.slice(0, 2).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{g.name}</p>
                    <p className="text-xs text-zinc-500">{formatNumber(g.participantCount)} members</p>
                  </div>
                  {g.isAdmin && <Badge tone="violet">Admin</Badge>}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
