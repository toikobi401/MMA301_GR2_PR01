import postgres from 'postgres';
import { config, isProduction } from '../config.js';

/**
 * Single Postgres pool for the process. `postgres` uses tagged templates,
 * which parameterise values automatically — string interpolation into SQL is
 * not possible by accident here.
 */
export const sql = postgres(config.DATABASE_URL, {
  max: isProduction ? 20 : 5,
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: isProduction ? () => {} : undefined,
});

export async function pingDatabase(): Promise<boolean> {
  try {
    await sql`select 1`;
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabase(): Promise<void> {
  await sql.end({ timeout: 5 });
}
