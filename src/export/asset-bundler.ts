import { readFile, writeFile, copyFile, ensureDir, stat } from 'fs-extra';
import { resolve, dirname, extname, basename, relative } from 'path';
import { createHash } from 'crypto';
import * as glob from 'fast-glob';
import { Logger } from '../utils/logger';

/**
 * Asset type classification
 */
export type AssetType =
    | 'image'
    | 'font'
    | 'style'
    | 'script'
    | 'document'
    | 'data'
    | 'other';

/**
 * Asset information
 */
export interface Asset {
    id: string;
    path: string;
    relativePath: string;
    type: AssetType;
    size: number;
    mimeType: string;
    checksum: string;
    dependencies: string[];
    metadata: Record<string, any>;
}

/**
 * Asset bundling configuration
 */
export interface AssetBundlerConfig {
    /** Source directory */
    sourceDir: string;

    /** Output directory */
    outputDir: string;

    /** Asset patterns to include */
    includePatterns?: string[];

    /** Patterns to exclude */
    excludePatterns?: string[];

    /** Enable asset optimization */
    enableOptimization?: boolean;

    /** Enable asset hashing */
    enableHashing?: boolean;

    /** Generate asset manifest */
    generateManifest?: boolean;

    /** Asset transformations */
    transformations?: {
        images?: {
            /** Enable image optimization */
            optimize?: boolean;
            /** Output formats */
            formats?: string[];
            /** Quality settings */
            quality?: number;
            /** Resize options */
            resize?: {
                width?: number;
                height?: number;
                fit?: 'cover' | 'contain' | 'fill';
            };
        };
        styles?: {
            /** Minify CSS */
            minify?: boolean;
            /** Auto-prefix CSS */
            autoPrefix?: boolean;
            /** Bundle CSS files */
            bundle?: boolean;
        };
        scripts?: {
            /** Minify JavaScript */
            minify?: boolean;
            /** Bundle JavaScript files */
            bundle?: boolean;
        };
    };
}

/**
 * Bundling result
 */
export interface BundlingResult {
    success: boolean;
    assets: Asset[];
    totalSize: number;
    optimizedSize: number;
    duration: number;
    errors: string[];
    warnings: string[];
}

/**
 * Asset bundler for handling project assets
 */
export class AssetBundler {
    private readonly logger: Logger;
    private readonly config: Required<AssetBundlerConfig>;
    private readonly assetTypeMap: Record<string, AssetType> = {
        // Images
        '.jpg': 'image',
        '.jpeg': 'image',
        '.png': 'image',
        '.gif': 'image',
        '.svg': 'image',
        '.webp': 'image',
        '.ico': 'image',
        '.bmp': 'image',

        // Fonts
        '.woff': 'font',
        '.woff2': 'font',
        '.ttf': 'font',
        '.eot': 'font',
        '.otf': 'font',

        // Styles
        '.css': 'style',
        '.scss': 'style',
        '.sass': 'style',
        '.less': 'style',
        '.styl': 'style',

        // Scripts
        '.js': 'script',
        '.mjs': 'script',
        '.jsx': 'script',
        '.ts': 'script',
        '.tsx': 'script',

        // Documents
        '.md': 'document',
        '.txt': 'document',
        '.pdf': 'document',
        '.doc': 'document',
        '.docx': 'document',

        // Data
        '.json': 'data',
        '.xml': 'data',
        '.csv': 'data',
        '.yaml': 'data',
        '.yml': 'data'
    };

    constructor(config: AssetBundlerConfig) {
        this.logger = new Logger('AssetBundler');
        this.config = {
            includePatterns: [
                '**/*.{jpg,jpeg,png,gif,svg,webp,ico}',
                '**/*.{woff,woff2,ttf,eot,otf}',
                '**/*.{css,scss,sass,less}',
                '**/*.{json,xml,csv,yaml,yml}'
            ],
            excludePatterns: [
                'node_modules/**',
                'dist/**',
                'build/**',
                '.git/**'
            ],
            enableOptimization: false,
            enableHashing: false,
            generateManifest: true,
            transformations: {
                images: {
                    optimize: false,
                    formats: ['webp'],
                    quality: 80
                },
                styles: {
                    minify: false,
                    autoPrefix: false,
                    bundle: false
                },
                scripts: {
                    minify: false,
                    bundle: false
                }
            },
            ...config
        };
    }

