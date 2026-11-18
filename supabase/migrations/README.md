The live schema was applied to Supabase project `hadewvoqkypsiwemihsz` in two migrations:
`init_job_platform` (tables, `is_owner()` RLS, storage bucket) and `app_extensions` (extra columns, dedupe indexes,
single-user sign-up trigger). Export them with `supabase db dump --schema public` if you need to recreate the project.
