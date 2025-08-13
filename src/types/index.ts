// Re-export all types from individual modules

import { DetectedElement } from './ast';
import { ElementTaggerOptions, ProcessingMode } from './config';
import { ElementMapping } from './mapping';

// AST types
export type {
    ASTNode,
    JSXElement,
    JSXOpeningElement,
    JSXClosingElement,
    JSXElementName,
    JSXIdentifier,
    JSXMemberExpression,
    JSXNamespacedName,
    JSXAttribute,
    JSXAttributeValue,
    JSXExpressionContainer,
    JSXEmptyExpression,
    JSXFragment,
    JSXOpeningFragment,
    JSXClosingFragment,
    JSXText,
    JSXChild,
    ParseResult,
    ParseMetadata,
    ParserConfig,
    ASTVisitor,
    NodePath,
    ElementDetectionResult,
    DetectedElement,
    ElementAttribute,
    ElementPosition,
    ModificationResult,
    ModificationChange
} from './ast';

// Configuration types
export type {
    ProcessingMode,
    TaggingOptions,
    RuntimeOptions,
    EditorOptions,
    PanelConfig,
    FileProcessingOptions,
    IDGenerationOptions,
    SyncOptions,
    ExportOptions,
    PerformanceOptions,
    LoggingOptions,
    ElementTaggerOptions,
    PluginConfig,
    ConfigValidationResult,
    EnvironmentInfo
} from './config';

// Mapping types
export type {
    ElementMapping,
    ElementMetadata,
    MappingFile,
    MappingStats,
    MappingSchema,
    ValidationRule,
    ValidationResult,
    ValidationError,
    MappingOptions,
    MappingOperationResult,
    MappingUpdate,
    MappingChangeHistory,
    MappingQuery
} from './mapping';

// Runtime types (when implemented)
export type * from './runtime';

// Editor types (when implemented)  
export type * from './editor';

// Plugin types (when implemented)
export type * from './plugin';

// Event types (when implemented)
export type * from './events';

// Common utility types
export interface ProcessingResult {
    success: boolean;
    filePath: string;
    elementsProcessed: number;
    processedCode?: string;
    mappings?: ElementMapping[];
    processingTime: number;
    errors?: string[];
    warnings?: string[];
}

export interface BatchProcessingResult {
    success: boolean;
    results: ProcessingResult[];
    stats: ProcessingStats;
    errors: string[];
}

export interface ProcessingStats {
    filesProcessed: number;
    elementsDetected: number;
    elementsTagged: number;
    totalTime: number;
    averageTimePerFile: number;
    errors: number;
    warnings: number;
}

// Error types
export interface ElementTaggerError extends Error {
    code: string;
    filePath?: string;
    elementId?: string;
    context?: Record<string, any>;
}

// Event types for extensibility
export interface ElementTaggerEvent {
    type: string;
    timestamp: string;
    data?: any;
}

export interface FileProcessedEvent extends ElementTaggerEvent {
    type: 'file-processed';
    data: {
        filePath: string;
        elementsCount: number;
        processingTime: number;
    };
}

export interface ElementTaggedEvent extends ElementTaggerEvent {
    type: 'element-tagged';
    data: {
        elementId: string;
        filePath: string;
        elementType: string;
        tagName: string;
    };
}

export interface MappingSavedEvent extends ElementTaggerEvent {
    type: 'mapping-saved';
    data: {
        mappingFile: string;
        elementsCount: number;
    };
}

// Union type for all events
export type AllElementTaggerEvents =
    | FileProcessedEvent
    | ElementTaggedEvent
    | MappingSavedEvent;

// Plugin system types
export interface PluginHooks {
    beforeProcessing?: (filePath: string) => void | Promise<void>;
    afterProcessing?: (result: ProcessingResult) => void | Promise<void>;
    beforeElementTagging?: (element: DetectedElement) => void | Promise<void>;
    afterElementTagging?: (element: DetectedElement, id: string) => void | Promise<void>;
    beforeExport?: (projectPath: string) => void | Promise<void>;
    afterExport?: (outputPath: string) => void | Promise<void>;
}

export interface Plugin {
    name: string;
    version?: string;
    description?: string;
    hooks?: PluginHooks;
    options?: Record<string, any>;
}

// Build tool integration types
export interface BuildToolPlugin {
    name: string;
    apply: (config: any) => void;
    options?: Record<string, any>;
}

export interface VitePluginOptions {
    include?: string[];
    exclude?: string[];
    mode?: ProcessingMode;
    elementTaggerOptions?: ElementTaggerOptions;
}

export interface WebpackPluginOptions {
    include?: string[];
    exclude?: string[];
    mode?: ProcessingMode;
    elementTaggerOptions?: ElementTaggerOptions;
}

export interface NextPluginOptions {
    elementTaggerOptions?: ElementTaggerOptions;
}
