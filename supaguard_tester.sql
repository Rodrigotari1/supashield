-- Supasec Tester Role Setup
--
-- This script creates a dedicated, non-superuser role for running Supasec.
-- Using a dedicated role is a security best practice, as it ensures that the
-- tool only has the minimum required permissions to test your RLS policies.
--
-- Instructions:
-- 1. Replace 'your-secure-password' with a strong, unique password.
-- 2. Run this script against your Supabase database.

-- Create a new role for testing
CREATE ROLE supaguard_tester LOGIN PASSWORD 'your-secure-password';

-- Grant connect permissions to the database
GRANT CONNECT ON DATABASE postgres TO supaguard_tester;

-- Grant usage on the schemas you want to test.
-- You may need to add additional schemas here depending on your application.
GRANT USAGE ON SCHEMA public, auth, storage TO supaguard_tester;

-- Grant the minimum required permissions on the tables you want to test.
-- This allows the tester role to attempt to perform these operations, which
-- is necessary to see if your RLS policies correctly block them.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO supaguard_tester;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO supaguard_tester;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA storage TO supaguard_tester;

-- Note:
-- If you add new tables to your database, you may need to re-run the GRANT
-- commands to ensure that the supaguard_tester role has the necessary
-- permissions to test them. 