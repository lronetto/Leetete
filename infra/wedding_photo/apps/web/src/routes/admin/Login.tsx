import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (r.status === 401) {
        setError('Email ou senha incorretos.');
        return;
      }
      if (!r.ok) {
        setError('Erro inesperado. Tenta de novo.');
        return;
      }
      navigate('/admin', { replace: true });
    } catch {
      setError('Falha de rede.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-full flex items-center justify-center px-6 py-12">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white border border-stone-200 rounded-lg p-6 space-y-4"
      >
        <h1 className="font-display text-2xl text-stone-800 text-center">
          Painel dos noivos
        </h1>
        <p className="text-sm text-stone-500 text-center -mt-2">
          Acesso restrito a Stefanie & Leandro.
        </p>

        <label className="block">
          <span className="block text-xs font-medium text-stone-600 mb-1">Email</span>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-stone-600 mb-1">Senha</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>

        {error && (
          <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="w-full bg-stone-800 text-cream rounded-full py-3 disabled:bg-stone-400 hover:bg-stone-700 transition"
        >
          {loading ? 'Entrando…' : 'Entrar'}
        </button>

        <Link
          to="/"
          className="block text-center text-xs text-stone-500 hover:text-stone-700"
        >
          ← Voltar pra página pública
        </Link>
      </form>
    </main>
  );
}
