/**
 * NestJS-style logger built on winston.
 *   [Afion] 12345  09/09/2026, 2:15:01 pm     LOG [UsersService] User created · uid=rakesh
 * Console gets colours; logs/ gets daily-appended JSON files for grepping.
 */
const winston = require('winston');
const path = require('path');

const COLORS = { error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[32m', http: '\x1b[35m', debug: '\x1b[36m' };
const RESET = '\x1b[0m', YELLOW = '\x1b[33m', DIM = '\x1b[2m';
const LEVEL_LABEL = { error: 'ERROR', warn: 'WARN', info: 'LOG', http: 'HTTP', debug: 'DEBUG' };

const nestLine = winston.format.printf(({ level, message, context, timestamp, stack }) => {
  const c = COLORS[level] || '';
  const ts = new Date(timestamp).toLocaleString('en-IN', { hour12: true });
  const ctx = context ? `${YELLOW}[${context}]${RESET} ` : '';
  const base = `${c}[Afion] ${process.pid}${RESET}  ${DIM}${ts}${RESET}  ${c}${(LEVEL_LABEL[level] || level).padStart(5)}${RESET} ${ctx}${c}${message}${RESET}`;
  return stack ? `${base}\n${stack}` : base;
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  levels: { error: 0, warn: 1, info: 2, http: 3, debug: 4 },
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
  ),
  transports: [
    new winston.transports.Console({ format: nestLine }),
    new winston.transports.File({
      filename: path.join(__dirname, '../../../logs/app.log'),
      format: winston.format.json(),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../../../logs/error.log'),
      level: 'error',
      format: winston.format.json(),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

/** Usage: const log = logger.child({ context: 'UsersService' }); log.info('...') */
module.exports = logger;
