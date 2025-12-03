/**
 * Logging utility for OCR-First Pipeline
 * Provides consistent logging across all modules
 */

const { LOG_CONFIG } = require('../config');

const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

const LOG_LEVEL_NAMES = {
    0: 'ERROR',
    1: 'WARN',
    2: 'INFO',
    3: 'DEBUG'
};

const COLORS = {
    ERROR: '\x1b[31m', // Red
    WARN: '\x1b[33m',  // Yellow
    INFO: '\x1b[36m',  // Cyan
    DEBUG: '\x1b[35m', // Magenta
    RESET: '\x1b[0m'   // Reset
};

class Logger {
    constructor(module = 'APP') {
        this.module = module;
        this.currentLevel = LOG_LEVELS[LOG_CONFIG.LEVEL.toUpperCase()] || LOG_LEVELS.INFO;
    }

    _format(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const levelName = LOG_LEVEL_NAMES[level];
        const color = COLORS[levelName];

        if (LOG_CONFIG.FORMAT === 'json') {
            return JSON.stringify({
                timestamp,
                level: levelName,
                module: this.module,
                message,
                data
            });
        }

        let output = `${color}[${levelName}]${COLORS.RESET} [${timestamp}] [${this.module}] ${message}`;
        if (data) {
            output += `\n${JSON.stringify(data, null, 2)}`;
        }
        return output;
    }

    error(message, data = null) {
        if (this.currentLevel >= LOG_LEVELS.ERROR) {
            console.error(this._format(LOG_LEVELS.ERROR, message, data));
        }
    }

    warn(message, data = null) {
        if (this.currentLevel >= LOG_LEVELS.WARN) {
            console.warn(this._format(LOG_LEVELS.WARN, message, data));
        }
    }

    info(message, data = null) {
        if (this.currentLevel >= LOG_LEVELS.INFO) {
            console.log(this._format(LOG_LEVELS.INFO, message, data));
        }
    }

    debug(message, data = null) {
        if (this.currentLevel >= LOG_LEVELS.DEBUG) {
            console.log(this._format(LOG_LEVELS.DEBUG, message, data));
        }
    }
}

module.exports = Logger;
