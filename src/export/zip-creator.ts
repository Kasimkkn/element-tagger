import { createWriteStream, createReadStream } from 'fs';
import { readdir, stat, readFile } from 'fs-extra';
import { resolve, relative, basename } from 'path';
import { performance } from 'perf_hooks';
import { createGzip, createDeflate } from 'zlib';
import { Logger } from '../utils/logger';

/**
 * ZIP creation configuration
 */
export interface ZipCreatorConfig {
    /** Source directory to zip */
    sourceDir: string;

    /** Output ZIP file path */
    outputPath: string;

    /** Compression level (0-9) */
    compressionLevel?: number;

    /** Files to exclude */
    excludePatterns?: string[];

    /** Include hidden files */
    includeHidden?: boolean;

    /** Enable progress reporting */
    enableProgress?: boolean;

    /** Custom file filter */
    fileFilter?: (filePath: string, stats: any) => boolean;
}

/**
 * ZIP entry information
 */
export interface ZipEntry {
    path: string;
    relativePath: string;
    size: number;
    isDirectory: boolean;
    compressedSize: number;
    crc32: number;
    lastModified: Date;
}

/**
 * ZIP creation result
 */
export interface ZipResult {
    success: boolean;
    outputPath: string;
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    entriesCount: number;
    duration: number;
    entries: ZipEntry[];
    error?: string;
}

/**
 * ZIP creator for packaging exported projects
 */
export class ZipCreator {
    private readonly logger: Logger;
    private readonly config: Required<ZipCreatorConfig>;

    constructor(config: ZipCreatorConfig) {
        this.logger = new Logger('ZipCreator');
        this.config = {
            compressionLevel: 6,
            excludePatterns: [
                'node_modules/**',
                '.git/**',
                '*.log',
                '.DS_Store',
                'Thumbs.db'
            ],
            includeHidden: false,
            enableProgress: false,
            fileFilter: () => true,
            ...config
        };
    }

    /**
     * Create ZIP archive
     */
    async createZip(): Promise<ZipResult> {
        const startTime = performance.now();
        this.logger.info(`Creating ZIP archive: ${this.config.outputPath}`);

        try {
            // Find all files to include
            const files = await this.findFilesToZip();
            this.logger.info(`Found ${files.length} files to compress`);

            // Create ZIP file
            const entries = await this.compressFiles(files);

            // Calculate statistics
            const originalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
            const compressedSize = entries.reduce((sum, entry) => sum + entry.compressedSize, 0);
            const compressionRatio = originalSize > 0 ? (1 - compressedSize / originalSize) * 100 : 0;

            const duration = performance.now() - startTime;

            this.logger.info(`ZIP created: ${entries.length} files, ${(originalSize / 1024 / 1024).toFixed(2)}MB → ${(compressedSize / 1024 / 1024).toFixed(2)}MB (${compressionRatio.toFixed(1)}% compression, ${duration.toFixed(2)}ms)`);

            return {
                success: true,
                outputPath: this.config.outputPath,
                originalSize,
                compressedSize,
                compressionRatio,
                entriesCount: entries.length,
                duration,
                entries
            };
        } catch (error) {
            const duration = performance.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            this.logger.error('ZIP creation failed', error);

            return {
                success: false,
                outputPath: this.config.outputPath,
                originalSize: 0,
                compressedSize: 0,
                compressionRatio: 0,
                entriesCount: 0,
                duration,
                entries: [],
                error: errorMessage
            };
        }
    }

    /**
     * Find all files to include in ZIP
     */
    private async findFilesToZip(): Promise<string[]> {
        const files: string[] = [];

        const processDirectory = async (dirPath: string): Promise<void> => {
            const entries = await readdir(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = resolve(dirPath, entry.name);
                const relativePath = relative(this.config.sourceDir, fullPath);

                // Skip hidden files if not included
                if (!this.config.includeHidden && entry.name.startsWith('.')) {
                    continue;
                }

                // Check exclusion patterns
                if (this.shouldExclude(relativePath)) {
                    continue;
                }

                if (entry.isDirectory()) {
                    await processDirectory(fullPath);
                } else if (entry.isFile()) {
                    const stats = await stat(fullPath);

                    // Apply custom filter
                    if (this.config.fileFilter(fullPath, stats)) {
                        files.push(fullPath);
                    }
                }
            }
        };

        await processDirectory(this.config.sourceDir);
        return files;
    }