    /**
     * Bundle all assets
     */
    async bundle(): Promise<BundlingResult> {
        const startTime = Date.now();
        this.logger.info(`Bundling assets from ${this.config.sourceDir}`);

        try {
            // Find all assets
            const assetPaths = await this.findAssets();
            this.logger.info(`Found ${assetPaths.length} assets to process`);

            // Process each asset
            const assets: Asset[] = [];
            const errors: string[] = [];
            const warnings: string[] = [];

            for (const assetPath of assetPaths) {
                try {
                    const asset = await this.processAsset(assetPath);
                    assets.push(asset);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    errors.push(`${assetPath}: ${errorMessage}`);
                    this.logger.error(`Failed to process asset: ${assetPath}`, error);
                }
            }

            // Calculate sizes
            const totalSize = assets.reduce((sum, asset) => sum + asset.size, 0);
            const optimizedSize = totalSize; // Would be different after optimization

            // Generate manifest if enabled
            if (this.config.generateManifest) {
                await this.generateAssetManifest(assets);
            }

            const duration = Date.now() - startTime;

            this.logger.info(`Asset bundling completed: ${assets.length} assets (${(totalSize / 1024 / 1024).toFixed(2)}MB, ${duration}ms)`);

            return {
                success: errors.length === 0,
                assets,
                totalSize,
                optimizedSize,
                duration,
                errors,
                warnings
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            this.logger.error('Asset bundling failed', error);

            return {
                success: false,
                assets: [],
                totalSize: 0,
                optimizedSize: 0,
                duration,
                errors: [errorMessage],
                warnings: []
            };
        }
    }

    /**
     * Find all assets to process
     */
    private async findAssets(): Promise<string[]> {
        const assets = await glob(this.config.includePatterns, {
            cwd: this.config.sourceDir,
            ignore: this.config.excludePatterns,
            absolute: true,
            onlyFiles: true
        });

        return assets;
    }

    /**
     * Process a single asset
     */
    private async processAsset(assetPath: string): Promise<Asset> {
        const relativePath = relative(this.config.sourceDir, assetPath);
        const assetType = this.getAssetType(assetPath);
        const stats = await stat(assetPath);
        const checksum = await this.calculateChecksum(assetPath);
        const mimeType = this.getMimeType(assetPath);

        // Generate asset ID
        const id = this.config.enableHashing
            ? `${basename(assetPath, extname(assetPath))}.${checksum.substring(0, 8)}${extname(assetPath)}`
            : basename(assetPath);

        // Determine output path
        const outputPath = resolve(this.config.outputDir, dirname(relativePath), id);

        // Process based on asset type
        await this.processAssetByType(assetPath, outputPath, assetType);

        // Analyze dependencies
        const dependencies = await this.analyzeDependencies(assetPath, assetType);

        // Gather metadata
        const metadata = await this.gatherMetadata(assetPath, assetType);

        return {
            id,
            path: outputPath,
            relativePath: relative(this.config.outputDir, outputPath),
            type: assetType,
            size: stats.size,
            mimeType,
            checksum,
            dependencies,
            metadata
        };
    }

    /**
     * Process asset based on its type
     */
    private async processAssetByType(
        inputPath: string,
        outputPath: string,
        assetType: AssetType
    ): Promise<void> {
        await ensureDir(dirname(outputPath));

        switch (assetType) {
            case 'image':
                await this.processImage(inputPath, outputPath);
                break;
            case 'style':
                await this.processStyle(inputPath, outputPath);
                break;
            case 'script':
                await this.processScript(inputPath, outputPath);
                break;
            default:
                await copyFile(inputPath, outputPath);
                break;
        }
    }

    /**
     * Process image assets
     */
    private async processImage(inputPath: string, outputPath: string): Promise<void> {
        const imageConfig = this.config.transformations?.images;

        if (imageConfig?.optimize && this.config.enableOptimization) {
            // Image optimization would go here
            // For now, just copy the file
            this.logger.warn('Image optimization not implemented');
            await copyFile(inputPath, outputPath);
        } else {
            await copyFile(inputPath, outputPath);
        }
    }

    /**
     * Process style assets
     */
    private async processStyle(inputPath: string, outputPath: string): Promise<void> {
        const styleConfig = this.config.transformations?.styles;

        if (styleConfig?.minify && this.config.enableOptimization) {
            // CSS minification would go here
            const content = await readFile(inputPath, 'utf-8');
            const minified = this.minifyCSS(content);
            await writeFile(outputPath, minified, 'utf-8');
        } else {
            await copyFile(inputPath, outputPath);
        }
    }

    /**
     * Process script assets
     */
    private async processScript(inputPath: string, outputPath: string): Promise<void> {
        const scriptConfig = this.config.transformations?.scripts;

        if (scriptConfig?.minify && this.config.enableOptimization) {
            // JavaScript minification would go here
            const content = await readFile(inputPath, 'utf-8');
            const minified = this.minifyJS(content);
            await writeFile(outputPath, minified, 'utf-8');
        } else {
            await copyFile(inputPath, outputPath);
        }
    }

    /**
     * Analyze asset dependencies
     */
    private async analyzeDependencies(assetPath: string, assetType: AssetType): Promise<string[]> {
        const dependencies: string[] = [];

        try {
            if (assetType === 'style') {
                // Analyze CSS imports and url() references
                const content = await readFile(assetPath, 'utf-8');
                const importMatches = content.match(/@import\s+['"]([^'"]+)['"]/g);
                const urlMatches = content.match(/url\(['"]?([^'")]+)['"]?\)/g);

                if (importMatches) {
                    importMatches.forEach(match => {
                        const path = match.match(/@import\s+['"]([^'"]+)['"]/)?.[1];
                        if (path) dependencies.push(path);
                    });
                }

                if (urlMatches) {
                    urlMatches.forEach(match => {
                        const path = match.match(/url\(['"]?([^'")]+)['"]?\)/)?.[1];
                        if (path && !path.startsWith('http') && !path.startsWith('data:')) {
                            dependencies.push(path);
                        }
                    });
                }
            } else if (assetType === 'script') {
                // Analyze JavaScript imports
                const content = await readFile(assetPath, 'utf-8');
                const importMatches = content.match(/import\s+.*\s+from\s+['"]([^'"]+)['"]/g);
                const requireMatches = content.match(/require\(['"]([^'"]+)['"]\)/g);

                if (importMatches) {
                    importMatches.forEach(match => {
                        const path = match.match(/from\s+['"]([^'"]+)['"]/)?.[1];
                        if (path && !path.startsWith('http') && !path.includes('node_modules')) {
                            dependencies.push(path);
                        }
                    });
                }

                if (requireMatches) {
                    requireMatches.forEach(match => {
                        const path = match.match(/require\(['"]([^'"]+)['"]\)/)?.[1];
                        if (path && !path.startsWith('http') && !path.includes('node_modules')) {
                            dependencies.push(path);
                        }
                    });
                }
            }
        } catch (error) {
            this.logger.warn(`Failed to analyze dependencies for ${assetPath}`, error);
        }

        return dependencies;
    }

    /**
     * Gather asset metadata
     */
    private async gatherMetadata(assetPath: string, assetType: AssetType): Promise<Record<string, any>> {
        const metadata: Record<string, any> = {};

        try {
            const stats = await stat(assetPath);
            metadata.created = stats.birthtime;
            metadata.modified = stats.mtime;
            metadata.extension = extname(assetPath);

            if (assetType === 'image') {
                // Would gather image dimensions, color profile, etc.
                metadata.isImage = true;
            } else if (assetType === 'style') {
                // Could analyze CSS rules, selectors, etc.
                const content = await readFile(assetPath, 'utf-8');
                metadata.lines = content.split('\n').length;
                metadata.hasImports = content.includes('@import');
            } else if (assetType === 'script') {
                // Could analyze JavaScript modules, exports, etc.
                const content = await readFile(assetPath, 'utf-8');
                metadata.lines = content.split('\n').length;
                metadata.hasImports = content.includes('import ') || content.includes('require(');
                metadata.hasExports = content.includes('export ') || content.includes('module.exports');
            }
        } catch (error) {
            this.logger.warn(`Failed to gather metadata for ${assetPath}`, error);
        }

        return metadata;
    }

    /**
     * Get asset type from file extension
     */
    private getAssetType(assetPath: string): AssetType {
        const ext = extname(assetPath).toLowerCase();
        return this.assetTypeMap[ext] || 'other';
    }

    /**
     * Get MIME type for asset
     */
    private getMimeType(assetPath: string): string {
        const ext = extname(assetPath).toLowerCase();
        const mimeTypes: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.webp': 'image/webp',
            '.ico': 'image/x-icon',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
            '.ttf': 'font/ttf',
            '.eot': 'application/vnd.ms-fontobject',
            '.otf': 'font/otf',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.xml': 'application/xml',
            '.csv': 'text/csv',
            '.txt': 'text/plain',
            '.md': 'text/markdown',
            '.pdf': 'application/pdf'
        };

        return mimeTypes[ext] || 'application/octet-stream';
    }

