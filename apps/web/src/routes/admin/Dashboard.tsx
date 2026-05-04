import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type {
  AdminStats,
  AdminUpload,
  AdminUploadsResponse,
} from '@leetete/shared';

interface AdminEvent {
  coupleNames: string;
  eventDate: string | null;
  galleryVisibility: 'public' | 'private';
  moderation: 'pre' | 'post';
  maxFileMb: number;
  allowVideo: boolean;
  maxVideoSeconds: number;
  welcomeMessage: string | null;
}

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

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [event, setEvent] = useState<AdminEvent | null>(null);
  const [uploads, setUploads] = useState<AdminUpload[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>(
    'all',
  );
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [eventDirty, setEventDirty] = useState(false);

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
    fetch('/api/admin/stats', { credentials: 'include' })
      .then((r) => r.json() as Promise<AdminStats>)
      .then(setStats);
    fetch('/api/admin/event', { credentials: 'include' })
      .then((r) => r.json() as Promise<AdminEvent>)
      .then(setEvent);
  }, [email]);

  async function loadUploads(reset: boolean) {
    if (!email || loading) return;
    setLoading(true);
    try {
      const url = new URL('/api/admin/uploads', window.location.origin);
      if (filter !== 'all') url.searchParams.set('status', filter);
      if (!reset && cursor) url.searchParams.set('cursor', cursor);
      const r = await fetch(url, { credentials: 'include' });
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
    loadUploads(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, filter]);

  async function refreshStats() {
    const r = await fetch('/api/admin/stats', { credentials: 'include' });
    setStats((await r.json()) as AdminStats);
  }

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
    refreshStats();
  }

  async function saveEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!event) return;
    setSavingEvent(true);
    try {
      await fetch('/api/admin/event', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event),
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

  if (!email) {
    return (
      <main className="min-h-full flex items-center justify-center p-6 text-stone-500">
        Carregando…
      </main>
    );
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
    navigate('/admin/login', { replace: true });
  }

  return (
    <main className="min-h-full max-w-4xl mx-auto px-4 py-8">
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
          <StatCard label="Pendentes" value={stats.pending} highlight={stats.pending > 0} />
          <StatCard label="Fotos / Vídeos" value={`${stats.photos} / ${stats.videos}`} />
          <StatCard label="Storage" value={formatBytes(stats.totalBytes)} />
        </section>
      )}

      {event && (
        <section className="bg-white rounded-lg border border-stone-200 p-5 mb-8">
          <h2 className="font-display text-xl text-stone-800 mb-4">Configuração</h2>
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl text-stone-800">Uploads</h2>
          <select
            value={filter}
            onChange={(e) =>
              setFilter(e.target.value as 'all' | 'pending' | 'approved' | 'rejected')
            }
            className="text-sm rounded border border-stone-300 px-2 py-1"
          >
            <option value="all">Todos</option>
            <option value="pending">Pendentes</option>
            <option value="approved">Aprovados</option>
            <option value="rejected">Rejeitados</option>
          </select>
        </div>

        {uploads.length === 0 && !loading && (
          <p className="text-stone-500 text-sm py-8 text-center">Nenhum upload.</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {uploads.map((u) => (
            <UploadCard
              key={u.id}
              upload={u}
              onApprove={() => approve(u.id)}
              onReject={() => reject(u.id)}
              onDelete={() => remove(u.id)}
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
  onApprove,
  onReject,
  onDelete,
}: {
  upload: AdminUpload;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
}) {
  const statusColor =
    upload.status === 'approved'
      ? 'bg-emerald-100 text-emerald-800'
      : upload.status === 'pending'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-rose-100 text-rose-800';

  return (
    <div className="rounded-md border border-stone-200 overflow-hidden bg-white">
      <div className="aspect-square bg-stone-100 relative">
        {upload.isVideo ? (
          <>
            <video src={upload.url} preload="metadata" className="w-full h-full object-cover" muted />
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
        <span
          className={`absolute top-2 left-2 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded ${statusColor}`}
        >
          {upload.status}
        </span>
      </div>
      <div className="p-2 text-xs text-stone-700 space-y-1">
        <div className="flex justify-between text-stone-500">
          <span>{formatDate(upload.createdAt)}</span>
          <span>{formatBytes(upload.sizeBytes)}</span>
        </div>
        {upload.authorName && <div className="font-medium">{upload.authorName}</div>}
        {upload.message && (
          <p className="text-stone-600 line-clamp-2">{upload.message}</p>
        )}
        <div className="flex gap-1 pt-1">
          {upload.status !== 'approved' && (
            <button
              type="button"
              onClick={onApprove}
              className="flex-1 text-[11px] bg-emerald-600 text-white rounded py-1 hover:bg-emerald-700"
            >
              Aprovar
            </button>
          )}
          {upload.status === 'approved' && (
            <button
              type="button"
              onClick={onReject}
              className="flex-1 text-[11px] bg-amber-600 text-white rounded py-1 hover:bg-amber-700"
            >
              Ocultar
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="flex-1 text-[11px] bg-stone-700 text-white rounded py-1 hover:bg-stone-800"
          >
            Apagar
          </button>
        </div>
      </div>
    </div>
  );
}
