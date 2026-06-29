'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface AuditRow {
  id: number;
  created_at: string;
  usuario_nome: string;
  usuario_login: string | null;
  modulo: string;
  acao: string;
  detalhe: string | null;
  registro_id: string | null;
  campo: string | null;
  valor_anterior: string | null;
  valor_novo: string | null;
}

function fmtTs(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function HistoricoPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data } = await sb
        .from('ga_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      setRows((data as AuditRow[]) || []);
      setLoading(false);
    })();
  }, []);

  const filtered = rows.filter((r) => {
    if (!filtro) return true;
    const q = filtro.toLowerCase();
    return (
      r.usuario_nome?.toLowerCase().includes(q) ||
      r.detalhe?.toLowerCase().includes(q) ||
      r.registro_id?.toLowerCase().includes(q) ||
      r.campo?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif text-[#1e3a5f]">Histórico de alterações</h1>
        <p className="text-sm text-slate-600 mt-1">
          Quem fez o quê e quando — login, edições de status, valores, etc.
        </p>
      </div>

      <input
        className="border rounded-lg px-3 py-2 w-full max-w-md text-sm"
        placeholder="Filtrar por usuário, chamado ou campo…"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
      />

      {loading ? (
        <p className="text-slate-500">Carregando…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase text-slate-600">
              <tr>
                <th className="p-3">Quando</th>
                <th className="p-3">Quem</th>
                <th className="p-3">Ação</th>
                <th className="p-3">Chamado</th>
                <th className="p-3">Campo</th>
                <th className="p-3">De → Para</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t hover:bg-slate-50">
                  <td className="p-3 whitespace-nowrap text-slate-500">{fmtTs(r.created_at)}</td>
                  <td className="p-3 font-medium">{r.usuario_nome}</td>
                  <td className="p-3">
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-200">{r.acao}</span>
                  </td>
                  <td className="p-3 font-mono text-xs">{r.registro_id || '—'}</td>
                  <td className="p-3">{r.campo || r.modulo}</td>
                  <td className="p-3 text-xs max-w-xs">
                    {r.valor_anterior != null && r.valor_novo != null ? (
                      <span>
                        <span className="text-red-600 line-through">{r.valor_anterior}</span>
                        {' → '}
                        <span className="text-emerald-700 font-medium">{r.valor_novo}</span>
                      </span>
                    ) : (
                      r.detalhe || '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <p className="p-8 text-center text-slate-500">Nenhum registro ainda. Após login e edições, aparece aqui.</p>
          )}
        </div>
      )}
    </div>
  );
}
