import { readFile, writeFile, pathExists, ensureFile, copy } from 'fs-extra';
import { resolve, dirname } from 'path';
import { performance } from 'perf_hooks';

import type {
    MappingFile,
    ElementMapping,
    MappingStats,
    MappingOperationResult,
    MappingUpdate,
    MappingQuery,
    ValidationResult,
    MappingOptions
} from '../types/mapping';
import type { ElementTaggerOptions } from '../types/config';
import { Logger } from '../utils/logger';

/**
 * Mapping manager configuration
 */
export interface MappingManagerConfig {
    /** Path to mapping file */
    filePath: string;

    /** Auto-save changes */
    autoSave?: boolean;

    /** Create backup before writing */
    createBackup?: boolean;

    /** Validate on read/write */
    validateOnAccess?: boolean;

    /** Cache mappings in memory */
    enableCaching?: boolean;

    /** Maximum cache size */
    maxCacheSize?: number;
}

/**
 * Manager for element mapping file operations
 */
export class MappingManager {
    private readonly logger: Logger;
    private readonly config: Required<MappingManagerConfig>;
    private readonly filePath: string;

    private mappingCache: MappingFile | null = null;
    private isDirty = false;
    private lastModified = 0;

    constructor(filePath: string, config: Partial<MappingManagerConfig> = {}) {
        this.logger = new Logger('MappingManager');
        this.filePath = resolve(filePath);

        this.config = {
            filePath,
            autoSave: true,
            createBackup: true,
            validateOnAccess: true,
            enableCaching: true,
            maxCacheSize: 10000,
            ...config
        };

        this.logger.debug(`Initialized with mapping file: ${this.filePath}`);
    }

    /**
     * Load mappings from file
     */
    async loadMappings(): Promise<MappingFile> {
        const startTime = performance.now();

        try {
            // Check cache first
            if (this.config.enableCaching && this.mappingCache && !this.isDirty) {
                const fileExists = await pathExists(this.filePath);
                if (fileExists) {
                    const stats = await import('fs').then(fs => fs.promises.stat(this.filePath));
                    if (stats.mtimeMs <= this.lastModified) {
                        this.logger.debug('Using cached mappings');
                        return this.mappingCache;
                    }
                }
            }

            // Load from file
            if (await pathExists(this.filePath)) {
                const content = await readFile(this.filePath, 'utf-8');
                const mappingFile = JSON.parse(content) as MappingFile;

                // Validate if enabled
                if (this.config.validateOnAccess) {
                    const validation = this.validateMappingFile(mappingFile);
                    if (!validation.isValid) {
                        this.logger.warn(`Mapping file validation failed: ${validation.errors.join(', ')}`);
                    }
                }

                // Update cache
                if (this.config.enableCaching) {
                    this.mappingCache = mappingFile;
                    this.lastModified = Date.now();
                    this.isDirty = false;
                }

                const loadTime = performance.now() - startTime;
                this.logger.debug(`Loaded mappings in ${loadTime.toFixed(2)}ms`);

                return mappingFile;
            } else {
                // Create new mapping file
                const emptyMapping = this.createEmptyMappingFile();
                await this.saveMappingFile(emptyMapping);
                return emptyMapping;
            }
        } catch (error) {
            this.logger.error('Failed to load mappings', error);
            // Return empty mapping file as fallback
            return this.createEmptyMappingFile();
        }
    }

