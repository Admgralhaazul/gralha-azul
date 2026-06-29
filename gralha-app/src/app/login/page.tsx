'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logLogin } from '@/lib/audit';

export default function LoginPage() {
  const router = useRouter();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr('');
    try {
      const sb = createClient();
      // Tenta Supabase Auth (email = usuario@gralha.local ou email real)
      const email = user.includes('@') ? user : `${user.toLowerCase()}@gralha.local`;
      const { error: authErr, data: authData } = await sb.auth.signInWithPassword({ email, password: pass });
      if (!authErr) {
        const nome = authData.user?.user_metadata?.nome || user;
        await logLogin(nome, user);
        router.push('/');
        router.refresh();
        return;
      }
      // Fallback: ga_usuarios (legado rescisões)
      const { data, error } = await sb.from('ga_usuarios').select('*').eq('login', user).maybeSingle();
      if (error || !data || data.senha !== pass) {
        setErr('Usuário ou senha inválidos.');
        return;
      }
      sessionStorage.setItem('ga_session', JSON.stringify({ nome: data.nome, login: data.login, role: data.role || 'user' }));
      await logLogin(data.nome, data.login);
      router.push('/');
    } catch {
      setErr('Erro de conexão. Verifique a nuvem.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 max-w-md flex flex-col justify-center px-12 py-16 bg-white">
        <h1 className="text-2xl font-serif text-[#1e3a5f]">Seja bem-vindo(a)</h1>
        <p className="text-sm text-slate-500 mt-2 mb-8">Gralha Azul · Gestão na nuvem</p>
        <form onSubmit={handleLogin} className="space-y-5">
          <label className="block text-xs uppercase tracking-widest text-slate-400">
            Usuário
            <input className="mt-2 w-full border-0 border-b border-slate-200 py-2 outline-none focus:border-[#1e3a5f] bg-transparent" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" />
          </label>
          <label className="block text-xs uppercase tracking-widest text-slate-400">
            Senha
            <input type="password" className="mt-2 w-full border-0 border-b border-slate-200 py-2 outline-none focus:border-[#1e3a5f] bg-transparent" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
          </label>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button type="submit" disabled={loading} className="w-full py-3 bg-[#1e3a5f] text-white text-xs uppercase tracking-widest font-semibold rounded hover:bg-[#2a5298] disabled:opacity-50">
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
      <div className="hidden md:flex flex-1 bg-[#2b3747] items-center justify-center text-white/80 text-sm">
        Sistema web profissional · acesso de qualquer lugar
      </div>
    </div>
  );
}
