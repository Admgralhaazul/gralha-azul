# Validação de manutenções

## Rodar validação linha a linha

```bash
node tools/validate-manut-lines.mjs
```

Compara cada linha do **PDF original** (modo `--faithful`, sem forçar totais) com os seeds JSON.

Relatórios em `tools/reports/validation-YYYY-MM-DD.json` e `.txt`.

## Reimport fiel (sem linhas artificiais)

```bash
node tools/import-cond-imob.mjs --faithful
node tools/import-ocup-geral.mjs --faithful
node tools/import-ager-adm.mjs --faithful
node tools/validate-manut-lines.mjs   # deve mostrar 0 issues
```

## Última validação (2026-06-29)

| Módulo | PDF | Seed | Issues |
|--------|-----|------|--------|
| imob+cond | 559 | 559 | **0** |
| ocup | 1170 | 1170 | **0** |
| ager | 106 | 106 | **0** |

Totais faithful imob+cond: 470 concl · 56 cancel · 33 pendentes (29 and + 4 aberto)

**Nota:** Totais anteriores (471/560) incluíam linhas/status ajustados artificialmente. Os dados faithful refletem o PDF linha a linha.
