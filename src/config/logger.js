/**
 * Tiny logger.
 * We do not add a logging library yet: console output with a level and an ISO
 * timestamp is enough for development, and it keeps the dependency list small.
 * Later we can swap this file for pino without touching the callers.
 */

const isProduction = process.env.NODE_ENV === 'production';

function stamp() {
  return new Date().toISOString();
}

function write(level, args) {
  const line = `[${stamp()}] [${level}]`;
  if (level === 'ERROR') console.error(line, ...args);
  else if (level === 'WARN') console.warn(line, ...args);
  else console.log(line, ...args);
}

export const logger = {
  info: (...args) => write('INFO', args),
  warn: (...args) => write('WARN', args),
  error: (...args) => write('ERROR', args),
  /** Debug noise stays out of production logs. */
  debug: (...args) => {
    if (!isProduction) write('DEBUG', args);
  },
};
