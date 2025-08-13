import { ElementTagger } from './core';
import { VitePlugin } from './plugins/vite-plugin';
import { WebpackPlugin } from './plugins/webpack-plugin';
import { NextPlugin } from './plugins/next-plugin';
import { RuntimeTracker } from './runtime';
import { VisualEditor } from './editor';
import { CodeSynchronizer } from './sync';
import { CodeExporter } from './export';

// Main class
export { ElementTagger };

// Plugin integrations
export const plugins = {
    vite: VitePlugin,
    webpack: WebpackPlugin,
    next: NextPlugin
} as const;

// Runtime functionality
export { RuntimeTracker };

// Editor components
export { VisualEditor };

// Code synchronization
export { CodeSynchronizer };

// Export functionality
export { CodeExporter };

// Modes
export { DevelopmentMode, ProductionMode, ExportMode } from './modes';

// Core exports
export {
    ASTParser,
    ASTTraverser,
    ElementDetector,
    IDGenerator,
    CodeInjector,
    CodeStripper,
    FileProcessor,
    MappingManager
} from './core';

// Types - Export all types for external use
export type * from './types';

// Specific type exports for common use cases
export type {
    ElementTaggerOptions,
    ProcessingMode,
    TaggingOptions,
    RuntimeOptions,
    EditorOptions
} from './types/config';

export type {
    ElementMapping,
    MappingFile,
    MappingStats,
    MappingQuery
} from './types/mapping';

export type {
    ASTNode,
    JSXElement,
    ParseResult,
    DetectedElement,
    ElementDetectionResult
} from './types/ast';

// Utility exports
export { Logger, createLogger, configureLogging } from './utils/logger';

// Default export for easy usage
export default ElementTagger;