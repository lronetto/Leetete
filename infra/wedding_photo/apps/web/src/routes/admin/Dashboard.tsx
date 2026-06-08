import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type {
  AdminStats,
  AdminUpload,
  AdminUploadsResponse,
} from '@leetete/shared';

interface AdminEvent {
  coupleNames: string;
  eventDate: string | null;
  coverKey: string | null;
  coverUrl: string | null;
  galleryVisibility: 'public' | 'private';
  moderation: 'pre' | 'post';
  maxFileMb: number;
  allowVideo: boolean;
  maxVideoSeconds: number;
  welcomeMessage: string | null;
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';
type KindFilter = 'all' | 'photo' | 'video';

const MB = 1024 * 1024;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < MB) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * MB) return `${(n / MB).toFixed(1)} MB`;
  return `${(n / (1024 * MB)).toFixed(2)} GB`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [event, setEvent] = useState<AdminEvent | null>(null);
  const [uploads, setUploads] = useState<AdminUpload[]>([]);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 350);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [eventDirty, setEventDirty] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<AdminUpload | null>(null);

  useEffect(() => {
    fetch('/api/admin/me', { credentials: 'include' })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) {
          navigate('/admin/login', { replace: true });
          return null;
        }
        return r.json() as Promise<{ email: string }>;
      })
      .then((d) => d && setEmail(d.email))
      .catch(() => navigate('/admin/login', { replace: true }));
  }, [navigate]);

  useEffect(() => {
    if (!email) return;
    refreshStats();
    refreshEvent();
  }, [email]);

  async function refreshStats() {
    const r = await fetch('/api/admin/stats', { credentials: 'include' });
    if (r.ok) setStats((await r.json()) as AdminStats);
  }

  async function refreshEvent() {
    const r = await fetch('/api/admin/event', { credentials: 'include' });
    if (r.ok) setEvent((await r.json()) as AdminEvent);
  }

  async function loadUploads(reset: boolean) {
    if (!email || loading) return;
    setLoading(true);
    try {
      const url = new URL('/api/admin/uploads', window.location.origin);
      if (status !== 'all') url.searchParams.set('status', status);
      if (kind !== 'all') url.searchParams.set('kind', kind);
      if (debouncedSearch.trim()) url.searchParams.set('q', debouncedSearch.trim());
      if (!reset && cursor) url.searchParams.set('cursor', cursor);
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) return;
      const data = (await r.json()) as AdminUploadsResponse;
      setUploads((prev) => (reset ? data.items : [...prev, ...data.items]));
      setCursor(data.nextCursor);
      setDone(!data.nextCursor);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!email) return;
    setUploads([]);
    setCursor(null);
    setDone(false);
    setSelected(new Set());
    loadUploads(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, status, kind, debouncedSearch]);

  async function approve(id: string) {
    await fetch(`/api/admin/uploads/${id}/approve`, {
      method: 'POST',
      credentials: 'include',
    });
    setUploads((u) =>
      u.map((x) =>
        x.id === id ? { ...x, status: 'approved', approvedAt: Date.now() } : x,
      ),
    );
    refreshStats();
  }

  async function reject(id: string) {
    await fetch(`/api/admin/uploads/${id}/reject`, {
      method: 'POST',
      credentials: 'include',
    });
    setUploads((u) =>
      u.map((x) => (x.id === id ? { ...x, status: 'rejected', approvedAt: null } : x)),
    );
    refreshStats();
  }

  async function remove(id: string) {
    if (!confirm('Apagar essa foto/vídeo? Não dá pra desfazer.')) return;
    await fetch(`/api/admin/uploads/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    setUploads((u) => u.filter((x) => x.id !== id));
    setSelected((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    refreshStats();
    refreshEvent();
  }

  async function setCover(item: AdminUpload) {
    await fetch(`/api/admin/uploads/${item.id}/cover`, {
      method: 'POST',
      credentials: 'include',
    });
    setUploads((u) => u.map((x) => ({ ...x, isCover: x.id === item.id })));
    refreshEvent();
  }

  async function clearCover() {
    await fetch('/api/admin/event/cover', {
      method: 'DELETE',
      credentials: 'include',
    });
    setUploads((u) => u.map((x) => ({ ...x, isCover: false })));
    refreshEvent();
  }

  async function bulk(action: 'approve' | 'reject' | 'delete') {
    if (selected.size === 0) return;
    if (action === 'delete' && !confirm(`Apagar ${selected.size} arquivos? Não dá pra desfazer.`))
      return;
    const ids = Array.from(selected);
    await fetch('/api/admin/uploads/bulk', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, ids }),
    });
    if (action === 'delete') {
      setUploads((u) => u.filter((x) => !selected.has(x.id)));
    } else {
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      setUploads((u) =>
        u.map((x) => (selected.has(x.id) ? { ...x, status: newStatus } : x)),
      );
    }
    setSelected(new Set());
    refreshStats();
    refreshEvent();
  }

  async function saveEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!event) return;
    setSavingEvent(true);
    try {
      const body = {
        coupleNames: event.coupleNames,
        eventDate: event.eventDate,
        galleryVisibility: event.galleryVisibility,
        moderation: event.moderation,
        maxFileMb: event.maxFileMb,
        allowVideo: event.allowVideo,
        maxVideoSeconds: event.maxVideoSeconds,
        welcomeMessage: event.welcomeMessage,
      };
      await fetch('/api/admin/event', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      setEventDirty(false);
    } finally {
      setSavingEvent(false);
    }
  }

  function patchEvent(patch: Partial<AdminEvent>) {
    setEvent((prev) => (prev ? { ...prev, ...patch } : prev));
    setEventDirty(true);
  }

  async function saveEdit(authorName: string, message: string) {
    if (!editing) return;
    await fetch(`/api/admin/uploads/${editing.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        authorName: authorName.trim() || null,
        message: message.trim() || null,
      }),
    });
    setUploads((u) =>
      u.map((x) =>
        x.id === editing.id
          ? {
              ...x,
              authorName: authorName.trim() || null,
              message: message.trim() || null,
            }
          : x,
      ),
    );
    setEditing(null);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllOnPage() {
    setSelected(new Set(uploads.map((u) => u.id)));
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
    navigate('/admin/login', { replace: true });
  }

  const allOnPageSelected = useMemo(
    () => uploads.length > 0 && uploads.every((u) => selected.has(u.id)),
    [uploads, selected],
  );

  if (!email) {
    return (
      <main className="min-h-full flex items-center justify-center p-6 text-stone-500">
        Carregando…
      </main>
    );
  }

  return (
    <main className="min-h-full max-w-5xl mx-auto px-4 py-8">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl text-stone-800">Painel dos noivos</h1>
          <p className="text-xs text-stone-500 mt-1">Logado como {email}</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="text-sm text-stone-500 hover:text-stone-700 underline"
        >
          Sair
        </button>
      </header>

      {stats && (
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard label="Aprovadas" value={stats.approved} />
          <StatCard
            label="Pendentes"
            value={stats.pending}
            highlight={stats.pending > 0}
          />
          <StatCard label="Fotos / Vídeos" value={`${stats.photos} / ${stats.videos}`} />
          <StatCard label="Storage" value={formatBytes(stats.totalBytes)} />
        </section>
      )}

      {event && (
        <section className="bg-white rounded-lg border border-stone-200 p-5 mb-8">
          <h2 className="font-display text-xl text-stone-800 mb-4">Configuração</h2>
          {event.coverUrl && (
            <div className="mb-4 flex items-center gap-3">
              <img
                src={event.coverUrl}
                alt="capa"
                className="w-24 h-24 object-cover rounded border border-stone-200"
              />
              <div className="text-sm">
                <p className="text-stone-700">Foto de capa definida.</p>
                <button
                  type="button"
                  onClick={clearCover}
                  className="text-xs text-rose-600 hover:underline"
                >
                  Remover capa
                </button>
              </div>
            </div>
          )}
          <form onSubmit={saveEvent} className="space-y-4">
            <Field label="Nome do casal">
              <input
                type="text"
                value={event.coupleNames}
                onChange={(e) => patchEvent({ coupleNames: e.target.value })}
                className="w-full rounded border border-stone-300 px-3 py-2"
              />
            </Field>
            <Field label="Data do evento (texto livre)">
              <input
                type="text"
                placeholder="ex: 07 de junho de 2026"
                value={event.eventDate ?? ''}
                onChange={(e) =>
                  patchEvent({ eventDate: e.target.value.trim() || null })
                }
                className="w-full rounded border border-stone-300 px-3 py-2"
              />
            </Field>
            <Field label="Mensagem de boas-vindas (na home)">
              <textarea
                value={event.welcomeMessage ?? ''}
                onChange={(e) =>
                  patchEvent({ welcomeMessage: e.target.value || null })
                }
                rows={2}
                className="w-full rounded border border-stone-300 px-3 py-2"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Galeria">
                <select
                  value={event.galleryVisibility}
                  onChange={(e) =>
                    patchEvent({
                      galleryVisibility: e.target.value as 'public' | 'private',
                    })
                  }
                  className="w-full rounded border border-stone-300 px-3 py-2"
                >
                  <option value="public">Pública</option>
                  <option value="private">Privada (só vocês)</option>
                </select>
              </Field>
              <Field label="Moderação">
                <select
                  value={event.moderation}
                  onChange={(e) =>
                    patchEvent({ moderation: e.target.value as 'pre' | 'post' })
                  }
                  className="w-full rounded border border-stone-300 px-3 py-2"
                >
                  <option value="post">Liberar tudo (moderar depois)</option>
                  <option value="pre">Aprovar antes de aparecer</option>
                </select>
              </Field>
              <Field label="Tamanho máx. por arquivo (MB)">
                <input
                  type="number"
                  min={1}
                  max={2000}
                  value={event.maxFileMb}
                  onChange={(e) => patchEvent({ maxFileMb: Number(e.target.value) })}
                  className="w-full rounded border border-stone-300 px-3 py-2"
                />
              </Field>
              <Field label="Duração máx. de vídeo (segundos)">
                <input
                  type="number"
                  min={1}
                  max={3600}
                  value={event.maxVideoSeconds}
                  onChange={(e) =>
                    patchEvent({ maxVideoSeconds: Number(e.target.value) })
                  }
                  className="w-full rounded border border-stone-300 px-3 py-2"
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={event.allowVideo}
                onChange={(e) => patchEvent({ allowVideo: e.target.checked })}
              />
              Permitir vídeos
            </label>
            <button
              type="submit"
              disabled={!eventDirty || savingEvent}
              className="bg-stone-800 text-cream rounded-full py-2 px-6 disabled:bg-stone-400 hover:bg-stone-700 transition"
            >
              {savingEvent ? 'Salvando…' : eventDirty ? 'Salvar' : 'Salvo'}
            </button>
          </form>
        </section>
      )}

      <section className="bg-white rounded-lg border border-stone-200 p-5">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <h2 className="font-display text-xl text-stone-800 mr-auto">Uploads</h2>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar autor ou mensagem"
            className="text-sm rounded border border-stone-300 px-2 py-1 w-full sm:w-64"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="text-sm rounded border border-stone-300 px-2 py-1"
          >
            <option value="all">Todos status</option>
            <option value="pending">Pendentes</option>
            <option value="approved">Aprovados</option>
            <option value="rejected">Rejeitados</option>
          </select>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as KindFilter)}
            className="text-sm rounded border border-stone-300 px-2 py-1"
          >
            <option value="all">Foto+Vídeo</option>
            <option value="photo">Só fotos</option>
            <option value="video">Só vídeos</option>
          </select>
        </div>

        {selected.size > 0 && (
          <div className="bg-stone-100 border border-stone-200 rounded p-2 mb-3 flex items-center gap-2 text-sm">
            <span className="text-stone-700">
              {selected.size} selecionad{selected.size === 1 ? 'o' : 'os'}
            </span>
            <button
              type="button"
              onClick={() => bulk('approve')}
              className="bg-emerald-600 text-white rounded py-1 px-3 text-xs hover:bg-emerald-700"
            >
              Aprovar
            </button>
            <button
              type="button"
              onClick={() => bulk('reject')}
              className="bg-amber-600 text-white rounded py-1 px-3 text-xs hover:bg-amber-700"
            >
              Rejeitar
            </button>
            <button
              type="button"
              onClick={() => bulk('delete')}
              className="bg-stone-800 text-white rounded py-1 px-3 text-xs hover:bg-stone-900"
            >
              Apagar
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="ml-auto text-stone-500 text-xs hover:underline"
            >
              Limpar seleção
            </button>
          </div>
        )}

        {uploads.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-stone-600 mb-2">
            <input
              type="checkbox"
              checked={allOnPageSelected}
              onChange={() => {
                if (allOnPageSelected) setSelected(new Set());
                else selectAllOnPage();
              }}
            />
            Selecionar todos desta página
          </label>
        )}

        {uploads.length === 0 && !loading && (
          <p className="text-stone-500 text-sm py-8 text-center">Nenhum upload.</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {uploads.map((u) => (
            <UploadCard
              key={u.id}
              upload={u}
              selected={selected.has(u.id)}
              onToggle={() => toggleSelect(u.id)}
              onApprove={() => approve(u.id)}
              onReject={() => reject(u.id)}
              onDelete={() => remove(u.id)}
              onEdit={() => setEditing(u)}
              onSetCover={() => setCover(u)}
            />
          ))}
        </div>

        {!done && (
          <div className="text-center mt-6">
            <button
              type="button"
              onClick={() => loadUploads(false)}
              disabled={loading}
              className="text-sm border border-stone-400 text-stone-700 rounded-full py-2 px-5 hover:bg-stone-50 disabled:opacity-50"
            >
              {loading ? 'Carregando…' : 'Carregar mais'}
            </button>
          </div>
        )}
      </section>

      <footer className="mt-10 text-xs text-stone-500 flex flex-wrap gap-4 justify-between">
        <Link to="/" className="hover:text-stone-700">
          ← Página pública
        </Link>
        <a
          href="/api/qrcode?format=pdf"
          target="_blank"
          rel="noreferrer"
          className="hover:text-stone-700"
        >
          Baixar QR Code (PDF A6)
        </a>
      </footer>

      {editing && (
        <EditModal
          upload={editing}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
        />
      )}
    </main>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        highlight ? 'border-rose-300 bg-rose-50' : 'border-stone-200 bg-white'
      }`}
    >
      <div className="text-xs text-stone-500">{label}</div>
      <div className="text-2xl font-display text-stone-800 mt-1">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-stone-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function UploadCard({
  upload,
  selected,
  onToggle,
  onApprove,
  onReject,
  onDelete,
  onEdit,
  onSetCover,
}: {
  upload: AdminUpload;
  selected: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onSetCover: () => void;
}) {
  const statusColor =
    upload.status === 'approved'
      ? 'bg-emerald-100 text-emerald-800'
      : upload.status === 'pending'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-rose-100 text-rose-800';

  return (
    <div
      className={`rounded-md border overflow-hidden bg-white ${
        selected ? 'border-stone-700 ring-2 ring-stone-700' : 'border-stone-200'
      }`}
    >
      <div className="aspect-square bg-stone-100 relative">
        {upload.isVideo ? (
          <>
            <video
              src={upload.url}
              preload="metadata"
              className="w-full h-full object-cover"
              muted
            />
            <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white text-2xl">
              ▶
            </span>
          </>
        ) : (
          <img
            src={upload.url}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
          />
        )}
        <label className="absolute top-2 right-2 bg-white/90 rounded p-1 cursor-pointer">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="cursor-pointer"
          />
        </label>
        <span
          className={`absolute top-2 left-2 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded ${statusColor}`}
        >
          {upload.status}
        </span>
        {upload.isCover && (
          <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-stone-800 text-cream">
            capa
          </span>
        )}
      </div>
      <div className="p-2 text-xs text-stone-700 space-y-1">
        <div className="flex justify-between text-stone-500">
          <span>{formatDate(upload.createdAt)}</span>
          <span>{formatBytes(upload.sizeBytes)}</span>
        </div>
        <div className="font-medium truncate">
          {upload.authorName || <span className="text-stone-400 italic">sem nome</span>}
        </div>
        {upload.message && (
          <p className="text-stone-600 line-clamp-2">{upload.message}</p>
        )}
        <div className="flex flex-wrap gap-1 pt-1">
          {upload.status !== 'approved' && (
            <button
              type="button"
              onClick={onApprove}
              className="text-[11px] bg-emerald-600 text-white rounded py-1 px-2 hover:bg-emerald-700"
            >
              Aprovar
            </button>
          )}
          {upload.status === 'approved' && (
            <button
              type="button"
              onClick={onReject}
              className="text-[11px] bg-amber-600 text-white rounded py-1 px-2 hover:bg-amber-700"
            >
              Ocultar
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="text-[11px] bg-stone-200 text-stone-800 rounded py-1 px-2 hover:bg-stone-300"
          >
            Editar
          </button>
          {!upload.isVideo && !upload.isCover && (
            <button
              type="button"
              onClick={onSetCover}
              className="text-[11px] bg-stone-200 text-stone-800 rounded py-1 px-2 hover:bg-stone-300"
            >
              Capa
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto text-[11px] bg-stone-700 text-white rounded py-1 px-2 hover:bg-stone-800"
          >
            Apagar
          </button>
        </div>
      </div>
    </div>
  );
}

function EditModal({
  upload,
  onClose,
  onSave,
}: {
  upload: AdminUpload;
  onClose: () => void;
  onSave: (authorName: string, message: string) => Promise<void>;
}) {
  const [authorName, setAuthorName] = useState(upload.authorName ?? '');
  const [message, setMessage] = useState(upload.message ?? '');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(authorName, message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg p-5 w-full max-w-md space-y-4"
      >
        <h3 className="font-display text-xl text-stone-800">Editar mensagem</h3>
        <div className="aspect-video bg-stone-100 rounded overflow-hidden">
          {upload.isVideo ? (
            <video
              src={upload.url}
              controls
              className="w-full h-full object-contain"
            />
          ) : (
            <img src={upload.url} alt="" className="w-full h-full object-contain" />
          )}
        </div>
        <label className="block">
          <span className="block text-xs font-medium text-stone-600 mb-1">Autor</span>
          <input
            type="text"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            maxLength={80}
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-stone-600 mb-1">Mensagem</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
            rows={4}
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-stone-400 text-stone-700 rounded-full py-2 hover:bg-stone-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-stone-800 text-cream rounded-full py-2 disabled:bg-stone-400 hover:bg-stone-700"
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}
