import { EventEmitter } from 'events';
import chokidar from 'chokidar';
import { performance } from 'perf_hooks';
import { ChangeTracker, type ChangeRecord } from './change-tracker';
import { ASTUpdater } from './ast-updater';
import { FileWriter } from './file-writer';
import { ASTParser } from '../core/ast-parser';
import { ElementDetector } from '../core/element-detector';
import type { ElementTaggerOptions } from '../types/config';
import type { DetectedElement } from '../types/ast';
import { Logger } from '../utils/logger';

/**
 * Synchronization configuration
 */
export interface SyncConfig {
    /** Enable real-time synchronization */
    enableRealTime?: boolean;

    /** Sync delay in milliseconds */
    syncDelay?: number;

    /** Files to watch for changes */
    watchPatterns?: string[];

    /** Files to ignore */
    ignorePatterns?: string[];

    /** Enable conflict resolution */
    enableConflictResolution?: boolean;

    /** Create backups before sync */
    createBackups?: boolean;

    /** Maximum sync queue size */
    maxQueueSize?: number;
}

/**
 * Sync operation result
 */
export interface SyncResult {
    success: boolean;
    filePath: string;
    changesApplied: number;
    duration: number;
    error?: string;
}

/**
 * Sync queue item
 */
interface SyncQueueItem {
    filePath: string;
    changes: ChangeRecord[];
    timestamp: string;
    priority: number;
}

/**
 * Code synchronizer for real-time updates
 */
export class CodeSynchronizer extends EventEmitter {
    private readonly logger: Logger;
    private readonly config: Required<SyncConfig>;
    private readonly changeTracker: ChangeTracker;
    private readonly astUpdater: ASTUpdater;
    private readonly fileWriter: FileWriter;
    private readonly astParser: ASTParser;
    private readonly elementDetector: ElementDetector;

    private fileWatcher?: chokidar.FSWatcher;
    private syncQueue: SyncQueueItem[] = [];
    private isProcessing = false;
    private debounceTimers = new Map<string, NodeJS.Timeout>();

    constructor(config: SyncConfig = {}, options: ElementTaggerOptions = {}) {
        super();
        this.logger = new Logger('CodeSynchronizer');
        this.config = {
            enableRealTime: true,
            syncDelay: 500,
            watchPatterns: ['**/*.{js,jsx,ts,tsx}'],
            ignorePatterns: ['node_modules/**', 'dist/**', '.git/**'],
            enableConflictResolution: true,
            createBackups: true,
            maxQueueSize: 100,
            ...config
        };

        this.changeTracker = new ChangeTracker();
        this.astUpdater = new ASTUpdater();
        this.fileWriter = new FileWriter({
            createBackup: this.config.createBackups
        });
        this.astParser = new ASTParser();
        this.elementDetector = new ElementDetector(options.tagElements);

        this.setupEventHandlers();
    }

    /**
     * Start synchronization
     */
    async start(): Promise<void> {
        this.logger.info('Starting code synchronization');

        if (this.config.enableRealTime) {
            await this.startFileWatching();
        }

        this.changeTracker.start();
        this.emit('sync-started');
    }

    /**
     * Stop synchronization
     */
    async stop(): Promise<void> {
        this.logger.info('Stopping code synchronization');

        if (this.fileWatcher) {
            await this.fileWatcher.close();
            this.fileWatcher = undefined;
        }

        this.changeTracker.stop();
        this.clearQueue();
        this.emit('sync-stopped');
    }

    /**
     * Sync specific file
     */
    async syncFile(filePath: string, changes?: ChangeRecord[]): Promise<SyncResult> {
        const startTime = performance.now();

        try {
            this.logger.debug(`Syncing file: ${filePath}`);

            // Parse current file
            const parseResult = await this.astParser.parseFile(filePath);
            if (!parseResult.success || !parseResult.ast) {
                throw new Error(parseResult.error || 'Failed to parse file');
            }

            // Apply changes if provided
            let changesApplied = 0;
            if (changes && changes.length > 0) {
                const updateResult = await this.astUpdater.applyChanges(parseResult.ast, changes);
                if (!updateResult.success) {
                    throw new Error(updateResult.error || 'Failed to apply changes');
                }
                changesApplied = updateResult.changes.length;
            }

            // Generate updated code
            const updatedCode = await this.astUpdater.generateCode(parseResult.ast);

            // Write file
            const writeResult = await this.fileWriter.writeFile(filePath, updatedCode);
            if (!writeResult.success) {
                throw new Error(writeResult.error || 'Failed to write file');
            }

            const duration = performance.now() - startTime;
            const result: SyncResult = {
                success: true,
                filePath,
                changesApplied,
                duration
            };

            this.emit('file-synced', result);
            return result;
        } catch (error) {
            const duration = performance.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            this.logger.error(`Failed to sync file: ${filePath}`, error);

            const result: SyncResult = {
                success: false,
                filePath,
                changesApplied: 0,
                duration,
                error: errorMessage
            };

            this.emit('sync-error', result);
            return result;
        }
    }

    /**
     * Queue changes for synchronization
     */
    queueChanges(filePath: string, changes: ChangeRecord[], priority = 1): void {
        // Remove existing queue items for the same file
        this.syncQueue = this.syncQueue.filter(item => item.filePath !== filePath);

        // Add new queue item
        const queueItem: SyncQueueItem = {
            filePath,
            changes,
            timestamp: new Date().toISOString(),
            priority
        };

        this.syncQueue.push(queueItem);

        // Sort by priority (higher first)
        this.syncQueue.sort((a, b) => b.priority - a.priority);

        // Limit queue size
        if (this.syncQueue.length > this.config.maxQueueSize) {
            this.syncQueue = this.syncQueue.slice(0, this.config.maxQueueSize);
        }

        this.logger.debug(`Queued ${changes.length} changes for ${filePath}`);
        this.scheduleProcessing();
    }

