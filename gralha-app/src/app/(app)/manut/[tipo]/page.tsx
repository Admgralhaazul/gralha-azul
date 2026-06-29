'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  computeGlobalTotals,
  computeManutStats,
  fmtBRL,
  fmtDate,
  formatManutMesRef,
  isImminente,
  manutInMes,
  normManutStatus,
  rowFromDb,
  type Manutencao,
  type ManutTipo,
} from '@/lib/manut-rules';
import { createClient } from '@/lib/supabase/client';
import { ManutModuleTitle, SyncBadge } from '@/components/layout';

function mesAtual() {
  const d = new Date();
  return {
    ano: String(d.getFullYear()),
    mes: String(d.getMonth() + 1).padStart(2, '0'),
  };
}

export default function ManutPage({ params }: { params: { tipo: ManutTipo } }) {
  const tipo = params.tipo;
  const [rows, setRows] = useState<Manutencao[]>([]);
  const [loading, setLoading] = useState(true);
  const [sync, setSync] = useState<'ok' | 'loading' | 'error'>('loading');
  const [q, setQ] = useState('');
  const [{ ano, mes }, setPeriod] = useState(mesAtual);

  const load = useCallback(async () => {
    setLoading(true);
    setSync('loading');
    try {
      const sb = createClient();
      const { data, error } = await sb
        .from('ga_manutencoes')
        .select('*')
        .eq('tipo', tipo)
        .order('dt_sol', { ascending: false })
        .limit(2000);
      if (error) throw error;
      setRows((data || []).map(rowFromDb));
      setSync('ok');
    } catch {
      setSync('error');
    } finally {
      setLoading(false);
    }
  }, [tipo]);

  useEffect(() => {
    load();
    const sb = createClient();
    const ch = sb
      .channel(`manut_${tipo}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ga_manutencoes', filter: `tipo=eq.${tipo}` }, () => load())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [tipo, load]);

  const stats = useMemo(() => computeManutStats(rows, ano, mes), [rows, ano, mes]);
  const global = useMemo(() => computeGlobalTotals(rows), [rows]);

  const filtered = useMemo(() => {
    return rows.filter((m) => {
      if (!manutInMes(m, ano, mes)) return false;
      if (!q) return true;
      const hay = `${m.desc || ''}${m.cond || ''}${m.prest || ''}${m.resp || ''}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [rows, ano, mes, q]);

  const showMat = tipo !== 'ocup';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <ManutModuleTitle tipo={tipo} />
        <SyncBadge status={sync} />
      </div>

      <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2">
        {formatManutMesRef(ano, mes)}
      </p>
      <p className="text-xs text-slate-500">
        Total geral: {global.concluido} concluídos · {global.andamento} em andamento · {global.cancelado} cancelados
      </p>

      <div className="grid grid-cols-3 gap-4 max-w-xl">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
          <div className="text-2xl font-bold text-amber-800">{stats.andamento}</div>
          <div className="text-xs uppercase tracking-wide text-amber-700">Em andamento</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-800">{stats.concluido}</div>
          <div className="text-xs uppercase tracking-wide text-emerald-700">Concluídos (mês)</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
          <div className="text-2xl font-bold text-slate-700">{stats.cancelado}</div>
          <div className="text-xs uppercase tracking-wide text-slate-600">Cancelados (mês)</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm">
          Ano
          <input className="block mt-1 border rounded px-2 py-1 w-24" value={ano} onChange={(e) => setPeriod({ ano: e.target.value, mes })} />
        </label>
        <label className="text-sm">
          Mês
          <input className="block mt-1 border rounded px-2 py-1 w-16" value={mes} onChange={(e) => setPeriod({ ano, mes: e.target.value.padStart(2, '0') })} />
        </label>
        <label className="text-sm flex-1 min-w-[200px]">
          Buscar
          <input className="block mt-1 border rounded px-2 py-1 w-full" placeholder="Contrato, descrição, prestador…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      {loading ? (
        <p className="text-slate-500">Carregando…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase text-slate-600">
              <tr>
                <th className="p-2">#</th>
                <th className="p-2">Status</th>
                <th className="p-2">Solic.</th>
                <th className="p-2">Prev./Conc.</th>
                <th className="p-2">Resp.</th>
                <th className="p-2">Contrato/Cond.</th>
                <th className="p-2">Prest.</th>
                <th className="p-2">Descrição</th>
                <th className="p-2">Valor</th>
                {showMat && <th className="p-2">Mat.</th>}
                <th className="p-2">Receita</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 300).map((m, i) => (
                <tr key={m.id} className={`border-t ${isImminente(m) ? 'bg-red-50 border-l-4 border-l-red-500' : ''}`}>
                  <td className="p-2 font-bold text-red-600">{i + 1}</td>
                  <td className="p-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200">{normManutStatus(m.status)}</span>
                  </td>
                  <td className="p-2 whitespace-nowrap">{fmtDate(m.dtSol)}</td>
                  <td className="p-2 whitespace-nowrap">{fmtDate(m.status === 'Concluído' ? m.dtConc : m.dtPrev)}</td>
                  <td className="p-2">{m.resp || '—'}</td>
                  <td className="p-2 max-w-[120px] truncate" title={m.cond || ''}>{m.cond || '—'}</td>
                  <td className="p-2">{m.prest || '—'}</td>
                  <td className="p-2 max-w-[180px] truncate" title={m.desc || ''}>{m.desc || '—'}</td>
                  <td className="p-2">{fmtBRL(m.val)}</td>
                  {showMat && <td className="p-2">{fmtBRL(m.mat)}</td>}
                  <td className="p-2 text-cyan-700 font-medium">{fmtBRL(m.recKenlo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 300 && (
            <p className="text-center text-xs text-slate-500 p-3 bg-slate-50">
              Mostrando 300 de {filtered.length} — refine a busca
            </p>
          )}
          {!filtered.length && <p className="p-8 text-center text-slate-500">Nenhum registro neste filtro.</p>}
        </div>
      )}
    </div>
  );
}
