import { writeFile, readFile, stat, ensureDir, copy } from 'fs-extra';
import { dirname, resolve } from 'path';
import { performance } from 'perf_hooks';
import type { ProcessingResult } from '../types/mapping';
import { Logger } from '../utils/logger';

/**
 * File write operation configuration
 */
export interface FileWriteConfig {
    /** Create backup before writing */
    createBackup?: boolean;

    /** Backup directory */
    backupDir?: string;

    /** Maximum number of backups to keep */
    maxBackups?: number;

    /** Validate file after writing */
    validateAfterWrite?: boolean;

    /** File encoding */
    encoding?: BufferEncoding;

    /** File permissions */
    mode?: number;
}

/**
 * File write operation result
 */
export interface FileWriteResult {
    success: boolean;
    filePath: string;
    bytesWritten: number;
    duration: number;
    backupCreated?: string;
    error?: string;
}

/**
 * Batch write operation result
 */
export interface BatchWriteResult {
    success: boolean;
    results: FileWriteResult[];
    totalFiles: number;
    totalBytes: number;
    duration: number;
    errors: string[];
}

/**
 * File writer for safely writing processed files
 */
export class FileWriter {
    private readonly logger: Logger;
    private readonly config: Required<FileWriteConfig>;

    constructor(config: FileWriteConfig = {}) {
        this.logger = new Logger('FileWriter');
        this.config = {
            createBackup: true,
            backupDir: '.element-tagger-backups',
            maxBackups: 10,
            validateAfterWrite: true,
            encoding: 'utf-8',
            mode: 0o644,
            ...config
        };
    }

    /**
     * Write single file
     */
    async writeFile(filePath: string, content: string): Promise<FileWriteResult> {
        const startTime = performance.now();
        const absolutePath = resolve(filePath);

        try {
            this.logger.debug(`Writing file: ${filePath}`);

            // Ensure directory exists
            await ensureDir(dirname(absolutePath));

            // Create backup if enabled
            let backupCreated: string | undefined;
            if (this.config.createBackup && await this.fileExists(absolutePath)) {
                backupCreated = await this.createBackup(absolutePath);
            }

            // Write file
            await writeFile(absolutePath, content, {
                encoding: this.config.encoding,
                mode: this.config.mode
            });

            // Validate if enabled
            if (this.config.validateAfterWrite) {
                const isValid = await this.validateFile(absolutePath, content);
                if (!isValid) {
                    throw new Error('File validation failed after write');
                }
            }

            const duration = performance.now() - startTime;
            const bytesWritten = Buffer.byteLength(content, this.config.encoding);

            this.logger.debug(`File written successfully: ${filePath} (${bytesWritten} bytes, ${duration.toFixed(2)}ms)`);

            return {
                success: true,
                filePath,
                bytesWritten,
                duration,
                backupCreated
            };
        } catch (error) {
            const duration = performance.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            this.logger.error(`Failed to write file: ${filePath}`, error);

            return {
                success: false,
                filePath,
                bytesWritten: 0,
                duration,
                error: errorMessage
            };
        }
    }

    /**
     * Write multiple files
     */
    async writeFiles(files: Array<{ path: string; content: string }>): Promise<BatchWriteResult> {
        const startTime = performance.now();
        this.logger.info(`Writing ${files.length} files`);

        const results: FileWriteResult[] = [];
        const errors: string[] = [];
        let totalBytes = 0;

        // Write files sequentially to avoid overwhelming the filesystem
        for (const file of files) {
            const result = await this.writeFile(file.path, file.content);
            results.push(result);

            if (result.success) {
                totalBytes += result.bytesWritten;
            } else {
                errors.push(`${file.path}: ${result.error}`);
            }
        }

        const duration = performance.now() - startTime;
        const successCount = results.filter(r => r.success).length;

        this.logger.info(`Batch write completed: ${successCount}/${files.length} files written (${totalBytes} bytes, ${duration.toFixed(2)}ms)`);

        return {
            success: errors.length === 0,
            results,
            totalFiles: files.length,
            totalBytes,
            duration,
            errors
        };
    }

    /**
     * Write processing results
     */
    async writeProcessingResults(results: ProcessingResult[]): Promise<BatchWriteResult> {
        const files = results
            .filter(result => result.success && result.processedCode)
            .map(result => ({
                path: result.filePath,
                content: result.processedCode!
            }));

        return this.writeFiles(files);
    }

    /**
     * Create backup of existing file
     */
    private async createBackup(filePath: string): Promise<string> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFileName = `${filePath}.backup.${timestamp}`;
        const backupPath = resolve(this.config.backupDir, backupFileName);

        await ensureDir(dirname(backupPath));
        await copy(filePath, backupPath);

        // Clean old backups
        await this.cleanOldBackups(filePath);

        this.logger.debug(`Backup created: ${backupPath}`);
        return backupPath;
    }

    /**
     * Clean old backup files
     */
    private async cleanOldBackups(originalFilePath: string): Promise<void> {
        try {
            const { readdir, unlink } = await import('fs/promises');
            const backupDir = resolve(this.config.backupDir);

            if (!await this.fileExists(backupDir)) {
                return;
            }

            const files = await readdir(backupDir);
            const baseFileName = originalFilePath.split('/').pop() || '';
            const backupFiles = files
                .filter(file => file.startsWith(`${baseFileName}.backup.`))
                .map(file => resolve(backupDir, file))
                .sort(); // Sort by name (timestamp)

            // Remove excess backups
            if (backupFiles.length > this.config.maxBackups) {
                const filesToDelete = backupFiles.slice(0, backupFiles.length - this.config.maxBackups);

                for (const file of filesToDelete) {
                    await unlink(file);
                    this.logger.debug(`Old backup removed: ${file}`);
                }
            }
        } catch (error) {
            this.logger.warn('Failed to clean old backups', error);
        }
    }

    /**
     * Validate file after writing
     */
    private async validateFile(filePath: string, expectedContent: string): Promise<boolean> {
        try {
            const actualContent = await readFile(filePath, this.config.encoding);
            return actualContent === expectedContent;
        } catch {
            return false;
        }
    }

    /**
     * Check if file exists
     */
    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await stat(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get backup directory path
     */
    getBackupDir(): string {
        return resolve(this.config.backupDir);
    }

    /**
     * List backup files for a specific file
     */
    async listBackups(filePath: string): Promise<string[]> {
        try {
            const { readdir } = await import('fs/promises');
            const backupDir = resolve(this.config.backupDir);

            if (!await this.fileExists(backupDir)) {
                return [];
            }

            const files = await readdir(backupDir);
            const baseFileName = filePath.split('/').pop() || '';

            return files
                .filter(file => file.startsWith(`${baseFileName}.backup.`))
                .map(file => resolve(backupDir, file))
                .sort()
                .reverse(); // Most recent first
        } catch (error) {
            this.logger.error('Failed to list backups', error);
            return [];
        }
    }

    /**
     * Restore from backup
     */
    async restoreFromBackup(backupPath: string, targetPath: string): Promise<boolean> {
        try {
            await copy(backupPath, targetPath);
            this.logger.info(`Restored from backup: ${backupPath} -> ${targetPath}`);
            return true;
        } catch (error) {
            this.logger.error('Failed to restore from backup', error);
            return false;
        }
    }
}