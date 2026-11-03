'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  CalendarClock,
  Clock,
  FileText,
  Gauge,
  ImageIcon,
  MessageSquareText,
  Paperclip,
  Plus,
  Send,
  Shuffle,
  Smartphone,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { api } from '@/lib/clientApi';
import { countVariations, renderTemplate } from '@/lib/messageTemplate';
import { normalizePhone } from '@/lib/phone';
import { useApi } from '@/app/components/hooks';
import { useSession } from '@/app/components/AppShell';
import { Button, Drawer, Field, Input, ProfileStatusBadge, Select, Textarea, Toggle, cn, formatNumber } from '@/app/components/ui';

const MAX_MESSAGES = 4;
const MAX_FILE_MB = 10;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,audio/mpeg,audio/ogg,application/pdf,.docx,.xlsx,.pptx';

function todayISO(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyForm(defaultTz) {
  return {
    campaignName: '',
    contactList: '',
    selectedClients: [],
    messages: [{ key: 1, text: '', media: 'none', file: null, existing: null }],
    delayUnit: 'minutes',
    minDelay: 3,
    maxDelay: 8,
    dailyLimit: 0,
    windowEnabled: true,
    windowStart: '09:00',
    windowEnd: '21:00',
    timezone: defaultTz,
    scheduleEnabled: false,
    scheduleDate: todayISO(1),
    scheduleTime: '09:00',
  };
}

function fromCampaign(c) {
  const startAt = c.scheduledStartAt ? new Date(c.scheduledStartAt) : null;
  const tz = c.scheduling?.timezone || 'Asia/Kolkata';
  let scheduleDate = todayISO(1);
  let scheduleTime = '09:00';
  if (startAt) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(startAt).map((p) => [p.type, p.value]));
    scheduleDate = `${parts.year}-${parts.month}-${parts.day}`;
    scheduleTime = `${parts.hour}:${parts.minute}`;
  }
  const hasWindow = c.scheduling?.windowEnabled !== false && !!c.scheduling?.startTime && !!c.scheduling?.endTime;
  return {
    campaignName: c.campaignName,
    contactList: c.contactList?._id || c.contactList || '',
    selectedClients: c.selectedClients || [],
    messages: (c.messages || []).map((m, i) => ({
      key: i + 1,
      text: m.text || '',
      media: m.hasMedia ? 'keep' : 'none',
      mediaFrom: i,
      file: null,
      existing: m.hasMedia ? { name: m.mediaName, type: m.mediaType, id: m.mediaId } : null,
    })),
    delayUnit: c.delaySettings?.unit || 'minutes',
    minDelay: c.delaySettings?.minDelay ?? 5,
    maxDelay: c.delaySettings?.maxDelay ?? 25,
    dailyLimit: c.dailyLimit || 0,
    windowEnabled: hasWindow,
    windowStart: c.scheduling?.startTime || '09:00',
    windowEnd: c.scheduling?.endTime || '21:00',
    timezone: tz,
    scheduleEnabled: !!startAt && ['scheduled', 'draft', 'pending'].includes(c.status) && startAt > new Date(),
    scheduleDate,
    scheduleTime,
  };
}

