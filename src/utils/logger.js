/**
 * Logger utility.
 * 
 * Provides structured logging with different log levels and prefixes
 * for system, security, ban, detection, and command events.
 * 
 * @module utils/logger
 */

function timestamp() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 19);
}

const isProduction = process.env.NODE_ENV === 'production' || !process.env.TERM_PROGRAM;

/**
 * Simple colored console logger with timestamps for production (Pterodactyl).
 */
const consoleLogger = {
    info: (msg) => console.log(`${timestamp()} \x1b[32m INFO \x1b[0m ${msg}`),
    warn: (msg) => console.warn(`${timestamp()} \x1b[33m WARN \x1b[0m ${msg}`),
    error: (msg, err) => console.error(`${timestamp()} \x1b[31m ERROR \x1b[0m ${msg}`, err?.message || err),
    fatal: (msg, err) => console.error(`${timestamp()} \x1b[31m FATAL \x1b[0m ${msg}`, err?.message || err),
    system: (msg) => console.log(`${timestamp()} \x1b[36m⚡ SYSTEM\x1b[0m ${msg}`),
    security: (msg) => console.log(`${timestamp()} \x1b[35m🛡️ SECURITY\x1b[0m ${msg}`),
    ban: (msg) => console.log(`${timestamp()} \x1b[31m🔨 BAN\x1b[0m ${msg}`),
    detection: (msg) => console.log(`${timestamp()} \x1b[33m⚠️ DETECTION\x1b[0m ${msg}`),
    command: (msg) => console.log(`${timestamp()} \x1b[34m📋 COMMAND\x1b[0m ${msg}`),
    debug: (msg) => console.log(`${timestamp()} \x1b[90m DEBUG \x1b[0m ${msg}`),
};

/**
 * Pino logger for development (pretty output).
 */
let pinoLogger;
if (!isProduction) {
    try {
        const pinoPretty = require('pino-pretty');
        pinoLogger = pino({
            level: process.env.LOG_LEVEL || 'debug',
            transport: {
                target: pinoPretty,
                options: {
                    colorize: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                },
            },
        });
    } catch {
        pinoLogger = null;
    }
}

// Use appropriate logger based on environment
const logger = isProduction ? consoleLogger : (pinoLogger || consoleLogger);

module.exports = {
    info: (msg) => logger.info(msg),
    warn: (msg) => logger.warn(msg),
    error: (msg, err) => logger.error(msg, err),
    fatal: (msg, err) => logger.fatal(msg, err),
    system: (msg) => logger.system(msg),
    security: (msg) => logger.security(msg),
    ban: (msg) => logger.ban(msg),
    detection: (msg) => logger.detection(msg),
    command: (msg) => logger.command(msg),
    debug: (msg) => logger.debug(msg),
};