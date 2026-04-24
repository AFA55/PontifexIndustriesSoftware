# Ad-hoc SQL Scripts

One-off operational SQL scripts. These are NOT migrations — do not place files here expecting Supabase to run them.

## Files

### `CLEANUP_TEST_ACCOUNTS.sql`
Deletes test accounts from `auth.users` and `public.profiles` while keeping the listed admin accounts. Run manually from the Supabase SQL editor (requires service_role) when pruning demo/test data before a release. Review the email allowlist at the top of the file before executing.
