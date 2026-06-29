# Gralha Azul — Sistema Web Profissional (v2)

Aplicação Next.js + Supabase. Substitui o `gestao.html` monolítico por banco relacional, sync em tempo real e base pronta para venda (multi-tenant).

## O que já está pronto

| Item | Status |
|------|--------|
| Schema PostgreSQL (`supabase/schema.sql`) | ✅ |
| Regras de negócio portadas (`src/lib/manut-rules.ts`) | ✅ |
| Migração fiel dos seeds (`tools/migrate-to-supabase.mjs`) | ✅ |
| Dashboard + módulos manut (imob/cond/ocup/ager) | ✅ |
| Login (Supabase Auth + fallback `ga_usuarios`) | ✅ |
| Realtime Supabase nas listas | ✅ |

## Dados migrados (fiel ao gestao.html)

- **349** imob + **211** cond + **1174** ocup + **108** ager = **1842** manutenções
- **23** condomínios (extraídos de `CONDOMINIOS` em gestao.html)
- **5** prestadores padrão
- Regras: Aberto→Em andamento, pendentes no filtro de mês, stats por mês de referência

## Colocar no ar (passo a passo)

### 1. Supabase — criar tabelas

No [Supabase SQL Editor](https://supabase.com/dashboard), execute:

```
supabase/schema.sql
```

### 2. Migrar dados

Com a **Service Role Key** (Settings → API):

```bash
cd /workspace
export SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
node tools/migrate-to-supabase.mjs
```

Validar: `node tools/migrate-to-supabase.mjs --dry-run`

### 3. App — variáveis de ambiente

Copie `gralha-app/.env.example` → `gralha-app/.env.local`

### 4. Deploy (Vercel — recomendado)

1. Conecte o repositório GitHub na [Vercel](https://vercel.com)
2. **Root Directory:** `gralha-app`
3. Adicione env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy → URL tipo `https://gralha-app.vercel.app`

Funciona de **qualquer internet** (casa, outra imob, celular).

### 5. Usuários

- Crie usuários em Supabase Auth (Authentication → Users), ou
- Use os existentes em `ga_usuarios` (login legado rescisões)

## Roadmap (próximas fases)

| Fase | Entrega |
|------|---------|
| **2** | CRUD editar/concluir manutenção, financeiro, prestadores |
| **3** | Processos, checklist, agenda, condomínio detalhe |
| **4** | Multi-imobiliária (venda SaaS), billing, domínio próprio |

O `gestao.html` continua no GitHub Pages como fallback até a v2 estar 100% validada pela equipe.

## Desenvolvimento local

```bash
cd gralha-app
npm install
npm run dev
```

Abra http://localhost:3000
