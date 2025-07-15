import { Pool } from 'pg';

export interface ReadOnlyPool extends Pool {}

/**
 * Establishes a read-only connection pool and validates that the mapped role
 * lacks any DML (INSERT/UPDATE/DELETE) or CREATE privileges. Throws if unsafe.
 */
export async function connectReadOnly(dbUrl: string): Promise<ReadOnlyPool> {
  const pool = new Pool({ connectionString: dbUrl });

  const client = await pool.connect();
  try {
    const { rows } = await client.query<{
      has_dml: boolean;
      has_create: boolean;
      role: string;
    }>(`
      SELECT
        EXISTS (
          SELECT 1
          FROM information_schema.role_table_grants
          WHERE grantee = current_user
            AND privilege_type IN ('INSERT','UPDATE','DELETE')
        ) AS has_dml,
        has_database_privilege(current_user, current_database(), 'CREATE') AS has_create,
        current_user AS role;
    `);

    const [row] = rows;
    if (row.has_dml || row.has_create) {
      throw new Error(
        `Role "${row.role}" is not read-only: DML or CREATE privileges detected. ` +
          'Provide a connection string mapped to a strictly read-only role (e.g. "supasec_ro").',
      );
    }
  } finally {
    client.release();
  }

  return pool;
} 