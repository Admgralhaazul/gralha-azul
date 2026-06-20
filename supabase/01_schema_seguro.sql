-- ============================================================
-- GRALHA AZUL — Banco de dados seguro (Supabase)
-- ============================================================
-- Como usar:
--   1. Crie um projeto novo em https://supabase.com
--   2. Abra "SQL Editor" > "New query"
--   3. Cole TODO este arquivo e clique em "Run"
--   4. Depois crie os usuários em Authentication > Users
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1) PERFIS DOS USUARIOS
--    Liga ao usuario oficial do Supabase Auth (auth.users).
--    Guarda nome, papel (admin/comum) e se o acesso esta ativo.
-- ============================================================
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null default '',
  role       text not null default 'comum' check (role in ('admin','comum')),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Funcao auxiliar para checar admin SEM causar recursao de RLS.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Funcao auxiliar: usuario autenticado E com acesso ativo.
create or replace function public.is_ativo()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and ativo = true
  );
$$;

-- Cada um le o proprio perfil; admin le todos.
drop policy if exists "perfil_select" on public.profiles;
create policy "perfil_select" on public.profiles
  for select using ( id = auth.uid() or public.is_admin() );

-- Usuario pode atualizar o proprio nome; admin pode atualizar qualquer perfil.
drop policy if exists "perfil_update" on public.profiles;
create policy "perfil_update" on public.profiles
  for update using ( id = auth.uid() or public.is_admin() );

-- Apenas admin cria/remove perfis manualmente (o normal e via trigger abaixo).
drop policy if exists "perfil_insert" on public.profiles;
create policy "perfil_insert" on public.profiles
  for insert with check ( public.is_admin() or id = auth.uid() );

drop policy if exists "perfil_delete" on public.profiles;
create policy "perfil_delete" on public.profiles
  for delete using ( public.is_admin() );

-- Quando um usuario novo e criado no Auth, cria o perfil automaticamente.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 2) DADOS DO SISTEMA
--    Por enquanto guarda o estado do app (igual hoje), mas
--    protegido: so usuario logado E ativo le/grava.
--    (Na proxima etapa migramos para 1 registro por item.)
-- ============================================================
create table if not exists public.ga_dados (
  chave         text primary key,
  valor         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

alter table public.ga_dados enable row level security;

drop policy if exists "dados_rw" on public.ga_dados;
create policy "dados_rw" on public.ga_dados
  for all
  using ( public.is_ativo() )
  with check ( public.is_ativo() );

-- ============================================================
-- 3) HISTORICO DE ACOES (quem fez o que e quando)
-- ============================================================
create table if not exists public.ga_historico (
  id        uuid primary key default gen_random_uuid(),
  usuario   text,
  nome      text,
  tipo      text,
  descricao text,
  ts        timestamptz not null default now()
);

alter table public.ga_historico enable row level security;

drop policy if exists "hist_select" on public.ga_historico;
create policy "hist_select" on public.ga_historico
  for select using ( auth.uid() is not null );

drop policy if exists "hist_insert" on public.ga_historico;
create policy "hist_insert" on public.ga_historico
  for insert with check ( auth.uid() is not null );

drop policy if exists "hist_delete" on public.ga_historico;
create policy "hist_delete" on public.ga_historico
  for delete using ( public.is_admin() );

-- ============================================================
-- 4) TEMPO REAL (atualiza todos os computadores na hora)
-- ============================================================
do $$
begin
  begin
    alter publication supabase_realtime add table public.ga_dados;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.ga_historico;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.profiles;
  exception when duplicate_object then null;
  end;
end $$;

-- ============================================================
-- PRONTO.
-- Proximo passo: Authentication > Users > "Add user" para cada
-- pessoa (email + senha). Depois, para tornar alguem ADMIN, rode:
--
--   update public.profiles set role='admin'
--   where id = (select id from auth.users where email='SEU_EMAIL_AQUI');
-- ============================================================
