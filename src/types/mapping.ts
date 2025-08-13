import type { ElementTaggerOptions } from './config';

/**
 * Element mapping entry stored in the mapping file
 */
export interface ElementMapping {
    /** Unique identifier for the element */
    id: string;

    /** File path where the element is located */
    filePath: string;

    /** Element tag name (div, span, Button, etc.) */
    element: string;

    /** Element type classification */
    elementType: 'dom' | 'component' | 'fragment';

    /** Line number in source file */
    line: number;

    /** Column number in source file */
    column: number;

    /** Start position in file */
    start: number;

    /** End position in file */
    end: number;

    /** Hash used for ID generation */
    hash: string;

    /** Text content of the element (if applicable) */
    content?: string;

    /** Element attributes (excluding data-el-id) */
    attributes?: Record<string, string | null>;

    /** CSS styles applied to the element */
    styles?: Record<string, string>;

    /** Parent element ID */
    parentId?: string;

    /** Child element IDs */
    children?: string[];

    /** Timestamp when mapping was created */
    created: string;

    /** Timestamp when mapping was last updated */
    updated: string;

    /** Additional metadata */
    metadata?: ElementMetadata;
}

/**
 * Additional metadata for an element
 */
export interface ElementMetadata {
    /** Whether element is currently visible */
    isVisible?: boolean;

    /** Whether element is interactive */
    isInteractive?: boolean;

    /** Custom component props (if applicable) */
    props?: Record<string, any>;

    /** CSS classes applied */
    classes?: string[];

    /** Accessibility attributes */
    accessibility?: {
        role?: string;
        label?: string;
        description?: string;
    };

    /** Performance metrics */
    performance?: {
        renderTime?: number;
        lastRender?: string;
    };
}

/**
 * Complete mapping file structure
 */
export interface MappingFile {
    /** Mapping file format version */
    version: string;

    /** Timestamp when file was generated */
    generated: string;

    /** Configuration used for generation */
    config: Partial<ElementTaggerOptions>;

    /** File mappings organized by file path */
    files: Record<string, ElementMapping[]>;

    /** Global statistics */
    stats: MappingStats;

    /** Schema validation info */
    schema?: MappingSchema;
}

/**
 * Statistics about the mapping file
 */
export interface MappingStats {
    /** Total number of mapped elements */
    totalElements: number;

    /** Total number of files processed */
    totalFiles: number;

    /** Timestamp of last processing */
    lastProcessed: string;

    /** Processing duration in milliseconds */
    processingTime?: number;

    /** Breakdown by element type */
    elementTypes: {
        dom: number;
        component: number;
        fragment: number;
    };

    /** Breakdown by file type */
    fileTypes: {
        jsx: number;
        tsx: number;
        js: number;
        ts: number;
    };

    /** Cache hit rate for ID generation */
    cacheHitRate?: number;
}

/**
 * Schema information for mapping file validation
 */
export interface MappingSchema {
    /** Schema version */
    version: string;

    /** Schema URL or identifier */
    url?: string;

    /** Validation rules */
    rules?: ValidationRule[];
}

/**
 * Validation rule for mapping file
 */
export interface ValidationRule {
    /** Rule name/identifier */
    name: string;

    /** Rule description */
    description: string;

    /** Rule severity */
    severity: 'error' | 'warning' | 'info';

    /** Validation function */
    validate: (mapping: ElementMapping) => boolean;
}

/**
 * Result of mapping file validation
 */
export interface ValidationResult {
    /** Whether validation passed */
    isValid: boolean;

    /** Validation errors */
    errors: ValidationError[];

    /** Validation warnings */
    warnings: ValidationError[];

    /** Statistics about validation */
    stats: {
        totalElements: number;
        validElements: number;
        invalidElements: number;
    };
}

/**
 * Validation error or warning
 */
export interface ValidationError {
    /** Error/warning message */
    message: string;

    /** Severity level */
    severity: 'error' | 'warning' | 'info';

    /** Element ID that caused the error */
    elementId?: string;

    /** File path where error occurred */
    filePath?: string;

    /** Rule that was violated */
    rule?: string;

    /** Additional context */
    context?: Record<string, any>;
}

/**
 * Options for mapping file operations
 */
export interface MappingOptions {
    /** Include element content in mappings */
    includeContent?: boolean;

    /** Include element attributes in mappings */
    includeAttributes?: boolean;

    /** Include CSS styles in mappings */
    includeStyles?: boolean;

    /** Include parent-child relationships */
    includeHierarchy?: boolean;

    /** Include metadata */
    includeMetadata?: boolean;

    /** Validate mappings on save */
    validateOnSave?: boolean;

    /** Backup previous mapping file */
    createBackup?: boolean;

    /** Compress mapping file */
    compress?: boolean;
}

/**
 * Mapping file operation result
 */
export interface MappingOperationResult {
    /** Whether operation succeeded */
    success: boolean;

    /** Operation that was performed */
    operation: 'read' | 'write' | 'update' | 'delete' | 'validate';

    /** File path that was operated on */
    filePath: string;

    /** Number of elements affected */
    elementsAffected?: number;

    /** Operation duration in milliseconds */
    duration?: number;

    /** Error message if operation failed */
    error?: string;

    /** Additional result data */
    data?: any;
}

/**
 * Mapping update operation
 */
export interface MappingUpdate {
    /** Type of update */
    type: 'add' | 'update' | 'remove' | 'move';

    /** Element ID being updated */
    elementId: string;

    /** File path */
    filePath: string;

    /** New mapping data (for add/update operations) */
    mapping?: Partial<ElementMapping>;

    /** Previous mapping data (for update/remove operations) */
    previousMapping?: ElementMapping;

    /** Timestamp of update */
    timestamp: string;

    /** Reason for update */
    reason?: string;
}

/**
 * Mapping change history entry
 */
export interface MappingChangeHistory {
    /** Change ID */
    id: string;

    /** Timestamp of change */
    timestamp: string;

    /** Type of change */
    type: 'file-added' | 'file-removed' | 'file-modified' | 'element-added' | 'element-removed' | 'element-modified';

    /** File path affected */
    filePath: string;

    /** Element ID affected (if applicable) */
    elementId?: string;

    /** Change details */
    details: Record<string, any>;

    /** User or system that made the change */
    source?: string;
}

/**
 * Mapping query parameters
 */
export interface MappingQuery {
    /** Filter by file path pattern */
    filePath?: string | RegExp;

    /** Filter by element type */
    elementType?: 'dom' | 'component' | 'fragment';

    /** Filter by element tag name */
    tagName?: string | RegExp;

    /** Filter by element ID pattern */
    elementId?: string | RegExp;

    /** Filter by attributes */
    attributes?: Record<string, string | RegExp>;

    /** Filter by content */
    content?: string | RegExp;

    /** Filter by date range */
    dateRange?: {
        from: string;
        to: string;
    };

    /** Include child elements */
    includeChildren?: boolean;

    /** Include parent elements */
    includeParents?: boolean;

    /** Maximum number of results */
    limit?: number;

    /** Offset for pagination */
    offset?: number;

    /** Sort order */
    sort?: {
        field: keyof ElementMapping;
        order: 'asc' | 'desc';
    };
}