    /**
     * Save mappings to file
     */
    async saveMappings(mappings: ElementMapping[], options?: MappingOptions): Promise<MappingOperationResult> {
        const startTime = performance.now();

        try {
            // Load existing mappings
            const existingMappingFile = await this.loadMappings();

            // Update mappings by file
            mappings.forEach(mapping => {
                if (!existingMappingFile.files[mapping.filePath]) {
                    existingMappingFile.files[mapping.filePath] = [];
                }

                // Remove existing mapping with same ID
                existingMappingFile.files[mapping.filePath] =
                    existingMappingFile.files[mapping.filePath].filter(m => m.id !== mapping.id);

                // Add new mapping
                existingMappingFile.files[mapping.filePath].push(mapping);
            });

            // Update stats
            existingMappingFile.stats = this.calculateStats(existingMappingFile);
            existingMappingFile.generated = new Date().toISOString();

            // Save to file
            await this.saveMappingFile(existingMappingFile);

            const duration = performance.now() - startTime;

            return {
                success: true,
                operation: 'write',
                filePath: this.filePath,
                elementsAffected: mappings.length,
                duration
            };
        } catch (error) {
            this.logger.error('Failed to save mappings', error);
            return {
                success: false,
                operation: 'write',
                filePath: this.filePath,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Get mappings for a specific file
     */
    async getFileMapping(filePath: string): Promise<ElementMapping[]> {
        try {
            const mappingFile = await this.loadMappings();
            return mappingFile.files[filePath] || [];
        } catch (error) {
            this.logger.error(`Failed to get mappings for file: ${filePath}`, error);
            return [];
        }
    }

    /**
     * Get mapping by element ID
     */
    async getMappingById(elementId: string): Promise<ElementMapping | null> {
        try {
            const mappingFile = await this.loadMappings();

            for (const fileMappings of Object.values(mappingFile.files)) {
                const mapping = fileMappings.find(m => m.id === elementId);
                if (mapping) {
                    return mapping;
                }
            }

            return null;
        } catch (error) {
            this.logger.error(`Failed to get mapping for ID: ${elementId}`, error);
            return null;
        }
    }

    /**
     * Query mappings with filters
     */
    async queryMappings(query: MappingQuery): Promise<ElementMapping[]> {
        try {
            const mappingFile = await this.loadMappings();
            let results: ElementMapping[] = [];

            // Collect all mappings
            for (const [filePath, mappings] of Object.entries(mappingFile.files)) {
                for (const mapping of mappings) {
                    if (this.matchesQuery(mapping, filePath, query)) {
                        results.push(mapping);
                    }
                }
            }

            // Apply sorting
            if (query.sort) {
                results.sort((a, b) => {
                    const aVal = a[query.sort!.field];
                    const bVal = b[query.sort!.field];

                    if (aVal < bVal) return query.sort!.order === 'asc' ? -1 : 1;
                    if (aVal > bVal) return query.sort!.order === 'asc' ? 1 : -1;
                    return 0;
                });
            }

            // Apply pagination
            if (query.offset || query.limit) {
                const start = query.offset || 0;
                const end = query.limit ? start + query.limit : results.length;
                results = results.slice(start, end);
            }

            return results;
        } catch (error) {
            this.logger.error('Failed to query mappings', error);
            return [];
        }
    }

    /**
     * Update mapping for an element
     */
    async updateMapping(elementId: string, updates: Partial<ElementMapping>): Promise<MappingOperationResult> {
        const startTime = performance.now();

        try {
            const mappingFile = await this.loadMappings();
            let updated = false;

            // Find and update the mapping
            for (const [filePath, mappings] of Object.entries(mappingFile.files)) {
                const index = mappings.findIndex(m => m.id === elementId);
                if (index !== -1) {
                    mappings[index] = {
                        ...mappings[index],
                        ...updates,
                        updated: new Date().toISOString()
                    };
                    updated = true;
                    break;
                }
            }

            if (updated) {
                await this.saveMappingFile(mappingFile);
            }

            const duration = performance.now() - startTime;

            return {
                success: updated,
                operation: 'update',
                filePath: this.filePath,
                elementsAffected: updated ? 1 : 0,
                duration,
                error: updated ? undefined : 'Element not found'
            };
        } catch (error) {
            this.logger.error(`Failed to update mapping: ${elementId}`, error);
            return {
                success: false,
                operation: 'update',
                filePath: this.filePath,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Remove mapping for an element
     */
    async removeMapping(elementId: string): Promise<MappingOperationResult> {
        const startTime = performance.now();

        try {
            const mappingFile = await this.loadMappings();
            let removed = false;

            // Find and remove the mapping
            for (const [filePath, mappings] of Object.entries(mappingFile.files)) {
                const index = mappings.findIndex(m => m.id === elementId);
                if (index !== -1) {
                    mappings.splice(index, 1);
                    removed = true;
                    break;
                }
            }

            if (removed) {
                await this.saveMappingFile(mappingFile);
            }

            const duration = performance.now() - startTime;

            return {
                success: removed,
                operation: 'remove',
                filePath: this.filePath,
                elementsAffected: removed ? 1 : 0,
                duration,
                error: removed ? undefined : 'Element not found'
            };
        } catch (error) {
            this.logger.error(`Failed to remove mapping: ${elementId}`, error);
            return {
                success: false,
                operation: 'remove',
                filePath: this.filePath,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Remove all mappings for a file
     */
    async removeFileMapping(filePath: string): Promise<MappingOperationResult> {
        const startTime = performance.now();

        try {
            const mappingFile = await this.loadMappings();
            const existingCount = mappingFile.files[filePath]?.length || 0;

            if (existingCount > 0) {
                delete mappingFile.files[filePath];
                mappingFile.stats = this.calculateStats(mappingFile);
                await this.saveMappingFile(mappingFile);
            }

            const duration = performance.now() - startTime;

            return {
                success: true,
                operation: 'delete',
                filePath: this.filePath,
                elementsAffected: existingCount,
                duration
            };
        } catch (error) {
            this.logger.error(`Failed to remove file mappings: ${filePath}`, error);
            return {
                success: false,
                operation: 'delete',
                filePath: this.filePath,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Get mapping statistics
     */
    async getStats(): Promise<MappingStats> {
        try {
            const mappingFile = await this.loadMappings();
            return mappingFile.stats;
        } catch (error) {
            this.logger.error('Failed to get mapping stats', error);
            return {
                totalElements: 0,
                totalFiles: 0,
                lastProcessed: new Date().toISOString(),
                elementTypes: { dom: 0, component: 0, fragment: 0 },
                fileTypes: { jsx: 0, tsx: 0, js: 0, ts: 0 }
            };
        }
    }

    /**
     * Validate mapping file structure
     */
    private validateMappingFile(mappingFile: MappingFile): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        let validElements = 0;
        let invalidElements = 0;

        // Check required fields
        if (!mappingFile.version) errors.push('Missing version field');
        if (!mappingFile.generated) errors.push('Missing generated field');
        if (!mappingFile.files) errors.push('Missing files field');
        if (!mappingFile.stats) errors.push('Missing stats field');

        // Validate each mapping
        if (mappingFile.files) {
            for (const [filePath, mappings] of Object.entries(mappingFile.files)) {
                for (const mapping of mappings) {
                    const mappingErrors = this.validateMapping(mapping);
                    if (mappingErrors.length > 0) {
                        errors.push(`${filePath}:${mapping.id}: ${mappingErrors.join(', ')}`);
                        invalidElements++;
                    } else {
                        validElements++;
                    }
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors: errors.map(err => ({ message: err, severity: 'error' as const })),
            warnings: warnings.map(warn => ({ message: warn, severity: 'warning' as const })),
            stats: {
                totalElements: validElements + invalidElements,
                validElements,
                invalidElements
            }
        };
    }

    /**
     * Validate a single mapping
     */
    private validateMapping(mapping: ElementMapping): string[] {
        const errors: string[] = [];

        if (!mapping.id) errors.push('Missing id');
        if (!mapping.filePath) errors.push('Missing filePath');
        if (!mapping.element) errors.push('Missing element');
        if (!mapping.elementType) errors.push('Missing elementType');
        if (typeof mapping.line !== 'number') errors.push('Invalid line number');
        if (typeof mapping.column !== 'number') errors.push('Invalid column number');
        if (!mapping.hash) errors.push('Missing hash');
        if (!mapping.created) errors.push('Missing created timestamp');
        if (!mapping.updated) errors.push('Missing updated timestamp');

        // Validate element type
        if (mapping.elementType && !['dom', 'component', 'fragment'].includes(mapping.elementType)) {
            errors.push('Invalid elementType');
        }

        return errors;
    }

    /**
     * Check if mapping matches query
     */
    private matchesQuery(mapping: ElementMapping, filePath: string, query: MappingQuery): boolean {
        // File path filter
        if (query.filePath) {
            if (typeof query.filePath === 'string') {
                if (!filePath.includes(query.filePath)) return false;
            } else if (query.filePath instanceof RegExp) {
                if (!query.filePath.test(filePath)) return false;
            }
        }

        // Element type filter
        if (query.elementType && mapping.elementType !== query.elementType) {
            return false;
        }

        // Tag name filter
        if (query.tagName) {
            if (typeof query.tagName === 'string') {
                if (mapping.element !== query.tagName) return false;
            } else if (query.tagName instanceof RegExp) {
                if (!query.tagName.test(mapping.element)) return false;
            }
        }

        // Element ID filter
        if (query.elementId) {
            if (typeof query.elementId === 'string') {
                if (!mapping.id.includes(query.elementId)) return false;
            } else if (query.elementId instanceof RegExp) {
                if (!query.elementId.test(mapping.id)) return false;
            }
        }

        // Attributes filter
        if (query.attributes && mapping.attributes) {
            for (const [attrName, attrValue] of Object.entries(query.attributes)) {
                const mappingAttrValue = mapping.attributes[attrName];

                if (typeof attrValue === 'string') {
                    if (mappingAttrValue !== attrValue) return false;
                } else if (attrValue instanceof RegExp) {
                    if (!mappingAttrValue || !attrValue.test(mappingAttrValue)) return false;
                }
            }
        }

        // Content filter
        if (query.content && mapping.content) {
            if (typeof query.content === 'string') {
                if (!mapping.content.includes(query.content)) return false;
            } else if (query.content instanceof RegExp) {
                if (!query.content.test(mapping.content)) return false;
            }
        }

        // Date range filter
        if (query.dateRange) {
            const createdDate = new Date(mapping.created);
            const fromDate = new Date(query.dateRange.from);
            const toDate = new Date(query.dateRange.to);

            if (createdDate < fromDate || createdDate > toDate) {
                return false;
            }
        }

        return true;
    }

    /**
     * Calculate statistics for mapping file
     */
    private calculateStats(mappingFile: MappingFile): MappingStats {
        let totalElements = 0;
        const elementTypes = { dom: 0, component: 0, fragment: 0 };
        const fileTypes = { jsx: 0, tsx: 0, js: 0, ts: 0 };

        for (const [filePath, mappings] of Object.entries(mappingFile.files)) {
            totalElements += mappings.length;

            // Count element types
            mappings.forEach(mapping => {
                elementTypes[mapping.elementType]++;
            });

            // Count file types
            if (filePath.endsWith('.jsx')) fileTypes.jsx++;
            else if (filePath.endsWith('.tsx')) fileTypes.tsx++;
            else if (filePath.endsWith('.js')) fileTypes.js++;
            else if (filePath.endsWith('.ts')) fileTypes.ts++;
        }

        return {
            totalElements,
            totalFiles: Object.keys(mappingFile.files).length,
            lastProcessed: new Date().toISOString(),
            elementTypes,
            fileTypes
        };
    }

    /**
     * Create empty mapping file
     */
    private createEmptyMappingFile(): MappingFile {
        return {
            version: '1.0.0',
            generated: new Date().toISOString(),
            config: {},
            files: {},
            stats: {
                totalElements: 0,
                totalFiles: 0,
                lastProcessed: new Date().toISOString(),
                elementTypes: { dom: 0, component: 0, fragment: 0 },
                fileTypes: { jsx: 0, tsx: 0, js: 0, ts: 0 }
            }
        };
    }

    /**
     * Save mapping file to disk
     */
    private async saveMappingFile(mappingFile: MappingFile): Promise<void> {
        try {
            // Create backup if enabled
            if (this.config.createBackup && await pathExists(this.filePath)) {
                const backupPath = `${this.filePath}.backup`;
                await copy(this.filePath, backupPath);
                this.logger.debug(`Created backup: ${backupPath}`);
            }

            // Ensure directory exists
            await ensureFile(this.filePath);

            // Write mapping file
            const content = JSON.stringify(mappingFile, null, 2);
            await writeFile(this.filePath, content, 'utf-8');

            // Update cache
            if (this.config.enableCaching) {
                this.mappingCache = mappingFile;
                this.lastModified = Date.now();
                this.isDirty = false;
            }

            this.logger.debug(`Saved mapping file: ${this.filePath}`);
        } catch (error) {
            this.logger.error('Failed to save mapping file', error);
            throw error;
        }
    }

    /**
     * Clear memory cache
     */
    clearCache(): void {
        this.mappingCache = null;
        this.lastModified = 0;
        this.isDirty = false;
        this.logger.debug('Mapping cache cleared');
    }

    /**
     * Check if mapping file exists
     */
    async exists(): Promise<boolean> {
        return await pathExists(this.filePath);
    }

    /**
     * Get mapping file path
     */
    getFilePath(): string {
        return this.filePath;
    }

    /**
     * Set configuration for element tagger
     */
    async setConfig(config: Partial<ElementTaggerOptions>): Promise<void> {
        const mappingFile = await this.loadMappings();
        mappingFile.config = { ...mappingFile.config, ...config };
        await this.saveMappingFile(mappingFile);
    }

    /**
     * Get current configuration
     */
    async getConfig(): Promise<Partial<ElementTaggerOptions>> {
        const mappingFile = await this.loadMappings();
        return mappingFile.config || {};
    }

    /**
     * Export mappings as JSON
     */
    async exportMappings(): Promise<string> {
        const mappingFile = await this.loadMappings();
        return JSON.stringify(mappingFile, null, 2);
    }

    /**
     * Import mappings from JSON
     */
    async importMappings(jsonContent: string): Promise<MappingOperationResult> {
        const startTime = performance.now();

        try {
            const importedMappingFile = JSON.parse(jsonContent) as MappingFile;

            // Validate imported data
            const validation = this.validateMappingFile(importedMappingFile);
            if (!validation.isValid) {
                return {
                    success: false,
                    operation: 'write',
                    filePath: this.filePath,
                    error: `Invalid mapping file: ${validation.errors.map(e => e.message).join(', ')}`
                };
            }

            // Save imported mappings
            await this.saveMappingFile(importedMappingFile);

            const duration = performance.now() - startTime;

            return {
                success: true,
                operation: 'write',
                filePath: this.filePath,
                elementsAffected: importedMappingFile.stats.totalElements,
                duration
            };
        } catch (error) {
            return {
                success: false,
                operation: 'write',
                filePath: this.filePath,
                error: error instanceof Error ? error.message : 'Invalid JSON'
            };
        }
    }

    /**
     * Create a new mapping manager with different file path
     */
    withFilePath(newFilePath: string): MappingManager {
        return new MappingManager(newFilePath, this.config);
    }
}