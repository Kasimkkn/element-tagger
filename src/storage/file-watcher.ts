import { EventEmitter } from 'events';
import chokidar from 'chokidar';
import { stat } from 'fs-extra';
import { resolve, relative } from 'path';
import type { ElementTaggerOptions } from '../types/config';
import { Logger } from '../utils/logger';

/**
 * File change event data
 */
export interface FileChangeEvent {
    type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
    filePath: string;
    relativePath: string;
    timestamp: string;
    stats?: {
        size: number;
        mtime: Date;
        isFile: boolean;
        isDirectory: boolean;
    };
}

/**
 * File watcher configuration
 */
export interface FileWatcherConfig {
    /** Patterns to watch */
    watchPatterns?: string[];

    /** Patterns to ignore */
    ignorePatterns?: string[];

    /** Watch options */
    watchOptions?: {
        /** Ignore initial scan */
        ignoreInitial?: boolean;

        /** Enable persistent watching */
        persistent?: boolean;

        /** Follow symlinks */
        followSymlinks?: boolean;

        /** Use polling */
        usePolling?: boolean;

        /** Polling interval */
        interval?: number;

        /** Binary interval */
        binaryInterval?: number;

        /** Depth limit */
        depth?: number;
    };

    /** Debounce delay in milliseconds */
    debounceDelay?: number;

    /** Enable detailed file stats */
    enableStats?: boolean;

    /** Base directory for relative paths */
    baseDir?: string;
}

/**
 * File watcher statistics
 */
export interface WatcherStats {
    watchedFiles: number;
    watchedDirectories: number;
    totalEvents: number;
    eventsByType: Record<string, number>;
    isWatching: boolean;
    startTime?: string;
    uptime?: number;
}

/**
 * File watcher for monitoring project files
 */
export class FileWatcher extends EventEmitter {
    private readonly logger: Logger;
    private readonly config: Required<FileWatcherConfig>;
    private watcher?: chokidar.FSWatcher;
    private debounceTimers = new Map<string, NodeJS.Timeout>();
    private stats: WatcherStats = {
        watchedFiles: 0,
        watchedDirectories: 0,
        totalEvents: 0,
        eventsByType: {},
        isWatching: false
    };

    constructor(config: FileWatcherConfig = {}) {
        super();
        this.logger = new Logger('FileWatcher');
        this.config = {
            watchPatterns: ['**/*.{js,jsx,ts,tsx}'],
            ignorePatterns: [
                'node_modules/**',
                'dist/**',
                'build/**',
                '.git/**',
                '**/*.test.*',
                '**/*.spec.*'
            ],
            watchOptions: {
                ignoreInitial: true,
                persistent: true,
                followSymlinks: false,
                usePolling: false,
                depth: undefined
            },
            debounceDelay: 100,
            enableStats: true,
            baseDir: process.cwd(),
            ...config
        };
    }

    /**
     * Start watching files
     */
    async start(patterns?: string[]): Promise<void> {
        if (this.watcher) {
            await this.stop();
        }

        const watchPatterns = patterns || this.config.watchPatterns;
        this.logger.info(`Starting file watcher for patterns: ${watchPatterns.join(', ')}`);

        try {
            this.watcher = chokidar.watch(watchPatterns, {
                ignored: this.config.ignorePatterns,
                ...this.config.watchOptions
            });

            this.setupEventHandlers();
            await this.waitForReady();

            this.stats.isWatching = true;
            this.stats.startTime = new Date().toISOString();

            this.logger.info('File watcher started successfully');
            this.emit('watcher-started');
        } catch (error) {
            this.logger.error('Failed to start file watcher', error);
            throw error;
        }
    }

    /**
     * Stop watching files
     */
    async stop(): Promise<void> {
        if (!this.watcher) {
            return;
        }

        this.logger.info('Stopping file watcher');

        try {
            await this.watcher.close();
            this.watcher = undefined;

            // Clear all debounce timers
            for (const timer of this.debounceTimers.values()) {
                clearTimeout(timer);
            }
            this.debounceTimers.clear();

            this.stats.isWatching = false;
            this.stats.startTime = undefined;

            this.logger.info('File watcher stopped');
            this.emit('watcher-stopped');
        } catch (error) {
            this.logger.error('Error stopping file watcher', error);
            throw error;
        }
    }

    /**
     * Add files or patterns to watch
     */
    add(paths: string | string[]): void {
        if (!this.watcher) {
            throw new Error('Watcher not started');
        }

        this.watcher.add(paths);
        this.logger.debug(`Added to watch: ${Array.isArray(paths) ? paths.join(', ') : paths}`);
    }

    /**
     * Remove files or patterns from watch
     */
    unwatch(paths: string | string[]): void {
        if (!this.watcher) {
            throw new Error('Watcher not started');
        }

        this.watcher.unwatch(paths);
        this.logger.debug(`Removed from watch: ${Array.isArray(paths) ? paths.join(', ') : paths}`);
    }

    /**
     * Get currently watched paths
     */
    getWatched(): Record<string, string[]> {
        if (!this.watcher) {
            return {};
        }

        return this.watcher.getWatched();
    }

