import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';
import type { ParseResult, DetectedElement } from '../types/ast';
import type { ElementMapping } from '../types/mapping';
import { Logger } from '../utils/logger';

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
    key: string;
    value: T;
    timestamp: number;
    accessCount: number;
    lastAccessed: number;
    size: number;
    ttl?: number;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
    /** Maximum cache size in MB */
    maxSize?: number;

    /** Default TTL in milliseconds */
    defaultTTL?: number;

    /** Maximum number of entries */
    maxEntries?: number;

    /** Enable LRU eviction */
    enableLRU?: boolean;

    /** Enable statistics collection */
    enableStats?: boolean;

    /** Cache persistence */
    persistent?: boolean;

    /** Persistence file path */
    persistenceFile?: string;
}

/**
 * Cache statistics
 */
export interface CacheStats {
    totalEntries: number;
    totalSize: number;
    hitCount: number;
    missCount: number;
    hitRate: number;
    evictionCount: number;
    oldestEntry?: number;
    newestEntry?: number;
    averageSize: number;
}

/**
 * Cache manager for AST, elements, and mappings
 */
export class CacheManager extends EventEmitter {
    private readonly logger: Logger;
    private readonly config: Required<CacheConfig>;

    // Separate caches for different data types
    private readonly astCache = new Map<string, CacheEntry<ParseResult>>();
    private readonly elementCache = new Map<string, CacheEntry<DetectedElement[]>>();
    private readonly mappingCache = new Map<string, CacheEntry<ElementMapping[]>>();
    private readonly generalCache = new Map<string, CacheEntry<any>>();

    // Statistics
    private stats = {
        hitCount: 0,
        missCount: 0,
        evictionCount: 0
    };

    constructor(config: CacheConfig = {}) {
        super();
        this.logger = new Logger('CacheManager');
        this.config = {
            maxSize: 100, // 100MB default
            defaultTTL: 30 * 60 * 1000, // 30 minutes
            maxEntries: 1000,
            enableLRU: true,
            enableStats: true,
            persistent: false,
            persistenceFile: '.element-tagger-cache.json',
            ...config
        };

        this.setupCleanupInterval();
    }

    /**
     * Cache AST parse result
     */
    cacheAST(filePath: string, parseResult: ParseResult, ttl?: number): void {
        const key = this.getASTCacheKey(filePath);
        const entry = this.createCacheEntry(key, parseResult, ttl);

        this.astCache.set(key, entry);
        this.enforceSize();

        this.logger.debug(`AST cached: ${filePath}`);
        this.emit('ast-cached', filePath);
    }

    /**
     * Get cached AST
     */
    getAST(filePath: string): ParseResult | null {
        const key = this.getASTCacheKey(filePath);
        const entry = this.astCache.get(key);

        if (!entry) {
            this.recordMiss();
            return null;
        }

        if (this.isExpired(entry)) {
            this.astCache.delete(key);
            this.recordMiss();
            return null;
        }

        this.updateAccess(entry);
        this.recordHit();

        this.logger.debug(`AST cache hit: ${filePath}`);
        return entry.value;
    }

    /**
     * Cache detected elements
     */
    cacheElements(filePath: string, elements: DetectedElement[], ttl?: number): void {
        const key = this.getElementCacheKey(filePath);
        const entry = this.createCacheEntry(key, elements, ttl);

        this.elementCache.set(key, entry);
        this.enforceSize();

        this.logger.debug(`Elements cached: ${filePath} (${elements.length} elements)`);
        this.emit('elements-cached', filePath, elements.length);
    }

    /**
     * Get cached elements
     */
    getElements(filePath: string): DetectedElement[] | null {
        const key = this.getElementCacheKey(filePath);
        const entry = this.elementCache.get(key);

        if (!entry) {
            this.recordMiss();
            return null;
        }

        if (this.isExpired(entry)) {
            this.elementCache.delete(key);
            this.recordMiss();
            return null;
        }

        this.updateAccess(entry);
        this.recordHit();

        this.logger.debug(`Elements cache hit: ${filePath}`);
        return entry.value;
    }

    /**
     * Cache element mappings
     */
    cacheMappings(filePath: string, mappings: ElementMapping[], ttl?: number): void {
        const key = this.getMappingCacheKey(filePath);
        const entry = this.createCacheEntry(key, mappings, ttl);

        this.mappingCache.set(key, entry);
        this.enforceSize();

        this.logger.debug(`Mappings cached: ${filePath} (${mappings.length} mappings)`);
        this.emit('mappings-cached', filePath, mappings.length);
    }

