import { createHash } from 'crypto';
import { basename, extname } from 'path';
import type { DetectedElement, ElementPosition } from '../types/ast';
import type { ElementMapping } from '../types/mapping';
import { Logger } from '../utils/logger';

/**
 * Configuration for ID generation
 */
export interface IDGeneratorConfig {
    idFormat?: string;
    hashLength?: number;
    includeLineNumbers?: boolean;
    includePosition?: boolean;
    prefix?: string;
    suffix?: string;
    separator?: string;
}

/**
 * Context for generating element IDs
 */
export interface IDGenerationContext {
    filePath: string;
    element: DetectedElement;
    existing?: ElementMapping[];
    index?: number;
}

/**
 * Result of ID generation
 */
export interface IDGenerationResult {
    id: string;
    hash: string;
    components: IDComponents;
    isReused: boolean;
}

/**
 * Components that make up an ID
 */
export interface IDComponents {
    filename: string;
    element: string;
    hash: string;
    position?: string;
    index?: string;
}

/**
 * Stable ID generator for JSX elements
 * Generates consistent IDs that remain stable across code changes
 */
export class IDGenerator {
    private readonly logger: Logger;
    private readonly config: Required<IDGeneratorConfig>;
    private readonly idCache = new Map<string, string>();
    private readonly hashCache = new Map<string, string>();

    constructor(config: IDGeneratorConfig = {}) {
        this.logger = new Logger('IDGenerator');
        this.config = {
            idFormat: '{filename}-{element}-{hash}',
            hashLength: 8,
            includeLineNumbers: false,
            includePosition: true,
            prefix: '',
            suffix: '',
            separator: '-',
            ...config
        };
    }

    /**
     * Generate a stable ID for an element
     */
    generateId(context: IDGenerationContext): IDGenerationResult {
        try {
            // Check if we already have an ID for this element
            const existingResult = this.findExistingId(context);
            if (existingResult) {
                this.logger.debug(`Reusing existing ID: ${existingResult.id}`);
                return existingResult;
            }

            // Generate new ID
            const components = this.generateComponents(context);
            const id = this.formatId(components);
            const hash = components.hash;

            // Cache the result
            const cacheKey = this.getCacheKey(context);
            this.idCache.set(cacheKey, id);

            const result: IDGenerationResult = {
                id,
                hash,
                components,
                isReused: false
            };

            this.logger.debug(`Generated new ID: ${id} for ${context.element.tagName}`);
            return result;
        } catch (error) {
            this.logger.error('Failed to generate ID', error);
            // Fallback to a simple ID
            const fallbackId = this.generateFallbackId(context);
            return {
                id: fallbackId,
                hash: 'fallback',
                components: {
                    filename: 'unknown',
                    element: context.element.tagName,
                    hash: 'fallback'
                },
                isReused: false
            };
        }
    }

    /**
     * Generate ID components
     */
    private generateComponents(context: IDGenerationContext): IDComponents {
        const filename = this.extractFilename(context.filePath);
        const element = this.normalizeElementName(context.element.tagName);
        const hash = this.generateHash(context);

        const components: IDComponents = {
            filename,
            element,
            hash
        };

        // Add optional components
        if (this.config.includePosition) {
            components.position = this.formatPosition(context.element.position);
        }

        if (context.index !== undefined) {
            components.index = context.index.toString();
        }

        return components;
    }

    /**
     * Generate a stable hash for the element
     */
    private generateHash(context: IDGenerationContext): string {
        const hashInput = this.createHashInput(context);
        const cacheKey = hashInput;

        // Check cache first
        if (this.hashCache.has(cacheKey)) {
            return this.hashCache.get(cacheKey)!;
        }

        // Generate new hash
        const hash = createHash('md5')
            .update(hashInput)
            .digest('hex')
            .substring(0, this.config.hashLength);

        this.hashCache.set(cacheKey, hash);
        return hash;
    }

    /**
     * Create input string for hash generation
     */
    private createHashInput(context: IDGenerationContext): string {
        const parts: string[] = [
            context.filePath,
            context.element.tagName,
            context.element.elementType
        ];

        // Include position for stability
        if (this.config.includePosition) {
            parts.push(
                context.element.position.line.toString(),
                context.element.position.column.toString()
            );
        }

        // Include line numbers if enabled
        if (this.config.includeLineNumbers) {
            parts.push(context.element.position.line.toString());
        }

        // Include attributes for more specificity
        const sortedAttrs = context.element.attributes
            .filter(attr => !attr.isDataElId) // Exclude our own data-el-id
            .map(attr => `${attr.name}=${attr.value || ''}`)
            .sort()
            .join(',');

        if (sortedAttrs) {
            parts.push(sortedAttrs);
        }

        return parts.join('|');
    }

