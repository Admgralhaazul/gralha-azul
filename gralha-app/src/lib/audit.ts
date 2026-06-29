import { createClient } from '@/lib/supabase/client';

export interface GaUser {
  nome: string;
  login: string;
  role?: string;
}

export function getCurrentUser(): GaUser {
  if (typeof window === 'undefined') return { nome: 'Sistema', login: 'sistema' };
  try {
    const sess = sessionStorage.getItem('ga_session');
    if (sess) return JSON.parse(sess) as GaUser;
  } catch { /* ignore */ }
  return { nome: 'Usuário', login: 'usuario' };
}

export function setCurrentUser(user: GaUser) {
  sessionStorage.setItem('ga_session', JSON.stringify(user));
}

export interface AuditEntry {
  modulo: string;
  acao: string;
  detalhe?: string;
  registro_id?: string;
  registro_tipo?: string;
  campo?: string;
  valor_anterior?: string;
  valor_novo?: string;
  org_id?: string;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  const user = getCurrentUser();
  const sb = createClient();
  try {
    await sb.from('ga_audit_log').insert({
      org_id: entry.org_id || null,
      modulo: entry.modulo,
      usuario_nome: user.nome,
      usuario_login: user.login,
      acao: entry.acao,
      detalhe: entry.detalhe || null,
      registro_id: entry.registro_id || null,
      registro_tipo: entry.registro_tipo || null,
      campo: entry.campo || null,
      valor_anterior: entry.valor_anterior ?? null,
      valor_novo: entry.valor_novo ?? null,
      dispositivo: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : null,
    });
  } catch (e) {
    console.warn('Audit log falhou:', e);
  }
}

/** Registra cada campo alterado — evita “briga” sobre quem mudou o quê */
export async function logManutChanges(
  manutId: string,
  tipo: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, string> = {},
) {
  const campos = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  for (const campo of campos) {
    const vAnt = before[campo];
    const vNov = after[campo];
    if (String(vAnt ?? '') === String(vNov ?? '')) continue;
    await logAudit({
      modulo: 'manutencao',
      acao: 'alterou',
      registro_id: manutId,
      registro_tipo: tipo,
      campo: labels[campo] || campo,
      valor_anterior: String(vAnt ?? '—'),
      valor_novo: String(vNov ?? '—'),
      detalhe: `${labels[campo] || campo}: "${vAnt ?? '—'}" → "${vNov ?? '—'}"`,
    });
  }
}

export async function logLogin(nome: string, login: string) {
  setCurrentUser({ nome, login });
  await logAudit({
    modulo: 'auth',
    acao: 'login',
    detalhe: `${nome} entrou no sistema`,
  });
}

export async function logLogout() {
  const user = getCurrentUser();
  await logAudit({
    modulo: 'auth',
    acao: 'logout',
    detalhe: `${user.nome} saiu do sistema`,
  });
  sessionStorage.removeItem('ga_session');
}
