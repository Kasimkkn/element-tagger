/**
 * Processing mode for the element tagger
 */
export type ProcessingMode = 'development' | 'production' | 'export';

/**
 * Element tagging configuration options
 */
export interface TaggingOptions {
    /** Tag DOM elements (div, span, h1, etc.) */
    domElements?: boolean;

    /** Tag custom React components */
    customComponents?: boolean;

    /** Tag React fragments */
    fragments?: boolean;

    /** Tag text nodes */
    textNodes?: boolean;

    /** Custom element filter function */
    elementFilter?: (tagName: string, elementType: 'dom' | 'component' | 'fragment') => boolean;
}

/**
 * Runtime configuration for browser environment
 */
export interface RuntimeOptions {
    /** Enable click handler for element selection */
    enableClickHandler?: boolean;

    /** Enable visual highlighting of elements */
    enableHighlighter?: boolean;

    /** Highlight color for selected elements */
    highlightColor?: string;

    /** Highlight opacity */
    highlightOpacity?: number;

    /** Enable hover effects */
    enableHoverEffects?: boolean;

    /** Hover color */
    hoverColor?: string;

    /** Enable keyboard shortcuts */
    enableKeyboardShortcuts?: boolean;

    /** Custom event handlers */
    eventHandlers?: {
        onElementClick?: (elementId: string, element: HTMLElement) => void;
        onElementHover?: (elementId: string, element: HTMLElement) => void;
        onElementSelect?: (elementId: string, element: HTMLElement) => void;
    };

    /** DOM query selectors */
    selectors?: {
        /** Selector for taggable elements */
        taggableElements?: string;

        /** Selector to exclude from tagging */
        excludeElements?: string;
    };
}

/**
 * Visual editor configuration
 */
export interface EditorOptions {
    /** Enable inline text editing */
    enableInlineEditing?: boolean;

    /** Enable properties panel */
    enablePropertiesPanel?: boolean;

    /** Enable style editor */
    enableStyleEditor?: boolean;

    /** Enable drag and drop */
    enableDragAndDrop?: boolean;

    /** Auto-save changes */
    autoSave?: boolean;

    /** Auto-save delay in milliseconds */
    autoSaveDelay?: number;

    /** Show element boundaries */
    showElementBoundaries?: boolean;

    /** Enable undo/redo functionality */
    enableUndoRedo?: boolean;

    /** Maximum undo history size */
    maxUndoHistory?: number;

    /** Editor theme */
    theme?: 'light' | 'dark' | 'auto';

    /** Custom CSS for editor interface */
    customCSS?: string;

    /** Editor panels configuration */
    panels?: {
        properties?: PanelConfig;
        styles?: PanelConfig;
        layers?: PanelConfig;
        assets?: PanelConfig;
    };
}

/**
 * Panel configuration for editor
 */
export interface PanelConfig {
    /** Whether panel is enabled */
    enabled?: boolean;

    /** Panel position */
    position?: 'left' | 'right' | 'top' | 'bottom' | 'floating';

    /** Panel width/height */
    size?: number;

    /** Whether panel is collapsible */
    collapsible?: boolean;

    /** Whether panel starts collapsed */
    defaultCollapsed?: boolean;

    /** Panel title */
    title?: string;
}

/**
 * File processing configuration
 */
export interface FileProcessingOptions {
    /** File patterns to include */
    include?: string[];

    /** File patterns to exclude */
    exclude?: string[];

    /** Enable file watching */
    watchFiles?: boolean;

    /** Watch options */
    watchOptions?: {
        /** Ignore initial file scan */
        ignoreInitial?: boolean;

        /** Enable persistent watching */
        persistent?: boolean;

        /** Patterns to ignore */
        ignored?: string[];

        /** Polling interval for file changes */
        interval?: number;
    };

    /** Maximum file size to process (in bytes) */
    maxFileSize?: number;

    /** Enable parallel processing */
    enableParallelProcessing?: boolean;

    /** Maximum number of parallel workers */
    maxWorkers?: number;
}

/**
 * ID generation configuration
 */
export interface IDGenerationOptions {
    /** ID format template */
    idFormat?: string;

    /** Hash length for generated IDs */
    hashLength?: number;

    /** ID prefix */
    prefix?: string;

    /** ID suffix */
    suffix?: string;

    /** Separator character */
    separator?: string;

    /** Include line numbers in hash */
    includeLineNumbers?: boolean;

    /** Include position in hash */
    includePosition?: boolean;

    /** Custom ID generation function */
    customIdGenerator?: (context: any) => string;
}

/**
 * Code synchronization options
 */
export interface SyncOptions {
    /** Enable real-time code synchronization */
    enableRealTimeSync?: boolean;

    /** Sync delay in milliseconds */
    syncDelay?: number;

    /** Enable conflict resolution */
    enableConflictResolution?: boolean;

    /** Conflict resolution strategy */
    conflictResolution?: 'manual' | 'auto-local' | 'auto-remote';

    /** Enable backup before sync */
    createBackupBeforeSync?: boolean;

    /** Maximum number of backups to keep */
    maxBackups?: number;