    /**
     * Format the final ID using the configured template
     */
    private formatId(components: IDComponents): string {
        let id = this.config.idFormat;

        // Replace placeholders
        id = id.replace('{filename}', components.filename);
        id = id.replace('{element}', components.element);
        id = id.replace('{hash}', components.hash);

        if (components.position) {
            id = id.replace('{position}', components.position);
        }

        if (components.index) {
            id = id.replace('{index}', components.index);
        }

        // Remove unused placeholders
        id = id.replace(/\{[^}]+\}/g, '');

        // Apply prefix and suffix
        if (this.config.prefix) {
            id = `${this.config.prefix}${this.config.separator}${id}`;
        }

        if (this.config.suffix) {
            id = `${id}${this.config.separator}${this.config.suffix}`;
        }

        // Clean up multiple separators
        const separator = this.config.separator;
        const regex = new RegExp(`${separator}+`, 'g');
        id = id.replace(regex, separator);

        // Remove leading/trailing separators
        id = id.replace(new RegExp(`^${separator}+|${separator}+$`, 'g'), '');

        return id;
    }

    /**
     * Extract filename from file path
     */
    private extractFilename(filePath: string): string {
        const base = basename(filePath, extname(filePath));
        // Convert to PascalCase for consistency
        return this.toPascalCase(base);
    }

    /**
     * Normalize element name for ID generation
     */
    private normalizeElementName(tagName: string): string {
        // Handle dot notation (React.Component -> ReactComponent)
        const normalized = tagName.replace(/\./g, '');

        // Ensure proper casing
        if (normalized[0] === normalized[0].toLowerCase()) {
            // DOM element - keep lowercase
            return normalized.toLowerCase();
        } else {
            // Component - ensure PascalCase
            return this.toPascalCase(normalized);
        }
    }

    /**
     * Convert string to PascalCase
     */
    private toPascalCase(str: string): string {
        return str
            .replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '')
            .replace(/^(.)/, char => char.toUpperCase());
    }

    /**
     * Format position for ID component
     */
    private formatPosition(position: ElementPosition): string {
        return `${position.line}-${position.column}`;
    }

    /**
     * Find existing ID for an element
     */
    private findExistingId(context: IDGenerationContext): IDGenerationResult | null {
        if (!context.existing || context.existing.length === 0) {
            return null;
        }

        // Look for exact match based on position and element type
        const match = context.existing.find(mapping =>
            mapping.element === context.element.tagName &&
            mapping.line === context.element.position.line &&
            mapping.column === context.element.position.column
        );

        if (match) {
            return {
                id: match.id,
                hash: match.hash,
                components: this.parseIdComponents(match.id),
                isReused: true
            };
        }

        return null;
    }

    /**
     * Parse ID back into components
     */
    private parseIdComponents(id: string): IDComponents {
        // This is a simplified parser - in a real implementation,
        // you'd want to store the format used to generate the ID
        const parts = id.split(this.config.separator);

        return {
            filename: parts[0] || 'unknown',
            element: parts[1] || 'unknown',
            hash: parts[2] || 'unknown'
        };
    }

    /**
     * Generate cache key for an element
     */
    private getCacheKey(context: IDGenerationContext): string {
        return `${context.filePath}:${context.element.position.line}:${context.element.position.column}:${context.element.tagName}`;
    }

    /**
     * Generate fallback ID when main generation fails
     */
    private generateFallbackId(context: IDGenerationContext): string {
        const filename = basename(context.filePath, extname(context.filePath));
        const timestamp = Date.now().toString(36);
        return `${filename}-${context.element.tagName}-${timestamp}`;
    }

    /**
     * Generate multiple IDs for a batch of elements
     */
    generateBatch(contexts: IDGenerationContext[]): IDGenerationResult[] {
        return contexts.map(context => this.generateId(context));
    }

    /**
     * Validate that an ID is properly formatted
     */
    validateId(id: string): boolean {
        // Basic validation - should not be empty and should match expected pattern
        if (!id || id.trim().length === 0) {
            return false;
        }

        // Should not contain invalid characters
        const invalidChars = /[<>:"\/\\|?*\s]/;
        if (invalidChars.test(id)) {
            return false;
        }

        return true;
    }

    /**
     * Clear internal caches
     */
    clearCache(): void {
        this.idCache.clear();
        this.hashCache.clear();
        this.logger.debug('ID generation caches cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): { idCacheSize: number; hashCacheSize: number } {
        return {
            idCacheSize: this.idCache.size,
            hashCacheSize: this.hashCache.size
        };
    }

    /**
     * Create a new generator with different config
     */
    withConfig(newConfig: Partial<IDGeneratorConfig>): IDGenerator {
        return new IDGenerator({ ...this.config, ...newConfig });
    }
}