    /**
     * Check if a path is being watched
     */
    isWatched(filePath: string): boolean {
        if (!this.watcher) {
            return false;
        }

        const watched = this.watcher.getWatched();
        const absolutePath = resolve(filePath);

        for (const [dir, files] of Object.entries(watched)) {
            if (files.includes(relative(dir, absolutePath))) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get watcher statistics
     */
    getStats(): WatcherStats {
        if (this.stats.startTime) {
            this.stats.uptime = Date.now() - new Date(this.stats.startTime).getTime();
        }

        return { ...this.stats };
    }

    /**
     * Reset statistics
     */
    resetStats(): void {
        this.stats = {
            watchedFiles: 0,
            watchedDirectories: 0,
            totalEvents: 0,
            eventsByType: {},
            isWatching: this.stats.isWatching,
            startTime: this.stats.startTime
        };
    }

    /**
     * Setup event handlers for the watcher
     */
    private setupEventHandlers(): void {
        if (!this.watcher) return;

        // File events
        this.watcher.on('add', (filePath, stats) => {
            this.handleFileEvent('add', filePath, stats);
        });

        this.watcher.on('change', (filePath, stats) => {
            this.handleFileEvent('change', filePath, stats);
        });

        this.watcher.on('unlink', (filePath) => {
            this.handleFileEvent('unlink', filePath);
        });

        // Directory events
        this.watcher.on('addDir', (dirPath, stats) => {
            this.handleFileEvent('addDir', dirPath, stats);
        });

        this.watcher.on('unlinkDir', (dirPath) => {
            this.handleFileEvent('unlinkDir', dirPath);
        });

        // Error handling
        this.watcher.on('error', (error) => {
            this.logger.error('File watcher error', error);
            this.emit('error', error);
        });

        // Ready event
        this.watcher.on('ready', () => {
            this.updateWatchedStats();
            this.emit('ready');
        });
    }

    /**
     * Handle file system events
     */
    private handleFileEvent(
        type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir',
        filePath: string,
        stats?: any
    ): void {
        const relativePath = relative(this.config.baseDir, filePath);

        // Update statistics
        this.updateEventStats(type);

        // Create event data
        const eventData: FileChangeEvent = {
            type,
            filePath: resolve(filePath),
            relativePath,
            timestamp: new Date().toISOString(),
            stats: stats ? this.formatStats(stats) : undefined
        };

        // Debounce the event
        this.debounceEvent(filePath, () => {
            this.logger.debug(`File ${type}: ${relativePath}`);
            this.emit('file-event', eventData);
            this.emit(type, eventData);
        });
    }

    /**
     * Debounce file events to avoid spam
     */
    private debounceEvent(filePath: string, callback: () => void): void {
        // Clear existing timer for this file
        if (this.debounceTimers.has(filePath)) {
            clearTimeout(this.debounceTimers.get(filePath)!);
        }

        // Set new timer
        const timer = setTimeout(() => {
            callback();
            this.debounceTimers.delete(filePath);
        }, this.config.debounceDelay);

        this.debounceTimers.set(filePath, timer);
    }

    /**
     * Format file stats
     */
    private formatStats(stats: any): FileChangeEvent['stats'] {
        if (!this.config.enableStats || !stats) {
            return undefined;
        }

        return {
            size: stats.size || 0,
            mtime: stats.mtime || new Date(),
            isFile: stats.isFile() || false,
            isDirectory: stats.isDirectory() || false
        };
    }

    /**
     * Update event statistics
     */
    private updateEventStats(type: string): void {
        this.stats.totalEvents++;
        this.stats.eventsByType[type] = (this.stats.eventsByType[type] || 0) + 1;
    }

    /**
     * Update watched files/directories count
     */
    private updateWatchedStats(): void {
        if (!this.watcher) return;

        const watched = this.watcher.getWatched();
        let fileCount = 0;
        let dirCount = Object.keys(watched).length;

        for (const files of Object.values(watched)) {
            fileCount += files.length;
        }

        this.stats.watchedFiles = fileCount;
        this.stats.watchedDirectories = dirCount;
    }

    /**
     * Wait for watcher to be ready
     */
    private waitForReady(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.watcher) {
                reject(new Error('Watcher not initialized'));
                return;
            }

            const timeout = setTimeout(() => {
                reject(new Error('Watcher ready timeout'));
            }, 10000); // 10 second timeout

            this.watcher.on('ready', () => {
                clearTimeout(timeout);
                resolve();
            });

            this.watcher.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    /**
     * Create watcher from configuration
     */
    static fromConfig(config: ElementTaggerOptions): FileWatcher {
        return new FileWatcher({
            watchPatterns: config.include,
            ignorePatterns: config.exclude,
            watchOptions: {
                ignoreInitial: true,
                persistent: config.watchFiles !== false
            }
        });
    }

    /**
     * Check if file should be processed based on patterns
     */
    shouldProcessFile(filePath: string): boolean {
        const relativePath = relative(this.config.baseDir, filePath);

        // Check if file matches watch patterns
        const includePatterns = this.config.watchPatterns;
        const excludePatterns = this.config.ignorePatterns;

        // Simple pattern matching (would use a proper glob matcher in production)
        const matchesInclude = includePatterns.some(pattern => {
            const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
            return regex.test(relativePath);
        });

        const matchesExclude = excludePatterns.some(pattern => {
            const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
            return regex.test(relativePath);
        });

        return matchesInclude && !matchesExclude;
    }
}