function Section({ icon: Icon, title, description, children, step }) {
  return (
    <section className="animate-fade-up rounded-2xl border border-zinc-200/80 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50" style={{ animationDelay: `${step * 50}ms` }}>
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function MediaPreview({ message }) {
  const objectUrl = useMemo(
    () => (message.media === 'new' && message.file?.type?.startsWith('image/') ? URL.createObjectURL(message.file) : null),
    [message.media, message.file]
  );
  useEffect(() => () => objectUrl && URL.revokeObjectURL(objectUrl), [objectUrl]);
  const url = objectUrl || (message.media === 'keep' && message.existing?.id && message.existing.type?.startsWith('image/') ? `/api/media/${message.existing.id}` : null);
  const name = message.media === 'new' ? message.file?.name : message.existing?.name;
  if (message.media === 'none') return null;
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={name || 'attachment'} className="mb-1.5 max-h-48 w-full rounded-lg object-cover" />
  ) : (
    <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-black/5 px-2.5 py-2 text-xs dark:bg-white/10">
      <FileText className="h-4 w-4" />
      <span className="truncate">{name || 'Attachment'}</span>
    </div>
  );
}

function WhatsAppPreview({ message, seed }) {
  const text = useMemo(() => renderTemplate(message.text, { number: '919876543210' }), [message.text, seed]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!message.text && message.media === 'none') return null;
  return (
    <div className="rounded-xl bg-[#efeae2] p-3 dark:bg-[#0b141a]">
      <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] p-1.5 text-[13px] text-zinc-900 shadow-sm dark:bg-[#005c4b] dark:text-zinc-100">
        <MediaPreview message={message} />
        {text && <p className="whitespace-pre-wrap break-words px-1 pb-0.5">{text}</p>}
        <p className="px-1 text-right text-[10px] text-zinc-500 dark:text-zinc-300/70">12:00 ✓✓</p>
      </div>
    </div>
  );
}

function MessageEditor({ message, index, canRemove, onChange, onRemove, profiles }) {
  const fileRef = useRef(null);
  const [seed, setSeed] = useState(0);
  const [testOpen, setTestOpen] = useState(false);
  const [testNumber, setTestNumber] = useState('');
  const [testing, setTesting] = useState(false);
  const variations = countVariations(message.text);

  const pickFile = (file) => {
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) return toast.error(`Attachments must be under ${MAX_FILE_MB} MB`);
    onChange({ media: 'new', file });
  };

  const sendTest = async () => {
    const number = normalizePhone(testNumber);
    if (!number) return toast.error('Enter a valid test number');
    const body = new FormData();
    body.append('to', number);
    body.append('text', message.text);
    const clientId = profiles.find((p) => p.ready)?.id;
    if (clientId) body.append('clientId', clientId);
    if (message.media === 'new' && message.file) body.append('media', message.file);
    setTesting(true);
    try {
      const res = await api.post('/api/messages/send', body);
      toast.success(res.msg);
      setTestOpen(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 p-4 transition-colors focus-within:border-brand-300 dark:border-zinc-700/80 dark:focus-within:border-brand-500/40">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Variation {index + 1}</p>
        <div className="flex items-center gap-1">
          {variations > 1 && <span className="mr-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">{formatNumber(variations)} combos</span>}
          <Button variant="ghost" size="xs" icon={Send} onClick={() => setTestOpen((o) => !o)} disabled={!profiles.some((p) => p.ready)}>Test</Button>
          {canRemove && <Button variant="danger-ghost" size="icon-sm" icon={Trash2} onClick={onRemove} aria-label="Remove variation" />}
        </div>
      </div>

      {testOpen && (
        <div className="mb-3 flex animate-fade-in gap-2">
          <Input value={testNumber} onChange={(e) => setTestNumber(e.target.value)} placeholder="Your test number" className="h-9" />
          <Button size="sm" className="h-9" loading={testing} onClick={sendTest}>Send test</Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Textarea
            value={message.text}
            onChange={(e) => onChange({ text: e.target.value })}
            rows={6}
            maxLength={4096}
            placeholder={'{Hi|Hello} there! 👋\n\nWe have something special for you…'}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
            {message.media === 'none' ? (
              <Button variant="secondary" size="xs" icon={Paperclip} onClick={() => fileRef.current?.click()}>Attach</Button>
            ) : (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-zinc-100 py-1 pl-2 pr-1 text-xs dark:bg-zinc-800">
                {(message.file?.type || message.existing?.type || '').startsWith('image/') ? <ImageIcon className="h-3.5 w-3.5 text-zinc-500" /> : <FileText className="h-3.5 w-3.5 text-zinc-500" />}
                <span className="max-w-[160px] truncate">{message.file?.name || message.existing?.name || 'Attachment'}</span>
                <button type="button" onClick={() => onChange({ media: 'none', file: null })} className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700" aria-label="Remove attachment"><X className="h-3 w-3" /></button>
              </span>
            )}
            <button type="button" className="text-xs font-medium text-zinc-500 hover:text-brand-600" onClick={() => onChange({ text: `${message.text}{{number}}` })}>+ {'{{number}}'}</button>
            <span className="ml-auto text-[11px] tabular-nums text-zinc-400">{message.text.length}/4096</span>
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-500">Preview</span>
            {variations > 1 && <button type="button" onClick={() => setSeed((s) => s + 1)} className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-brand-600"><Shuffle className="h-3 w-3" />Shuffle</button>}
          </div>
          <WhatsAppPreview message={message} seed={seed} />
          {!message.text && message.media === 'none' && <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-zinc-200 text-xs text-zinc-400 dark:border-zinc-700">Start typing to preview</div>}
        </div>
      </div>
    </div>
  );
}

function estimate(form, total) {
  const unit = form.delayUnit === 'seconds' ? 1 : 60;
  const avg = ((Number(form.minDelay) || 0) + (Number(form.maxDelay) || 0)) / 2 * unit + 3;
  if (!total || !avg) return null;
  let windowSec = 86400;
  if (form.windowEnabled) {
    const [sh, sm] = form.windowStart.split(':').map(Number);
    const [eh, em] = form.windowEnd.split(':').map(Number);
    let mins = eh * 60 + em - (sh * 60 + sm);
    if (mins <= 0) mins += 1440;
    windowSec = mins * 60;
  }
  let perDay = Math.floor(windowSec / avg);
  if (form.dailyLimit > 0) perDay = Math.min(perDay, form.dailyLimit);
  if (perDay <= 0) return null;
  const days = total / perDay;
  return { perDay, label: days < 1 ? `about ${Math.max(1, Math.round((total * avg) / 3600))} hour(s)` : `about ${Math.ceil(days)} day(s)` };
}

export default function CampaignForm({ open, onClose, campaign, onSaved }) {
  const { profiles } = useSession();
  const editing = !!campaign;
  const defaultTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    } catch {
      return 'Asia/Kolkata';
    }
  }, []);
  const [form, setForm] = useState(() => emptyForm(defaultTz));
  const [saving, setSaving] = useState(null);
  const { data: lists, loading: listsLoading } = useApi(open ? '/api/contacts' : null, { select: (d) => d.lists });
  const timezones = useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return ['Asia/Kolkata', 'UTC'];
    }
  }, []);

  // Reset the form each time the drawer opens (derived state, no effect).
  const openKey = open ? campaign?.campaignId || 'new' : null;
  const [loadedKey, setLoadedKey] = useState(null);
  if (openKey !== loadedKey) {
    setLoadedKey(openKey);
    if (openKey) setForm(campaign ? fromCampaign(campaign) : { ...emptyForm(defaultTz), selectedClients: profiles.filter((p) => p.ready).map((p) => p.id) });
  }

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setMessage = (key, patch) => setForm((f) => ({ ...f, messages: f.messages.map((m) => (m.key === key ? { ...m, ...patch } : m)) }));
  const selectedList = lists?.find((l) => l._id === form.contactList);
  const eta = estimate(form, selectedList?.count);

  const validate = () => {
    if (!form.campaignName.trim()) return 'Give the campaign a name';
    if (!form.contactList) return 'Choose a contact list';
    if (!form.selectedClients.length) return 'Select at least one WhatsApp profile';
    if (form.messages.some((m) => !m.text.trim() && m.media === 'none')) return 'Every variation needs text or an attachment';
    if (Number(form.maxDelay) < Number(form.minDelay)) return 'Maximum delay must be at least the minimum delay';
    if (form.delayUnit === 'seconds' && Number(form.minDelay) < 10) return 'Minimum delay is 10 seconds';
    return null;
  };

  const submit = async (asDraft = false) => {
    const problem = validate();
    if (problem) return toast.error(problem);
    const body = new FormData();
    body.append('campaignName', form.campaignName.trim());
    body.append('contactList', form.contactList);
    body.append('selectedClients', JSON.stringify(form.selectedClients));
    body.append('delayUnit', form.delayUnit);
    body.append('minDelay', String(form.minDelay));
    body.append('maxDelay', String(form.maxDelay));
    body.append('dailyLimit', String(form.dailyLimit || 0));
    body.append('windowEnabled', String(form.windowEnabled));
    body.append('windowStart', form.windowStart);
    body.append('windowEnd', form.windowEnd);
    body.append('timezone', form.timezone);
    if (form.scheduleEnabled) {
      body.append('scheduleDate', form.scheduleDate);
      body.append('scheduleTime', form.scheduleTime);
    }
    if (asDraft) body.append('saveAsDraft', 'true');
    body.append('messages', JSON.stringify(form.messages.map((m) => ({ text: m.text, media: m.media, mediaFrom: m.mediaFrom }))));
    form.messages.forEach((m, i) => m.media === 'new' && m.file && body.append(`media${i}`, m.file));

    setSaving(asDraft ? 'draft' : 'save');
    try {
      if (editing) {
        await api.put(`/api/campaigns?campaignId=${encodeURIComponent(campaign.campaignId)}`, body);
        toast.success('Campaign updated');
      } else {
        const res = await api.post('/api/campaigns', body);
        toast.success(res.status === 'scheduled' ? 'Campaign scheduled' : res.status === 'draft' ? 'Saved as draft' : 'Campaign launched 🚀');
      }
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-3xl"
      title={editing ? 'Edit campaign' : 'New campaign'}
      description={editing ? 'Changes apply to messages that have not been sent yet.' : 'Set up who to message, what to say and how fast to send.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {!editing && <Button variant="secondary" loading={saving === 'draft'} disabled={!!saving} onClick={() => submit(true)}>Save as draft</Button>}
          <Button icon={editing ? undefined : form.scheduleEnabled ? CalendarClock : Send} loading={saving === 'save'} disabled={!!saving} onClick={() => submit(false)}>
            {editing ? 'Save changes' : form.scheduleEnabled ? 'Schedule campaign' : 'Launch campaign'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Section step={0} icon={Users} title="Audience" description="Name the campaign and choose who receives it.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Campaign name" required>
              <Input value={form.campaignName} onChange={(e) => set({ campaignName: e.target.value })} maxLength={120} placeholder="Diwali offer 2026" />
            </Field>
            <Field label="Contact list" required hint={selectedList ? `${formatNumber(selectedList.count)} numbers${eta ? ` · finishes in ${eta.label}` : ''}` : undefined}>
              {listsLoading ? <div className="skeleton h-[42px] w-full" /> : (
                <Select value={form.contactList} onChange={(e) => set({ contactList: e.target.value })} disabled={editing && campaign.processedNumbers > 0}>
                  <option value="">Select a list…</option>
                  {(lists || []).map((l) => <option key={l._id} value={l._id}>{l.name} ({formatNumber(l.count)})</option>)}
                </Select>
              )}
            </Field>
          </div>
          {lists && !lists.length && <p className="mt-3 text-xs text-amber-600">You have no contact lists yet. Create one on the Contacts page first.</p>}
        </Section>

        <Section step={1} icon={Smartphone} title="Send from" description="Messages rotate randomly across the selected profiles.">
          <div className="grid gap-2 sm:grid-cols-2">
            {profiles.map((p) => {
              const checked = form.selectedClients.includes(p.id);
              return (
                <label key={p.id} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all', checked ? 'border-brand-500 bg-brand-50/50 shadow-glow dark:bg-brand-500/5' : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700')}>
                  <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={checked} onChange={(e) => set({ selectedClients: e.target.checked ? [...form.selectedClients, p.id] : form.selectedClients.filter((id) => id !== p.id) })} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="truncate text-xs text-zinc-500">{p.accountInfo?.number ? `+${p.accountInfo.number}` : 'Not linked'}</p>
                  </div>
                  <ProfileStatusBadge profile={p} />
                </label>
              );
            })}
          </div>
          {form.selectedClients.length > 0 && !form.selectedClients.some((id) => profiles.find((p) => p.id === id)?.ready) && (
            <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">None of the selected profiles are connected. The campaign will wait until one comes online.</p>
          )}
        </Section>

        <Section step={2} icon={MessageSquareText} title="Messages" description="Add up to 4 variations. Each recipient gets one at random, which looks more natural to WhatsApp.">
          <div className="space-y-3">
            {form.messages.map((m, i) => (
              <MessageEditor key={m.key} message={m} index={i} profiles={profiles} canRemove={form.messages.length > 1} onChange={(patch) => setMessage(m.key, patch)} onRemove={() => set({ messages: form.messages.filter((x) => x.key !== m.key) })} />
            ))}
          </div>
          {form.messages.length < MAX_MESSAGES && (
            <Button variant="secondary" size="sm" icon={Plus} className="mt-3" onClick={() => set({ messages: [...form.messages, { key: Date.now(), text: '', media: 'none', file: null, existing: null }] })}>
              Add variation
            </Button>
          )}
          <p className="mt-3 text-xs text-zinc-500">Tip: <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">{'{Hi|Hello|Hey}'}</code> picks a random word per recipient; <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">{'{{number}}'}</code> inserts their number.</p>
        </Section>

        <Section step={3} icon={Gauge} title="Pacing" description="Slower, randomised sending protects your numbers from being flagged.">
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Unit">
              <Select value={form.delayUnit} onChange={(e) => set({ delayUnit: e.target.value, ...(e.target.value === 'seconds' ? { minDelay: 45, maxDelay: 120 } : { minDelay: 3, maxDelay: 8 }) })}>
                <option value="minutes">Minutes</option>
                <option value="seconds">Seconds</option>
              </Select>
            </Field>
            <Field label="Min delay">
              <Input type="number" min={form.delayUnit === 'seconds' ? 10 : 1} value={form.minDelay} onChange={(e) => set({ minDelay: e.target.value })} />
            </Field>
            <Field label="Max delay">
              <Input type="number" min={form.minDelay} value={form.maxDelay} onChange={(e) => set({ maxDelay: e.target.value })} />
            </Field>
            <Field label="Daily limit" hint="0 = unlimited">
              <Input type="number" min={0} value={form.dailyLimit} onChange={(e) => set({ dailyLimit: Math.max(0, Number(e.target.value) || 0) })} />
            </Field>
          </div>
          {eta && <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">≈ {formatNumber(eta.perDay)} messages per day · estimated to finish in {eta.label}.</p>}
        </Section>

        <Section step={4} icon={Clock} title="Schedule" description="When to start and which hours of the day messages may go out.">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/40">
              <div>
                <p className="text-sm font-medium">Start later</p>
                <p className="text-xs text-zinc-500">Otherwise the campaign starts as soon as you launch it.</p>
              </div>
              <Toggle checked={form.scheduleEnabled} onChange={(v) => set({ scheduleEnabled: v })} label="Start later" />
            </div>
            {form.scheduleEnabled && (
              <div className="grid animate-fade-in gap-4 sm:grid-cols-2">
                <Field label="Start date"><Input type="date" min={todayISO()} value={form.scheduleDate} onChange={(e) => set({ scheduleDate: e.target.value })} /></Field>
                <Field label="Start time"><Input type="time" value={form.scheduleTime} onChange={(e) => set({ scheduleTime: e.target.value })} /></Field>
              </div>
            )}

            <div className="flex items-center justify-between gap-4 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/40">
              <div>
                <p className="text-sm font-medium">Sending hours</p>
                <p className="text-xs text-zinc-500">Pause outside these hours and resume automatically the next day.</p>
              </div>
              <Toggle checked={form.windowEnabled} onChange={(v) => set({ windowEnabled: v })} label="Sending hours" />
            </div>
            {form.windowEnabled && (
              <div className="grid animate-fade-in gap-4 sm:grid-cols-2">
                <Field label="From"><Input type="time" value={form.windowStart} onChange={(e) => set({ windowStart: e.target.value })} /></Field>
                <Field label="Until"><Input type="time" value={form.windowEnd} onChange={(e) => set({ windowEnd: e.target.value })} /></Field>
              </div>
            )}

            <Field label="Time zone">
              <Select value={form.timezone} onChange={(e) => set({ timezone: e.target.value })}>
                {(timezones.includes(form.timezone) ? timezones : [form.timezone, ...timezones]).map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
              </Select>
            </Field>
          </div>
        </Section>
      </div>
    </Drawer>
  );
}