    /** Sync event handlers */
    syncHandlers?: {
        onSyncStart?: () => void;
        onSyncComplete?: () => void;
        onSyncError?: (error: Error) => void;
        onConflict?: (conflict: any) => void;
    };
}

/**
 * Export configuration
 */
export interface ExportOptions {
    /** Output directory for exported code */
    outputDir?: string;

    /** Export format */
    format?: 'zip' | 'folder' | 'single-file';

    /** Include source maps in export */
    includeSourceMaps?: boolean;

    /** Minify exported code */
    minify?: boolean;

    /** Remove comments from exported code */
    removeComments?: boolean;

    /** Remove all data-el-id attributes */
    stripTaggingAttributes?: boolean;

    /** Include assets in export */
    includeAssets?: boolean;

    /** Asset file patterns to include */
    assetPatterns?: string[];

    /** Generate package.json for exported project */
    generatePackageJson?: boolean;

    /** Custom package.json template */
    packageJsonTemplate?: Record<string, any>;

    /** Export hooks */
    hooks?: {
        beforeExport?: () => void | Promise<void>;
        afterExport?: (outputPath: string) => void | Promise<void>;
        onError?: (error: Error) => void;
    };
}

/**
 * Performance configuration
 */
export interface PerformanceOptions {
    /** Enable performance monitoring */
    enableMonitoring?: boolean;

    /** Enable caching */
    enableCaching?: boolean;

    /** Cache size limit */
    cacheSize?: number;

    /** Cache TTL in milliseconds */
    cacheTTL?: number;

    /** Enable memory optimization */
    enableMemoryOptimization?: boolean;

    /** Memory usage limit (in MB) */
    memoryLimit?: number;

    /** Enable performance profiling */
    enableProfiling?: boolean;

    /** Performance thresholds */
    thresholds?: {
        /** Maximum parsing time per file (ms) */
        maxParseTime?: number;

        /** Maximum processing time per file (ms) */
        maxProcessTime?: number;

        /** Maximum memory usage (MB) */
        maxMemoryUsage?: number;
    };
}

/**
 * Logging configuration
 */
export interface LoggingOptions {
    /** Log level */
    level?: 'debug' | 'info' | 'warn' | 'error' | 'silent';

    /** Enable colored output */
    enableColors?: boolean;

    /** Enable timestamps */
    enableTimestamps?: boolean;

    /** Log file path */
    logFile?: string;

    /** Maximum log file size */
    maxLogFileSize?: number;

    /** Number of log files to rotate */
    logRotation?: number;

    /** Custom log format */
    format?: string;

    /** Custom log handler */
    handler?: (level: string, message: string, data?: any) => void;
}

/**
 * Main configuration interface for Element Tagger
 */
export interface ElementTaggerOptions {
    /** Processing mode */
    mode?: ProcessingMode;

    /** File processing options */
    include?: string[];
    exclude?: string[];
    watchFiles?: boolean;

    /** Mapping file configuration */
    mappingFile?: string;
    mappingOptions?: any; // Will be defined in mapping types

    /** Element tagging options */
    tagElements?: TaggingOptions;

    idPrefix?: string;
    idFormat?: string;
    hashLength?: number;
    /** ID generation options */
    idGeneration?: IDGenerationOptions;

    /** Runtime options for browser environment */
    runtime?: RuntimeOptions;

    /** Visual editor options */
    editor?: EditorOptions;

    /** Code synchronization options */
    sync?: SyncOptions;

    /** Export options */
    export?: ExportOptions;

    /** File processing options */
    fileProcessing?: FileProcessingOptions;

    /** Performance options */
    performance?: PerformanceOptions;

    /** Logging options */
    logging?: LoggingOptions;

    /** Plugin configuration */
    plugins?: PluginConfig[];

    /** Custom configuration for specific build tools */
    buildTools?: {
        vite?: Record<string, any>;
        webpack?: Record<string, any>;
        next?: Record<string, any>;
        rollup?: Record<string, any>;
    };

    /** Environment-specific configuration */
    environments?: {
        development?: Partial<ElementTaggerOptions>;
        production?: Partial<ElementTaggerOptions>;
        test?: Partial<ElementTaggerOptions>;
    };
}

/**
 * Plugin configuration
 */
export interface PluginConfig {
    /** Plugin name */
    name: string;

    /** Plugin options */
    options?: Record<string, any>;

    /** Plugin enable/disable */
    enabled?: boolean;

    /** Plugin priority */
    priority?: number;
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
    /** Whether configuration is valid */
    isValid: boolean;

    /** Validation errors */
    errors: string[];

    /** Validation warnings */
    warnings: string[];

    /** Normalized configuration */
    config?: ElementTaggerOptions;
}

/**
 * Environment detection result
 */
export interface EnvironmentInfo {
    /** Detected build tool */
    buildTool?: 'vite' | 'webpack' | 'next' | 'rollup' | 'unknown';

    /** Node.js version */
    nodeVersion?: string;

    /** Package manager */
    packageManager?: 'npm' | 'yarn' | 'pnpm';

    /** TypeScript availability */
    hasTypeScript?: boolean;

    /** React version */
    reactVersion?: string;

    /** Project type */
    projectType?: 'spa' | 'ssr' | 'static' | 'library';
}