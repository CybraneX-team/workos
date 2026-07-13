-- Discovered via live end-to-end testing: PostgreSQL added `base64url`
-- support to encode()/decode() in version 18. This project's linked
-- Supabase Postgres is 17.6 — the base64url expression (copied from the
-- existing workspace_invites.token default in the baseline schema) fails
-- at INSERT time with "unrecognized encoding: base64url". DDL never
-- evaluates column DEFAULTs, so the original migration's CREATE TABLE
-- applied cleanly and only failed once startup_invites was actually
-- inserted into. Switching to hex — same entropy (24 random bytes),
-- trivially URL-safe with no character-set edge cases at all.
--
-- Note: workspace_invites.token has the same latent expression and is out
-- of scope here — not touched, since it's pre-existing baseline schema.
alter table public.startup_invites
  alter column token set default encode(extensions.gen_random_bytes(24), 'hex');
