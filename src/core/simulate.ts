import type { Pool, PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import type { ProbeResult, DatabaseOperation, ColumnIntrospectionResult } from '../shared/types.js';
import { 
  SQL_ERROR_CODES, 
  POSTGRESQL_SYSTEM_ROLES,
  COLUMN_TYPE_TEST_VALUES 
} from '../shared/constants.js';

/**
 * Tests if a specific database operation is allowed for a user with given JWT claims.
 * Uses transactional safety to ensure no data persists even if operations succeed.
 */
export async function executeRlsPolicyProbeForOperation(
  pool: Pool,
  schema: string,
  table: string,
  operation: DatabaseOperation,
  jwtClaims: Record<string, any>,
): Promise<ProbeResult> {
  const client = await pool.connect();
  
  try {
    await initializeTransactionalTestSession(client);
    await configureSessionForUserContext(client, jwtClaims);
    await createSavepointForOperationTest(client);
    
    const result = await attemptDatabaseOperationWithRlsEvaluation(
      client, 
      schema, 
      table, 
      operation
    );
    
    await rollbackToSavepointAfterTest(client);
    return result;
    
  } catch (error) {
    return 'ERROR';
  } finally {
    await rollbackEntireTransactionForCleanup(client);
    client.release();
  }
}

/**
 * Initializes a database transaction for safe testing.
 */
async function initializeTransactionalTestSession(client: PoolClient): Promise<void> {
  await client.query('BEGIN');
}

/**
 * Configures the database session with user context (JWT claims and role).
 */
async function configureSessionForUserContext(
  client: PoolClient, 
  jwtClaims: Record<string, any>
): Promise<void> {
  await setJwtClaimsInDatabaseSession(client, jwtClaims);
  await setUserRoleBasedOnJwtClaims(client, jwtClaims);
  await setLegacyRoleConfigurationIfNeeded(client, jwtClaims);
}

/**
 * Sets JWT claims in the database session for RLS policy evaluation.
 */
async function setJwtClaimsInDatabaseSession(
  client: PoolClient, 
  jwtClaims: Record<string, any>
): Promise<void> {
  const claimsJson = JSON.stringify(jwtClaims);
  await client.query('SELECT set_config($1, $2, true)', ['request.jwt.claims', claimsJson]);
}

/**
 * Sets the appropriate PostgreSQL role based on JWT claims.
 */
async function setUserRoleBasedOnJwtClaims(
  client: PoolClient, 
  jwtClaims: Record<string, any>
): Promise<void> {
  const roleToSet = determinePostgresqlRoleFromJwtClaims(jwtClaims);
  await client.query(`SET LOCAL ROLE ${roleToSet}`);
}

/**
 * Determines the appropriate PostgreSQL role based on JWT claims.
 */
function determinePostgresqlRoleFromJwtClaims(jwtClaims: Record<string, any>): string {
  if (jwtClaims.role === 'authenticated') {
    return POSTGRESQL_SYSTEM_ROLES.AUTHENTICATED;
  }
  return POSTGRESQL_SYSTEM_ROLES.ANONYMOUS;
}

/**
 * Sets legacy role configuration for backward compatibility.
 */
async function setLegacyRoleConfigurationIfNeeded(
  client: PoolClient, 
  jwtClaims: Record<string, any>
): Promise<void> {
  if (jwtClaims.role && jwtClaims.role !== 'authenticated') {
    await client.query('SELECT set_config($1, $2, true)', ['role', jwtClaims.role]);
  }
}

/**
 * Creates a savepoint for safe operation testing.
 */
async function createSavepointForOperationTest(client: PoolClient): Promise<void> {
  await client.query('SAVEPOINT test_probe');
}

/**
 * Rolls back to the savepoint after testing an operation.
 */
async function rollbackToSavepointAfterTest(client: PoolClient): Promise<void> {
  await client.query('ROLLBACK TO test_probe');
}

/**
 * Rolls back the entire transaction for cleanup.
 */
async function rollbackEntireTransactionForCleanup(client: PoolClient): Promise<void> {
  await client.query('ROLLBACK');
}

/**
 * Attempts a database operation and evaluates the result based on RLS policies.
 */
async function attemptDatabaseOperationWithRlsEvaluation(
  client: PoolClient,
  schema: string,
  table: string,
  operation: DatabaseOperation,
): Promise<ProbeResult> {
  const fullyQualifiedTableName = createFullyQualifiedTableName(schema, table);

  try {
    switch (operation) {
      case 'SELECT':
        return await executeSelectOperationAndEvaluateResult(client, fullyQualifiedTableName);
      
      case 'INSERT':
        return await executeInsertOperationAndEvaluateResult(client, schema, table, fullyQualifiedTableName);
      
      case 'UPDATE':
        return await executeUpdateOperationAndEvaluateResult(client, schema, table, fullyQualifiedTableName);
      
      case 'DELETE':
        return await executeDeleteOperationAndEvaluateResult(client, schema, table, fullyQualifiedTableName);
      
      default:
        return 'ERROR';
    }
  } catch (error: any) {
    return interpretDatabaseErrorAsProbeResult(error);
  }
}

/**
 * Creates a fully qualified table name for SQL queries.
 */
function createFullyQualifiedTableName(schema: string, table: string): string {
  return `"${schema}"."${table}"`;
}

/**
 * Executes a SELECT operation and evaluates the result.
 */
async function executeSelectOperationAndEvaluateResult(
  client: PoolClient, 
  fullyQualifiedTableName: string
): Promise<ProbeResult> {
  const result = await client.query(
    `SELECT * FROM ${fullyQualifiedTableName} LIMIT 1`
  );
  return result.rows.length > 0 ? 'ALLOW' : 'DENY';
}

/**
 * Introspects the primary key column(s) for a given table.
 */
async function introspectPrimaryKeyColumns(
  client: PoolClient,
  schema: string,
  table: string
): Promise<string[]> {
  const { rows } = await client.query(
    `
    SELECT kcu.column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema = $1
      AND tc.table_name = $2;
  `,
    [schema, table]
  );
  return rows.map((row: any) => row.column_name);
}

/**
 * Finds the primary key of the first row visible to the current user context.
 * This is used to create a safe, targeted UPDATE or DELETE operation.
 */
async function findTargetRowForMutation(
  client: PoolClient,
  schema: string,
  table: string,
  fullyQualifiedTableName: string
): Promise<{ pkColumns: string[]; pkValues: any[] } | null> {
  const pkColumns = await introspectPrimaryKeyColumns(client, schema, table);
  if (pkColumns.length === 0) {
    // We cannot safely test UPDATE/DELETE on a table without a primary key.
    // The operation would be ambiguous and could affect multiple rows.
    // This is a safeguard to prevent unintended side effects.
    throw new Error(
      `Cannot test UPDATE/DELETE on table ${fullyQualifiedTableName} because it has no primary key.`
    );
  }

  const pkSelect = pkColumns.map((col) => `"${col}"`).join(', ');
  const { rows } = await client.query(
    `SELECT ${pkSelect} FROM ${fullyQualifiedTableName} LIMIT 1`
  );

  if (rows.length === 0) {
    return null; // No rows are visible to this user, so we can't update/delete anything.
  }

  const pkValues = pkColumns.map((col) => rows[0][col]);
  return { pkColumns, pkValues };
}

/**
 * Executes an INSERT operation and evaluates the result.
 */
async function executeInsertOperationAndEvaluateResult(
  client: PoolClient,
  schema: string,
  table: string,
  fullyQualifiedTableName: string
): Promise<ProbeResult> {
  const columns = await introspectTableColumnsForInsertOperation(client, schema, table);
  
  if (columns.length === 0) return 'ERROR';

  const { columnNames, columnValues } = generateInsertStatementComponents(columns);
  
  if (columnNames.length > 0) {
    const insertSql = `INSERT INTO ${fullyQualifiedTableName} (${columnNames.join(', ')}) VALUES (${columnValues.join(', ')})`;
    await client.query(insertSql);
  } else {
    await client.query(`INSERT INTO ${fullyQualifiedTableName} DEFAULT VALUES`);
  }
  
  return 'ALLOW';
}

/**
 * Executes an UPDATE operation and evaluates the result.
 * It targets a single, visible row to avoid table scans and improve performance.
 */
async function executeUpdateOperationAndEvaluateResult(
  client: PoolClient,
  schema: string,
  table: string,
  fullyQualifiedTableName: string
): Promise<ProbeResult> {
  const targetRow = await findTargetRowForMutation(
    client,
    schema,
    table,
    fullyQualifiedTableName
  );
  if (!targetRow) {
    return 'DENY'; // No rows visible, so nothing can be updated.
  }

  const { pkColumns, pkValues } = targetRow;

  // Build a parameterized WHERE clause to safely target the specific row.
  const whereClause = pkColumns
    .map((col, i) => `"${col}" = $${i + 1}`)
    .join(' AND ');

  // We only need to check if the policy allows the update, so we perform
  // a no-op update on the primary key itself.
  const setClause = `"${pkColumns[0]}" = "${pkColumns[0]}"`;

  const result = await client.query(
    `UPDATE ${fullyQualifiedTableName} SET ${setClause} WHERE ${whereClause}`,
    pkValues
  );

  return (result.rowCount ?? 0) > 0 ? 'ALLOW' : 'DENY';
}

/**
 * Executes a DELETE operation and evaluates the result.
 * It targets a single, visible row to avoid table scans and improve performance.
 */
async function executeDeleteOperationAndEvaluateResult(
  client: PoolClient,
  schema: string,
  table: string,
  fullyQualifiedTableName: string
): Promise<ProbeResult> {
  const targetRow = await findTargetRowForMutation(
    client,
    schema,
    table,
    fullyQualifiedTableName
  );
  if (!targetRow) {
    return 'DENY'; // No rows visible, so nothing can be deleted.
  }

  const { pkColumns, pkValues } = targetRow;

  // Build a parameterized WHERE clause to safely target the specific row.
  const whereClause = pkColumns
    .map((col, i) => `"${col}" = $${i + 1}`)
    .join(' AND ');

  const result = await client.query(
    `DELETE FROM ${fullyQualifiedTableName} WHERE ${whereClause}`,
    pkValues
  );

  return (result.rowCount ?? 0) > 0 ? 'ALLOW' : 'DENY';
}

/**
 * Introspects table columns needed for INSERT operation testing.
 */
async function introspectTableColumnsForInsertOperation(
  client: PoolClient,
  schema: string,
  table: string
): Promise<ColumnIntrospectionResult[]> {
  const { rows: columns } = await client.query(`
    SELECT 
      column_name, 
      data_type, 
      is_nullable, 
      column_default,
      CASE 
        WHEN column_name IN (
          SELECT column_name 
          FROM information_schema.key_column_usage 
          WHERE table_schema = $1 AND table_name = $2
        ) THEN true 
        ELSE false 
      END as is_primary_key
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2 
    ORDER BY ordinal_position
  `, [schema, table]);

  return columns.map((col: any): ColumnIntrospectionResult => ({
    column_name: col.column_name,
    data_type: col.data_type,
    is_nullable: col.is_nullable === 'YES',
    column_default: col.column_default,
    is_primary_key: col.is_primary_key,
  }));
}

/**
 * Generates column names and values for INSERT statement based on column introspection.
 */
function generateInsertStatementComponents(
  columns: ColumnIntrospectionResult[]
): { columnNames: string[]; columnValues: string[] } {
  const columnNames: string[] = [];
  const columnValues: string[] = [];
  
  for (const column of columns) {
    if (column.column_default !== null) continue; // Skip columns with defaults
    
    columnNames.push(`"${column.column_name}"`);
    columnValues.push(generateTestValueForColumn(column));
  }
  
  return { columnNames, columnValues };
}

/**
 * Generates appropriate test values for different column types.
 */
function generateTestValueForColumn(column: ColumnIntrospectionResult): string {
  if (column.column_name === 'id' && column.data_type === 'uuid') {
    return COLUMN_TYPE_TEST_VALUES.UUID();
  }
  
  if (column.column_name === 'user_id' && column.data_type === 'uuid') {
    return COLUMN_TYPE_TEST_VALUES.UUID();
  }
  
  if (column.data_type === 'uuid') {
    return COLUMN_TYPE_TEST_VALUES.UUID_RANDOM();
  }
  
  if (column.data_type.includes('text') || column.data_type.includes('varchar')) {
    return COLUMN_TYPE_TEST_VALUES.TEXT;
  }
  
  if (column.data_type.includes('int') || column.data_type.includes('numeric')) {
    return COLUMN_TYPE_TEST_VALUES.INTEGER;
  }
  
  if (column.data_type.includes('bool')) {
    return COLUMN_TYPE_TEST_VALUES.BOOLEAN;
  }
  
  return COLUMN_TYPE_TEST_VALUES.DEFAULT;
}

/**
 * Interprets database errors and converts them to appropriate ProbeResult values.
 */
function interpretDatabaseErrorAsProbeResult(error: any): ProbeResult {
  if (isRlsPolicyViolationError(error)) {
    return 'DENY';
  }
  
  if (isDuplicateKeyError(error)) {
    return 'ALLOW'; // RLS allowed the operation, just data already exists
  }
  
  return 'ALLOW'; // Other errors still mean the operation was attempted
}

/**
 * Determines if an error is an RLS policy violation.
 */
function isRlsPolicyViolationError(error: any): boolean {
  return error.code === SQL_ERROR_CODES.PERMISSION_DENIED || 
         error.message?.includes('permission denied') || 
         error.message?.includes('policy');
}

/**
 * Determines if an error is a duplicate key constraint violation.
 */
function isDuplicateKeyError(error: any): boolean {
  return error.code === SQL_ERROR_CODES.DUPLICATE_KEY;
} 