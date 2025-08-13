import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import type { ASTNode, DetectedElement } from '../types/ast';
import type { ElementMapping } from '../types/mapping';
import { Logger } from '../utils/logger';

/**
 * Types of changes that can be tracked
 */
export type ChangeType =
    | 'element-added'
    | 'element-removed'
    | 'element-modified'
    | 'attribute-added'
    | 'attribute-removed'
    | 'attribute-modified'
    | 'content-changed'
    | 'structure-changed';

/**
 * Change record for tracking modifications
 */
export interface ChangeRecord {
    id: string;
    timestamp: string;
    type: ChangeType;
    filePath: string;
    elementId?: string;
    before?: any;
    after?: any;
    position?: {
        line: number;
        column: number;
    };
    metadata?: Record<string, any>;
}

/**
 * Configuration for change tracking
 */
export interface ChangeTrackerConfig {
    /** Maximum number of changes to keep in memory */
    maxHistory?: number;

    /** Enable automatic change detection */
    autoDetect?: boolean;

    /** Debounce time for change detection (ms) */
    debounceTime?: number;

    /** Types of changes to track */
    trackTypes?: ChangeType[];

    /** Enable detailed diffing */
    enableDetailedDiff?: boolean;
}

/**
 * Change tracker for monitoring and recording modifications
 */
export class ChangeTracker extends EventEmitter {
    private readonly logger: Logger;
    private readonly config: Required<ChangeTrackerConfig>;
    private readonly changeHistory: ChangeRecord[] = [];
    private readonly elementSnapshots = new Map<string, any>();
    private changeCounter = 0;

    constructor(config: ChangeTrackerConfig = {}) {
        super();
        this.logger = new Logger('ChangeTracker');
        this.config = {
            maxHistory: 1000,
            autoDetect: true,
            debounceTime: 100,
            trackTypes: [
                'element-added',
                'element-removed',
                'element-modified',
                'attribute-modified'
            ],
            enableDetailedDiff: true,
            ...config
        };
    }

    /**
     * Start tracking changes
     */
    start(): void {
        this.logger.info('Change tracking started');
        this.emit('tracking-started');
    }

    /**
     * Stop tracking changes
     */
    stop(): void {
        this.logger.info('Change tracking stopped');
        this.emit('tracking-stopped');
    }

    /**
     * Record a change
     */
    recordChange(change: Omit<ChangeRecord, 'id' | 'timestamp'>): void {
        if (!this.config.trackTypes.includes(change.type)) {
            return;
        }

        const changeRecord: ChangeRecord = {
            id: `change-${++this.changeCounter}`,
            timestamp: new Date().toISOString(),
            ...change
        };

        this.addToHistory(changeRecord);
        this.emit('change-recorded', changeRecord);

        this.logger.debug(`Change recorded: ${change.type} in ${change.filePath}`);
    }

    /**
     * Track element changes between snapshots
     */
    trackElementChanges(
        filePath: string,
        oldElements: DetectedElement[],
        newElements: DetectedElement[]
    ): ChangeRecord[] {
        const changes: ChangeRecord[] = [];
        const oldElementMap = new Map(oldElements.map(el => [this.getElementKey(el), el]));
        const newElementMap = new Map(newElements.map(el => [this.getElementKey(el), el]));

        // Find added elements
        for (const [key, newElement] of newElementMap) {
            if (!oldElementMap.has(key)) {
                changes.push({
                    id: `change-${++this.changeCounter}`,
                    timestamp: new Date().toISOString(),
                    type: 'element-added',
                    filePath,
                    elementId: key,
                    after: this.serializeElement(newElement),
                    position: newElement.position
                });
            }
        }

        // Find removed elements
        for (const [key, oldElement] of oldElementMap) {
            if (!newElementMap.has(key)) {
                changes.push({
                    id: `change-${++this.changeCounter}`,
                    timestamp: new Date().toISOString(),
                    type: 'element-removed',
                    filePath,
                    elementId: key,
                    before: this.serializeElement(oldElement),
                    position: oldElement.position
                });
            }
        }

        // Find modified elements
        for (const [key, newElement] of newElementMap) {
            const oldElement = oldElementMap.get(key);
            if (oldElement && this.hasElementChanged(oldElement, newElement)) {
                changes.push({
                    id: `change-${++this.changeCounter}`,
                    timestamp: new Date().toISOString(),
                    type: 'element-modified',
                    filePath,
                    elementId: key,
                    before: this.serializeElement(oldElement),
                    after: this.serializeElement(newElement),
                    position: newElement.position
                });
            }
        }

        changes.forEach(change => this.addToHistory(change));
        return changes;
    }

