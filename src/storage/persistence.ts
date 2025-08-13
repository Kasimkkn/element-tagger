import { readFile, writeFile, pathExists, ensureDir, remove } from 'fs-extra';
import { resolve, dirname } from 'path';
import { performance } from 'perf_hooks';
import { createHash } from 'crypto';
import { Logger } from '../utils/logger';

/**
 * Persistence configuration
 */
export interface PersistenceConfig {
    /** Base directory for persistence */
    baseDir?: string;

    /** Enable compression */
    enableCompression?: boolean;

    /** Enable encryption */
    enableEncryption?: boolean;

    /** Encryption key */
    encryptionKey?: string;

    /** File format */
    format?: 'json' | 'binary';

    /** Enable versioning */
    enableVersioning?: boolean;

    /** Maximum versions to keep */
    maxVersions?: number;

    /** Enable integrity checks */
    enableIntegrityChecks?: boolean;
}

/**
 * Persistence operation result
 */
export interface PersistenceResult {
    success: boolean;
    filePath: string;
    operation: 'read' | 'write' | 'delete' | 'exists';
    duration: number;
    size?: number;
    checksum?: string;
    error?: string;
}

/**
 * Stored data with metadata
 */
interface StoredData<T> {
    version: string;
    timestamp: string;
    checksum: string;
    data: T;
    metadata?: Record<string, any>;
}

/**
 * Persistence manager for storing data to disk
 */
export class PersistenceManager {
    private readonly logger: Logger;
    private readonly config: Required<PersistenceConfig>;

    constructor(config: PersistenceConfig = {}) {
        this.logger = new Logger('PersistenceManager');
        this.config = {
            baseDir: '.element-tagger',
            enableCompression: false,
            enableEncryption: false,
            encryptionKey: '',
            format: 'json',
            enableVersioning: false,
            maxVersions: 5,
            enableIntegrityChecks: true,
            ...config
        };
    }

    /**
     * Store data to file
     */
    async store<T>(key: string, data: T, metadata?: Record<string, any>): Promise<PersistenceResult> {
        const startTime = performance.now();
        const filePath = this.getFilePath(key);

        try {
            this.logger.debug(`Storing data: ${key}`);

            // Ensure directory exists
            await ensureDir(dirname(filePath));

            // Create stored data structure
            const storedData: StoredData<T> = {
                version: '1.0.0',
                timestamp: new Date().toISOString(),
                checksum: '',
                data,
                metadata
            };

            // Serialize data
            let serialized = this.serialize(storedData);

            // Apply compression if enabled
            if (this.config.enableCompression) {
                serialized = await this.compress(serialized);
            }

            // Apply encryption if enabled
            if (this.config.enableEncryption) {
                serialized = await this.encrypt(serialized);
            }

            // Calculate checksum
            const checksum = this.calculateChecksum(serialized);
            storedData.checksum = checksum;

            // Re-serialize with checksum
            if (!this.config.enableEncryption && !this.config.enableCompression) {
                serialized = this.serialize(storedData);
            }

            // Handle versioning
            if (this.config.enableVersioning) {
                await this.createVersion(filePath);
            }

            // Write file
            await writeFile(filePath, serialized, this.config.format === 'binary' ? undefined : 'utf-8');

            const duration = performance.now() - startTime;
            const size = serialized.length;

            this.logger.debug(`Data stored: ${key} (${size} bytes, ${duration.toFixed(2)}ms)`);

            return {
                success: true,
                filePath,
                operation: 'write',
                duration,
                size,
                checksum
            };
        } catch (error) {
            const duration = performance.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            this.logger.error(`Failed to store data: ${key}`, error);

            return {
                success: false,
                filePath,
                operation: 'write',
                duration,
                error: errorMessage
            };
        }
    }

