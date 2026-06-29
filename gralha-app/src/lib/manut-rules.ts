/**
 * Regras de negócio portadas fielmente de gestao.html
 * Fonte: normManutStatus, manutDateRef, manutInMes, updateManutStats
 */

export type ManutTipo = 'imob' | 'cond' | 'ocup' | 'ager' | 'proc';
export type ManutStatusNorm = 'Em andamento' | 'Concluído' | 'Cancelado';

export interface Manutencao {
  id: string;
  tipo: ManutTipo;
  status: string;
  dtSol?: string | null;
  dtPrev?: string | null;
  dtConc?: string | null;
  resp?: string | null;
  cond?: string | null;
  prest?: string | null;
  desc?: string | null;
  val?: number | null;
  mat?: number | null;
  recKenlo?: number | string | null;
  manutKenlo?: string | null;
  locDeb?: string | null;
  contas?: string | null;
  recibo?: string | null;
  obs?: string | null;
  _visita?: boolean;
  _fromChk?: boolean;
  _planilhaAberto?: boolean;
  condId?: number | null;
}

export const MANUT_MES_NOMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function normManutStatus(s?: string | null): ManutStatusNorm {
  const t = (s || '').trim();
  if (t === 'Aberto' || t === 'Atrasado' || t === 'Andamento') return 'Em andamento';
  if (t === 'Concluido') return 'Concluído';
  if (t === 'Concluído' || t === 'Cancelado') return t as ManutStatusNorm;
  return (t || 'Em andamento') as ManutStatusNorm;
}

export function manutDateRef(m: Manutencao): string {
  const st = normManutStatus(m.status);
  if (st === 'Concluído') return m.dtConc || m.dtSol || '';
  if (st === 'Cancelado') return m.dtConc || m.dtPrev || m.dtSol || '';
  return m.dtSol || '';
}

export function manutInMesStrict(m: Manutencao, ano: string, mes: string): boolean {
  if (!ano && !mes) return true;
  const dt = manutDateRef(m);
  if (ano && (!dt || !dt.startsWith(ano))) return false;
  if (mes && (!dt || dt.substring(5, 7) !== mes)) return false;
  return true;
}

/** Pendentes sempre passam filtro de mês (meses anteriores incluídos) */
export function manutInMes(m: Manutencao, ano: string, mes: string): boolean {
  if (!ano && !mes) return true;
  if (normManutStatus(m.status) === 'Em andamento') return true;
  return manutInMesStrict(m, ano, mes);
}

export function formatManutMesRef(ano: string, mes: string): string {
  if (ano && mes) {
    const idx = parseInt(mes, 10) - 1;
    return `Mês de referência: ${MANUT_MES_NOMES[idx] || mes}/${ano} (pendentes de meses anteriores incluídos)`;
  }
  if (ano) return `Ano de referência: ${ano}`;
  if (mes) {
    const idx = parseInt(mes, 10) - 1;
    return `Mês de referência: ${MANUT_MES_NOMES[idx] || mes}`;
  }
  return '';
}

export interface ManutStats {
  andamento: number;
  concluido: number;
  cancelado: number;
  total: number;
}

/** Cards: andamento = todos pendentes; concl/canc = filtro estrito do mês */
export function computeManutStats(
  rows: Manutencao[],
  ano: string,
  mes: string,
): ManutStats {
  let andamento = 0;
  let concluido = 0;
  let cancelado = 0;
  for (const m of rows) {
    const st = normManutStatus(m.status);
    if (st === 'Em andamento') {
      andamento++;
      continue;
    }
    if ((ano || mes) && !manutInMesStrict(m, ano, mes)) continue;
    if (st === 'Concluído') concluido++;
    else if (st === 'Cancelado') cancelado++;
  }
  return { andamento, concluido, cancelado, total: rows.length };
}

export function computeGlobalTotals(rows: Manutencao[]) {
  let andamento = 0;
  let concluido = 0;
  let cancelado = 0;
  for (const m of rows) {
    const st = normManutStatus(m.status);
    if (st === 'Em andamento') andamento++;
    else if (st === 'Concluído') concluido++;
    else if (st === 'Cancelado') cancelado++;
  }
  return { andamento, concluido, cancelado };
}

export function isImminente(m: Manutencao, days = 14): boolean {
  if (normManutStatus(m.status) !== 'Em andamento' || !m.dtPrev) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dt = new Date(m.dtPrev);
  const diff = Math.ceil((dt.getTime() - hoje.getTime()) / 86400000);
  return diff <= days;
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const [y, mo, d] = iso.split('-');
  if (!y || !mo || !d) return iso;
  return `${d}/${mo}/${y}`;
}

export function fmtBRL(n?: number | string | null): string {
  const v = typeof n === 'string' ? parseFloat(n) : (n ?? 0);
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const MODULO_LABELS: Record<ManutTipo, string> = {
  imob: 'Executadas pela Imobiliária',
  cond: 'Condomínios',
  ocup: 'Imóveis Ocupados',
  ager: 'Manut. Assistente',
  proc: 'Processos Administrativos',
};

export function rowFromDb(r: Record<string, unknown>): Manutencao {
  return {
    id: String(r.id),
    tipo: r.tipo as ManutTipo,
    status: String(r.status_raw ?? r.status ?? 'Em andamento'),
    dtSol: r.dt_sol as string | null,
    dtPrev: r.dt_prev as string | null,
    dtConc: r.dt_conc as string | null,
    resp: r.resp as string | null,
    cond: r.cond as string | null,
    prest: r.prest as string | null,
    desc: r.descricao as string | null,
    val: Number(r.val ?? 0),
    mat: Number(r.mat ?? 0),
    recKenlo: r.rec_kenlo as string | number | null,
    manutKenlo: r.manut_kenlo as string | null,
    locDeb: r.loc_deb as string | null,
    contas: r.contas as string | null,
    recibo: r.recibo as string | null,
    obs: r.obs as string | null,
    _visita: Boolean(r.is_visita),
    _fromChk: Boolean(r.is_from_chk),
    _planilhaAberto: Boolean(r.is_planilha_aberto),
    condId: r.cond_id as number | null,
  };
}

export function rowToDb(orgId: string, m: Manutencao) {
  const val = Number(m.val ?? 0);
  const mat = Number(m.mat ?? 0);
  let rec = Number(m.recKenlo ?? 0);
  if (!rec && val > 0) rec = Math.max(0, val - mat);
  return {
    id: m.id,
    org_id: orgId,
    tipo: m.tipo,
    status_raw: m.status,
    dt_sol: m.dtSol || null,
    dt_prev: m.dtPrev || null,
    dt_conc: m.dtConc || null,
    resp: m.resp || null,
    cond: m.cond || null,
    prest: m.prest || null,
    descricao: m.desc || null,
    val,
    mat,
    rec_kenlo: rec,
    manut_kenlo: m.manutKenlo || null,
    loc_deb: m.locDeb || null,
    contas: m.contas || null,
    recibo: m.recibo || 'Não',
    obs: m.obs || null,
    cond_id: m.condId || null,
    is_visita: Boolean(m._visita),
    is_from_chk: Boolean(m._fromChk),
    is_planilha_aberto: Boolean(m._planilhaAberto),
    legacy_payload: m,
    updated_at: new Date().toISOString(),
  };
}
