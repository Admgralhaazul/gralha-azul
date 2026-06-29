/**
 * Validação linha a linha: PDF (modo faithful) vs seeds JSON
 * Run: node tools/validate-manut-lines.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  readPdf as readCondImobPdf,
  extractFromText as parseCondImob,
  splitTipo,
  countStatus,
} from './import-cond-imob.mjs';
import { readPdf as readOcupPdf, extractFromText as parseOcup } from './import-ocup-geral.mjs';
import { readPdf as readAgerPdf, extractFromText as parseAger } from './import-ager-adm.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const REPORT_DIR = path.join(__dirname, 'reports');

const PDFS = {
  cond_imob: '/home/ubuntu/.cursor/projects/workspace/uploads/conominio_e_imobilairia_4b1d.pdf',
  ocup: '/home/ubuntu/.cursor/projects/workspace/uploads/manuten__es_geral_b421.pdf',
  ager: '/home/ubuntu/.cursor/projects/workspace/uploads/assistente_adm_52e9.pdf',
};

function fp(r) {
  const cond = String(r.cond || '').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 45);
  const desc = String(r.desc || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 35);
  return [
    r.dtSol || '',
    cond,
    Number(r.val ?? 0).toFixed(2),
    Number(r.mat ?? 0).toFixed(2),
    desc,
  ].join('|');
}

function compareRows(moduleName, pdfRows, seedRows, opts = {}) {
  const issues = [];
  const seedByFp = new Map();
  const seedUsed = new Set();

  for (const s of seedRows) {
    const key = fp(s);
    if (!seedByFp.has(key)) seedByFp.set(key, []);
    seedByFp.get(key).push(s);
  }

  pdfRows.forEach((p, idx) => {
    const key = fp(p);
    const candidates = seedByFp.get(key) || [];
    const seed = candidates.find((c) => !seedUsed.has(c.id)) || candidates[0];

    if (!seed) {
      issues.push({
        type: 'missing_in_seed',
        line: idx + 1,
        pdf: { dtSol: p.dtSol, cond: p.cond, status: p.status, desc: (p.desc || '').slice(0, 60), val: p.val },
        expectedTipo: opts.getTipo?.(p),
      });
      return;
    }
    seedUsed.add(seed.id);

    const expectedTipo = opts.getTipo?.(p);
    const actualTipo = seed.tipo || opts.inferTipo?.(seed);
    if (expectedTipo && actualTipo && expectedTipo !== actualTipo) {
      issues.push({
        type: 'wrong_module',
        line: idx + 1,
        seedId: seed.id,
        cond: p.cond,
        expectedTipo,
        actualTipo,
        pdfStatus: p.status,
        seedStatus: seed.status,
      });
    }

    if (p.status !== seed.status) {
      issues.push({
        type: 'status_mismatch',
        line: idx + 1,
        seedId: seed.id,
        cond: p.cond,
        pdfStatus: p.status,
        seedStatus: seed.status,
      });
    }

    if (Math.abs(Number(p.val || 0) - Number(seed.val || 0)) > 0.02) {
      issues.push({
        type: 'val_mismatch',
        line: idx + 1,
        seedId: seed.id,
        cond: p.cond,
        pdfVal: p.val,
        seedVal: seed.val,
      });
    }
  });

  for (const s of seedRows.filter((r) => r._planilhaAberto)) {
    issues.push({
      type: 'synthetic_row',
      seedId: s.id,
      cond: s.cond,
      status: s.status,
      note: 'Linha artificial para bater totais — não existe no PDF',
    });
  }

  const orphanSeed = seedRows.filter((s) => !seedUsed.has(s.id) && !s._planilhaAberto);
  for (const s of orphanSeed) {
    issues.push({
      type: 'extra_in_seed',
      seedId: s.id,
      cond: s.cond,
      status: s.status,
      desc: (s.desc || '').slice(0, 50),
    });
  }

  return {
    module: moduleName,
    pdfCount: pdfRows.length,
    seedCount: seedRows.length,
    matched: seedUsed.size,
    issueCount: issues.length,
    pdfStatus: countStatus(pdfRows),
    seedStatus: countStatus(seedRows),
    issues,
  };
}

function summarize(report) {
  const byType = {};
  for (const mod of report.modules) {
    for (const iss of mod.issues) {
      byType[iss.type] = (byType[iss.type] || 0) + 1;
    }
  }
  return byType;
}

async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const condImobText = await readCondImobPdf(PDFS.cond_imob);
  const faithfulCI = parseCondImob(condImobText, { faithful: true });
  const pdfCI = faithfulCI.allRows || [];
  const seedImob = JSON.parse(fs.readFileSync(path.join(ROOT, 'gestao-imob-seed.json'), 'utf8')).imob;
  const seedCond = JSON.parse(fs.readFileSync(path.join(ROOT, 'gestao-cond-seed.json'), 'utf8')).cond;

  const rCI = compareRows('imob+cond', pdfCI, [...seedImob, ...seedCond], {
    getTipo: (p) => splitTipo(p.cond),
    inferTipo: (s) => (String(s.id).startsWith('cond_') ? 'cond' : 'imob'),
  });

  const pdfOcup = parseOcup(await readOcupPdf(PDFS.ocup), 'ocup', { faithful: true });
  const seedOcup = JSON.parse(fs.readFileSync(path.join(ROOT, 'gestao-ocup-seed.json'), 'utf8')).ocup;
  const rOcup = compareRows('ocup', pdfOcup, seedOcup, { inferTipo: () => 'ocup' });

  const { rows: pdfAger } = parseAger(await readAgerPdf(PDFS.ager), { faithful: true });
  const seedAger = JSON.parse(fs.readFileSync(path.join(ROOT, 'gestao-ager-seed.json'), 'utf8')).ager;
  const rAger = compareRows('ager', pdfAger, seedAger, { inferTipo: () => 'ager' });

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'faithful_pdf_vs_current_seeds',
    modules: [rCI, rOcup, rAger],
    summary: {},
  };
  report.summary = summarize(report);

  const stamp = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(REPORT_DIR, `validation-${stamp}.json`);
  const txtPath = path.join(REPORT_DIR, `validation-${stamp}.txt`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  let txt = '=== VALIDAÇÃO LINHA A LINHA (PDF faithful vs seeds) ===\n\n';
  for (const m of report.modules) {
    txt += `## ${m.module}\n`;
    txt += `PDF: ${m.pdfCount} linhas | Seed: ${m.seedCount} | Matched: ${m.matched} | Issues: ${m.issueCount}\n`;
    txt += `PDF status:   ${JSON.stringify(m.pdfStatus)}\n`;
    txt += `Seed status:  ${JSON.stringify(m.seedStatus)}\n\n`;
    const top = m.issues.slice(0, 40);
    for (const i of top) {
      txt += `  [${i.type}] ${JSON.stringify(i)}\n`;
    }
    if (m.issues.length > 40) txt += `  ... +${m.issues.length - 40} issues (ver JSON)\n`;
    txt += '\n';
  }
  txt += `Resumo por tipo: ${JSON.stringify(report.summary)}\n`;
  fs.writeFileSync(txtPath, txt);

  console.log(txt);
  console.log('Relatórios:', jsonPath, txtPath);
  return report;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
