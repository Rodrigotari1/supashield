import type { Pool, PoolClient } from 'pg';
import { randomUUID } from 'crypto';

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
    
    // Set JWT context for RLS - this is the critical fix
    const claimsJson = JSON.stringify(jwtClaims);
    await client.query('SELECT set_config($1, $2, true)', ['request.jwt.claims', claimsJson]);
    
    // Set role based on JWT claims - this is crucial for TO authenticated policies
    if (jwtClaims.role === 'authenticated') {
      await client.query('SET LOCAL ROLE authenticated');
    } else {
      // For anonymous users, use anon role
      await client.query('SET LOCAL ROLE anon');
    }
    
    // Set role if specified in claims (legacy - keep for compatibility)
    if (jwtClaims.role && jwtClaims.role !== 'authenticated') {
      await client.query('SELECT set_config($1, $2, true)', ['role', jwtClaims.role]);
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
      case 'SELECT': {
        // Test actual data access, not just dummy query
        const result = await client.query(`SELECT * FROM ${fullTable} LIMIT 1`);
        return result.rows.length > 0 ? 'ALLOW' : 'DENY';
      }
      
      case 'INSERT': {
        // Try to insert a test record
        const { rows: columns } = await client.query(`
          SELECT column_name, data_type, is_nullable, column_default 
          FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2 
          ORDER BY ordinal_position
        `, [schema, table]);

        if (columns.length === 0) return 'ERROR';

        // Build INSERT with appropriate test values
        const insertColumns: string[] = [];
        const insertValues: string[] = [];
        
        for (const col of columns) {
          if (col.column_default !== null) continue; // Skip columns with defaults
          
          insertColumns.push(`"${col.column_name}"`);
          
          // Use appropriate test values based on column type
          if (col.column_name === 'id' && col.data_type === 'uuid') {
            // For primary key id columns, use auth.uid() to match RLS policies
            insertValues.push('auth.uid()');
          } else if (col.column_name === 'user_id' && col.data_type === 'uuid') {
            insertValues.push('auth.uid()');
          } else if (col.data_type === 'uuid') {
            insertValues.push(`'${randomUUID()}'`);
          } else if (col.data_type.includes('text') || col.data_type.includes('varchar')) {
            insertValues.push("'test'");
          } else if (col.data_type.includes('int') || col.data_type.includes('numeric')) {
            insertValues.push('1');
          } else if (col.data_type.includes('bool')) {
            insertValues.push('true');
          } else {
            insertValues.push('DEFAULT');
          }
        }

        if (insertColumns.length > 0) {
          await client.query(`INSERT INTO ${fullTable} (${insertColumns.join(', ')}) VALUES (${insertValues.join(', ')})`);
        } else {
          await client.query(`INSERT INTO ${fullTable} DEFAULT VALUES`);
        }
        return 'ALLOW';
      }

      case 'UPDATE': {
        // Try to update existing records - use a simple update that should trigger RLS
        const res = await client.query(`UPDATE ${fullTable} SET id = id WHERE true`);
        const affected = res.rowCount ?? 0;
        return affected > 0 ? 'ALLOW' : 'DENY';
      }

      case 'DELETE': {
        // Try to delete with a condition that might match - RLS should block if not allowed
        const res = await client.query(`DELETE FROM ${fullTable} WHERE 1=1`);
        const del = res.rowCount ?? 0;
        return del > 0 ? 'ALLOW' : 'DENY';
      }

      default:
        return 'ERROR';
    }
  } catch (error: any) {
    if (error.code === '42501' || error.message?.includes('permission denied') || error.message?.includes('policy')) {
      return 'DENY';
    }
    // Duplicate key errors mean RLS allowed the operation, just data already exists
    if (error.code === '23505') {
      return 'ALLOW';
    }
    return 'ALLOW'; // Other errors (like syntax errors) still mean the operation was attempted
  }
} 