    /**
     * Process sync queue
     */
    private async processQueue(): Promise<void> {
        if (this.isProcessing || this.syncQueue.length === 0) {
            return;
        }

        this.isProcessing = true;
        this.emit('queue-processing-started');

        try {
            while (this.syncQueue.length > 0) {
                const item = this.syncQueue.shift()!;
                await this.syncFile(item.filePath, item.changes);
            }
        } catch (error) {
            this.logger.error('Error processing sync queue', error);
        } finally {
            this.isProcessing = false;
            this.emit('queue-processing-completed');
        }
    }

    /**
     * Schedule queue processing with debouncing
     */
    private scheduleProcessing(): void {
        // Clear existing timer
        if (this.debounceTimers.has('queue')) {
            clearTimeout(this.debounceTimers.get('queue')!);
        }

        // Schedule new processing
        const timer = setTimeout(() => {
            this.processQueue();
            this.debounceTimers.delete('queue');
        }, this.config.syncDelay);

        this.debounceTimers.set('queue', timer);
    }

    /**
     * Start file watching
     */
    private async startFileWatching(): Promise<void> {
        this.fileWatcher = chokidar.watch(this.config.watchPatterns, {
            ignored: this.config.ignorePatterns,
            persistent: true,
            ignoreInitial: true
        });

        this.fileWatcher.on('change', (filePath) => {
            this.handleFileChange(filePath);
        });

        this.fileWatcher.on('add', (filePath) => {
            this.handleFileAdd(filePath);
        });

        this.fileWatcher.on('unlink', (filePath) => {
            this.handleFileRemove(filePath);
        });

        this.fileWatcher.on('error', (error) => {
            this.logger.error('File watcher error', error);
            this.emit('watch-error', error);
        });

        this.logger.info('File watching started');
    }

    /**
     * Handle file change
     */
    private handleFileChange(filePath: string): void {
        this.logger.debug(`File changed: ${filePath}`);
        this.debounceFileOperation(filePath, () => {
            this.detectAndQueueChanges(filePath);
        });
    }

    /**
     * Handle file addition
     */
    private handleFileAdd(filePath: string): void {
        this.logger.debug(`File added: ${filePath}`);
        this.emit('file-added', filePath);
    }

    /**
     * Handle file removal
     */
    private handleFileRemove(filePath: string): void {
        this.logger.debug(`File removed: ${filePath}`);

        // Clear any pending operations for this file
        this.syncQueue = this.syncQueue.filter(item => item.filePath !== filePath);

        if (this.debounceTimers.has(filePath)) {
            clearTimeout(this.debounceTimers.get(filePath)!);
            this.debounceTimers.delete(filePath);
        }

        this.emit('file-removed', filePath);
    }

    /**
     * Debounce file operations
     */
    private debounceFileOperation(filePath: string, operation: () => void): void {
        // Clear existing timer for this file
        if (this.debounceTimers.has(filePath)) {
            clearTimeout(this.debounceTimers.get(filePath)!);
        }

        // Schedule new operation
        const timer = setTimeout(() => {
            operation();
            this.debounceTimers.delete(filePath);
        }, this.config.syncDelay);

        this.debounceTimers.set(filePath, timer);
    }

    /**
     * Detect changes and queue them
     */
    private async detectAndQueueChanges(filePath: string): Promise<void> {
        try {
            // Parse file and detect elements
            const parseResult = await this.astParser.parseFile(filePath);
            if (!parseResult.success || !parseResult.ast) {
                return;
            }

            const detectionResult = this.elementDetector.detectElements(parseResult.ast, filePath);

            // Compare with previous snapshot
            const changes = this.changeTracker.compareWithSnapshot(filePath, detectionResult.elements);

            if (changes.length > 0) {
                this.queueChanges(filePath, changes);
            }

            // Update snapshot
            this.changeTracker.takeSnapshot(filePath, detectionResult.elements);
        } catch (error) {
            this.logger.error(`Failed to detect changes for ${filePath}`, error);
        }
    }

    /**
     * Setup event handlers
     */
    private setupEventHandlers(): void {
        this.changeTracker.on('change-recorded', (change: ChangeRecord) => {
            this.emit('change-detected', change);
        });
    }

    /**
     * Clear sync queue
     */
    private clearQueue(): void {
        this.syncQueue.length = 0;

        // Clear all debounce timers
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
    }

    /**
     * Get sync statistics
     */
    getStats(): {
        queueSize: number;
        isProcessing: boolean;
        isWatching: boolean;
        activeTimers: number;
    } {
        return {
            queueSize: this.syncQueue.length,
            isProcessing: this.isProcessing,
            isWatching: !!this.fileWatcher,
            activeTimers: this.debounceTimers.size
        };
    }

    /**
     * Force sync all queued changes
     */
    async flushQueue(): Promise<SyncResult[]> {
        const results: SyncResult[] = [];

        while (this.syncQueue.length > 0) {
            const item = this.syncQueue.shift()!;
            const result = await this.syncFile(item.filePath, item.changes);
            results.push(result);
        }

        return results;
    }
}