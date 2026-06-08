import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

interface EventInfo {
  coupleNames: string;
  eventDate: string | null;
  welcomeMessage: string | null;
  coverUrl: string | null;
}

export default function Home() {
  const [event, setEvent] = useState<EventInfo | null>(null);

  useEffect(() => {
    api<EventInfo>('/event')
      .then(setEvent)
      .catch(() => setEvent(null));
  }, []);

  return (
    <main className="min-h-full flex flex-col items-center justify-center px-6 py-12 text-center">
      {event?.coverUrl && (
        <div className="w-full max-w-md mb-8 overflow-hidden rounded-xl shadow-sm">
          <img
            src={event.coverUrl}
            alt=""
            className="w-full aspect-[4/3] object-cover"
          />
        </div>
      )}
      <h1 className="font-display text-5xl text-stone-800 mb-3">
        {event?.coupleNames ?? 'Stefanie & Leandro'}
      </h1>
      {event?.eventDate ? (
        <p className="text-stone-600 mb-8">{event.eventDate}</p>
      ) : null}
      <p className="max-w-md text-stone-700 mb-10">
        {event?.welcomeMessage ??
          'Compartilhe suas fotos, vídeos e mensagens deste dia especial.'}
      </p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Link
          to="/enviar"
          className="bg-stone-800 text-cream rounded-full py-3 px-6 hover:bg-stone-700 transition"
        >
          Enviar fotos e mensagem
        </Link>
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
