-- Migration — lock chat_search EXECUTE to service_role ONLY.
--
-- WHY THIS EXISTS (privacy boundary hardening)
-- --------------------------------------------
-- public.chat_search(uuid, uuid, vector, int) is the HARD privacy filter for the
-- "chat with your feedback" RAG: it takes an EXPLICIT p_asker_id and returns only
-- the (anonymised, threshold-gated) feedback chunks that asker is entitled to see.
-- Because the asker id is a *parameter* (not derived from the JWT inside the
-- function), the function is only safe if the CALLER is trusted to pass a verified
-- id. The app does that server-side (session-verified employee id via a
-- service-role client). It must therefore be impossible for a logged-in user to
-- reach the function directly via PostgREST `/rpc/chat_search` and spoof
-- p_asker_id to read someone else's scoped feedback.
--
-- The original chat_search migration ran `revoke all ... from public`, but that
-- only drops the implicit PUBLIC grant. Supabase configures ALTER DEFAULT
-- PRIVILEGES that auto-grant EXECUTE on every new public function to the `anon`
-- and `authenticated` roles. Those role-specific grants survive a `from public`
-- revoke, so on the live DB `anon` and `authenticated` could still EXECUTE
-- chat_search — i.e. any logged-in (or even anonymous) user could call it with an
-- arbitrary p_asker_id. This migration revokes those explicit grants and re-grants
-- EXECUTE to service_role only. Idempotent and safe to re-run.

revoke execute on function public.chat_search(uuid, uuid, vector, int)
  from public, anon, authenticated;

grant execute on function public.chat_search(uuid, uuid, vector, int)
  to service_role;

do $$
declare
  bad text;
begin
  -- Fail loudly if anon/authenticated/PUBLIC can still execute it after this runs.
  select string_agg(grantee || ':' || privilege_type, ', ')
    into bad
  from information_schema.role_routine_grants
  where routine_schema = 'public'
    and routine_name = 'chat_search'
    and grantee in ('anon', 'authenticated', 'PUBLIC')
    and privilege_type = 'EXECUTE';

  if bad is not null then
    raise exception 'chat_search still executable by untrusted role(s): %', bad;
  end if;

  raise notice 'chat_search EXECUTE locked to service_role only.';
end $$;
