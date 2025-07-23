-- Create a read-only role for SupaGuard testing
CREATE ROLE supaguard_test2 WITH LOGIN PASSWORD 'test123';

-- Grant basic schema access
GRANT USAGE ON SCHEMA public TO supaguard_test2;
GRANT USAGE ON SCHEMA auth TO supaguard_test2;

-- Grant SELECT on all tables (read-only)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO supaguard_test2;
GRANT SELECT ON ALL TABLES IN SCHEMA auth TO supaguard_test2;

-- Allow executing auth functions (needed for auth.uid())
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO supaguard_test2;

-- Allow role switching for testing (this is the key!)
GRANT anon TO supaguard_test2;
GRANT authenticated TO supaguard_test2;

-- Give minimal DML rights needed for testing (but RLS will still block)
GRANT INSERT, UPDATE, DELETE ON public.todos TO supaguard_test2;

-- Important: This role should NOT be a superuser or have BYPASSRLS
