import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }),
  base: {
    service: 'payroll-builder',
    version: process.env.npm_package_version || '0.1.0',
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.secret',
      '*.token',
      '*.encryptedAmount',
      '*.employeeSecret',
    ],
    censor: '[REDACTED]',
  },
});

export const childLogger = (context: Record<string, unknown>) => logger.child(context);

export default logger;
