import { readFile, writeFile, stat } from 'fs-extra';
import { resolve, relative } from 'path';
import { performance } from 'perf_hooks';
import * as glob from 'fast-glob';

import { ASTParser } from './ast-parser';
import { ElementDetector } from './element-detector';
import { IDGenerator, type IDGenerationContext } from './id-generator';
import { CodeInjector, type InjectionContext, type BatchInjectionRequest } from './code-injector';
import { MappingManager } from '../storage/mapping-manager';

import type {
    ProcessingMode,
    ElementTaggerOptions,
    TaggingOptions
} from '../types/config';
import type {
    ProcessingResult,
    ElementMapping
} from '../types/mapping';
import type {
    ParseResult,
    DetectedElement,
    ElementDetectionResult
} from '../types/ast';

import { Logger } from '../utils/logger';

/**
 * File processing configuration
 */
export interface FileProcessingConfig {
    mode: ProcessingMode;
    options: ElementTaggerOptions;
    workingDirectory?: string;
}

/**
 * Processing context for a single file
 */
export interface FileProcessingContext {
    filePath: string;
    absolutePath: string;
    relativePath: string;
    content: string;
    size: number;
    mode: ProcessingMode;
    startTime: number;
}

/**
 * Processing statistics
 */
export interface ProcessingStats {
    filesProcessed: number;
    elementsDetected: number;
    elementsTagged: number;
    totalTime: number;
    averageTimePerFile: number;
    errors: number;
    warnings: number;
}

/**
 * Batch processing result
 */
export interface BatchProcessingResult {
    success: boolean;
    results: ProcessingResult[];
    stats: ProcessingStats;
    errors: string[];
}

/**
 * File processor that orchestrates the complete tagging workflow
 */
export class FileProcessor {
    private readonly logger: Logger;
    private readonly config: FileProcessingConfig;

    private readonly astParser: ASTParser;
    private readonly elementDetector: ElementDetector;
    private readonly idGenerator: IDGenerator;
    private readonly codeInjector: CodeInjector;
    private readonly mappingManager: MappingManager;

    private readonly stats: ProcessingStats = {
        filesProcessed: 0,
        elementsDetected: 0,
        elementsTagged: 0,
        totalTime: 0,
        averageTimePerFile: 0,
        errors: 0,
        warnings: 0
    };

    constructor(config: FileProcessingConfig) {
        this.logger = new Logger('FileProcessor');
        this.config = config;

        // Initialize core components
        this.astParser = new ASTParser();
        this.elementDetector = new ElementDetector(config.options.tagElements);
        this.idGenerator = new IDGenerator(config.options.idGeneration);
        this.codeInjector = new CodeInjector({
            attributeName: 'data-el-id',
            preserveExisting: config.mode !== 'export',
            formatCode: true
        });
        this.mappingManager = new MappingManager(
            config.options.mappingFile || '.element-mapping.json'
        );
    }

    /**
     * Process a single file
     */
    async process(filePath: string, mode?: ProcessingMode): Promise<string> {
        const processingMode = mode || this.config.mode;

        try {
            const context = await this.createProcessingContext(filePath, processingMode);
            const result = await this.processFile(context);

            if (!result.success) {
                throw new Error(result.error || 'Processing failed');
            }

            return result.processedCode || context.content;
        } catch (error) {
            this.logger.error(`Failed to process file: ${filePath}`, error);
            this.stats.errors++;
            throw error;
        }
    }

