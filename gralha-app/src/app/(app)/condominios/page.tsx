'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Condo {
  id: number;
  legacy_id: number;
  nome: string;
  unidades: string;
  tipo: string;
}

export default function CondominiosPage() {
  const [rows, setRows] = useState<Condo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data } = await sb.from('ga_condominios').select('id, legacy_id, nome, unidades, tipo').order('legacy_id');
      setRows(data || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif text-[#1e3a5f]">Condomínios</h1>
      <p className="text-sm text-slate-600">23 condomínios — dados agora persistidos na nuvem (antes só no HTML).</p>
      {loading ? (
        <p className="text-slate-500">Carregando…</p>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="font-medium text-[#1e3a5f]">{c.nome}</div>
              <div className="text-xs text-slate-500 mt-1">{c.unidades} · {c.tipo}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