    /**
     * Take snapshot of elements for comparison
     */
    takeSnapshot(filePath: string, elements: DetectedElement[]): void {
        const snapshot = elements.map(el => ({
            key: this.getElementKey(el),
            element: this.serializeElement(el)
        }));

        this.elementSnapshots.set(filePath, snapshot);
        this.logger.debug(`Snapshot taken for ${filePath}: ${elements.length} elements`);
    }

    /**
     * Compare current elements with snapshot
     */
    compareWithSnapshot(filePath: string, currentElements: DetectedElement[]): ChangeRecord[] {
        const snapshot = this.elementSnapshots.get(filePath);
        if (!snapshot) {
            this.takeSnapshot(filePath, currentElements);
            return [];
        }

        const snapshotElements = snapshot.map(s => s.element);
        return this.trackElementChanges(filePath, snapshotElements, currentElements);
    }

    /**
     * Get change history
     */
    getHistory(filter?: {
        filePath?: string;
        type?: ChangeType;
        elementId?: string;
        since?: string;
    }): ChangeRecord[] {
        let filtered = [...this.changeHistory];

        if (filter) {
            if (filter.filePath) {
                filtered = filtered.filter(change => change.filePath === filter.filePath);
            }
            if (filter.type) {
                filtered = filtered.filter(change => change.type === filter.type);
            }
            if (filter.elementId) {
                filtered = filtered.filter(change => change.elementId === filter.elementId);
            }
            if (filter.since) {
                const sinceDate = new Date(filter.since);
                filtered = filtered.filter(change => new Date(change.timestamp) >= sinceDate);
            }
        }

        return filtered.sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
    }

    /**
     * Get changes since specific timestamp
     */
    getChangesSince(timestamp: string): ChangeRecord[] {
        return this.getHistory({ since: timestamp });
    }

    /**
     * Clear change history
     */
    clearHistory(): void {
        this.changeHistory.length = 0;
        this.logger.debug('Change history cleared');
        this.emit('history-cleared');
    }

    /**
     * Get statistics about tracked changes
     */
    getStats(): {
        totalChanges: number;
        changesByType: Record<ChangeType, number>;
        changesByFile: Record<string, number>;
        oldestChange?: string;
        newestChange?: string;
    } {
        const changesByType = {} as Record<ChangeType, number>;
        const changesByFile = {} as Record<string, number>;

        this.changeHistory.forEach(change => {
            changesByType[change.type] = (changesByType[change.type] || 0) + 1;
            changesByFile[change.filePath] = (changesByFile[change.filePath] || 0) + 1;
        });

        return {
            totalChanges: this.changeHistory.length,
            changesByType,
            changesByFile,
            oldestChange: this.changeHistory[this.changeHistory.length - 1]?.timestamp,
            newestChange: this.changeHistory[0]?.timestamp
        };
    }

    /**
     * Add change to history with size management
     */
    private addToHistory(change: ChangeRecord): void {
        this.changeHistory.unshift(change);

        // Maintain history size limit
        if (this.changeHistory.length > this.config.maxHistory) {
            this.changeHistory.splice(this.config.maxHistory);
        }
    }

    /**
     * Generate unique key for element
     */
    private getElementKey(element: DetectedElement): string {
        return `${element.tagName}-${element.position.line}-${element.position.column}`;
    }

    /**
     * Serialize element for comparison
     */
    private serializeElement(element: DetectedElement): any {
        return {
            tagName: element.tagName,
            elementType: element.elementType,
            attributes: element.attributes.map(attr => ({
                name: attr.name,
                value: attr.value
            })),
            position: element.position,
            hasDataElId: element.hasDataElId
        };
    }

    /**
     * Check if element has changed
     */
    private hasElementChanged(oldElement: DetectedElement, newElement: DetectedElement): boolean {
        const oldSerialized = this.serializeElement(oldElement);
        const newSerialized = this.serializeElement(newElement);

        return JSON.stringify(oldSerialized) !== JSON.stringify(newSerialized);
    }
}