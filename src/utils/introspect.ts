import type { Pool, PoolClient } from 'pg';
import type { TableMeta, PolicyInfo } from './types.js';

export async function introspectSchema(pool: Pool): Promise<TableMeta[]> {
  const client = await pool.connect();
  try {
    // Get all tables with RLS enabled
    const tablesQuery = `
      SELECT 
        schemaname as schema,
        tablename as name
      FROM pg_tables 
      WHERE schemaname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        AND rowsecurity = true
      ORDER BY schemaname, tablename;
    `;

    const { rows: tables } = await client.query(tablesQuery);
    
    const tableMetas: TableMeta[] = [];
    
    for (const table of tables) {
      const policies = await getPoliciesForTable(client, table.schema, table.name);
      tableMetas.push({
        schema: table.schema,
        name: table.name,
        policies,
      });
    }

    return tableMetas;
  } finally {
    client.release();
  }
}

async function getPoliciesForTable(
  client: PoolClient,
  schema: string,
  table: string,
): Promise<PolicyInfo[]> {
  const policiesQuery = `
    SELECT 
      pol.polname as name,
      pol.polcmd as command,
      pol.polroles::regrole[] as role_oids,
      pol.polqual as using_expression,
      pol.polwithcheck as with_check_expression
    FROM pg_policy pol
    JOIN pg_class cls ON pol.polrelid = cls.oid
    JOIN pg_namespace nsp ON cls.relnamespace = nsp.oid
    WHERE nsp.nspname = $1 AND cls.relname = $2
    ORDER BY pol.polname;
  `;

  const { rows: policies } = await client.query(policiesQuery, [schema, table]);
  
  return policies.map((policy: any): PolicyInfo => ({
    name: policy.name,
    command: policy.command as 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE',
    roles: policy.role_oids || [],
    using_expression: policy.using_expression || undefined,
    with_check_expression: policy.with_check_expression || undefined,
  }));
} 