    /**
     * Get cached mappings
     */
    getMappings(filePath: string): ElementMapping[] | null {
        const key = this.getMappingCacheKey(filePath);
        const entry = this.mappingCache.get(key);

        if (!entry) {
            this.recordMiss();
            return null;
        }

        if (this.isExpired(entry)) {
            this.mappingCache.delete(key);
            this.recordMiss();
            return null;
        }

        this.updateAccess(entry);
        this.recordHit();

        this.logger.debug(`Mappings cache hit: ${filePath}`);
        return entry.value;
    }

    /**
     * Cache general data
     */
    cache<T>(key: string, value: T, ttl?: number): void {
        const entry = this.createCacheEntry(key, value, ttl);
        this.generalCache.set(key, entry);
        this.enforceSize();

        this.logger.debug(`General data cached: ${key}`);
        this.emit('data-cached', key);
    }

    /**
     * Get cached general data
     */
    get<T>(key: string): T | null {
        const entry = this.generalCache.get(key);

        if (!entry) {
            this.recordMiss();
            return null;
        }

        if (this.isExpired(entry)) {
            this.generalCache.delete(key);
            this.recordMiss();
            return null;
        }

        this.updateAccess(entry);
        this.recordHit();

        return entry.value as T;
    }

    /**
     * Remove from all caches by file path
     */
    invalidateFile(filePath: string): void {
        const astKey = this.getASTCacheKey(filePath);
        const elementKey = this.getElementCacheKey(filePath);
        const mappingKey = this.getMappingCacheKey(filePath);

        this.astCache.delete(astKey);
        this.elementCache.delete(elementKey);
        this.mappingCache.delete(mappingKey);

        this.logger.debug(`Cache invalidated: ${filePath}`);
        this.emit('file-invalidated', filePath);
    }

    /**
     * Remove specific cache entry
     */
    invalidate(key: string): void {
        this.generalCache.delete(key);
        this.logger.debug(`Cache entry invalidated: ${key}`);
        this.emit('entry-invalidated', key);
    }