    /**
     * Load data from file
     */
    async load<T>(key: string): Promise<{ data: T | null; result: PersistenceResult }> {
        const startTime = performance.now();
        const filePath = this.getFilePath(key);

        try {
            this.logger.debug(`Loading data: ${key}`);

            // Check if file exists
            if (!await pathExists(filePath)) {
                const duration = performance.now() - startTime;
                return {
                    data: null,
                    result: {
                        success: false,
                        filePath,
                        operation: 'read',
                        duration,
                        error: 'File not found'
                    }
                };
            }

            // Read file
            let content = await readFile(filePath, this.config.format === 'binary' ? undefined : 'utf-8');

            // Apply decryption if enabled
            if (this.config.enableEncryption) {
                content = await this.decrypt(content);
            }

            // Apply decompression if enabled
            if (this.config.enableCompression) {
                content = await this.decompress(content);
            }

            // Parse data
            const storedData: StoredData<T> = this.deserialize(content);

            // Verify integrity if enabled
            if (this.config.enableIntegrityChecks) {
                const isValid = await this.verifyIntegrity(storedData, content);
                if (!isValid) {
                    throw new Error('Data integrity check failed');
                }
            }

            const duration = performance.now() - startTime;
            const size = typeof content === 'string' ? content.length : content.length;

            this.logger.debug(`Data loaded: ${key} (${size} bytes, ${duration.toFixed(2)}ms)`);

            return {
                data: storedData.data,
                result: {
                    success: true,
                    filePath,
                    operation: 'read',
                    duration,
                    size,
                    checksum: storedData.checksum
                }
            };
        } catch (error) {
            const duration = performance.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            this.logger.error(`Failed to load data: ${key}`, error);

            return {
                data: null,
                result: {
                    success: false,
                    filePath,
                    operation: 'read',
                    duration,
                    error: errorMessage
                }
            };
        }
    }

    /**
     * Check if data exists
     */
    async exists(key: string): Promise<PersistenceResult> {
        const startTime = performance.now();
        const filePath = this.getFilePath(key);

        try {
            const fileExists = await pathExists(filePath);
            const duration = performance.now() - startTime;

            return {
                success: fileExists,
                filePath,
                operation: 'exists',
                duration
            };
        } catch (error) {
            const duration = performance.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            return {
                success: false,
                filePath,
                operation: 'exists',
                duration,
                error: errorMessage
            };
        }
    }

    /**
     * Delete stored data
     */
    async delete(key: string): Promise<PersistenceResult> {
        const startTime = performance.now();
        const filePath = this.getFilePath(key);

        try {
            this.logger.debug(`Deleting data: ${key}`);

            if (await pathExists(filePath)) {
                await remove(filePath);

                // Clean up versions if enabled
                if (this.config.enableVersioning) {
                    await this.cleanupVersions(filePath);
                }
            }

            const duration = performance.now() - startTime;

            this.logger.debug(`Data deleted: ${key} (${duration.toFixed(2)}ms)`);

            return {
                success: true,
                filePath,
                operation: 'delete',
                duration
            };
        } catch (error) {
            const duration = performance.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            this.logger.error(`Failed to delete data: ${key}`, error);

            return {
                success: false,
                filePath,
                operation: 'delete',
                duration,
                error: errorMessage
            };
        }
    }

    /**
     * List all stored keys
     */
    async listKeys(): Promise<string[]> {
        try {
            const { readdir } = await import('fs/promises');
            const baseDir = resolve(this.config.baseDir);

            if (!await pathExists(baseDir)) {
                return [];
            }

            const files = await readdir(baseDir, { recursive: true });
            const extension = this.config.format === 'json' ? '.json' : '.dat';

            return files
                .filter(file => typeof file === 'string' && file.endsWith(extension))
                .map(file => file.replace(extension, ''));
        } catch (error) {
            this.logger.error('Failed to list keys', error);
            return [];
        }
    }

    /**
     * Get storage statistics
     */
    async getStats(): Promise<{
        totalFiles: number;
        totalSize: number;
        oldestFile?: string;
        newestFile?: string;
    }> {
        try {
            const keys = await this.listKeys();
            let totalSize = 0;
            let oldestTime = Infinity;
            let newestTime = 0;
            let oldestFile: string | undefined;
            let newestFile: string | undefined;

            for (const key of keys) {
                const filePath = this.getFilePath(key);
                if (await pathExists(filePath)) {
                    const { stat } = await import('fs/promises');
                    const stats = await stat(filePath);

                    totalSize += stats.size;

                    if (stats.mtimeMs < oldestTime) {
                        oldestTime = stats.mtimeMs;
                        oldestFile = key;
                    }

                    if (stats.mtimeMs > newestTime) {
                        newestTime = stats.mtimeMs;
                        newestFile = key;
                    }
                }
            }

            return {
                totalFiles: keys.length,
                totalSize,
                oldestFile,
                newestFile
            };
        } catch (error) {
            this.logger.error('Failed to get storage stats', error);
            return {
                totalFiles: 0,
                totalSize: 0
            };
        }
    }

