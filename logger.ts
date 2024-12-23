import * as fs from 'fs';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogOptions {
    enabled: boolean;
    level: LogLevel;
    outputFile?: string;
}

class Logger {
    private static instance: Logger;
    private options: LogOptions;

    private constructor(options: LogOptions) {
        this.options = options;
    }

    public static getInstance(options?: Partial<LogOptions>): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger({
                enabled: options?.enabled ?? false,
                level: options?.level ?? 'error',
                outputFile: options?.outputFile
            });
        }
        return Logger.instance;
    }

    private shouldLog(level: LogLevel): boolean {
        if (!this.options.enabled) return false;
        
        const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
        return levels.indexOf(level) >= levels.indexOf(this.options.level);
    }

    private formatError(error: any): string {
        if (error instanceof Error) {
            return `${error.name}: ${error.message}\nStack: ${error.stack}`;
        } else if (typeof error === 'object') {
            try {
                return JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
            } catch {
                return `[Unserializable object: ${Object.prototype.toString.call(error)}]`;
            }
        }
        return String(error);
    }

    private formatMessage(level: LogLevel, ...args: any[]): string {
        const timestamp = new Date().toISOString();
        const message = args.map(arg => {
            if (arg instanceof Error || (arg && arg.message && arg.stack)) {
                return this.formatError(arg);
            }
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch {
                    return `[Unserializable object: ${Object.prototype.toString.call(arg)}]`;
                }
            }
            return String(arg);
        }).join(' ');
        return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    }

    public debug(...args: any[]): void {
        if (this.shouldLog('debug')) {
            this.writeToFile(this.formatMessage('debug', ...args));
        }
    }

    public info(...args: any[]): void {
        if (this.shouldLog('info')) {
            this.writeToFile(this.formatMessage('info', ...args));
        }
    }

    public warn(...args: any[]): void {
        if (this.shouldLog('warn')) {
            this.writeToFile(this.formatMessage('warn', ...args));
        }
    }

    public error(...args: any[]): void {
        if (this.shouldLog('error')) {
            this.writeToFile(this.formatMessage('error', ...args));
        }
    }

    private writeToFile(message: string): void {
        if (this.options.outputFile) {
            fs.appendFileSync(this.options.outputFile, message + '\n');
        }
    }
}

// Create a custom console replacement
const customConsole = {
    log: (...args: any[]) => Logger.getInstance().info(...args),
    info: (...args: any[]) => Logger.getInstance().info(...args),
    warn: (...args: any[]) => Logger.getInstance().warn(...args),
    error: (...args: any[]) => Logger.getInstance().error(...args),
    debug: (...args: any[]) => Logger.getInstance().debug(...args),
    // Add no-op implementations for other console methods
    trace: () => {},
    assert: () => {},
    clear: () => {},
    count: () => {},
    countReset: () => {},
    group: () => {},
    groupEnd: () => {},
    table: () => {},
    time: () => {},
    timeEnd: () => {},
    timeLog: () => {},
    dir: () => {},
    dirxml: () => {},
    profile: () => {},
    profileEnd: () => {},
    timeStamp: () => {},
    context: () => {},
    memory: undefined
};

export function setupGlobalLogger(options?: Partial<LogOptions>): void {
    Logger.getInstance(options);
    
    // Completely replace the console object
    (global as any).console = customConsole;
}

export { Logger };