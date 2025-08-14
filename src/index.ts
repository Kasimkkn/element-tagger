import { ElementTagger } from './core';
import { VitePlugin, WebpackPlugin, NextPlugin, RollupPlugin } from './plugins';
import { ClickHandler, ElementHighlighter, ElementTracker, DOMUtils } from './runtime';
import { InlineEditor, VisualEditor } from './editor';
import { CodeSynchronizer, ASTUpdater, ChangeTracker, FileWriter } from './sync';
import { CodeExporter, AssetBundler, ProjectGenerator, ZipCreator } from './export';

// Main class
export { ElementTagger };

// Plugin integrations - Now with complete implementations!
export const plugins = {
    vite: VitePlugin,
    webpack: WebpackPlugin,
    next: NextPlugin,
    rollup: RollupPlugin
} as const;

// Runtime functionality - Now with complete implementations
export { ClickHandler, ElementHighlighter, ElementTracker, DOMUtils };

// Editor components - Now with InlineEditor implementation
export { InlineEditor, VisualEditor };

// Code synchronization - Now with complete implementations
export { CodeSynchronizer, ASTUpdater, ChangeTracker, FileWriter };

// Export functionality - Now with complete implementations
export { CodeExporter, AssetBundler, ProjectGenerator, ZipCreator };

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

// Storage and persistence
export {
    CacheManager,
    FileWatcher,
    PersistenceManager
} from './storage';

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
export { generateHash, generateStableHash } from './utils/hash-generator';
export { normalizePath, getFileExtension } from './utils/path-utils';
export { isJSXElement, getJSXElementName } from './utils/jsx-utils';
export { toPascalCase, toCamelCase } from './utils/string-utils';
export { validateElementId, validateFilePath } from './utils/validation';

// Default export for easy usage
export default ElementTagger;