import { copyFile, ensureDir, writeFile, readFile } from 'fs-extra';
import { resolve, dirname, relative, basename } from 'path';
import { performance } from 'perf_hooks';
import * as glob from 'fast-glob';
import { CodeStripper } from '../core/code-stripper';
import { ASTParser } from '../core/ast-parser';
import type { ExportOptions } from '../types/config';
import type { ProcessingResult } from '../types/mapping';
import { Logger } from '../utils/logger';

/**
 * Export configuration
 */
export interface ExportConfig extends ExportOptions {
    /** Source directory */
    sourceDir: string;

    /** Output directory */
    outputDir: string;

    /** Additional files to include */
    additionalFiles?: string[];

    /** Custom transformations */
    transformations?: Array<{
        pattern: string;
        transform: (content: string, filePath: string) => string;
    }>;
}

/**
 * Export result
 */
export interface ExportResult {
    success: boolean;
    outputPath: string;
    filesProcessed: number;
    totalSize: number;
    duration: number;
    errors: string[];
    warnings: string[];
    manifest?: ExportManifest;
}

/**
 * Export manifest
 */
export interface ExportManifest {
    version: string;
    exportedAt: string;
    sourceDir: string;
    files: Array<{
        path: string;
        size: number;
        checksum: string;
        processed: boolean;
    }>;
    statistics: {
        totalFiles: number;
        processedFiles: number;
        totalSize: number;
        elementsRemoved: number;
    };
}

/**
 * Code exporter for generating clean production code
 */
export class CodeExporter {
    private readonly logger: Logger;
    private readonly config: Required<ExportConfig>;
    private readonly codeStripper: CodeStripper;
    private readonly astParser: ASTParser;

    constructor(config: ExportConfig) {
        this.logger = new Logger('CodeExporter');
        this.config = {
            format: 'folder',
            includeSourceMaps: false,
            minify: false,
            removeComments: false,
            stripTaggingAttributes: true,
            includeAssets: true,
            assetPatterns: ['**/*.{css,scss,sass,less,png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf,eot}'],
            generatePackageJson: true,
            packageJsonTemplate: {},
            additionalFiles: [],
            transformations: [],
            hooks: {},
            ...config
        };

        this.codeStripper = new CodeStripper({
            attributesToStrip: this.config.stripTaggingAttributes ? ['data-el-id'] : [],
            minifyOutput: this.config.minify,
            preserveComments: !this.config.removeComments
        });

        this.astParser = new ASTParser();
    }

    /**
     * Export project to clean code
     */
    async export(): Promise<ExportResult> {
        const startTime = performance.now();
        this.logger.info(`Exporting project from ${this.config.sourceDir} to ${this.config.outputDir}`);

        try {
            // Run before export hook
            if (this.config.hooks?.beforeExport) {
                await this.config.hooks.beforeExport(this.config.sourceDir);
            }

            // Ensure output directory
            await ensureDir(this.config.outputDir);

            // Find all files to process
            const allFiles = await this.findFilesToExport();
            this.logger.info(`Found ${allFiles.length} files to export`);

            // Process files
            const processResults = await this.processFiles(allFiles);

            // Copy assets
            const assetResults = await this.copyAssets();

            // Generate additional files
            await this.generateAdditionalFiles();

            // Create manifest
            const manifest = await this.createManifest(processResults, assetResults);

            // Create final package based on format
            const finalResult = await this.createFinalPackage(manifest);

            const duration = performance.now() - startTime;
            const errors = processResults.filter(r => !r.success).map(r => r.error || 'Unknown error');

            const result: ExportResult = {
                success: errors.length === 0,
                outputPath: this.config.outputDir,
                filesProcessed: processResults.length,
                totalSize: manifest.statistics.totalSize,
                duration,
                errors,
                warnings: [],
                manifest
            };

            // Run after export hook
            if (this.config.hooks?.afterExport) {
                await this.config.hooks.afterExport(this.config.outputDir);
            }

            this.logger.info(`Export completed: ${result.filesProcessed} files (${(result.totalSize / 1024 / 1024).toFixed(2)}MB, ${duration.toFixed(2)}ms)`);

            return result;
        } catch (error) {
            const duration = performance.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            this.logger.error('Export failed', error);

            if (this.config.hooks?.onError) {
                this.config.hooks.onError(error instanceof Error ? error : new Error(errorMessage));
            }

            return {
                success: false,
                outputPath: this.config.outputDir,
                filesProcessed: 0,
                totalSize: 0,
                duration,
                errors: [errorMessage],
                warnings: []
            };
        }
    }

    /**
     * Find all files to export
     */
    private async findFilesToExport(): Promise<string[]> {
        const patterns = [
            '**/*.{js,jsx,ts,tsx}',
            '**/*.{json,md,txt,yml,yaml}',
            ...(this.config.includeAssets ? this.config.assetPatterns || [] : []),
            ...(this.config.additionalFiles || [])
        ];

        const excludePatterns = [
            'node_modules/**',
            'dist/**',
            'build/**',
            '.git/**',
            '**/*.test.*',
            '**/*.spec.*',
            '.element-tagger*',
            '**/.DS_Store'
        ];

        const files = await glob(patterns, {
            cwd: this.config.sourceDir,
            ignore: excludePatterns,
            absolute: true,
            onlyFiles: true
        });

        return files;
    }

