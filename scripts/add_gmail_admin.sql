-- Add jan.mikes21@gmail.com as a super admin so real-email login works via Resend
-- (Resend only delivers to this address until a domain is verified).
insert into public.employees (email, first_name, last_name, division, job_title, role, is_super_admin, is_active)
values ('jan.mikes21@gmail.com', 'Jan', 'Mikeš', 'Management', 'RevOps / Admin', 'manager', true, true)
on conflict (email) do update set is_super_admin = true, is_active = true;
