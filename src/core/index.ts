import { ASTParser } from './ast-parser';
import { ASTTraverser } from './ast-traverser';
import { ElementDetector } from './element-detector';
import { IDGenerator, type IDGenerationContext } from './id-generator';
import { CodeInjector, type InjectionContext, type BatchInjectionRequest } from './code-injector';
import { CodeStripper } from './code-stripper';
import { FileProcessor, type FileProcessingConfig } from './file-processor';
import { MappingManager } from '../storage/mapping-manager';
import type {
    ElementTaggerOptions,
    ProcessingMode,
    TaggingOptions
} from '../types/config';
import type {
    ParseResult,
    DetectedElement,
    ElementDetectionResult
} from '../types/ast';
import type { ElementMapping } from '../types/mapping';
import { Logger } from '../utils/logger';

/**
 * Main ElementTagger class that orchestrates all core functionality
 */
export class ElementTagger {
    private readonly logger: Logger;
    private readonly options: Required<ElementTaggerOptions>;

    private readonly astParser: ASTParser;
    private readonly astTraverser: ASTTraverser;
    private readonly elementDetector: ElementDetector;
    private readonly idGenerator: IDGenerator;
    private readonly codeInjector: CodeInjector;
    private readonly codeStripper: CodeStripper;
    private readonly fileProcessor: FileProcessor;
    private readonly mappingManager: MappingManager;

    constructor(options: ElementTaggerOptions = {}) {
        this.logger = new Logger('ElementTagger');

        // Merge with defaults
        this.options = {
            mode: 'development',
            include: ['**/*.jsx', '**/*.tsx'],
            exclude: ['node_modules/**', 'dist/**'],
            mappingFile: '.element-mapping.json',
            watchFiles: true,
            tagElements: {
                domElements: true,
                customComponents: false,
                fragments: false,
                textNodes: false
            },
            idGeneration: {
                idFormat: '{filename}-{element}-{hash}',
                hashLength: 8,
                includePosition: true,
                separator: '-'
            },
            runtime: {
                enableClickHandler: true,
                enableHighlighter: true,
                highlightColor: '#007acc',
                highlightOpacity: 0.3
            },
            editor: {
                enableInlineEditing: true,
                enablePropertiesPanel: true,
                enableStyleEditor: true,
                autoSave: true,
                autoSaveDelay: 1000
            },
            sync: {
                enableRealTimeSync: false,
                syncDelay: 500
            },
            export: {
                stripTaggingAttributes: true,
                minify: false,
                includeSourceMaps: false
            },
            fileProcessing: {
                enableParallelProcessing: false,
                maxWorkers: 4
            },
            performance: {
                enableCaching: true,
                enableMonitoring: false
            },
            logging: {
                level: 'info',
                enableColors: true,
                enableTimestamps: true
            },
            plugins: [],
            buildTools: {},
            environments: {},
            mappingOptions: {},
            ...options
        } as Required<ElementTaggerOptions>;

        // Initialize core components
        this.astParser = new ASTParser();
        this.astTraverser = new ASTTraverser();
        this.elementDetector = new ElementDetector(this.options.tagElements);
        this.idGenerator = new IDGenerator(this.options.idGeneration);
        this.codeInjector = new CodeInjector({
            attributeName: 'data-el-id',
            preserveExisting: this.options.mode !== 'export',
            formatCode: true
        });
        this.codeStripper = new CodeStripper({
            attributesToStrip: ['data-el-id'],
            minifyOutput: this.options.export?.minify || false,
            preserveComments: !this.options.export?.minify
        });

        const processingConfig: FileProcessingConfig = {
            mode: this.options.mode,
            options: this.options
        };
        this.fileProcessor = new FileProcessor(processingConfig);
        this.mappingManager = new MappingManager(this.options.mappingFile);

        this.logger.info(`ElementTagger initialized in ${this.options.mode} mode`);
    }

    /**
     * Process a single file
     */
    async processFile(filePath: string, mode?: ProcessingMode): Promise<string> {
        this.logger.debug(`Processing file: ${filePath}`);
        return await this.fileProcessor.process(filePath, mode);
    }

    /**
     * Process an entire project directory
     */
    async processProject(projectPath: string, outputPath?: string): Promise<void> {
        this.logger.info(`Processing project: ${projectPath}`);
        const result = await this.fileProcessor.processProject(projectPath, outputPath);

        if (!result.success) {
            throw new Error(`Project processing failed: ${result.errors.join(', ')}`);
        }

        this.logger.info(`Successfully processed ${result.results.length} files`);
    }

