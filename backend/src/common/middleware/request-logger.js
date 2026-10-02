const logger = require('../logger/logger');
const log = logger.child({ context: 'HTTP' });

/** NestJS-flavoured request log: METHOD /path 200 12ms · uid */
module.exports = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const who = req.user ? ` · ${req.user.uid}` : '';
    const line = `${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(0)}ms${who}`;
    if (res.statusCode >= 500) log.error(line);
    else if (res.statusCode >= 400) log.warn(line);
    else log.http(line);
  });
  next();
};