    /**
     * Process an entire project directory
     */
    async processProject(projectPath: string, outputPath?: string): Promise<BatchProcessingResult> {
        this.logger.info(`Processing project: ${projectPath}`);
        const startTime = performance.now();

        try {
            // Find all files to process
            const files = await this.findFilesToProcess(projectPath);
            this.logger.info(`Found ${files.length} files to process`);

            // Process files in batches for better performance
            const batchSize = this.config.options.fileProcessing?.maxWorkers || 4;
            const results: ProcessingResult[] = [];
            const errors: string[] = [];

            for (let i = 0; i < files.length; i += batchSize) {
                const batch = files.slice(i, i + batchSize);
                const batchResults = await this.processBatch(batch);

                results.push(...batchResults.results);
                errors.push(...batchResults.errors);
            }

            // Save mappings if in development or production mode
            if (this.config.mode !== 'export') {
                await this.saveMappings(results);
            }

            // Write processed files if output path is specified
            if (outputPath) {
                await this.writeProcessedFiles(results, outputPath);
            }

            const totalTime = performance.now() - startTime;
            this.updateGlobalStats(totalTime);

            return {
                success: errors.length === 0,
                results,
                stats: { ...this.stats },
                errors
            };
        } catch (error) {
            this.logger.error('Project processing failed', error);
            return {
                success: false,
                results: [],
                stats: { ...this.stats },
                errors: [error instanceof Error ? error.message : 'Unknown error']
            };
        }
    }

    /**
     * Process a single file with full workflow
     */
    private async processFile(context: FileProcessingContext): Promise<ProcessingResult> {
        this.logger.debug(`Processing file: ${context.relativePath}`);

        try {
            // Step 1: Parse the file
            const parseResult = await this.parseFile(context);
            if (!parseResult.success || !parseResult.ast) {
                return this.createErrorResult(context, parseResult.error || 'Parse failed');
            }

            // Step 2: Detect elements (skip if export mode and no existing tags)
            const detectionResult = await this.detectElements(parseResult, context);
            if (detectionResult.totalCount === 0) {
                this.logger.debug(`No elements found in ${context.relativePath}`);
                return this.createSuccessResult(context, context.content, []);
            }

            // Step 3: Process elements based on mode
            const processedCode = await this.processElements(
                parseResult,
                detectionResult,
                context
            );

            // Step 4: Create element mappings
            const mappings = await this.createElementMappings(
                detectionResult.elements,
                context
            );

            const result = this.createSuccessResult(context, processedCode, mappings);
            this.updateFileStats(result);

            return result;
        } catch (error) {
            this.logger.error(`Error processing ${context.relativePath}`, error);
            this.stats.errors++;
            return this.createErrorResult(
                context,
                error instanceof Error ? error.message : 'Unknown processing error'
            );
        }
    }

    /**
     * Parse file using AST parser
     */
    private async parseFile(context: FileProcessingContext): Promise<ParseResult> {
        return await this.astParser.parseCode(context.content, context.absolutePath);
    }

    /**
     * Detect elements in parsed AST
     */
    private async detectElements(
        parseResult: ParseResult,
        context: FileProcessingContext
    ): Promise<ElementDetectionResult> {
        if (!parseResult.ast) {
            return {
                elements: [],
                totalCount: 0,
                domElements: 0,
                customComponents: 0,
                fragments: 0
            };
        }

        return this.elementDetector.detectElements(parseResult.ast, context.absolutePath);
    }

    /**
     * Process elements based on current mode
     */
    private async processElements(
        parseResult: ParseResult,
        detectionResult: ElementDetectionResult,
        context: FileProcessingContext
    ): Promise<string> {
        if (!parseResult.ast) {
            return context.content;
        }

        switch (context.mode) {
            case 'export':
                return await this.processForExport(parseResult.ast);

            case 'development':
            case 'production':
                return await this.processForTagging(
                    parseResult.ast,
                    detectionResult.elements,
                    context
                );

            default:
                return context.content;
        }
    }

    /**
     * Process AST for export mode (remove all tags)
     */
    private async processForExport(ast: any): Promise<string> {
        // Remove existing data-el-id attributes
        const removalResult = await this.codeInjector.removeAttributes(ast);

        if (!removalResult.success) {
            this.logger.warn('Failed to remove attributes during export');
        }

        // Generate clean code
        return await this.codeInjector.generateCode(ast);
    }