    /**
     * Export clean code without element tagger attributes
     */
    async exportCleanCode(projectPath: string, outputPath: string): Promise<void> {
        const originalMode = this.options.mode;
        this.options.mode = 'export';

        try {
            await this.processProject(projectPath, outputPath);
            this.logger.info(`Clean code exported to: ${outputPath}`);
        } finally {
            this.options.mode = originalMode;
        }
    }

    /**
     * Parse a file and return AST
     */
    async parseFile(filePath: string): Promise<ParseResult> {
        return await this.astParser.parseFile(filePath);
    }

    /**
     * Parse code string and return AST
     */
    async parseCode(code: string, filePath?: string): Promise<ParseResult> {
        return await this.astParser.parseCode(code, filePath);
    }

    /**
     * Detect elements in AST
     */
    detectElements(ast: any, filePath?: string): ElementDetectionResult {
        return this.elementDetector.detectElements(ast, filePath);
    }

    /**
     * Generate ID for an element
     */
    generateElementId(context: IDGenerationContext): any {
        return this.idGenerator.generateId(context);
    }

    /**
     * Inject data-el-id attributes into code
     */
    async injectIds(request: BatchInjectionRequest): Promise<{ code: string; result: any }> {
        return await this.codeInjector.injectAndGenerate(request);
    }

    /**
     * Strip data-el-id attributes from code
     */
    async stripIds(ast: any): Promise<{ code: string; result: any }> {
        return await this.codeStripper.stripAndGenerate(ast);
    }

    /**
     * Get element mappings for a file
     */
    async getFileMappings(filePath: string): Promise<ElementMapping[]> {
        return await this.mappingManager.getFileMapping(filePath);
    }

    /**
     * Get element mapping by ID
     */
    async getMappingById(elementId: string): Promise<ElementMapping | null> {
        return await this.mappingManager.getMappingById(elementId);
    }

    /**
     * Save element mappings
     */
    async saveMappings(mappings: ElementMapping[]): Promise<void> {
        const result = await this.mappingManager.saveMappings(mappings);
        if (!result.success) {
            throw new Error(result.error || 'Failed to save mappings');
        }
    }

    /**
     * Get processing statistics
     */
    getStats(): any {
        return this.fileProcessor.getStats();
    }

    /**
     * Set processing mode
     */
    setMode(mode: ProcessingMode): void {
        this.options.mode = mode;
        this.logger.info(`Mode changed to: ${mode}`);
    }

    /**
     * Get current mode
     */
    getMode(): ProcessingMode {
        return this.options.mode;
    }

    /**
     * Get current configuration
     */
    getConfig(): Required<ElementTaggerOptions> {
        return { ...this.options };
    }

    /**
     * Update configuration
     */
    updateConfig(newOptions: Partial<ElementTaggerOptions>): void {
        Object.assign(this.options, newOptions);
        this.logger.info('Configuration updated');
    }

    /**
     * Check if a file should be processed
     */
    shouldProcessFile(filePath: string): boolean {
        return ASTParser.shouldProcessFile(filePath);
    }

    /**
     * Validate that a file can be parsed
     */
    async validateFile(filePath: string): Promise<boolean> {
        try {
            const parseResult = await this.parseFile(filePath);
            return parseResult.success;
        } catch {
            return false;
        }
    }

    /**
     * Get detailed information about processing capabilities
     */
    getProcessingInfo(): {
        supportedFileTypes: string[];
        currentMode: ProcessingMode;
        taggingOptions: TaggingOptions;
        mappingFile: string;
        version: string;
    } {
        return {
            supportedFileTypes: ['.js', '.jsx', '.ts', '.tsx'],
            currentMode: this.options.mode,
            taggingOptions: this.options.tagElements,
            mappingFile: this.options.mappingFile,
            version: '1.0.0'
        };
    }

    /**
     * Create a new ElementTagger instance with different options
     */
    withOptions(newOptions: Partial<ElementTaggerOptions>): ElementTagger {
        return new ElementTagger({ ...this.options, ...newOptions });
    }

    /**
     * Dispose resources and cleanup
     */
    dispose(): void {
        this.mappingManager.clearCache();
        this.idGenerator.clearCache();
        this.logger.info('ElementTagger disposed');
    }
}

// Export all core classes and types
export {
    ASTParser,
    ASTTraverser,
    ElementDetector,
    IDGenerator,
    CodeInjector,
    CodeStripper,
    FileProcessor,
    MappingManager
};

// Export core types
export type {
    IDGenerationContext,
    InjectionContext,
    BatchInjectionRequest,
    FileProcessingConfig
};

// Export interfaces for extensibility
export type {
    ParseResult,
    DetectedElement,
    ElementDetectionResult,
    ElementMapping
};