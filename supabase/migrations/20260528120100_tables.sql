-- Migration 2 — Tables, constraints, indexes (DESIGN.md §7)
-- RLS is enabled in migration 4. Helper functions in migration 3.

-- updated_at maintenance for responses autosave (§6)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- employees ----------------------------------------------------------------
create table public.employees (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  first_name      text not null,
  last_name       text not null,
  division        text,
  job_title       text,
  reporting_to_id uuid references public.employees(id) on delete set null,
  role            app_role not null,
  is_super_admin  boolean not null default false,
  work_phone      text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- evaluation_cycles --------------------------------------------------------
create table public.evaluation_cycles (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  status               cycle_status not null default 'draft',
  form_start           timestamptz,
  form_end             timestamptz,
  anon_min_responses   int not null default 3 check (anon_min_responses between 2 and 5),
  require_peer_approval boolean not null default false,
  reminder_config      jsonb,
  created_by           uuid references public.employees(id),
  published_at         timestamptz,
  created_at           timestamptz not null default now()
);

-- cycle_relationships — the admin-drawn feedback graph (§3) -----------------
create table public.cycle_relationships (
  id                uuid primary key default gen_random_uuid(),
  cycle_id          uuid not null references public.evaluation_cycles(id) on delete cascade,
  from_employee_id  uuid not null references public.employees(id),
  to_employee_id    uuid not null references public.employees(id),
  relationship_type relationship_type not null,
  created_at        timestamptz not null default now(),
  constraint cycle_relationships_no_self check (from_employee_id <> to_employee_id),
  unique (cycle_id, from_employee_id, to_employee_id, relationship_type)
);

-- feedback_assignments — generated from the graph (§4) ----------------------
create table public.feedback_assignments (
  id           uuid primary key default gen_random_uuid(),
  cycle_id     uuid not null references public.evaluation_cycles(id) on delete cascade,
  from_id      uuid not null references public.employees(id),
  to_id        uuid not null references public.employees(id),
  type         assignment_type not null,
  status       assignment_status not null default 'pending',
  submitted_at timestamptz,
  unique (cycle_id, from_id, to_id, type)
);

-- questions (§6) -----------------------------------------------------------
create table public.questions (
  id                      uuid primary key default gen_random_uuid(),
  cycle_id                uuid not null references public.evaluation_cycles(id) on delete cascade,
  text                    text not null,
  description             text,
  type                    question_type not null,
  category                text,
  target_assignment_types text[] not null default array['self','upward','downward','peer'],
  sort_order              int not null default 0,
  is_required             boolean not null default true,
  created_at              timestamptz not null default now()
);

-- responses (§6) -----------------------------------------------------------
create table public.responses (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.feedback_assignments(id) on delete cascade,
  question_id   uuid not null references public.questions(id) on delete cascade,
  scale_value   int,
  text_value    text,
  choice_value  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (assignment_id, question_id)
);

create trigger responses_set_updated_at
  before update on public.responses
  for each row execute function public.set_updated_at();

-- peer_nominations — optional input (§5) -----------------------------------
create table public.peer_nominations (
  id           uuid primary key default gen_random_uuid(),
  cycle_id     uuid not null references public.evaluation_cycles(id) on delete cascade,
  nominator_id uuid not null references public.employees(id),
  nominee_id   uuid not null references public.employees(id),
  status       nomination_status not null default 'pending',
  reviewed_by  uuid references public.employees(id),
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint peer_nominations_no_self check (nominator_id <> nominee_id),
  unique (cycle_id, nominator_id, nominee_id)
);

-- result_summaries — AI writes here later (§6/§7) --------------------------
create table public.result_summaries (
  id           uuid primary key default gen_random_uuid(),
  cycle_id     uuid not null references public.evaluation_cycles(id) on delete cascade,
  recipient_id uuid not null references public.employees(id),
  scope        text not null,
  ai_summary   text,
  theme_tags   text[],
  computed_at  timestamptz,
  unique (cycle_id, recipient_id, scope)
);

-- audit_logs — de-anon reads logged here (§9) ------------------------------
create table public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.employees(id),
  action       text not null,
  target_table text,
  target_id    uuid,
  meta         jsonb,
  created_at   timestamptz not null default now()
);

-- Indexes: every FK + (cycle_id, status) on assignments --------------------
create index idx_employees_reporting_to on public.employees(reporting_to_id);
create index idx_cycles_created_by      on public.evaluation_cycles(created_by);
create index idx_crel_cycle             on public.cycle_relationships(cycle_id);
create index idx_crel_from              on public.cycle_relationships(from_employee_id);
create index idx_crel_to                on public.cycle_relationships(to_employee_id);
create index idx_fa_cycle               on public.feedback_assignments(cycle_id);
create index idx_fa_from                on public.feedback_assignments(from_id);
create index idx_fa_to                  on public.feedback_assignments(to_id);
create index idx_fa_cycle_status        on public.feedback_assignments(cycle_id, status);
create index idx_questions_cycle        on public.questions(cycle_id);
create index idx_responses_assignment   on public.responses(assignment_id);
create index idx_responses_question     on public.responses(question_id);
create index idx_pn_cycle               on public.peer_nominations(cycle_id);
create index idx_pn_nominator           on public.peer_nominations(nominator_id);
create index idx_pn_nominee             on public.peer_nominations(nominee_id);
create index idx_pn_reviewed_by         on public.peer_nominations(reviewed_by);
create index idx_rs_cycle               on public.result_summaries(cycle_id);
create index idx_rs_recipient           on public.result_summaries(recipient_id);
create index idx_audit_actor            on public.audit_logs(actor_id);
