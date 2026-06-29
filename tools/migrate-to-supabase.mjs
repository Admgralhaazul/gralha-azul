/**
 * Migração fiel: seeds JSON + condominios de gestao.html → Supabase
 *
 * Uso:
 *   SUPABASE_SERVICE_ROLE_KEY=xxx node tools/migrate-to-supabase.mjs
 *   node tools/migrate-to-supabase.mjs --dry-run
 *   node tools/migrate-to-supabase.mjs --sql-only > supabase/seed-data.sql
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ORG_SLUG = 'gralha-azul';
const BATCH = 100;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://zirimotcujjxfgwpccda.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const dryRun = process.argv.includes('--dry-run');
const sqlOnly = process.argv.includes('--sql-only');

function loadJson(name) {
  const p = path.join(ROOT, name);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function extractCondominios() {
  const html = fs.readFileSync(path.join(ROOT, 'gestao.html'), 'utf8');
  const m = html.match(/const CONDOMINIOS = (\[[\s\S]*?\n\]);/);
  if (!m) throw new Error('CONDOMINIOS não encontrado em gestao.html');
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

function extractPrestadores() {
  const html = fs.readFileSync(path.join(ROOT, 'gestao.html'), 'utf8');
  const m = html.match(/const PRESTADORES_DEFAULT = (\[[\s\S]*?\n\]);/);
  if (!m) throw new Error('PRESTADORES_DEFAULT não encontrado');
  return eval(m[1]);
}

function mapManutRow(m, tipo, orgId) {
  const val = Number(m.val ?? 0);
  const mat = Number(m.mat ?? 0);
  let rec = parseFloat(m.recKenlo ?? 0) || 0;
  if (!rec && val > 0) rec = Math.max(0, val - mat);
  return {
    id: m.id,
    org_id: orgId,
    tipo,
    status_raw: m.status || 'Em andamento',
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
  };
}

function sqlEscape(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function main() {
  const imobSeed = loadJson('gestao-imob-seed.json');
  const condSeed = loadJson('gestao-cond-seed.json');
  const ocupSeed = loadJson('gestao-ocup-seed.json');
  const agerSeed = loadJson('gestao-ager-seed.json');
  const condominios = extractCondominios();
  const prestadores = extractPrestadores();

  const manutRows = [
    ...(imobSeed?.imob || []).map((m) => mapManutRow({ ...m, tipo: 'imob' }, 'imob', '__ORG__')),
    ...(condSeed?.cond || []).map((m) => mapManutRow({ ...m, tipo: 'cond' }, 'cond', '__ORG__')),
    ...(ocupSeed?.ocup || []).map((m) => mapManutRow({ ...m, tipo: 'ocup' }, 'ocup', '__ORG__')),
    ...(agerSeed?.ager || []).map((m) => mapManutRow({ ...m, tipo: 'ager' }, 'ager', '__ORG__')),
  ];

  const counts = {};
  manutRows.forEach((r) => {
    const k = `${r.tipo}:${r.status_raw}`;
    counts[k] = (counts[k] || 0) + 1;
  });

  console.log('=== Migração Gralha Azul ===');
  console.log('Condomínios:', condominios.length);
  console.log('Prestadores:', prestadores.length);
  console.log('Manutenções:', manutRows.length);
  console.log('Por tipo/status:', counts);

  if (sqlOnly) {
    console.log('-- SQL gerado (substituir __ORG_ID__ pelo uuid da org)');
    console.log(`insert into ga_organizations (slug, nome) values ('${ORG_SLUG}', 'Gralha Azul Imobiliária') on conflict (slug) do nothing;`);
    for (const c of condominios) {
      console.log(`insert into ga_condominios (org_id, legacy_id, nome, unidades, tipo, agua, gas, energia, vagas, prestadores, servicos, checklists, manut_chk) values (__ORG_ID__, ${c.id}, ${sqlEscape(c.nome)}, ${sqlEscape(c.unidades)}, ${sqlEscape(c.tipo)}, ${sqlEscape(c.agua)}, ${sqlEscape(c.gas)}, ${sqlEscape(c.energia)}, ${sqlEscape(c.vagas)}, ${sqlEscape(c.prestadores)}, ${sqlEscape(c.servicos || [])}, ${sqlEscape(c.checklists || [])}, '[]'::jsonb) on conflict (org_id, legacy_id) do update set nome=excluded.nome;`);
    }
    for (const p of prestadores) {
      console.log(`insert into ga_prestadores (id, org_id, nome, esp, tel, perc, rec_tipo) values (${sqlEscape(p.id)}, __ORG_ID__, ${sqlEscape(p.nome)}, ${sqlEscape(p.esp)}, ${sqlEscape(p.tel)}, ${p.perc}, ${sqlEscape(p.rec_tipo)}) on conflict (org_id, id) do update set nome=excluded.nome;`);
    }
    for (const m of manutRows) {
      const cols = Object.keys(m).filter((k) => k !== 'legacy_payload');
      const vals = cols.map((k) => (k === 'org_id' ? '__ORG_ID__' : sqlEscape(m[k])));
      console.log(`insert into ga_manutencoes (${cols.join(', ')}, legacy_payload) values (${vals.join(', ')}, ${sqlEscape(m.legacy_payload)}) on conflict (org_id, id) do update set status_raw=excluded.status_raw, updated_at=now();`);
    }
    return;
  }

  if (dryRun) {
    console.log('Dry-run — nada gravado.');
    return;
  }

  if (!SERVICE_KEY) {
    console.error('Defina SUPABASE_SERVICE_ROLE_KEY ou use --dry-run / --sql-only');
    process.exit(1);
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  let { data: org } = await sb.from('ga_organizations').select('id').eq('slug', ORG_SLUG).maybeSingle();
  if (!org) {
    const { data: created, error } = await sb.from('ga_organizations').insert({ slug: ORG_SLUG, nome: 'Gralha Azul Imobiliária' }).select('id').single();
    if (error) throw error;
    org = created;
  }
  const orgId = org.id;
  console.log('Org ID:', orgId);

  const condRows = condominios.map((c) => ({
    org_id: orgId,
    legacy_id: c.id,
    nome: c.nome,
    unidades: c.unidades,
    tipo: c.tipo,
    agua: c.agua,
    gas: c.gas,
    energia: c.energia,
    vagas: c.vagas,
    prestadores: c.prestadores || {},
    servicos: c.servicos || [],
    checklists: c.checklists || [],
    manut_chk: c.manutChk || [],
  }));

  const { error: condErr } = await sb.from('ga_condominios').upsert(condRows, { onConflict: 'org_id,legacy_id' });
  if (condErr) throw condErr;
  console.log('Condomínios OK');

  const prestRows = prestadores.map((p) => ({
    id: p.id,
    org_id: orgId,
    nome: p.nome,
    esp: p.esp,
    tel: p.tel,
    perc: p.perc,
    rec_tipo: p.rec_tipo,
  }));
  const { error: prestErr } = await sb.from('ga_prestadores').upsert(prestRows, { onConflict: 'org_id,id' });
  if (prestErr) throw prestErr;
  console.log('Prestadores OK');

  const fullManut = manutRows.map((m) => ({ ...m, org_id: orgId }));
  for (let i = 0; i < fullManut.length; i += BATCH) {
    const chunk = fullManut.slice(i, i + BATCH);
    const { error } = await sb.from('ga_manutencoes').upsert(chunk, { onConflict: 'org_id,id' });
    if (error) throw error;
    process.stdout.write(`\rManutenções: ${Math.min(i + BATCH, fullManut.length)}/${fullManut.length}`);
  }
  console.log('\nMigração concluída.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
