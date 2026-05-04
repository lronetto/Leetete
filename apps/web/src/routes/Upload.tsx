import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { uploadFile } from '../lib/upload.js';

interface EventInfo {
  coupleNames: string;
  allowVideo: boolean;
  maxFileMb: number;
  maxVideoSeconds: number;
}

type Status = 'idle' | 'preparing' | 'uploading' | 'success' | 'error';

const MB = 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < MB) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

export default function Upload() {
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [authorName, setAuthorName] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState({ index: 0, loaded: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch('/api/event')
      .then((r) => (r.ok ? (r.json() as Promise<EventInfo>) : null))
      .then(setEvent)
      .catch(() => setEvent(null));
  }, []);

  function reset() {
    setFiles([]);
    setStatus('idle');
    setProgress({ index: 0, loaded: 0, total: 0 });
    setError(null);
    setSuccessCount(0);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length || status === 'uploading') return;

    const ac = new AbortController();
    abortRef.current = ac;
    setStatus('uploading');
    setError(null);
    setSuccessCount(0);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        setProgress({ index: i, loaded: 0, total: file.size });
        await uploadFile(
          file,
          { authorName, message: i === 0 ? message : undefined },
          {
            signal: ac.signal,
            onProgress: (loaded, total) => setProgress({ index: i, loaded, total }),
          },
        );
        setSuccessCount((n) => n + 1);
      }
      setStatus('success');
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') {
        setStatus('idle');
        return;
      }
      console.error(err);
      setError(humanError(err));
      setStatus('error');
    } finally {
      abortRef.current = null;
    }
  }

  function cancelUpload() {
    abortRef.current?.abort();
  }

  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  const overLimit =
    event &&
    files.some(
      (f) =>
        f.size > event.maxFileMb * MB ||
        (f.type.startsWith('video/') && !event.allowVideo),
    );

  if (status === 'success') {
    return (
      <main className="min-h-full flex flex-col items-center justify-center px-6 py-12 text-center">
        <h2 className="font-display text-4xl text-stone-800 mb-3">Obrigado!</h2>
        <p className="max-w-md text-stone-700 mb-8">
          {successCount === 1
            ? 'Sua foto/vídeo foi enviado com sucesso.'
            : `${successCount} arquivos enviados com sucesso.`}
          {message ? ' Sua mensagem aos noivos foi guardada.' : ''}
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            type="button"
            onClick={reset}
            className="bg-stone-800 text-cream rounded-full py-3 px-6 hover:bg-stone-700 transition"
          >
            Enviar mais
          </button>
          <Link
            to="/galeria"
            className="border border-stone-400 text-stone-700 rounded-full py-3 px-6 hover:bg-white/40 transition"
          >
            Ver galeria
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full px-6 py-10 max-w-xl mx-auto">
      <Link to="/" className="text-sm text-stone-500 hover:text-stone-700">
        ← Voltar
      </Link>
      <h2 className="font-display text-3xl text-stone-800 mt-4 mb-2">Enviar fotos</h2>
      <p className="text-stone-600 mb-6 text-sm">
        Compartilhe momentos do casamento de {event?.coupleNames ?? 'Stefanie & Leandro'}.
        {event?.allowVideo
          ? ` Vídeos curtos (até ${Math.floor(event.maxVideoSeconds / 60)} min) também são bem-vindos.`
          : ' Apenas fotos por enquanto.'}
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Foto ou vídeo
          </label>
          <input
            ref={inputRef}
            type="file"
            accept={event?.allowVideo ? 'image/*,video/*' : 'image/*'}
            multiple
            disabled={status === 'uploading'}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="block w-full text-sm text-stone-700 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-medium file:bg-stone-200 file:text-stone-700 hover:file:bg-stone-300"
          />
          {files.length > 0 && (
            <p className="mt-2 text-xs text-stone-500">
              {files.length} arquivo{files.length > 1 ? 's' : ''} ({formatBytes(totalBytes)})
            </p>
          )}
          {overLimit && (
            <p className="mt-2 text-xs text-rose-700">
              Algum arquivo excede o limite ({event?.maxFileMb} MB) ou é um vídeo (não permitido).
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Seu nome <span className="font-normal text-stone-500">(opcional)</span>
          </label>
          <input
            type="text"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            disabled={status === 'uploading'}
            maxLength={80}
            placeholder="Como você quer aparecer na galeria"
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-800 focus:border-stone-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Mensagem aos noivos <span className="font-normal text-stone-500">(opcional)</span>
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={status === 'uploading'}
            maxLength={2000}
            rows={4}
            placeholder="Deixe um recadinho carinhoso"
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-800 focus:border-stone-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-stone-400 text-right">{message.length}/2000</p>
        </div>

        {status === 'uploading' && (
          <div className="rounded-lg bg-stone-100 p-4">
            <div className="flex justify-between text-xs text-stone-600 mb-1">
              <span>
                Enviando {progress.index + 1}/{files.length}
              </span>
              <span>
                {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
              </span>
            </div>
            <div className="h-2 bg-stone-300 rounded overflow-hidden">
              <div
                className="h-full bg-stone-700 transition-all"
                style={{
                  width: `${progress.total ? Math.min(100, (progress.loaded / progress.total) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-3">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          {status === 'uploading' ? (
            <button
              type="button"
              onClick={cancelUpload}
              className="flex-1 border border-stone-400 text-stone-700 rounded-full py-3 hover:bg-white/40"
            >
              Cancelar
            </button>
          ) : (
            <button
              type="submit"
              disabled={!files.length || Boolean(overLimit)}
              className="flex-1 bg-stone-800 text-cream rounded-full py-3 disabled:bg-stone-400 hover:bg-stone-700 transition"
            >
              {files.length > 1 ? `Enviar ${files.length} arquivos` : 'Enviar'}
            </button>
          )}
        </div>
      </form>
    </main>
  );
}

function humanError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('file_too_large')) return 'Arquivo grande demais.';
  if (msg.includes('video_not_allowed')) return 'Vídeos não são permitidos.';
  if (msg.includes('video_too_long')) return 'Vídeo muito longo.';
  if (msg.toLowerCase().includes('cors')) return 'Erro de CORS no R2 — me avisa.';
  if (msg.includes('network')) return 'Falha de rede. Tenta de novo.';
  return 'Erro ao enviar. Tenta de novo em alguns segundos.';
}
