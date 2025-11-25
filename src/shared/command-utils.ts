import type { Pool } from 'pg';
import { createDatabaseConnectionConfig, establishValidatedDatabaseConnection } from '../core/db.js';
import { createLogger, Logger } from './logger.js';

export interface CommandContext {
  pool: Pool;
  logger: Logger;
  dbUrl: string;
}

export interface CommandOptions {
  url?: string;
  verbose?: boolean;
}

export function resolveDbUrl(options: CommandOptions): string | undefined {
  return options.url || process.env.SUPASHIELD_DATABASE_URL || process.env.DATABASE_URL;
}

export async function withDatabaseConnection<T>(
  options: CommandOptions,
  handler: (ctx: CommandContext) => Promise<T>
): Promise<T> {
  const logger = createLogger(options.verbose);
  const dbUrl = resolveDbUrl(options);

  if (!dbUrl) {
    logger.error('Database URL is required. Use --url or set SUPASHIELD_DATABASE_URL env var.');
    process.exit(1);
  }

  try {
    logger.start('Connecting to database...');
    const connectionConfig = createDatabaseConnectionConfig(dbUrl);
    const pool = await establishValidatedDatabaseConnection(connectionConfig);
    logger.succeed('Connected to database.');

    const result = await handler({ pool, logger, dbUrl });

    await pool.end();
    return result;

  } catch (error) {
    logger.error('An unexpected error occurred.', error);
    process.exit(1);
  }
}

export function createCommandLogger(verbose = false): Logger {
  return createLogger(verbose);
}