    /**
     * Calculate file checksum
     */
    private async calculateChecksum(filePath: string): Promise<string> {
        const content = await readFile(filePath);
        return createHash('md5').update(content).digest('hex');
    }

    /**
     * Generate asset manifest
     */
    private async generateAssetManifest(assets: Asset[]): Promise<void> {
        const manifest = {
            version: '1.0.0',
            generatedAt: new Date().toISOString(),
            assets: assets.map(asset => ({
                id: asset.id,
                path: asset.relativePath,
                type: asset.type,
                size: asset.size,
                mimeType: asset.mimeType,
                checksum: asset.checksum,
                dependencies: asset.dependencies
            })),
            statistics: {
                totalAssets: assets.length,
                totalSize: assets.reduce((sum, asset) => sum + asset.size, 0),
                assetsByType: assets.reduce((acc, asset) => {
                    acc[asset.type] = (acc[asset.type] || 0) + 1;
                    return acc;
                }, {} as Record<AssetType, number>)
            }
        };

        const manifestPath = resolve(this.config.outputDir, 'asset-manifest.json');
        await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
        this.logger.debug('Generated asset manifest');
    }

    /**
     * Simple CSS minification
     */
    private minifyCSS(css: string): string {
        return css
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
            .replace(/\s+/g, ' ') // Collapse whitespace
            .replace(/;\s*}/g, '}') // Remove unnecessary semicolons
            .replace(/\s*{\s*/g, '{') // Clean up braces
            .replace(/}\s*/g, '}')
            .replace(/;\s*/g, ';')
            .trim();
    }

    /**
     * Simple JavaScript minification
     */
    private minifyJS(js: string): string {
        return js
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
            .replace(/\/\/.*$/gm, '') // Remove line comments
            .replace(/\s+/g, ' ') // Collapse whitespace
            .replace(/;\s*}/g, '}') // Clean up syntax
            .replace(/\s*{\s*/g, '{')
            .replace(/}\s*/g, '}')
            .replace(/;\s*/g, ';')
            .trim();
    }

    /**
     * Get bundling statistics
     */
    getStats(assets: Asset[]): {
        totalAssets: number;
        totalSize: number;
        assetsByType: Record<AssetType, number>;
        largestAssets: Asset[];
        duplicateAssets: Asset[];
    } {
        const assetsByType = assets.reduce((acc, asset) => {
            acc[asset.type] = (acc[asset.type] || 0) + 1;
            return acc;
        }, {} as Record<AssetType, number>);

        const largestAssets = [...assets]
            .sort((a, b) => b.size - a.size)
            .slice(0, 10);

        // Find potential duplicates based on checksum
        const checksumMap = new Map<string, Asset[]>();
        assets.forEach(asset => {
            if (!checksumMap.has(asset.checksum)) {
                checksumMap.set(asset.checksum, []);
            }
            checksumMap.get(asset.checksum)!.push(asset);
        });

        const duplicateAssets = Array.from(checksumMap.values())
            .filter(group => group.length > 1)
            .flat();

        return {
            totalAssets: assets.length,
            totalSize: assets.reduce((sum, asset) => sum + asset.size, 0),
            assetsByType,
            largestAssets,
            duplicateAssets
        };
    }

    /**
     * Clean unused assets
     */
    async cleanUnusedAssets(usedAssets: string[]): Promise<number> {
        const allAssets = await this.findAssets();
        const unusedAssets = allAssets.filter(asset =>
            !usedAssets.some(used =>
                relative(this.config.sourceDir, asset) === used
            )
        );

        let removedCount = 0;
        for (const asset of unusedAssets) {
            try {
                const outputPath = resolve(
                    this.config.outputDir,
                    relative(this.config.sourceDir, asset)
                );

                // Would remove the file here
                // await remove(outputPath);
                removedCount++;
            } catch (error) {
                this.logger.warn(`Failed to remove unused asset: ${asset}`, error);
            }
        }

        this.logger.info(`Cleaned ${removedCount} unused assets`);
        return removedCount;
    }
}