    /**
     * Clear all stored data
     */
    async clear(): Promise<void> {
        try {
            const baseDir = resolve(this.config.baseDir);
            if (await pathExists(baseDir)) {
                await remove(baseDir);
                this.logger.info('All stored data cleared');
            }
        } catch (error) {
            this.logger.error('Failed to clear storage', error);
            throw error;
        }
    }

    /**
     * Get file path for key
     */
    private getFilePath(key: string): string {
        const extension = this.config.format === 'json' ? '.json' : '.dat';
        const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
        return resolve(this.config.baseDir, `${sanitizedKey}${extension}`);
    }

    /**
     * Serialize data
     */
    private serialize<T>(data: T): string | Buffer {
        if (this.config.format === 'json') {
            return JSON.stringify(data, null, 2);
        } else {
            // For binary format, we'll still use JSON but return as Buffer
            return Buffer.from(JSON.stringify(data));
        }
    }

    /**
     * Deserialize data
     */
    private deserialize<T>(content: string | Buffer): T {
        const text = typeof content === 'string' ? content : content.toString('utf-8');
        return JSON.parse(text);
    }

    /**
     * Calculate checksum
     */
    private calculateChecksum(data: string | Buffer): string {
        return createHash('sha256').update(data).digest('hex');
    }

    /**
     * Compress data (placeholder implementation)
     */
    private async compress(data: string | Buffer): Promise<Buffer> {
        // In a real implementation, you'd use a compression library like zlib
        this.logger.warn('Compression not implemented');
        return Buffer.from(data);
    }

    /**
     * Decompress data (placeholder implementation)
     */
    private async decompress(data: string | Buffer): Promise<string> {
        // In a real implementation, you'd use a compression library like zlib
        this.logger.warn('Decompression not implemented');
        return typeof data === 'string' ? data : data.toString('utf-8');
    }

    /**
     * Encrypt data (placeholder implementation)
     */
    private async encrypt(data: string | Buffer): Promise<Buffer> {
        // In a real implementation, you'd use a crypto library
        this.logger.warn('Encryption not implemented');
        return Buffer.from(data);
    }

    /**
     * Decrypt data (placeholder implementation)
     */
    private async decrypt(data: string | Buffer): Promise<string> {
        // In a real implementation, you'd use a crypto library
        this.logger.warn('Decryption not implemented');
        return typeof data === 'string' ? data : data.toString('utf-8');
    }

    /**
     * Verify data integrity
     */
    private async verifyIntegrity<T>(storedData: StoredData<T>, content: string | Buffer): boolean {
        if (!storedData.checksum) {
            return true; // No checksum to verify
        }

        // Create a copy without checksum for verification
        const dataForVerification = { ...storedData, checksum: '' };
        const serialized = this.serialize(dataForVerification);
        const calculatedChecksum = this.calculateChecksum(serialized);

        return calculatedChecksum === storedData.checksum;
    }

    /**
     * Create version backup
     */
    private async createVersion(filePath: string): Promise<void> {
        if (!await pathExists(filePath)) {
            return;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const versionPath = `${filePath}.v${timestamp}`;

        const { copyFile } = await import('fs/promises');
        await copyFile(filePath, versionPath);

        // Clean up old versions
        await this.cleanupVersions(filePath);
    }

    /**
     * Clean up old versions
     */
    private async cleanupVersions(filePath: string): Promise<void> {
        try {
            const { readdir, unlink } = await import('fs/promises');
            const dir = dirname(filePath);
            const basename = filePath.split('/').pop() || '';

            const files = await readdir(dir);
            const versionFiles = files
                .filter(file => file.startsWith(`${basename}.v`))
                .sort()
                .reverse(); // Newest first

            // Remove excess versions
            if (versionFiles.length > this.config.maxVersions) {
                const filesToDelete = versionFiles.slice(this.config.maxVersions);

                for (const file of filesToDelete) {
                    await unlink(resolve(dir, file));
                }
            }
        } catch (error) {
            this.logger.warn('Failed to cleanup versions', error);
        }
    }
}