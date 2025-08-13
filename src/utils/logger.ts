/**
 * Logger utility for Element Tagger
 * Provides structured logging with different levels and formatting
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    module: string;
    message: string;
    data?: any;
    error?: Error;
}

export interface LoggerConfig {
    level?: LogLevel;
    enableColors?: boolean;
    enableTimestamp?: boolean;
    prefix?: string;
    onLog?: (entry: LogEntry) => void;
}

/**
 * Color codes for console output
 */
const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    magenta: '\x1b[35m',
    gray: '\x1b[90m'
} as const;

/**
 * Log level priorities for filtering
 */
const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    silent: 4
};

/**
 * Logger class for structured logging
 */
export class Logger {
    private readonly module: string;
    private readonly config: Required<LoggerConfig>;
    private static globalConfig: LoggerConfig = {
        level: 'info',
        enableColors: true,
        enableTimestamp: true
    };

    constructor(module: string, config: LoggerConfig = {}) {
        this.module = module;
        this.config = {
            level: config.level || Logger.globalConfig.level || 'info',
            enableColors: config.enableColors ?? Logger.globalConfig.enableColors ?? true,
            enableTimestamp: config.enableTimestamp ?? Logger.globalConfig.enableTimestamp ?? true,
            prefix: config.prefix || Logger.globalConfig.prefix || '',
            onLog: config.onLog || Logger.globalConfig.onLog || (() => { })
        };
    }

    /**
     * Set global logger configuration
     */
    static configure(config: LoggerConfig): void {
        Logger.globalConfig = { ...Logger.globalConfig, ...config };
    }

    /**
     * Create a child logger with the same config
     */
    child(module: string): Logger {
        return new Logger(module, this.config);
    }

    /**
     * Debug level logging
     */
    debug(message: string, data?: any): void {
        this.log('debug', message, data);
    }

    /**
     * Info level logging
     */
    info(message: string, data?: any): void {
        this.log('info', message, data);
    }

    /**
     * Warning level logging
     */
    warn(message: string, data?: any): void {
        this.log('warn', message, data);
    }

    /**
     * Error level logging
     */
    error(message: string, error?: Error | any): void {
        if (error instanceof Error) {
            this.log('error', message, undefined, error);
        } else {
            this.log('error', message, error);
        }
    }

    /**
     * Core logging method
     */
    private log(level: LogLevel, message: string, data?: any, error?: Error): void {
        // Check if log level should be output
        if (LOG_LEVELS[level] < LOG_LEVELS[this.config.level]) {
            return;
        }

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            module: this.module,
            message,
            data,
            error
        };

        // Call custom log handler if provided
        this.config.onLog(entry);

        // Output to console
        this.outputToConsole(entry);
    }

    /**
     * Output log entry to console with formatting
     */
    private outputToConsole(entry: LogEntry): void {
        const parts: string[] = [];

        // Timestamp
        if (this.config.enableTimestamp) {
            const time = new Date(entry.timestamp).toLocaleTimeString();
            parts.push(this.colorize(time, 'gray'));
        }

        // Prefix
        if (this.config.prefix) {
            parts.push(this.colorize(`[${this.config.prefix}]`, 'cyan'));
        }

        // Level
        const levelColor = this.getLevelColor(entry.level);
        const levelText = entry.level.toUpperCase().padEnd(5);
        parts.push(this.colorize(levelText, levelColor));

        // Module
        parts.push(this.colorize(`[${entry.module}]`, 'blue'));

        // Message
        parts.push(entry.message);

        const logLine = parts.join(' ');

        // Output based on level
        switch (entry.level) {
            case 'error':
                console.error(logLine);
                if (entry.error) {
                    console.error(entry.error);
                }
                break;
            case 'warn':
                console.warn(logLine);
                break;
            case 'debug':
                console.debug(logLine);
                break;
            default:
                console.log(logLine);
        }

        // Output additional data if present
        if (entry.data !== undefined) {
            console.log(this.colorize('  Data:', 'dim'), entry.data);
        }
    }

    /**
     * Apply color to text if colors are enabled
     */
    private colorize(text: string, color: keyof typeof COLORS): string {
        if (!this.config.enableColors) {
            return text;
        }
        return `${COLORS[color]}${text}${COLORS.reset}`;
    }

    /**
     * Get color for log level
     */
    private getLevelColor(level: LogLevel): keyof typeof COLORS {
        switch (level) {
            case 'error':
                return 'red';
            case 'warn':
                return 'yellow';
            case 'info':
                return 'green';
            case 'debug':
                return 'cyan';
            default:
                return 'reset';
        }
    }

    /**
     * Check if a log level is enabled
     */
    isLevelEnabled(level: LogLevel): boolean {
        return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
    }

    /**
     * Create a timer for performance logging
     */
    time(label: string): () => void {
        const start = Date.now();
        return () => {
            const duration = Date.now() - start;
            this.debug(`${label} completed in ${duration}ms`);
        };
    }

    /**
     * Log with performance timing
     */
    withTiming<T>(label: string, fn: () => T): T;
    withTiming<T>(label: string, fn: () => Promise<T>): Promise<T>;
    withTiming<T>(label: string, fn: () => T | Promise<T>): T | Promise<T> {
        const timer = this.time(label);
        const result = fn();

        if (result instanceof Promise) {
            return result.finally(timer);
        } else {
            timer();
            return result;
        }
    }

    /**
     * Create a scoped logger for a specific operation
     */
    scope(operation: string): Logger {
        return new Logger(`${this.module}:${operation}`, this.config);
    }
}

/**
 * Default logger instance
 */
export const logger = new Logger('ElementTagger');

/**
 * Create a logger for a specific module
 */
export function createLogger(module: string, config?: LoggerConfig): Logger {
    return new Logger(module, config);
}

/**
 * Configure global logging
 */
export function configureLogging(config: LoggerConfig): void {
    Logger.configure(config);
}