'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ManutTipo } from '@/lib/manut-rules';
import { MODULO_LABELS } from '@/lib/manut-rules';

const NAV: { href: string; label: string }[] = [
  { href: '/', label: 'Dashboard' },
  { href: '/manut/imob', label: 'Imobiliária' },
  { href: '/manut/cond', label: 'Condomínios' },
  { href: '/manut/ocup', label: 'Ocupados' },
  { href: '/manut/ager', label: 'Assistente' },
  { href: '/condominios', label: 'Condos (cadastro)' },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-56 shrink-0 border-r border-slate-200 bg-[#1e3a5f] text-white min-h-screen p-4">
      <div className="mb-8">
        <div className="text-lg font-serif tracking-tight">Gralha Azul</div>
        <div className="text-[10px] uppercase tracking-widest text-slate-300 mt-1">Gestão · Nuvem</div>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded px-3 py-2 text-sm transition ${active ? 'bg-white/15 font-medium' : 'hover:bg-white/10 text-slate-200'}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function SyncBadge({ status }: { status: 'ok' | 'loading' | 'error' }) {
  const map = {
    ok: { text: 'Sincronizado', cls: 'bg-emerald-100 text-emerald-800' },
    loading: { text: 'Salvando…', cls: 'bg-amber-100 text-amber-800' },
    error: { text: 'Sem conexão', cls: 'bg-red-100 text-red-800' },
  };
  const s = map[status];
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-full ${s.cls}`}>{s.text}</span>
  );
}

export function ManutModuleTitle({ tipo }: { tipo: ManutTipo }) {
  return <h1 className="text-xl font-serif text-[#1e3a5f]">{MODULO_LABELS[tipo]}</h1>;
}