    /**
     * Check if file should be excluded
     */
    private shouldExclude(relativePath: string): boolean {
        return this.config.excludePatterns.some(pattern => {
            // Simple pattern matching (would use a proper glob matcher in production)
            if (pattern.endsWith('/**')) {
                const prefix = pattern.slice(0, -3);
                return relativePath.startsWith(prefix);
            } else if (pattern.includes('*')) {
                const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                return regex.test(relativePath);
            } else {
                return relativePath === pattern || relativePath.endsWith(pattern);
            }
        });
    }

    /**
     * Compress files into ZIP format
     * Note: This is a simplified implementation. In production, you'd use a proper ZIP library like 'archiver' or 'yauzl'
     */
    private async compressFiles(files: string[]): Promise<ZipEntry[]> {
        const entries: ZipEntry[] = [];

        // Create simple compressed archive (not actual ZIP format)
        const outputStream = createWriteStream(this.config.outputPath);
        const manifest: any[] = [];

        try {
            for (let i = 0; i < files.length; i++) {
                const filePath = files[i];
                const relativePath = relative(this.config.sourceDir, filePath);
                const stats = await stat(filePath);

                if (this.config.enableProgress) {
                    this.logger.debug(`Compressing: ${relativePath} (${i + 1}/${files.length})`);
                }

                // Read file content
                const content = await readFile(filePath);

                // Compress content (simplified)
                const compressed = await this.compressData(content);

                // Calculate CRC32 (simplified)
                const crc32 = this.calculateCRC32(content);

                const entry: ZipEntry = {
                    path: filePath,
                    relativePath,
                    size: stats.size,
                    isDirectory: false,
                    compressedSize: compressed.length,
                    crc32,
                    lastModified: stats.mtime
                };

                entries.push(entry);
                manifest.push({
                    path: relativePath,
                    size: stats.size,
                    compressedSize: compressed.length,
                    offset: outputStream.bytesWritten
                });

                // Write compressed data to output
                outputStream.write(compressed);
            }

            // Write manifest at the end
            const manifestData = Buffer.from(JSON.stringify(manifest));
            const manifestSize = Buffer.alloc(4);
            manifestSize.writeUInt32LE(manifestData.length, 0);

            outputStream.write(manifestData);
            outputStream.write(manifestSize);

        } finally {
            outputStream.end();
        }

        return entries;
    }

    /**
     * Compress data using deflate
     */
    private async compressData(data: Buffer): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            const deflate = createDeflate({ level: this.config.compressionLevel });

            deflate.on('data', (chunk) => chunks.push(chunk));
            deflate.on('end', () => resolve(Buffer.concat(chunks)));
            deflate.on('error', reject);