    /**
     * Process code files
     */
    private async processFiles(files: string[]): Promise<ProcessingResult[]> {
        const results: ProcessingResult[] = [];
        const codeFileExtensions = ['.js', '.jsx', '.ts', '.tsx'];

        for (const filePath of files) {
            const relativePath = relative(this.config.sourceDir, filePath);
            const outputPath = resolve(this.config.outputDir, relativePath);

            try {
                const isCodeFile = codeFileExtensions.some(ext => filePath.endsWith(ext));

                if (isCodeFile && this.config.stripTaggingAttributes) {
                    // Process code file to remove attributes
                    const result = await this.processCodeFile(filePath, outputPath);
                    results.push(result);
                } else {
                    // Copy file as-is or apply transformations
                    const result = await this.copyOrTransformFile(filePath, outputPath);
                    results.push(result);
                }
            } catch (error) {
                this.logger.error(`Failed to process file: ${relativePath}`, error);
                results.push({
                    success: false,
                    filePath: relativePath,
                    elementsProcessed: 0,
                    processingTime: 0,
                    errors: [error instanceof Error ? error.message : 'Unknown error']
                });
            }
        }

        return results;
    }

    /**
     * Process code file to remove element tagger attributes
     */
    private async processCodeFile(inputPath: string, outputPath: string): Promise<ProcessingResult> {
        const startTime = performance.now();
        const relativePath = relative(this.config.sourceDir, inputPath);

        try {
            // Parse the file
            const parseResult = await this.astParser.parseFile(inputPath);

            if (!parseResult.success || !parseResult.ast) {
                // If parsing fails, copy as-is
                await this.copyFile(inputPath, outputPath);
                return {
                    success: true,
                    filePath: relativePath,
                    elementsProcessed: 0,
                    processingTime: performance.now() - startTime,
                    warnings: ['Could not parse file, copied as-is']
                };
            }

            // Strip attributes
            const stripResult = await this.codeStripper.stripAndGenerate(parseResult.ast);

            if (!stripResult.result.success) {
                throw new Error(stripResult.result.error || 'Failed to strip attributes');
            }

            // Ensure output directory
            await ensureDir(dirname(outputPath));

            // Write processed file
            await writeFile(outputPath, stripResult.code, 'utf-8');

            return {
                success: true,
                filePath: relativePath,
                elementsProcessed: stripResult.result.changes.length,
                processedCode: stripResult.code,
                processingTime: performance.now() - startTime
            };
        } catch (error) {
            this.logger.error(`Error processing code file: ${relativePath}`, error);
            return {
                success: false,
                filePath: relativePath,
                elementsProcessed: 0,
                processingTime: performance.now() - startTime,
                errors: [error instanceof Error ? error.message : 'Unknown error']
            };
        }
    }

    /**
     * Copy file or apply transformations
     */
    private async copyOrTransformFile(inputPath: string, outputPath: string): Promise<ProcessingResult> {
        const startTime = performance.now();
        const relativePath = relative(this.config.sourceDir, inputPath);

        try {
            // Check for transformations
            const transformation = this.config.transformations?.find(t => {
                const regex = new RegExp(t.pattern);
                return regex.test(relativePath);
            });

            if (transformation) {
                // Apply transformation
                const content = await readFile(inputPath, 'utf-8');
                const transformedContent = transformation.transform(content, relativePath);

                await ensureDir(dirname(outputPath));
                await writeFile(outputPath, transformedContent, 'utf-8');
            } else {
                // Copy as-is
                await this.copyFile(inputPath, outputPath);
            }

            return {
                success: true,
                filePath: relativePath,
                elementsProcessed: 0,
                processingTime: performance.now() - startTime
            };
        } catch (error) {
            this.logger.error(`Error copying file: ${relativePath}`, error);
            return {
                success: false,
                filePath: relativePath,
                elementsProcessed: 0,
                processingTime: performance.now() - startTime,
                errors: [error instanceof Error ? error.message : 'Unknown error']
            };
        }
    }

    /**
     * Copy assets
     */
    private async copyAssets(): Promise<ProcessingResult[]> {
        if (!this.config.includeAssets || !this.config.assetPatterns) {
            return [];
        }

        const assetFiles = await glob(this.config.assetPatterns, {
            cwd: this.config.sourceDir,
            ignore: ['node_modules/**'],
            absolute: true,
            onlyFiles: true
        });

        const results: ProcessingResult[] = [];

        for (const assetPath of assetFiles) {
            const relativePath = relative(this.config.sourceDir, assetPath);
            const outputPath = resolve(this.config.outputDir, relativePath);

            const result = await this.copyOrTransformFile(assetPath, outputPath);
            results.push(result);
        }

        return results;
    }

