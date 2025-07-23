import { Pool, PoolClient } from 'pg';
import type { DatabaseConnectionConfig, DatabaseRolePrivileges } from '../shared/types.js';
import { DEFAULT_CONNECTION_CONFIG } from '../shared/constants.js';

export interface ReadOnlyPool extends Pool {}

/**
 * Establishes a validated database connection pool with role privilege verification.
 * Ensures the connected role has appropriate permissions for safe RLS testing.
 */
export async function establishValidatedDatabaseConnection(
  connectionConfig: DatabaseConnectionConfig
): Promise<ReadOnlyPool> {
  logSanitizedConnectionAttempt(connectionConfig.url);
  
  try {
    const pool = await createDatabaseConnectionPool(connectionConfig);
    
    // The role validation is now always enabled by default for safety.
    await validateDatabaseRolePrivileges(pool);
    
    return pool;
  } catch (error) {
    throw handleDatabaseConnectionError(error);
  }
}

/**
 * Creates a PostgreSQL connection pool with the provided configuration.
 */
async function createDatabaseConnectionPool(
  config: DatabaseConnectionConfig
): Promise<ReadOnlyPool> {
  const pool = new Pool({
    connectionString: config.url,
    connectionTimeoutMillis: config.connection_timeout_ms,
    max: 10, // Maximum number of connections in pool
  });

  // Test the connection
  const client = await pool.connect();
  client.release();
  
  return pool;
}

/**
 * Validates that the current database role has appropriate privileges for safe testing.
 * Throws an error if the role has dangerous global privileges.
 */
async function validateDatabaseRolePrivileges(pool: Pool): Promise<void> {
  const client = await pool.connect();
  
  try {
    const privileges = await introspectCurrentRolePrivileges(client);
    
    if (shouldRejectRoleForSafetyReasons(privileges)) {
      throw createUnsafeRoleError(privileges);
    }
    
    logRoleValidationResult(privileges);
    
  } finally {
    client.release();
  }
}

/**
 * Introspects the current database role's privileges and returns detailed information.
 */
async function introspectCurrentRolePrivileges(client: PoolClient): Promise<DatabaseRolePrivileges> {
  const { rows } = await client.query<{
    has_global_dml: boolean;
    has_create: boolean;
    role: string;
    table_privileges: string[];
    is_superuser: boolean;
  }>(`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
        WHERE grantee = current_user 
        AND privilege_type IN ('INSERT','UPDATE','DELETE')
        AND table_schema = 'information_schema'
      ) AS has_global_dml,
      has_database_privilege(current_user, current_database(), 'CREATE') AS has_create,
      current_user AS role,
      ARRAY(
        SELECT DISTINCT table_schema || '.' || table_name
        FROM information_schema.role_table_grants
        WHERE grantee = current_user 
        AND privilege_type IN ('INSERT','UPDATE','DELETE')
        AND table_schema NOT IN ('information_schema', 'pg_catalog')
      ) AS table_privileges,
      usesuper AS is_superuser
    FROM pg_user 
    WHERE usename = current_user;
  `);

  const [row] = rows;

  return {
    role_name: row.role,
    has_global_dml: row.has_global_dml,
    has_create_privilege: row.has_create,
    table_specific_privileges: row.table_privileges || [],
    is_superuser: row.is_superuser || false,
  };
}

/**
 * Determines if a database role should be rejected for safety reasons.
 */
function shouldRejectRoleForSafetyReasons(privileges: DatabaseRolePrivileges): boolean {
  // Reject superusers and roles with dangerous global DML or CREATE privileges.
  return privileges.is_superuser || privileges.has_global_dml || privileges.has_create_privilege;
}

/**
 * Creates an appropriate error for unsafe database roles.
 */
function createUnsafeRoleError(privileges: DatabaseRolePrivileges): Error {
  let reason = 'it has dangerous global privileges.';
  if (privileges.is_superuser) {
    reason = 'it is a superuser.';
  }
  return new Error(
    `Role "${privileges.role_name}" is unsafe for testing because ${reason} ` +
    'Use a dedicated, non-superuser role with only table-specific DML privileges for testing.'
  );
}

/**
 * Logs the result of role validation with appropriate messaging.
 */
function logRoleValidationResult(privileges: DatabaseRolePrivileges): void {
  if (privileges.table_specific_privileges.length > 0) {
    console.log(
      `✅ Using testing role "${privileges.role_name}" with DML on: ${privileges.table_specific_privileges.join(', ')}`
    );
  } else {
    console.log(`✅ Using read-only role "${privileges.role_name}"`);
  }
}

/**
 * Logs connection attempt with sanitized URL (password hidden).
 */
function logSanitizedConnectionAttempt(url: string): void {
  const sanitizedUrl = url.replace(/:[^:@]*@/, ':***@');
  console.log(`🔗 Connecting to: ${sanitizedUrl}`);
}

/**
 * Handles and transforms database connection errors into user-friendly messages.
 */
function handleDatabaseConnectionError(error: unknown): Error {
  if (error instanceof Error) {
    if (error.message.includes('Invalid URL')) {
      return new Error(`Invalid connection string: ${error.message}`);
    }
    if (error.message.includes('ENOTFOUND')) {
      return new Error(`Database host not found. Please check your connection URL.`);
    }
    if (error.message.includes('authentication failed')) {
      return new Error(`Database authentication failed. Please check your credentials.`);
    }
  }
  
  return error instanceof Error ? error : new Error('Unknown database connection error');
}

/**
 * Creates a database connection configuration with defaults merged in.
 */
export function createDatabaseConnectionConfig(
  url: string, 
  overrides: Partial<DatabaseConnectionConfig> = {}
): DatabaseConnectionConfig {
  return {
    url,
    ...DEFAULT_CONNECTION_CONFIG,
    ...overrides,
  };
} 