import type { Pool, PoolClient } from 'pg';
import type { TableMeta, PolicyInfo } from '../shared/types.js';
import { EXCLUDED_SCHEMAS_FROM_INTROSPECTION } from '../shared/constants.js';

/**
 * Introspects the database schema to discover all tables with RLS enabled and their policies.
 */
export async function introspectSchema(pool: Pool): Promise<TableMeta[]> {
  const client = await pool.connect();
  try {
    const tablesWithRlsEnabled = await discoverTablesWithRowLevelSecurityEnabled(client);
    const tablesWithPolicyDetails = await enrichTablesWithPolicyInformation(client, tablesWithRlsEnabled);
    
    return tablesWithPolicyDetails;
  } finally {
    client.release();
  }
}

/**
 * Discovers all tables in the database that have Row Level Security enabled.
 */
async function discoverTablesWithRowLevelSecurityEnabled(client: PoolClient): Promise<Array<{schema: string, name: string}>> {
  const excludedSchemasCondition = createExcludedSchemasCondition();
  
  const tablesQuery = `
    SELECT 
      schemaname as schema,
      tablename as name
    FROM pg_tables 
    WHERE ${excludedSchemasCondition}
      AND rowsecurity = true
    ORDER BY schemaname, tablename;
  `;

  const { rows: tables } = await client.query(tablesQuery);
  return tables;
}

/**
 * Creates a SQL condition to exclude system schemas from introspection.
 */
function createExcludedSchemasCondition(): string {
  const schemaList = EXCLUDED_SCHEMAS_FROM_INTROSPECTION
    .map(schema => `'${schema}'`)
    .join(', ');
  
  return `schemaname NOT IN (${schemaList})`;
}

/**
 * Enriches discovered tables with detailed policy information.
 */
async function enrichTablesWithPolicyInformation(
  client: PoolClient, 
  tables: Array<{schema: string, name: string}>
): Promise<TableMeta[]> {
  const enrichedTables: TableMeta[] = [];
  
  for (const table of tables) {
    const policies = await introspectPoliciesForSpecificTable(client, table.schema, table.name);
    enrichedTables.push({
      schema: table.schema,
      name: table.name,
      policies,
    });
  }

  return enrichedTables;
}

/**
 * Introspects all RLS policies for a specific table.
 */
async function introspectPoliciesForSpecificTable(
  client: PoolClient,
  schema: string,
  table: string,
): Promise<PolicyInfo[]> {
  const policiesQuery = createPolicyIntrospectionQuery();
  const { rows: policies } = await client.query(policiesQuery, [schema, table]);
  
  return policies.map(transformRawPolicyDataToStructured);
}

/**
 * Creates the SQL query for introspecting table policies.
 */
function createPolicyIntrospectionQuery(): string {
  return `
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
}

/**
 * Transforms raw policy data from PostgreSQL into structured PolicyInfo objects.
 */
function transformRawPolicyDataToStructured(rawPolicy: any): PolicyInfo {
  return {
    name: rawPolicy.name,
    command: rawPolicy.command as 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE',
    roles: rawPolicy.role_oids || [],
    using_expression: rawPolicy.using_expression || undefined,
    with_check_expression: rawPolicy.with_check_expression || undefined,
  };
} 