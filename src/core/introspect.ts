import type { Pool, PoolClient } from 'pg';
import type { TableMeta, PolicyInfo, StorageBucketMeta } from '../shared/types.js';
import { EXCLUDED_SCHEMAS_FROM_INTROSPECTION } from '../shared/constants.js';

/**
 * Introspects the database schema to discover tables with RLS enabled and their policies.
 */
export async function introspectSchema(pool: Pool, options: { includeSystemSchemas?: boolean } = {}): Promise<TableMeta[]> {
  const client = await pool.connect();
  try {
    const tablesWithRlsEnabled = await discoverTablesWithRowLevelSecurityEnabled(client, options.includeSystemSchemas);
    const tablesWithPolicyDetails = await enrichTablesWithPolicyInformation(client, tablesWithRlsEnabled);
    
    return tablesWithPolicyDetails;
  } finally {
    client.release();
  }
}

/**
 * Discovers all tables in the database that have Row Level Security enabled.
 */
async function discoverTablesWithRowLevelSecurityEnabled(client: PoolClient, includeSystemSchemas = false): Promise<Array<{schema: string, name: string}>> {
  const schemaCondition = includeSystemSchemas 
    ? createExcludedSchemasCondition() 
    : "schemaname = 'public'";
  
  const tablesQuery = `
    SELECT 
      schemaname as schema,
      tablename as name
    FROM pg_tables 
    WHERE ${schemaCondition}
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
 * Introspects storage buckets and their RLS policies.
 */
export async function introspectStorageBuckets(pool: Pool): Promise<StorageBucketMeta[]> {
  const client = await pool.connect();
  try {
    const buckets = await discoverStorageBuckets(client);
    const bucketsWithPolicies = await enrichBucketsWithPolicyInformation(client, buckets);
    
    return bucketsWithPolicies;
  } finally {
    client.release();
  }
}

/**
 * Discovers all storage buckets in the database.
 */
async function discoverStorageBuckets(client: PoolClient): Promise<Array<{bucket_id: string, name: string, public: boolean}>> {
  const bucketsQuery = `
    SELECT 
      id as bucket_id,
      name,
      public
    FROM storage.buckets 
    ORDER BY name;
  `;

  const { rows: buckets } = await client.query(bucketsQuery);
  return buckets;
}

/**
 * Enriches discovered buckets with detailed policy information.
 * Note: storage.objects policies are table-level, shared across all buckets.
 */
async function enrichBucketsWithPolicyInformation(
  client: PoolClient, 
  buckets: Array<{bucket_id: string, name: string, public: boolean}>
): Promise<StorageBucketMeta[]> {
  const enrichedBuckets: StorageBucketMeta[] = [];
  
  // Query storage.objects policies once (shared across all buckets)
  const sharedPolicies = await introspectPoliciesForStorageObjects(client);
  
  for (const bucket of buckets) {
    enrichedBuckets.push({
      bucket_id: bucket.bucket_id,
      name: bucket.name,
      policies: sharedPolicies,
      public: bucket.public,
    });
  }

  return enrichedBuckets;
}

/**
 * Introspects RLS policies for the storage.objects table.
 */
async function introspectPoliciesForStorageObjects(client: PoolClient): Promise<PolicyInfo[]> {
  const policiesQuery = createStoragePolicyIntrospectionQuery();
  const { rows: policies } = await client.query(policiesQuery);
  
  return policies.map(transformRawPolicyDataToStructured);
}

/**
 * Creates the SQL query for introspecting storage.objects policies.
 */
function createStoragePolicyIntrospectionQuery(): string {
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
    WHERE nsp.nspname = 'storage' AND cls.relname = 'objects'
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