const chalk = {
    // ANSI color codes for terminal output
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    blue: (text) => `\x1b[34m${text}\x1b[0m`,
    magenta: (text) => `\x1b[35m${text}\x1b[0m`,
    cyan: (text) => `\x1b[36m${text}\x1b[0m`,
    gray: (text) => `\x1b[90m${text}\x1b[0m`,
    bold: (text) => `\x1b[1m${text}\x1b[0m`,
    bgRed: (text) => `\x1b[41m\x1b[37m${text}\x1b[0m`,
    bgGreen: (text) => `\x1b[42m\x1b[30m${text}\x1b[0m`,
    bgYellow: (text) => `\x1b[43m\x1b[30m${text}\x1b[0m`,
};

function timestamp() {
    return chalk.gray(new Date().toISOString().replace('T', ' ').substring(0, 19));
}

const logger = {
    info(message) {
        console.log(`${timestamp()} ${chalk.bgGreen(' INFO ')} ${message}`);
    },

    warn(message) {
        console.warn(`${timestamp()} ${chalk.bgYellow(' WARN ')} ${chalk.yellow(message)}`);
    },

    error(message, error = null) {
        console.error(`${timestamp()} ${chalk.bgRed(' ERROR ')} ${chalk.red(message)}`);
        if (error?.stack) {
            console.error(chalk.gray(error.stack));
        }
    },

    fatal(message, error = null) {
        console.error(`${timestamp()} ${chalk.bgRed(' FATAL ')} ${chalk.bold(chalk.red(message))}`);
        if (error?.stack) {
            console.error(chalk.gray(error.stack));
        }
    },

    system(message) {
        console.log(`${timestamp()} ${chalk.cyan('⚡ SYSTEM')} ${chalk.bold(message)}`);
    },

    security(message) {
        console.log(`${timestamp()} ${chalk.magenta('🛡️  SECURITY')} ${message}`);
    },

    ban(message) {
        console.log(`${timestamp()} ${chalk.red('🔨 BAN')} ${chalk.bold(message)}`);
    },

    detection(message) {
        console.log(`${timestamp()} ${chalk.yellow('⚠️  DETECTION')} ${message}`);
    },

    command(message) {
        console.log(`${timestamp()} ${chalk.blue('📋 COMMAND')} ${message}`);
    },

    debug(message) {
        if (process.env.DEBUG === 'true') {
            console.log(`${timestamp()} ${chalk.gray(' DEBUG ')} ${chalk.gray(message)}`);
        }
    },
};

module.exports = logger;