    /**
     * Clear all caches
     */
    clear(): void {
        this.astCache.clear();
        this.elementCache.clear();
        this.mappingCache.clear();
        this.generalCache.clear();

        this.resetStats();
        this.logger.info('All caches cleared');
        this.emit('cache-cleared');
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats {
        const allEntries = [
            ...this.astCache.values(),
            ...this.elementCache.values(),
            ...this.mappingCache.values(),
            ...this.generalCache.values()
        ];

        const totalEntries = allEntries.length;
        const totalSize = allEntries.reduce((sum, entry) => sum + entry.size, 0);
        const timestamps = allEntries.map(entry => entry.timestamp);

        const hitRate = this.stats.hitCount + this.stats.missCount > 0
            ? this.stats.hitCount / (this.stats.hitCount + this.stats.missCount)
            : 0;

        return {
            totalEntries,
            totalSize: totalSize / (1024 * 1024), // Convert to MB
            hitCount: this.stats.hitCount,
            missCount: this.stats.missCount,
            hitRate: Math.round(hitRate * 100) / 100,
            evictionCount: this.stats.evictionCount,
            oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : undefined,
            newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : undefined,
            averageSize: totalEntries > 0 ? totalSize / totalEntries : 0
        };
    }

    /**
     * Preload cache with file data
     */
    async preload(files: string[]): Promise<void> {
        this.logger.info(`Preloading cache for ${files.length} files`);

        // This would integrate with the AST parser and element detector
        // For now, we'll just emit the event
        this.emit('preload-started', files.length);

        // Implementation would go here

        this.emit('preload-completed', files.length);
    }

    /**
     * Create cache entry with metadata
     */
    private createCacheEntry<T>(key: string, value: T, ttl?: number): CacheEntry<T> {
        const now = performance.now();
        const size = this.calculateSize(value);

        return {
            key,
            value,
            timestamp: now,
            accessCount: 1,
            lastAccessed: now,
            size,
            ttl: ttl || this.config.defaultTTL
        };
    }

    /**
     * Calculate approximate size of value in bytes
     */
    private calculateSize(value: any): number {
        try {
            return new Blob([JSON.stringify(value)]).size;
        } catch {
            // Fallback estimation
            return JSON.stringify(value).length * 2; // Rough estimate
        }
    }

    /**
     * Check if cache entry is expired
     */
    private isExpired(entry: CacheEntry<any>): boolean {
        if (!entry.ttl) return false;
        return performance.now() - entry.timestamp > entry.ttl;
    }

    /**
     * Update access information
     */
    private updateAccess(entry: CacheEntry<any>): void {
        entry.accessCount++;
        entry.lastAccessed = performance.now();
    }

    /**
     * Enforce cache size limits
     */
    private enforceSize(): void {
        const stats = this.getStats();

        // Check size limit
        if (stats.totalSize > this.config.maxSize) {
            this.evictBySize();
        }

        // Check entry count limit
        if (stats.totalEntries > this.config.maxEntries) {
            this.evictByCount();
        }
    }

    /**
     * Evict entries to reduce size
     */
    private evictBySize(): void {
        const allCaches = [this.astCache, this.elementCache, this.mappingCache, this.generalCache];
        const allEntries: Array<{ cache: Map<string, CacheEntry<any>>, entry: CacheEntry<any> }> = [];

        // Collect all entries
        for (const cache of allCaches) {
            for (const entry of cache.values()) {
                allEntries.push({ cache, entry });
            }
        }

        // Sort by LRU if enabled, otherwise by size
        allEntries.sort((a, b) => {
            if (this.config.enableLRU) {
                return a.entry.lastAccessed - b.entry.lastAccessed;
            }
            return b.entry.size - a.entry.size;
        });

        // Evict until under size limit
        const targetSize = this.config.maxSize * 0.8; // 80% of max size
        let currentSize = this.getStats().totalSize;

        for (const { cache, entry } of allEntries) {
            if (currentSize <= targetSize) break;

            cache.delete(entry.key);
            currentSize -= entry.size / (1024 * 1024);
            this.stats.evictionCount++;
        }

        this.logger.debug(`Evicted entries to reduce cache size`);
    }

    /**
     * Evict entries to reduce count
     */
    private evictByCount(): void {
        const allCaches = [this.astCache, this.elementCache, this.mappingCache, this.generalCache];
        const allEntries: Array<{ cache: Map<string, CacheEntry<any>>, entry: CacheEntry<any> }> = [];

        // Collect all entries
        for (const cache of allCaches) {
            for (const entry of cache.values()) {
                allEntries.push({ cache, entry });
            }
        }

        // Sort by LRU
        allEntries.sort((a, b) => a.entry.lastAccessed - b.entry.lastAccessed);

        // Evict oldest entries
        const targetCount = Math.floor(this.config.maxEntries * 0.8); // 80% of max entries
        const toEvict = allEntries.length - targetCount;

        for (let i = 0; i < toEvict; i++) {
            const { cache, entry } = allEntries[i];
            cache.delete(entry.key);
            this.stats.evictionCount++;
        }

        this.logger.debug(`Evicted ${toEvict} entries to reduce cache count`);
    }

    /**
     * Setup periodic cleanup
     */
    private setupCleanupInterval(): void {
        setInterval(() => {
            this.cleanupExpired();
        }, 5 * 60 * 1000); // Every 5 minutes
    }

    /**
     * Remove expired entries
     */
    private cleanupExpired(): void {
        const allCaches = [this.astCache, this.elementCache, this.mappingCache, this.generalCache];
        let cleanedCount = 0;

        for (const cache of allCaches) {
            for (const [key, entry] of cache.entries()) {
                if (this.isExpired(entry)) {
                    cache.delete(key);
                    cleanedCount++;
                }
            }
        }

        if (cleanedCount > 0) {
            this.logger.debug(`Cleaned up ${cleanedCount} expired cache entries`);
            this.emit('cleanup-completed', cleanedCount);
        }
    }

    /**
     * Generate cache keys
     */
    private getASTCacheKey(filePath: string): string {
        return `ast:${filePath}`;
    }

    private getElementCacheKey(filePath: string): string {
        return `elements:${filePath}`;
    }

    private getMappingCacheKey(filePath: string): string {
        return `mappings:${filePath}`;
    }

    /**
     * Record cache hit
     */
    private recordHit(): void {
        if (this.config.enableStats) {
            this.stats.hitCount++;
        }
    }

    /**
     * Record cache miss
     */
    private recordMiss(): void {
        if (this.config.enableStats) {
            this.stats.missCount++;
        }
    }

    /**
     * Reset statistics
     */
    private resetStats(): void {
        this.stats = {
            hitCount: 0,
            missCount: 0,
            evictionCount: 0
        };
    }
}