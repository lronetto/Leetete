import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GalleryItem, GalleryResponse } from '@leetete/shared';

export default function Gallery() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<GalleryItem | null>(null);

  async function loadMore(reset = false) {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const url = new URL('/api/gallery', window.location.origin);
      if (!reset && cursor) url.searchParams.set('cursor', cursor);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = (await res.json()) as GalleryResponse;
      setItems((prev) => (reset ? data.items : [...prev, ...data.items]));
      setCursor(data.nextCursor);
      if (!data.nextCursor) setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'erro');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-full px-4 py-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Link to="/" className="text-sm text-stone-500 hover:text-stone-700">
          ← Voltar
        </Link>
        <Link
          to="/enviar"
          className="text-sm bg-stone-800 text-cream rounded-full py-2 px-4 hover:bg-stone-700"
        >
          + Enviar
        </Link>
      </div>
      <h2 className="font-display text-3xl text-stone-800 mb-6">Galeria</h2>

      {items.length === 0 && !loading && !error && (
        <div className="text-center text-stone-600 py-16">
          Ainda sem fotos. Seja a primeira pessoa a compartilhar!
        </div>
      )}

      {error && (
        <div className="text-rose-700 bg-rose-50 border border-rose-200 rounded p-3 text-sm mb-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActive(item)}
            className="relative aspect-square overflow-hidden rounded-md bg-stone-200 group"
          >
            {item.isVideo ? (
              <>
                <video
                  src={item.url}
                  preload="metadata"
                  muted
                  className="w-full h-full object-cover"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white text-2xl">
                  ▶
                </span>
              </>
            ) : (
              <img
                src={item.url}
                alt={item.message ?? ''}
                loading="lazy"
                className="w-full h-full object-cover transition group-hover:scale-105"
              />
            )}
          </button>
        ))}
      </div>

      {!done && (
        <div className="text-center mt-8">
          <button
            type="button"
            onClick={() => loadMore(false)}
            disabled={loading}
            className="border border-stone-400 text-stone-700 rounded-full py-2 px-6 disabled:opacity-50 hover:bg-white/40"
          >
            {loading ? 'Carregando…' : 'Carregar mais'}
          </button>
        </div>
      )}

      {active && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex flex-col"
          onClick={() => setActive(null)}
        >
          <button
            type="button"
            className="self-end m-4 text-white text-2xl leading-none"
            onClick={() => setActive(null)}
            aria-label="Fechar"
          >
            ×
          </button>
          <div
            className="flex-1 flex items-center justify-center px-4"
            onClick={(e) => e.stopPropagation()}
          >
            {active.isVideo ? (
              <video
                src={active.url}
                controls
                autoPlay
                className="max-h-full max-w-full rounded"
              />
            ) : (
              <img
                src={active.url}
                alt={active.message ?? ''}
                className="max-h-full max-w-full rounded object-contain"
              />
            )}
          </div>
          {(active.authorName || active.message) && (
            <div
              className="bg-black/60 text-cream px-6 py-4 text-sm"
              onClick={(e) => e.stopPropagation()}
            >
              {active.authorName && (
                <p className="font-medium">{active.authorName}</p>
              )}
              {active.message && <p className="text-stone-200 mt-1">{active.message}</p>}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
