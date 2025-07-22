import type { Pool, PoolClient } from 'pg';

export type ProbeResult = 'ALLOW' | 'DENY' | 'ERROR';

/**
 * Tests if a specific operation is allowed for a user on a table.
 * Uses SAVEPOINT to ensure no data persists even if the operation succeeds.
 */
export async function probe(
  pool: Pool,
  schema: string,
  table: string,
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE',
  jwtClaims: Record<string, any>,
): Promise<ProbeResult> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Set JWT context for RLS
    if (Object.keys(jwtClaims).length > 0) {
      const claimsJson = JSON.stringify(jwtClaims);
      await client.query('SELECT set_config($1, $2, true)', ['request.jwt.claims', claimsJson]);
      
      // Set role if specified in claims
      if (jwtClaims.role) {
        await client.query('SELECT set_config($1, $2, true)', ['role', jwtClaims.role]);
      }
    }

    await client.query('SAVEPOINT test_probe');

    const result = await executeOperation(client, schema, table, operation);
    
    await client.query('ROLLBACK TO test_probe');
    return result;
    
  } catch (error) {
    return 'ERROR';
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

async function executeOperation(
  client: PoolClient,
  schema: string,
  table: string,
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE',
): Promise<ProbeResult> {
  const fullTable = `"${schema}"."${table}"`;
  
  try {
    switch (operation) {
      case 'SELECT':
        await client.query(`SELECT 1 FROM ${fullTable} LIMIT 1`);
        return 'ALLOW';
        
      case 'INSERT': {
        // Get column info to build a minimal INSERT
        const { rows: columns } = await client.query(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns 
          WHERE table_schema = $1 AND table_name = $2
          AND column_default IS NULL
          ORDER BY ordinal_position
          LIMIT 5
        `, [schema, table]);
        
        if (columns.length === 0) return 'ERROR';
        
        const columnNames = columns.map(c => `"${c.column_name}"`).join(', ');
        const placeholders = columns.map(() => 'DEFAULT').join(', ');
        
        await client.query(`INSERT INTO ${fullTable} (${columnNames}) VALUES (${placeholders})`);
        return 'ALLOW';
      }
      
      case 'UPDATE':
        // Try to update a single row (may affect 0 rows but tests policy)
        await client.query(`UPDATE ${fullTable} SET ctid = ctid WHERE ctid = '(0,1)'`);
        return 'ALLOW';
        
      case 'DELETE':
        // Try to delete with impossible condition (tests policy without deleting)
        await client.query(`DELETE FROM ${fullTable} WHERE false`);
        return 'ALLOW';
        
      default:
        return 'ERROR';
    }
  } catch (error: any) {
    // Check if it's a permission error (RLS blocked it)
    if (error.code === '42501' || error.message?.includes('permission denied')) {
      return 'DENY';
    }
    // Other errors (constraint violations, etc.) still mean the policy allowed it
    return 'ALLOW';
  }
} 