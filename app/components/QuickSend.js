'use client';

import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Paperclip, Send, X } from 'lucide-react';
import { api } from '@/lib/clientApi';
import { normalizePhone } from '@/lib/phone';
import { useSession } from '@/app/components/AppShell';
import { Button, Field, Input, Modal, Select, Textarea } from '@/app/components/ui';

export default function QuickSend({ open, onClose, defaults = {} }) {
  const { profiles } = useSession();
  const ready = profiles.filter((p) => p.ready);
  const [to, setTo] = useState('');
  const [text, setText] = useState(defaults.text || '');
  const [clientId, setClientId] = useState('');
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef(null);
  const normalized = normalizePhone(to);

  const send = async () => {
    if (!normalized) return toast.error('Enter a valid phone number');
    if (!text.trim() && !file) return toast.error('Write a message or attach a file');
    const body = new FormData();
    body.append('to', normalized);
    body.append('text', text);
    if (clientId) body.append('clientId', clientId);
    if (file) body.append('media', file);
    setSending(true);
    try {
      const res = await api.post('/api/messages/send', body);
      toast.success(res.msg);
      setTo('');
      setFile(null);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Quick send"
      description="Send a one-off message from a connected profile."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={Send} loading={sending} onClick={send} disabled={!ready.length}>Send message</Button>
        </>
      }
    >
      <div className="space-y-4">
        {!ready.length && <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">No WhatsApp profile is connected. Connect one first.</p>}
        <Field label="Phone number" hint={to && (normalized ? `Will send to +${normalized}` : 'Not a valid number yet')}>
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="98765 43210 or +1 415 555 0100" inputMode="tel" />
        </Field>
        <Field label="Send from">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Any connected profile</option>
            {ready.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.accountInfo?.number ? ` (+${p.accountInfo.number})` : ''}</option>
            ))}
          </Select>
        </Field>
        <Field label="Message" hint="Supports spintax like {Hi|Hello}.">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={4096} placeholder="Type your message…" />
        </Field>
        <div>
          <input ref={fileRef} type="file" className="hidden" accept="image/*,video/mp4,audio/mpeg,application/pdf,.docx,.xlsx,.pptx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          {file ? (
            <div className="flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700">
              <span className="flex min-w-0 items-center gap-2"><Paperclip className="h-4 w-4 shrink-0 text-zinc-400" /><span className="truncate">{file.name}</span></span>
              <Button variant="ghost" size="icon-sm" icon={X} onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }} aria-label="Remove attachment" />
            </div>
          ) : (
            <Button variant="secondary" size="sm" icon={Paperclip} onClick={() => fileRef.current?.click()}>Attach file</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