    /**
     * Process AST for tagging modes (add/update tags)
     */
    private async processForTagging(
        ast: any,
        elements: DetectedElement[],
        context: FileProcessingContext
    ): Promise<string> {
        // Load existing mappings for this file
        const existingMappings = await this.mappingManager.getFileMapping(context.relativePath);

        // Generate IDs for elements
        const injectionContexts: InjectionContext[] = [];

        for (const element of elements) {
            const shouldTag = this.elementDetector.shouldTagElement(element);

            if (shouldTag) {
                const idContext: IDGenerationContext = {
                    filePath: context.relativePath,
                    element,
                    existing: existingMappings
                };

                const idResult = this.idGenerator.generateId(idContext);

                injectionContexts.push({
                    element,
                    idResult,
                    shouldInject: true
                });
            }
        }

        // Inject IDs into AST
        const batchRequest: BatchInjectionRequest = {
            ast,
            contexts: injectionContexts,
            filePath: context.relativePath
        };

        const { code } = await this.codeInjector.injectAndGenerate(batchRequest);

        this.stats.elementsTagged += injectionContexts.length;
        return code;
    }

    /**
     * Create element mappings from detected elements
     */
    private async createElementMappings(
        elements: DetectedElement[],
        context: FileProcessingContext
    ): Promise<ElementMapping[]> {
        const mappings: ElementMapping[] = [];
        const timestamp = new Date().toISOString();

        for (const element of elements) {
            if (this.elementDetector.shouldTagElement(element)) {
                const idContext: IDGenerationContext = {
                    filePath: context.relativePath,
                    element
                };

                const idResult = this.idGenerator.generateId(idContext);

                const mapping: ElementMapping = {
                    id: idResult.id,
                    filePath: context.relativePath,
                    element: element.tagName,
                    elementType: element.elementType,
                    line: element.position.line,
                    column: element.position.column,
                    start: element.position.start,
                    end: element.position.end,
                    hash: idResult.hash,
                    attributes: this.extractAttributesMap(element),
                    created: timestamp,
                    updated: timestamp
                };

                mappings.push(mapping);
            }
        }

        return mappings;
    }

    /**
     * Extract attributes as a map
     */
    private extractAttributesMap(element: DetectedElement): Record<string, string | null> {
        const attrs: Record<string, string | null> = {};

        element.attributes.forEach(attr => {
            if (!attr.isDataElId) {
                attrs[attr.name] = attr.value;
            }
        });

        return attrs;
    }

    /**
     * Create file processing context
     */
    private async createProcessingContext(
        filePath: string,
        mode: ProcessingMode
    ): Promise<FileProcessingContext> {
        const absolutePath = resolve(filePath);
        const workingDir = this.config.workingDirectory || process.cwd();
        const relativePath = relative(workingDir, absolutePath);

        const content = await readFile(absolutePath, 'utf-8');
        const fileStats = await stat(absolutePath);

        return {
            filePath,
            absolutePath,
            relativePath,
            content,
            size: fileStats.size,
            mode,
            startTime: performance.now()
        };
    }

    /**
     * Find all files to process in a project
     */
    private async findFilesToProcess(projectPath: string): Promise<string[]> {
        const include = this.config.options.include || ['**/*.{js,jsx,ts,tsx}'];
        const exclude = this.config.options.exclude || ['node_modules/**', 'dist/**'];

        const patterns = include.map(pattern => resolve(projectPath, pattern));

        const files = await glob(patterns, {
            ignore: exclude.map(pattern => resolve(projectPath, pattern)),
            absolute: true,
            onlyFiles: true
        });

        // Filter files that should be processed
        return files.filter(file => ASTParser.shouldProcessFile(file));
    }

