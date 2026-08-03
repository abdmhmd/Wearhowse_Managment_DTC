import { env } from './env';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  metadata?: Record<string, any>;
}

function formatEntry(entry: LogEntry): string {
  const base = `[${entry.timestamp}] ${entry.level.toUpperCase()}`;
  const ctx = entry.context ? ` [${entry.context}]` : '';
  const meta = entry.metadata ? ` ${JSON.stringify(entry.metadata)}` : '';
  return `${base}${ctx} ${entry.message}${meta}`;
}

function log(level: LogLevel, message: string, context?: string, metadata?: Record<string, any>) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
    metadata,
  };

  const formatted = formatEntry(entry);

  if (level === 'error') {
    console.error(formatted);
  } else if (level === 'warn') {
    console.warn(formatted);
  } else {
    console.log(formatted);
  }
}

export const logger = {
  error: (message: string, context?: string, metadata?: Record<string, any>) => log('error', message, context, metadata),
  warn: (message: string, context?: string, metadata?: Record<string, any>) => log('warn', message, context, metadata),
  info: (message: string, context?: string, metadata?: Record<string, any>) => log('info', message, context, metadata),
  debug: (message: string, context?: string, metadata?: Record<string, any>) => {
    if (env.NODE_ENV === 'development') {
      log('debug', message, context, metadata);
    }
  },
};
