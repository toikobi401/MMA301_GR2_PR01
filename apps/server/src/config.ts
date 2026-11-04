import { serverEnvSchema, type ServerEnv } from '@app/shared';

/**
 * Parse and freeze configuration at boot. A missing or malformed variable
 * kills the process here with a readable message rather than surfacing as a
 * confusing failure deep inside a request handler.
 */
function loadConfig(): ServerEnv {
  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    console.error(`Invalid server environment:\n${issues}\n`);
    process.exit(1);
  }

  return parsed.data;
}

export const config = loadConfig();
export const isProduction = config.NODE_ENV === 'production';
export const isDevelopment = config.NODE_ENV === 'development';
