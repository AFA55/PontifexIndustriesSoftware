-- Access requests no longer collect a password. The request form previously
-- bcrypt-hashed a password into access_requests.password_hash, but that hash was
-- NEVER usable to create a login — Supabase Auth manages its own credentials and
-- cannot accept a pre-computed hash — so the user was always asked for a password
-- AGAIN at the post-approval setup link (the "asked twice" bug). The password is
-- now set ONCE, at setup-account, after an admin approves. Make the column
-- nullable so a request can be stored with contact info only.
-- Additive + idempotent; existing rows keep their value.
ALTER TABLE public.access_requests ALTER COLUMN password_hash DROP NOT NULL;
