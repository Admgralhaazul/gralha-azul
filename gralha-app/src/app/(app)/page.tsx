'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { computeGlobalTotals, MODULO_LABELS, rowFromDb, type ManutTipo } from '@/lib/manut-rules';
import { SyncBadge } from '@/components/layout';

const TIPOS: ManutTipo[] = ['imob', 'cond', 'ocup', 'ager'];

export default function DashboardPage() {
  const [counts, setCounts] = useState<Record<string, { total: number; andamento: number }>>({});
  const [sync, setSync] = useState<'ok' | 'loading' | 'error'>('loading');

  useEffect(() => {
    (async () => {
      setSync('loading');
      try {
        const sb = createClient();
        const next: Record<string, { total: number; andamento: number }> = {};
        for (const tipo of TIPOS) {
          const { data, error } = await sb.from('ga_manutencoes').select('*').eq('tipo', tipo);
          if (error) throw error;
          const rows = (data || []).map(rowFromDb);
          const g = computeGlobalTotals(rows);
          next[tipo] = { total: rows.length, andamento: g.andamento };
        }
        setCounts(next);
        setSync('ok');
      } catch {
        setSync('error');
      }
    })();
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif text-[#1e3a5f]">Dashboard</h1>
          <p className="text-sm text-slate-600 mt-1">Gestão Administrativa · dados centralizados na nuvem</p>
        </div>
        <SyncBadge status={sync} />
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        {TIPOS.map((tipo) => (
          <Link
            key={tipo}
            href={`/manut/${tipo}`}
            className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-[#1e3a5f]/30 transition"
          >
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">{MODULO_LABELS[tipo]}</div>
            <div className="text-3xl font-bold text-[#1e3a5f]">{counts[tipo]?.total ?? '—'}</div>
            <div className="text-sm text-amber-700 mt-2">{counts[tipo]?.andamento ?? '—'} em andamento</div>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <strong>Sistema profissional (v2)</strong> — cada manutenção é um registro no banco PostgreSQL (Supabase).
        Mesmas regras do gestao.html: pendentes sempre visíveis no filtro de mês; cards de concluídos/cancelados por mês de referência.
      </div>
    </div>
  );
}
