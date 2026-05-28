-- Migration 4 — RLS: enable + policies (DESIGN.md §8)
-- Model: every policy targets `authenticated` (so `anon` is always denied).
-- `service_role` has BYPASSRLS (used by n8n) and is unaffected by policies.
-- Super-admin elevation is encoded via is_super_admin() — super admins are
-- still the `authenticated` Postgres role, NOT service_role, so they do NOT
-- bypass RLS; their access must be granted explicitly in each policy.

-- Table privileges (RLS still gates every row). anon gets nothing.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

-- employees -----------------------------------------------------------------
alter table public.employees enable row level security;

create policy employees_select on public.employees
  for select to authenticated
  using (
    is_super_admin()
    or employees.id = current_employee_id()
    or exists (
      select 1 from public.evaluation_cycles c
      where employees.id in (select employee_id from public.manager_subtree(c.id))
    )
  );

create policy employees_insert on public.employees
  for insert to authenticated with check (is_super_admin());
create policy employees_update on public.employees
  for update to authenticated using (is_super_admin()) with check (is_super_admin());
create policy employees_delete on public.employees
  for delete to authenticated using (is_super_admin());

-- evaluation_cycles : read = any authenticated; write = super admin ----------
alter table public.evaluation_cycles enable row level security;

create policy cycles_select on public.evaluation_cycles
  for select to authenticated using (true);
create policy cycles_insert on public.evaluation_cycles
  for insert to authenticated with check (is_super_admin());
create policy cycles_update on public.evaluation_cycles
  for update to authenticated using (is_super_admin()) with check (is_super_admin());
create policy cycles_delete on public.evaluation_cycles
  for delete to authenticated using (is_super_admin());

-- cycle_relationships : read = any authenticated; write = super admin --------
alter table public.cycle_relationships enable row level security;

create policy crel_select on public.cycle_relationships
  for select to authenticated using (true);
create policy crel_insert on public.cycle_relationships
  for insert to authenticated with check (is_super_admin());
create policy crel_update on public.cycle_relationships
  for update to authenticated using (is_super_admin()) with check (is_super_admin());
create policy crel_delete on public.cycle_relationships
  for delete to authenticated using (is_super_admin());

-- questions : read = any authenticated; write = super admin ------------------
alter table public.questions enable row level security;

create policy questions_select on public.questions
  for select to authenticated using (true);
create policy questions_insert on public.questions
  for insert to authenticated with check (is_super_admin());
create policy questions_update on public.questions
  for update to authenticated using (is_super_admin()) with check (is_super_admin());
create policy questions_delete on public.questions
  for delete to authenticated using (is_super_admin());

-- feedback_assignments : raw read = giver(own) + super admin -----------------
-- Rows are created by generate_assignments() (security definer, bypasses RLS)
-- or by an admin. The giver may only flip their own status while the form is
-- open. Recipients never read raw rows — they use the aggregation views.
alter table public.feedback_assignments enable row level security;

create policy fa_select on public.feedback_assignments
  for select to authenticated
  using (from_id = current_employee_id() or is_super_admin());

create policy fa_insert on public.feedback_assignments
  for insert to authenticated with check (is_super_admin());

create policy fa_update on public.feedback_assignments
  for update to authenticated
  using (is_super_admin() or (from_id = current_employee_id() and form_is_open(cycle_id)))
  with check (is_super_admin() or (from_id = current_employee_id() and form_is_open(cycle_id)));

create policy fa_delete on public.feedback_assignments
  for delete to authenticated using (is_super_admin());

-- responses : write/read by the giver only (+ super admin reads raw) ---------
-- Form locks once now() > form_end (form_is_open()). Recipients read via views.
alter table public.responses enable row level security;

create policy responses_select on public.responses
  for select to authenticated
  using (
    is_super_admin()
    or exists (
      select 1 from public.feedback_assignments fa
      where fa.id = responses.assignment_id
        and fa.from_id = current_employee_id()
    )
  );

create policy responses_insert on public.responses
  for insert to authenticated
  with check (
    exists (
      select 1 from public.feedback_assignments fa
      where fa.id = responses.assignment_id
        and fa.from_id = current_employee_id()
        and public.form_is_open(fa.cycle_id)
    )
  );

create policy responses_update on public.responses
  for update to authenticated
  using (
    exists (
      select 1 from public.feedback_assignments fa
      where fa.id = responses.assignment_id
        and fa.from_id = current_employee_id()
        and public.form_is_open(fa.cycle_id)
    )
  )
  with check (
    exists (
      select 1 from public.feedback_assignments fa
      where fa.id = responses.assignment_id
        and fa.from_id = current_employee_id()
        and public.form_is_open(fa.cycle_id)
    )
  );

create policy responses_delete on public.responses
  for delete to authenticated using (is_super_admin());

-- peer_nominations : write = nominator(+admin); read adds manager if approval-on
alter table public.peer_nominations enable row level security;

create policy pn_select on public.peer_nominations
  for select to authenticated
  using (
    is_super_admin()
    or nominator_id = current_employee_id()
    or exists (
      select 1 from public.evaluation_cycles c
      where c.id = peer_nominations.cycle_id
        and c.require_peer_approval = true
        and peer_nominations.nominator_id in (select employee_id from public.manager_subtree(c.id))
    )
  );

create policy pn_insert on public.peer_nominations
  for insert to authenticated
  with check (nominator_id = current_employee_id() or is_super_admin());
create policy pn_update on public.peer_nominations
  for update to authenticated
  using (nominator_id = current_employee_id() or is_super_admin())
  with check (nominator_id = current_employee_id() or is_super_admin());
create policy pn_delete on public.peer_nominations
  for delete to authenticated
  using (nominator_id = current_employee_id() or is_super_admin());

-- result_summaries : read = visibility matrix, gated to published for non-admins
-- Write = service_role only (n8n) -> intentionally no insert/update/delete policy.
alter table public.result_summaries enable row level security;

create policy rs_select on public.result_summaries
  for select to authenticated
  using (
    is_super_admin()
    or (
      exists (select 1 from public.evaluation_cycles c
              where c.id = result_summaries.cycle_id and c.status = 'published')
      and (
        recipient_id = current_employee_id()
        or my_role() = 'ceo'
        or exists (
          select 1 from public.evaluation_cycles c
          where c.id = result_summaries.cycle_id
            and result_summaries.recipient_id in (select employee_id from public.manager_subtree(c.id))
        )
      )
    )
  );

-- audit_logs : read = super admin; insert = own actor row; immutable ---------
alter table public.audit_logs enable row level security;

create policy audit_select on public.audit_logs
  for select to authenticated using (is_super_admin());
create policy audit_insert on public.audit_logs
  for insert to authenticated
  with check (actor_id = current_employee_id() or is_super_admin());
