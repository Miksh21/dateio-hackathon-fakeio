-- Read-only confirmation of committed state after deploy + seed.
do $$
declare
  n int; nceo int; nmgr int; nic int; nsa int; nnull int; nrls int; mcfly_null boolean;
begin
  select count(*) into n     from public.employees;
  select count(*) into nceo  from public.employees where role = 'ceo';
  select count(*) into nmgr  from public.employees where role = 'manager';
  select count(*) into nic   from public.employees where role = 'ic';
  select count(*) into nsa    from public.employees where is_super_admin;
  select count(*) into nnull  from public.employees where reporting_to_id is null;
  select count(*) into nrls   from pg_tables where schemaname = 'public' and rowsecurity;
  select (reporting_to_id is null) into mcfly_null
    from public.employees where email = 'marty.mcfly@fakeio.eu';
  raise notice 'employees=% | ceo=% manager=% ic=% | super_admins=% | null reporting_to=% | RLS tables=% | McFly null=%',
    n, nceo, nmgr, nic, nsa, nnull, nrls, mcfly_null;
end $$;