    /**
     * Process a batch of files
     */
    private async processBatch(filePaths: string[]): Promise<BatchProcessingResult> {
        const results: ProcessingResult[] = [];
        const errors: string[] = [];

        // Process files in parallel if enabled
        if (this.config.options.fileProcessing?.enableParallelProcessing) {
            const promises = filePaths.map(async (filePath) => {
                try {
                    const context = await this.createProcessingContext(filePath, this.config.mode);
                    return await this.processFile(context);
                } catch (error) {
                    errors.push(`${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    return null;
                }
            });

            const batchResults = await Promise.all(promises);
            results.push(...batchResults.filter((r): r is ProcessingResult => r !== null));
        } else {
            // Process files sequentially
            for (const filePath of filePaths) {
                try {
                    const context = await this.createProcessingContext(filePath, this.config.mode);
                    const result = await this.processFile(context);
                    results.push(result);
                } catch (error) {
                    errors.push(`${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
        }

        return {
            success: errors.length === 0,
            results,
            stats: { ...this.stats },
            errors
        };
    }

    /**
     * Save mappings to file
     */
    private async saveMappings(results: ProcessingResult[]): Promise<void> {
        const allMappings: ElementMapping[] = [];

        results.forEach(result => {
            if (result.success && result.mappings) {
                allMappings.push(...result.mappings);
            }
        });

        if (allMappings.length > 0) {
            await this.mappingManager.saveMappings(allMappings);
            this.logger.info(`Saved ${allMappings.length} element mappings`);
        }
    }

    /**
     * Write processed files to output directory
     */
    private async writeProcessedFiles(
        results: ProcessingResult[],
        outputPath: string
    ): Promise<void> {
        for (const result of results) {
            if (result.success && result.processedCode) {
                const outputFile = resolve(outputPath, result.filePath);
                await writeFile(outputFile, result.processedCode, 'utf-8');
            }
        }

        this.logger.info(`Written ${results.length} processed files to ${outputPath}`);
    }

    /**
     * Create success result
     */
    private createSuccessResult(
        context: FileProcessingContext,
        processedCode: string,
        mappings: ElementMapping[]
    ): ProcessingResult {
        return {
            success: true,
            filePath: context.relativePath,
            elementsProcessed: mappings.length,
            processedCode,
            mappings,
            processingTime: performance.now() - context.startTime
        };
    }

    /**
     * Create error result
     */
    private createErrorResult(
        context: FileProcessingContext,
        error: string
    ): ProcessingResult {
        return {
            success: false,
            filePath: context.relativePath,
            elementsProcessed: 0,
            errors: [error],
            processingTime: performance.now() - context.startTime
        };
    }

    /**
     * Update statistics for a processed file
     */
    private updateFileStats(result: ProcessingResult): void {
        this.stats.filesProcessed++;
        this.stats.elementsDetected += result.elementsProcessed;

        if (result.success) {
            this.stats.totalTime += result.processingTime;
            this.stats.averageTimePerFile = this.stats.totalTime / this.stats.filesProcessed;
        }
    }

    /**
     * Update global statistics
     */
    private updateGlobalStats(totalTime: number): void {
        this.stats.totalTime = totalTime;
        if (this.stats.filesProcessed > 0) {
            this.stats.averageTimePerFile = totalTime / this.stats.filesProcessed;
        }
    }

    /**
     * Get current processing statistics
     */
    getStats(): ProcessingStats {
        return { ...this.stats };
    }

    /**
     * Reset statistics
     */
    resetStats(): void {
        Object.assign(this.stats, {
            filesProcessed: 0,
            elementsDetected: 0,
            elementsTagged: 0,
            totalTime: 0,
            averageTimePerFile: 0,
            errors: 0,
            warnings: 0
        });
    }

    /**
     * Create a new processor with different config
     */
    withConfig(newConfig: Partial<FileProcessingConfig>): FileProcessor {
        return new FileProcessor({ ...this.config, ...newConfig });
    }
}