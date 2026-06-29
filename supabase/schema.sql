-- Gralha Azul — schema relacional (multi-tenant ready)
-- Rodar no Supabase SQL Editor antes da migração

create extension if not exists "pgcrypto";

-- Organizações (cada imobiliária cliente)
create table if not exists ga_organizations (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Usuários do sistema (substitui ga_usuarios + DB.users)
create table if not exists ga_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references ga_organizations(id) on delete cascade,
  nome text not null,
  cargo text,
  role text not null default 'operacional' check (role in ('admin','financeiro','operacional')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Condomínios (antes hardcoded em gestao.html)
create table if not exists ga_condominios (
  id serial primary key,
  org_id uuid not null references ga_organizations(id) on delete cascade,
  legacy_id int,
  nome text not null,
  unidades text,
  tipo text,
  agua text,
  gas text,
  energia text,
  vagas text,
  prestadores jsonb not null default '{}',
  servicos jsonb not null default '[]',
  checklists jsonb not null default '[]',
  manut_chk jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (org_id, legacy_id)
);

-- Manutenções (imob, cond, ocup, ager, proc)
create table if not exists ga_manutencoes (
  id text not null,
  org_id uuid not null references ga_organizations(id) on delete cascade,
  tipo text not null check (tipo in ('imob','cond','ocup','ager','proc')),
  status_raw text not null default 'Em andamento',
  dt_sol date,
  dt_prev date,
  dt_conc date,
  resp text,
  cond text,
  prest text,
  descricao text,
  val numeric(12,2) not null default 0,
  mat numeric(12,2) not null default 0,
  rec_kenlo numeric(12,2) not null default 0,
  manut_kenlo text,
  loc_deb text,
  contas text,
  recibo text default 'Não',
  obs text,
  cond_id int references ga_condominios(id),
  is_visita boolean not null default false,
  is_from_chk boolean not null default false,
  is_planilha_aberto boolean not null default false,
  legacy_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);

create index if not exists idx_manut_org_tipo on ga_manutencoes(org_id, tipo);
create index if not exists idx_manut_org_status on ga_manutencoes(org_id, status_raw);
create index if not exists idx_manut_dt_sol on ga_manutencoes(org_id, dt_sol);

-- Prestadores
create table if not exists ga_prestadores (
  id text not null,
  org_id uuid not null references ga_organizations(id) on delete cascade,
  nome text not null,
  esp text,
  tel text,
  perc numeric(5,2) not null default 70,
  rec_tipo text not null default 'valor',
  created_at timestamptz not null default now(),
  primary key (org_id, id)
);

-- Tarefas / processos
create table if not exists ga_tasks (
  id text not null,
  org_id uuid not null references ga_organizations(id) on delete cascade,
  titulo text,
  resp text,
  prio text,
  dt_ini date,
  dt_fim date,
  cond text,
  obs text,
  status text not null default 'Pendente',
  criado_em timestamptz,
  concluido_em timestamptz,
  primary key (org_id, id)
);

create table if not exists ga_notificacoes (
  id text not null,
  org_id uuid not null references ga_organizations(id) on delete cascade,
  cod text,
  dt date,
  dest text,
  contrato text,
  tipo text,
  resp text,
  obs text,
  primary key (org_id, id)
);

create table if not exists ga_lembretes (
  id text not null,
  org_id uuid not null references ga_organizations(id) on delete cascade,
  texto text,
  dt_fim date,
  status text,
  criado_em timestamptz,
  primary key (org_id, id)
);

create table if not exists ga_events (
  id text not null,
  org_id uuid not null references ga_organizations(id) on delete cascade,
  titulo text,
  dt date,
  hora text,
  resp text,
  cond text,
  obs text,
  from_cond boolean default false,
  from_checklist boolean default false,
  primary key (org_id, id)
);

create table if not exists ga_checklists (
  id text not null,
  org_id uuid not null references ga_organizations(id) on delete cascade,
  cond_id int references ga_condominios(id),
  cond_nome text,
  dt date,
  resp text,
  obs text,
  checks jsonb not null default '[]',
  criado_em timestamptz,
  primary key (org_id, id)
);

-- Auditoria (substitui ga_historico_nuvem)
create table if not exists ga_audit_log (
  id bigserial primary key,
  org_id uuid references ga_organizations(id),
  modulo text not null,
  usuario_nome text,
  acao text,
  detalhe text,
  dispositivo text,
  created_at timestamptz not null default now()
);

-- View: status normalizado (Aberto → Em andamento)
create or replace view ga_manutencoes_norm as
select
  m.*,
  case
    when lower(trim(status_raw)) in ('aberto','atrasado','andamento','em andamento') then 'Em andamento'
    when lower(trim(status_raw)) in ('concluido','concluído') then 'Concluído'
    when lower(trim(status_raw)) like 'cancel%' then 'Cancelado'
    else coalesce(nullif(trim(status_raw), ''), 'Em andamento')
  end as status_norm
from ga_manutencoes m;

-- RLS básico (ajustar policies conforme auth)
alter table ga_manutencoes enable row level security;
alter table ga_condominios enable row level security;
alter table ga_profiles enable row level security;

create policy "profiles_own_org" on ga_profiles for select using (
  org_id in (select org_id from ga_profiles where id = auth.uid())
);

create policy "manut_org_members" on ga_manutencoes for all using (
  org_id in (select org_id from ga_profiles where id = auth.uid())
);

create policy "cond_org_members" on ga_condominios for all using (
  org_id in (select org_id from ga_profiles where id = auth.uid())
);

-- Org padrão Gralha Azul
insert into ga_organizations (slug, nome)
values ('gralha-azul', 'Gralha Azul Imobiliária')
on conflict (slug) do nothing;
