import type { Pool } from 'pg';
import { discoverAllTables } from './introspect.js';
import { executeRlsPolicyProbeForOperation } from './simulate.js';
import type { DatabaseOperation, ProbeResult } from '../shared/types.js';

export interface CoverageReport {
  tables: TableCoverage[];
}

export interface TableCoverage {
  schema: string;
  name: string;
  rls_enabled: boolean;
  access: {
    anonymous: RoleAccess;
    authenticated: RoleAccess;
  };
}

export interface RoleAccess {
  SELECT: ProbeResult;
  INSERT: ProbeResult;
  UPDATE: ProbeResult;
  DELETE: ProbeResult;
}

const OPERATIONS: DatabaseOperation[] = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

const DEFAULT_CLAIMS = {
  anonymous: { role: 'anon' },
  authenticated: { 
    role: 'authenticated', 
    sub: '00000000-0000-0000-0000-000000000000',
    email: 'test@example.com'
  }
};

export async function generateCoverageReport(
  pool: Pool, 
  options: { includeSystemSchemas?: boolean } = {}
): Promise<CoverageReport> {
  const client = await pool.connect();
  
  try {
    const allTables = await discoverAllTables(client, options.includeSystemSchemas);
    const report: CoverageReport = { tables: [] };

    // Sort tables by schema then name
    allTables.sort((a, b) => {
      if (a.schema !== b.schema) return a.schema.localeCompare(b.schema);
      return a.name.localeCompare(b.name);
    });

    for (const table of allTables) {
      const tableCoverage: TableCoverage = {
        schema: table.schema,
        name: table.name,
        rls_enabled: table.rls_enabled,
        access: {
          anonymous: createEmptyAccess(),
          authenticated: createEmptyAccess(),
        }
      };

      if (!table.rls_enabled) {
        // If RLS is disabled, access is typically allowed for everyone
        // (Subject to table permissions, but for RLS tools we assume RLS disabled = OPEN)
        tableCoverage.access.anonymous = createFullAccess();
        tableCoverage.access.authenticated = createFullAccess();
      } else {
        // Check Anonymous
        for (const op of OPERATIONS) {
          tableCoverage.access.anonymous[op] = await executeRlsPolicyProbeForOperation(
            pool,
            table.schema,
            table.name,
            op,
            DEFAULT_CLAIMS.anonymous
          );
        }

        // Check Authenticated
        for (const op of OPERATIONS) {
          tableCoverage.access.authenticated[op] = await executeRlsPolicyProbeForOperation(
            pool,
            table.schema,
            table.name,
            op,
            DEFAULT_CLAIMS.authenticated
          );
        }
      }

      report.tables.push(tableCoverage);
    }

    return report;

  } finally {
    client.release();
  }
}

function createEmptyAccess(): RoleAccess {
  return {
    SELECT: 'DENY',
    INSERT: 'DENY',
    UPDATE: 'DENY',
    DELETE: 'DENY'
  };
}

function createFullAccess(): RoleAccess {
  return {
    SELECT: 'ALLOW',
    INSERT: 'ALLOW',
    UPDATE: 'ALLOW',
    DELETE: 'ALLOW'
  };
}