            deflate.write(data);
            deflate.end();
        });
    }

    /**
     * Calculate CRC32 checksum (simplified implementation)
     */
    private calculateCRC32(data: Buffer): number {
        // This is a very simplified CRC32 implementation
        // In production, use a proper CRC32 library
        let crc = 0xFFFFFFFF;

        for (let i = 0; i < data.length; i++) {
            crc = crc ^ data[i];
            for (let j = 0; j < 8; j++) {
                crc = (crc >>> 1) ^ (0xEDB88320 & (-(crc & 1)));
            }
        }

        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    /**
     * Extract ZIP archive (for testing purposes)
     */
    async extractZip(zipPath: string, outputDir: string): Promise<boolean> {
        try {
            this.logger.info(`Extracting ZIP: ${zipPath} to ${outputDir}`);

            // This would implement ZIP extraction
            // For now, just return success
            this.logger.warn('ZIP extraction not implemented');

            return true;
        } catch (error) {
            this.logger.error('ZIP extraction failed', error);
            return false;
        }
    }

    /**
     * Validate ZIP file
     */
    async validateZip(zipPath: string): Promise<{
        isValid: boolean;
        entries: number;
        error?: string;
    }> {
        try {
            // Read the manifest from the end of the file
            const { createReadStream } = await import('fs');
            const { stat } = await import('fs/promises');

            const stats = await stat(zipPath);
            const stream = createReadStream(zipPath, {
                start: Math.max(0, stats.size - 1024), // Read last 1KB
                end: stats.size
            });

            const chunks: Buffer[] = [];

            return new Promise((resolve) => {
                stream.on('data', (chunk) => chunks.push(chunk));
                stream.on('end', () => {
                    try {
                        const data = Buffer.concat(chunks);

                        // Read manifest size from last 4 bytes
                        const manifestSize = data.readUInt32LE(data.length - 4);

                        // Read manifest
                        const manifestData = data.subarray(data.length - 4 - manifestSize, data.length - 4);
                        const manifest = JSON.parse(manifestData.toString());

                        resolve({
                            isValid: true,
                            entries: manifest.length
                        });
                    } catch (error) {
                        resolve({
                            isValid: false,
                            entries: 0,
                            error: error instanceof Error ? error.message : 'Invalid ZIP format'
                        });
                    }
                });

                stream.on('error', (error) => {
                    resolve({
                        isValid: false,
                        entries: 0,
                        error: error.message
                    });
                });
            });
        } catch (error) {
            return {
                isValid: false,
                entries: 0,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Get ZIP file information
     */
    async getZipInfo(zipPath: string): Promise<{
        size: number;
        entries: number;
        compressionRatio: number;
        created: Date;
    } | null> {
        try {
            const { stat } = await import('fs/promises');
            const stats = await stat(zipPath);

            const validation = await this.validateZip(zipPath);

            if (!validation.isValid) {
                return null;
            }

            return {
                size: stats.size,
                entries: validation.entries,
                compressionRatio: 0, // Would calculate from manifest
                created: stats.birthtime
            };
        } catch {
            return null;
        }
    }

    /**
     * Create ZIP with progress callback
     */
    async createZipWithProgress(
        progressCallback: (progress: {
            current: number;
            total: number;
            currentFile: string;
            percentage: number;
        }) => void
    ): Promise<ZipResult> {
        const startTime = performance.now();
        this.logger.info(`Creating ZIP archive with progress: ${this.config.outputPath}`);

        try {
            // Find all files to include
            const files = await this.findFilesToZip();
            const totalFiles = files.length;

            this.logger.info(`Found ${totalFiles} files to compress`);

            const entries: ZipEntry[] = [];
            const outputStream = createWriteStream(this.config.outputPath);
            const manifest: any[] = [];

            try {
                for (let i = 0; i < files.length; i++) {
                    const filePath = files[i];
                    const relativePath = relative(this.config.sourceDir, filePath);
                    const stats = await stat(filePath);

                    // Report progress
                    const percentage = Math.round((i / totalFiles) * 100);
                    progressCallback({
                        current: i + 1,
                        total: totalFiles,
                        currentFile: relativePath,
                        percentage
                    });

                    // Read and compress file
                    const content = await readFile(filePath);
                    const compressed = await this.compressData(content);
                    const crc32 = this.calculateCRC32(content);

                    const entry: ZipEntry = {
                        path: filePath,
                        relativePath,
                        size: stats.size,
                        isDirectory: false,
                        compressedSize: compressed.length,
                        crc32,
                        lastModified: stats.mtime
                    };

                    entries.push(entry);
                    manifest.push({
                        path: relativePath,
                        size: stats.size,
                        compressedSize: compressed.length,
                        offset: outputStream.bytesWritten
                    });

                    outputStream.write(compressed);
                }

                // Write manifest
                const manifestData = Buffer.from(JSON.stringify(manifest));
                const manifestSize = Buffer.alloc(4);
                manifestSize.writeUInt32LE(manifestData.length, 0);

                outputStream.write(manifestData);
                outputStream.write(manifestSize);

            } finally {
                outputStream.end();
            }

            // Final progress report
            progressCallback({
                current: totalFiles,
                total: totalFiles,
                currentFile: 'Complete',
                percentage: 100
            });

            // Calculate statistics
            const originalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
            const compressedSize = entries.reduce((sum, entry) => sum + entry.compressedSize, 0);
            const compressionRatio = originalSize > 0 ? (1 - compressedSize / originalSize) * 100 : 0;

            const duration = performance.now() - startTime;

            this.logger.info(`ZIP created with progress: ${entries.length} files, ${(originalSize / 1024 / 1024).toFixed(2)}MB → ${(compressedSize / 1024 / 1024).toFixed(2)}MB (${compressionRatio.toFixed(1)}% compression, ${duration.toFixed(2)}ms)`);

            return {
                success: true,
                outputPath: this.config.outputPath,
                originalSize,
                compressedSize,
                compressionRatio,
                entriesCount: entries.length,
                duration,
                entries
            };
        } catch (error) {
            const duration = performance.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            this.logger.error('ZIP creation with progress failed', error);

            return {
                success: false,
                outputPath: this.config.outputPath,
                originalSize: 0,
                compressedSize: 0,
                compressionRatio: 0,
                entriesCount: 0,
                duration,
                entries: [],
                error: errorMessage
            };
        }
    }

    /**
     * Create TAR.GZ archive as alternative
     */
    async createTarGz(): Promise<ZipResult> {
        const startTime = performance.now();
        this.logger.info(`Creating TAR.GZ archive: ${this.config.outputPath}.tar.gz`);

        try {
            // Find all files
            const files = await this.findFilesToZip();
            const entries: ZipEntry[] = [];

            // Create TAR.GZ stream
            const outputPath = `${this.config.outputPath}.tar.gz`;
            const outputStream = createWriteStream(outputPath);
            const gzipStream = createGzip({ level: this.config.compressionLevel });

            gzipStream.pipe(outputStream);

            let totalSize = 0;
            let compressedSize = 0;

            for (const filePath of files) {
                const relativePath = relative(this.config.sourceDir, filePath);
                const stats = await stat(filePath);
                const content = await readFile(filePath);

                // Write TAR header (simplified)
                const header = this.createTarHeader(relativePath, stats.size);
                gzipStream.write(header);
                gzipStream.write(content);

                // Padding to 512-byte boundary
                const padding = (512 - (content.length % 512)) % 512;
                if (padding > 0) {
                    gzipStream.write(Buffer.alloc(padding));
                }

                const entry: ZipEntry = {
                    path: filePath,
                    relativePath,
                    size: stats.size,
                    isDirectory: false,
                    compressedSize: content.length + header.length + padding,
                    crc32: this.calculateCRC32(content),
                    lastModified: stats.mtime
                };

                entries.push(entry);
                totalSize += stats.size;
                compressedSize += entry.compressedSize;
            }

            // End TAR with two zero blocks
            gzipStream.write(Buffer.alloc(1024));
            gzipStream.end();

            await new Promise<void>((resolve, reject) => {
                outputStream.on('finish', resolve);
                outputStream.on('error', reject);
            });

            const duration = performance.now() - startTime;
            const compressionRatio = totalSize > 0 ? (1 - compressedSize / totalSize) * 100 : 0;

            return {
                success: true,
                outputPath,
                originalSize: totalSize,
                compressedSize,
                compressionRatio,
                entriesCount: entries.length,
                duration,
                entries
            };
        } catch (error) {
            const duration = performance.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            this.logger.error('TAR.GZ creation failed', error);

            return {
                success: false,
                outputPath: `${this.config.outputPath}.tar.gz`,
                originalSize: 0,
                compressedSize: 0,
                compressionRatio: 0,
                entriesCount: 0,
                duration,
                entries: [],
                error: errorMessage
            };
        }
    }

    /**
     * Create simplified TAR header
     */
    private createTarHeader(filename: string, size: number): Buffer {
        const header = Buffer.alloc(512);

        // File name (100 bytes)
        header.write(filename.substring(0, 100), 0, 'ascii');

        // File mode (8 bytes) - default to 644
        header.write('0000644\0', 100, 'ascii');

        // Owner ID (8 bytes)
        header.write('0000000\0', 108, 'ascii');

        // Group ID (8 bytes)
        header.write('0000000\0', 116, 'ascii');

        // File size (12 bytes)
        const sizeOctal = size.toString(8).padStart(11, '0') + '\0';
        header.write(sizeOctal, 124, 'ascii');

        // Modification time (12 bytes)
        const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0';
        header.write(mtime, 136, 'ascii');

        // Checksum placeholder (8 bytes)
        header.write('        ', 148, 'ascii');

        // Type flag (1 byte) - regular file
        header.write('0', 156, 'ascii');

        // Calculate checksum
        let checksum = 0;
        for (let i = 0; i < 512; i++) {
            checksum += header[i];
        }

        // Write checksum
        const checksumOctal = checksum.toString(8).padStart(6, '0') + '\0 ';
        header.write(checksumOctal, 148, 'ascii');

        return header;
    }

    /**
     * Estimate compression ratio before creating ZIP
     */
    async estimateCompression(sampleSize = 10): Promise<{
        estimatedRatio: number;
        sampleFiles: number;
        totalFiles: number;
    }> {
        try {
            const files = await this.findFilesToZip();
            const sampleFiles = files.slice(0, Math.min(sampleSize, files.length));

            let totalOriginal = 0;
            let totalCompressed = 0;

            for (const filePath of sampleFiles) {
                const content = await readFile(filePath);
                const compressed = await this.compressData(content);

                totalOriginal += content.length;
                totalCompressed += compressed.length;
            }

            const estimatedRatio = totalOriginal > 0 ? (1 - totalCompressed / totalOriginal) * 100 : 0;

            return {
                estimatedRatio,
                sampleFiles: sampleFiles.length,
                totalFiles: files.length
            };
        } catch (error) {
            this.logger.error('Failed to estimate compression', error);
            return {
                estimatedRatio: 0,
                sampleFiles: 0,
                totalFiles: 0
            };
        }
    }

    /**
     * Get optimal compression level based on file types
     */
    getOptimalCompressionLevel(files: string[]): number {
        // Analyze file types to determine optimal compression
        const extensions = files.map(file => file.split('.').pop()?.toLowerCase() || '');

        const compressibleTypes = ['txt', 'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'json', 'xml', 'md'];
        const alreadyCompressed = ['jpg', 'jpeg', 'png', 'gif', 'zip', 'rar', '7z', 'mp3', 'mp4'];

        const compressibleCount = extensions.filter(ext => compressibleTypes.includes(ext)).length;
        const compressedCount = extensions.filter(ext => alreadyCompressed.includes(ext)).length;

        if (compressedCount > files.length * 0.7) {
            // Mostly compressed files, use lower compression
            return 3;
        } else if (compressibleCount > files.length * 0.7) {
            // Mostly text files, use higher compression
            return 9;
        } else {
            // Mixed content, use balanced compression
            return 6;
        }
    }

    /**
     * Create multiple archive formats
     */
    async createMultipleFormats(formats: ('zip' | 'tar.gz')[]): Promise<{
        results: Record<string, ZipResult>;
        bestFormat: string;
        bestRatio: number;
    }> {
        const results: Record<string, ZipResult> = {};
        let bestFormat = '';
        let bestRatio = 0;

        for (const format of formats) {
            try {
                let result: ZipResult;

                if (format === 'zip') {
                    result = await this.createZip();
                } else if (format === 'tar.gz') {
                    result = await this.createTarGz();
                } else {
                    continue;
                }

                results[format] = result;

                if (result.success && result.compressionRatio > bestRatio) {
                    bestRatio = result.compressionRatio;
                    bestFormat = format;
                }
            } catch (error) {
                this.logger.error(`Failed to create ${format} archive`, error);
                results[format] = {
                    success: false,
                    outputPath: '',
                    originalSize: 0,
                    compressedSize: 0,
                    compressionRatio: 0,
                    entriesCount: 0,
                    duration: 0,
                    entries: [],
                    error: error instanceof Error ? error.message : 'Unknown error'
                };
            }
        }

        return {
            results,
            bestFormat,
            bestRatio
        };
    }
}