    /**
     * Generate additional files (package.json, README, etc.)
     */
    private async generateAdditionalFiles(): Promise<void> {
        if (this.config.generatePackageJson) {
            await this.generatePackageJson();
        }

        // Generate README if needed
        await this.generateReadme();

        // Generate .gitignore if needed
        await this.generateGitignore();
    }

    /**
     * Generate package.json
     */
    private async generatePackageJson(): Promise<void> {
        const packageJsonPath = resolve(this.config.outputDir, 'package.json');

        // Try to read existing package.json from source
        let existingPackageJson = {};
        const sourcePackageJson = resolve(this.config.sourceDir, 'package.json');

        try {
            const content = await readFile(sourcePackageJson, 'utf-8');
            existingPackageJson = JSON.parse(content);
        } catch {
            // No existing package.json or parse error
        }

        const packageJson = {
            name: 'exported-project',
            version: '1.0.0',
            description: 'Exported project from Element Tagger',
            main: 'index.js',
            scripts: {
                start: 'node index.js',
                build: 'echo "No build step required"'
            },
            ...existingPackageJson,
            ...this.config.packageJsonTemplate
        };

        await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8');
        this.logger.debug('Generated package.json');
    }

    /**
     * Generate README
     */
    private async generateReadme(): Promise<void> {
        const readmePath = resolve(this.config.outputDir, 'README.md');

        // Don't overwrite existing README
        try {
            await readFile(readmePath);
            return; // README already exists
        } catch {
            // README doesn't exist, create one
        }

        const readme = `# Exported Project

This project was exported from Element Tagger.

## Getting Started

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Start the project:
   \`\`\`bash
   npm start
   \`\`\`

## About

This project has been processed to remove all Element Tagger attributes and is ready for production deployment.

Generated on: ${new Date().toISOString()}
`;

        await writeFile(readmePath, readme, 'utf-8');
        this.logger.debug('Generated README.md');
    }

    /**
     * Generate .gitignore
     */
    private async generateGitignore(): Promise<void> {
        const gitignorePath = resolve(this.config.outputDir, '.gitignore');

        // Don't overwrite existing .gitignore
        try {
            await readFile(gitignorePath);
            return; // .gitignore already exists
        } catch {
            // .gitignore doesn't exist, create one
        }

        const gitignore = `# Dependencies
node_modules/
npm-debug.log*

# Build outputs
dist/
build/

# Environment variables
.env
.env.local

# Editor directories and files
.vscode/
.idea/
*.swp
*.swo

# OS generated files
.DS_Store
Thumbs.db

# Logs
logs/
*.log
`;

        await writeFile(gitignorePath, gitignore, 'utf-8');
        this.logger.debug('Generated .gitignore');
    }

    /**
     * Create export manifest
     */
    private async createManifest(
        processResults: ProcessingResult[],
        assetResults: ProcessingResult[]
    ): Promise<ExportManifest> {
        const allResults = [...processResults, ...assetResults];
        const totalElementsRemoved = allResults.reduce((sum, r) => sum + (r.elementsProcessed || 0), 0);

        const files = await Promise.all(
            allResults.map(async (result) => {
                const fullPath = resolve(this.config.outputDir, result.filePath);
                let size = 0;
                let checksum = '';

                try {
                    const { stat, createHash } = await import('fs');
                    const stats = await new Promise<any>((resolve, reject) => {
                        stat(fullPath, (err, stats) => {
                            if (err) reject(err);
                            else resolve(stats);
                        });
                    });
                    size = stats.size;

                    const content = await readFile(fullPath);
                    checksum = createHash('md5').update(content).digest('hex');
                } catch {
                    // File might not exist or be accessible
                }

                return {
                    path: result.filePath,
                    size,
                    checksum,
                    processed: result.success && (result.elementsProcessed || 0) > 0
                };
            })
        );

        const totalSize = files.reduce((sum, f) => sum + f.size, 0);

        return {
            version: '1.0.0',
            exportedAt: new Date().toISOString(),
            sourceDir: this.config.sourceDir,
            files,
            statistics: {
                totalFiles: files.length,
                processedFiles: processResults.filter(r => r.success).length,
                totalSize,
                elementsRemoved: totalElementsRemoved
            }
        };
    }

    /**
     * Create final package based on format
     */
    private async createFinalPackage(manifest: ExportManifest): Promise<void> {
        // Write manifest
        const manifestPath = resolve(this.config.outputDir, 'export-manifest.json');
        await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

        if (this.config.format === 'zip') {
            // Would implement ZIP creation here
            this.logger.warn('ZIP export format not yet implemented');
        }

        // 'folder' format is already done by copying files
    }

    /**
     * Copy file ensuring directory exists
     */
    private async copyFile(sourcePath: string, destPath: string): Promise<void> {
        await ensureDir(dirname(destPath));
        await copyFile(sourcePath, destPath);
    }
}