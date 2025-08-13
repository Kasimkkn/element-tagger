import { EventEmitter } from 'events';
import type { RuntimeConfig } from '../types/runtime';
import { Logger } from '../utils/logger';

/**
 * Tracked element information
 */
export interface TrackedElement {
    id: string;
    element: HTMLElement;
    selector: string;
    tagName: string;
    isVisible: boolean;
    boundingRect: DOMRect;
    attributes: Record<string, string>;
    metadata: Record<string, any>;
    lastSeen: number;
}

/**
 * Element tracking configuration
 */
export interface ElementTrackerConfig extends RuntimeConfig {
    /** Maximum number of elements to track */
    maxElements?: number;

    /** Update interval for tracking (ms) */
    updateInterval?: number;

    /** Track visibility changes */
    trackVisibility?: boolean;

    /** Track position changes */
    trackPosition?: boolean;

    /** Track attribute changes */
    trackAttributes?: boolean;

    /** Debounce time for updates (ms) */
    debounceTime?: number;
}

/**
 * Element update event
 */
export interface ElementUpdateEvent {
    type: 'added' | 'removed' | 'moved' | 'resized' | 'visibility' | 'attributes';
    elementId: string;
    element: HTMLElement;
    oldData?: Partial<TrackedElement>;
    newData?: Partial<TrackedElement>;
    timestamp: number;
}

/**
 * Element tracker for monitoring DOM elements in browser
 */
export class ElementTracker extends EventEmitter {
    private readonly logger: Logger;
    private readonly config: Required<ElementTrackerConfig>;
    private readonly trackedElements = new Map<string, TrackedElement>();
    private readonly observers = new Map<string, any>();

    private intersectionObserver?: IntersectionObserver;
    private mutationObserver?: MutationObserver;
    private resizeObserver?: ResizeObserver;
    private updateTimer?: NodeJS.Timeout;
    private isTracking = false;

    constructor(config: ElementTrackerConfig = {}) {
        super();
        this.logger = new Logger('ElementTracker');
        this.config = {
            enableClickHandler: true,
            enableHighlighter: true,
            highlightColor: '#007acc',
            highlightOpacity: 0.3,
            maxElements: 1000,
            updateInterval: 1000,
            trackVisibility: true,
            trackPosition: true,
            trackAttributes: true,
            debounceTime: 100,
            ...config
        };

        this.setupObservers();
    }

    /**
     * Start tracking elements
     */
    start(): void {
        if (this.isTracking) {
            this.logger.warn('Element tracking already started');
            return;
        }

        this.logger.info('Starting element tracking');
        this.isTracking = true;

        // Find and track existing elements
        this.discoverElements();

        // Start observers
        this.startObservers();

        // Start update timer
        this.startUpdateTimer();

        this.emit('tracking-started');
    }

    /**
     * Stop tracking elements
     */
    stop(): void {
        if (!this.isTracking) {
            return;
        }

        this.logger.info('Stopping element tracking');
        this.isTracking = false;

        // Stop observers
        this.stopObservers();

        // Clear update timer
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = undefined;
        }

        this.emit('tracking-stopped');
    }

    /**
     * Track specific element
     */
    track(elementId: string): boolean {
        const element = document.querySelector(`[data-el-id="${elementId}"]`) as HTMLElement;

        if (!element) {
            this.logger.warn(`Element not found: ${elementId}`);
            return false;
        }

        return this.trackElement(element, elementId);
    }

    /**
     * Stop tracking specific element
     */
    untrack(elementId: string): boolean {
        if (!this.trackedElements.has(elementId)) {
            return false;
        }

        this.trackedElements.delete(elementId);
        this.observers.delete(elementId);

        this.logger.debug(`Stopped tracking element: ${elementId}`);
        this.emit('element-untracked', elementId);

        return true;
    }

    /**
     * Get tracked element data
     */
    getElement(elementId: string): TrackedElement | null {
        return this.trackedElements.get(elementId) || null;
    }

    /**
     * Get all tracked elements
     */
    getTracked(): string[] {
        return Array.from(this.trackedElements.keys());
    }

    /**
     * Get tracked elements by criteria
     */
    getElementsBy(criteria: {
        tagName?: string;
        isVisible?: boolean;
        hasAttribute?: string;
        inViewport?: boolean;
    }): TrackedElement[] {
        const elements = Array.from(this.trackedElements.values());

        return elements.filter(tracked => {
            if (criteria.tagName && tracked.tagName !== criteria.tagName) {
                return false;
            }

            if (criteria.isVisible !== undefined && tracked.isVisible !== criteria.isVisible) {
                return false;
            }

            if (criteria.hasAttribute && !tracked.attributes[criteria.hasAttribute]) {
                return false;
            }

            if (criteria.inViewport !== undefined) {
                const rect = tracked.boundingRect;
                const inViewport = rect.top >= 0 &&
                    rect.left >= 0 &&
                    rect.bottom <= window.innerHeight &&
                    rect.right <= window.innerWidth;

                if (inViewport !== criteria.inViewport) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * Update element data
     */
    updateElement(elementId: string): boolean {
        const tracked = this.trackedElements.get(elementId);
        if (!tracked) {
            return false;
        }

        const element = tracked.element;
        if (!element.isConnected) {
            this.untrack(elementId);
            return false;
        }

        const oldData = { ...tracked };
        const newData = this.createTrackedElement(element, elementId);

        // Check for changes
        const changes = this.detectChanges(oldData, newData);

        if (changes.length > 0) {
            this.trackedElements.set(elementId, newData);

            changes.forEach(change => {
                this.emit('element-updated', {
                    type: change,
                    elementId,
                    element,
                    oldData,
                    newData,
                    timestamp: Date.now()
                } as ElementUpdateEvent);
            });
        }

        return true;
    }

    /**
     * Force update all tracked elements
     */
    updateAll(): void {
        for (const elementId of this.trackedElements.keys()) {
            this.updateElement(elementId);
        }
    }

    /**
     * Get tracking statistics
     */
    getStats(): {
        totalTracked: number;
        visibleElements: number;
        hiddenElements: number;
        byTagName: Record<string, number>;
        averageSize: { width: number; height: number };
    } {
        const elements = Array.from(this.trackedElements.values());
        const visible = elements.filter(el => el.isVisible);
        const hidden = elements.filter(el => !el.isVisible);

        const byTagName: Record<string, number> = {};
        let totalWidth = 0;
        let totalHeight = 0;

        elements.forEach(el => {
            byTagName[el.tagName] = (byTagName[el.tagName] || 0) + 1;
            totalWidth += el.boundingRect.width;
            totalHeight += el.boundingRect.height;
        });

        return {
            totalTracked: elements.length,
            visibleElements: visible.length,
            hiddenElements: hidden.length,
            byTagName,
            averageSize: {
                width: elements.length > 0 ? totalWidth / elements.length : 0,
                height: elements.length > 0 ? totalHeight / elements.length : 0
            }
        };
    }

    /**
     * Setup observers for tracking
     */
    private setupObservers(): void {
        // Intersection Observer for visibility tracking
        if (this.config.trackVisibility && 'IntersectionObserver' in window) {
            this.intersectionObserver = new IntersectionObserver(
                (entries) => this.handleIntersectionChanges(entries),
                { threshold: [0, 0.1, 0.5, 1.0] }
            );
        }

        // Mutation Observer for DOM changes
        if ('MutationObserver' in window) {
            this.mutationObserver = new MutationObserver(
                (mutations) => this.handleMutations(mutations)
            );
        }

        // Resize Observer for size changes
        if (this.config.trackPosition && 'ResizeObserver' in window) {
            this.resizeObserver = new ResizeObserver(
                (entries) => this.handleResizeChanges(entries)
            );
        }
    }

    /**
     * Start all observers
     */
    private startObservers(): void {
        if (this.mutationObserver) {
            this.mutationObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: this.config.trackAttributes,
                attributeFilter: this.config.trackAttributes ? ['data-el-id', 'class', 'style'] : undefined
            });
        }

        // Observe all tracked elements
        this.trackedElements.forEach((tracked) => {
            if (this.intersectionObserver) {
                this.intersectionObserver.observe(tracked.element);
            }

            if (this.resizeObserver) {
                this.resizeObserver.observe(tracked.element);
            }
        });
    }

    /**
     * Stop all observers
     */
    private stopObservers(): void {
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
        }

        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
        }

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
    }

    /**
     * Start update timer
     */
    private startUpdateTimer(): void {
        this.updateTimer = setInterval(() => {
            this.updateAll();
        }, this.config.updateInterval);
    }

    /**
     * Discover existing elements in DOM
     */
    private discoverElements(): void {
        const elements = document.querySelectorAll('[data-el-id]') as NodeListOf<HTMLElement>;

        elements.forEach((element) => {
            const elementId = element.getAttribute('data-el-id');
            if (elementId) {
                this.trackElement(element, elementId);
            }
        });

        this.logger.info(`Discovered ${elements.length} elements to track`);
    }

    /**
     * Track individual element
     */
    private trackElement(element: HTMLElement, elementId: string): boolean {
        if (this.trackedElements.size >= this.config.maxElements) {
            this.logger.warn('Maximum tracked elements limit reached');
            return false;
        }

        const tracked = this.createTrackedElement(element, elementId);
        this.trackedElements.set(elementId, tracked);

        // Start observing
        if (this.intersectionObserver) {
            this.intersectionObserver.observe(element);
        }

        if (this.resizeObserver) {
            this.resizeObserver.observe(element);
        }

        this.logger.debug(`Started tracking element: ${elementId}`);
        this.emit('element-tracked', tracked);

        return true;
    }

    /**
     * Create tracked element data
     */
    private createTrackedElement(element: HTMLElement, elementId: string): TrackedElement {
        const rect = element.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(element);

        const attributes: Record<string, string> = {};
        for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes[i];
            attributes[attr.name] = attr.value;
        }

        return {
            id: elementId,
            element,
            selector: this.generateSelector(element),
            tagName: element.tagName.toLowerCase(),
            isVisible: computedStyle.display !== 'none' &&
                computedStyle.visibility !== 'hidden' &&
                rect.width > 0 &&
                rect.height > 0,
            boundingRect: rect,
            attributes,
            metadata: {
                zIndex: computedStyle.zIndex,
                position: computedStyle.position,
                opacity: computedStyle.opacity
            },
            lastSeen: Date.now()
        };
    }

    /**
     * Generate CSS selector for element
     */
    private generateSelector(element: HTMLElement): string {
        const path: string[] = [];
        let current: Element | null = element;

        while (current && current !== document.body) {
            let selector = current.tagName.toLowerCase();

            if (current.id) {
                selector += `#${current.id}`;
                path.unshift(selector);
                break;
            }

            if (current.className) {
                const classes = current.className.split(' ').filter(c => c.trim());
                if (classes.length > 0) {
                    selector += '.' + classes.join('.');
                }
            }

            // Add nth-child if needed for uniqueness
            const siblings = Array.from(current.parentElement?.children || [])
                .filter(el => el.tagName === current!.tagName);

            if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                selector += `:nth-child(${index})`;
            }

            path.unshift(selector);
            current = current.parentElement;
        }

        return path.join(' > ');
    }

    /**
     * Detect changes between old and new element data
     */
    private detectChanges(oldData: TrackedElement, newData: TrackedElement): string[] {
        const changes: string[] = [];

        if (oldData.isVisible !== newData.isVisible) {
            changes.push('visibility');
        }

        if (oldData.boundingRect.x !== newData.boundingRect.x ||
            oldData.boundingRect.y !== newData.boundingRect.y) {
            changes.push('moved');
        }

        if (oldData.boundingRect.width !== newData.boundingRect.width ||
            oldData.boundingRect.height !== newData.boundingRect.height) {
            changes.push('resized');
        }

        if (JSON.stringify(oldData.attributes) !== JSON.stringify(newData.attributes)) {
            changes.push('attributes');
        }

        return changes;
    }

    /**
     * Handle intersection observer changes
     */
    private handleIntersectionChanges(entries: IntersectionObserverEntry[]): void {
        entries.forEach((entry) => {
            const element = entry.target as HTMLElement;
            const elementId = element.getAttribute('data-el-id');

            if (elementId && this.trackedElements.has(elementId)) {
                const tracked = this.trackedElements.get(elementId)!;
                const wasVisible = tracked.isVisible;
                const isVisible = entry.isIntersecting;

                if (wasVisible !== isVisible) {
                    tracked.isVisible = isVisible;
                    this.emit('element-updated', {
                        type: 'visibility',
                        elementId,
                        element,
                        oldData: { isVisible: wasVisible },
                        newData: { isVisible },
                        timestamp: Date.now()
                    } as ElementUpdateEvent);
                }
            }
        });
    }

    /**
     * Handle mutation observer changes
     */
    private handleMutations(mutations: MutationRecord[]): void {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                // Check for added elements
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const element = node as HTMLElement;
                        const elementId = element.getAttribute('data-el-id');

                        if (elementId && !this.trackedElements.has(elementId)) {
                            this.trackElement(element, elementId);
                        }

                        // Check descendants
                        const descendants = element.querySelectorAll('[data-el-id]');
                        descendants.forEach((desc) => {
                            const descId = desc.getAttribute('data-el-id');
                            if (descId && !this.trackedElements.has(descId)) {
                                this.trackElement(desc as HTMLElement, descId);
                            }
                        });
                    }
                });

                // Check for removed elements
                mutation.removedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const element = node as HTMLElement;
                        const elementId = element.getAttribute('data-el-id');

                        if (elementId && this.trackedElements.has(elementId)) {
                            this.untrack(elementId);
                            this.emit('element-updated', {
                                type: 'removed',
                                elementId,
                                element,
                                timestamp: Date.now()
                            } as ElementUpdateEvent);
                        }
                    }
                });
            } else if (mutation.type === 'attributes') {
                const element = mutation.target as HTMLElement;
                const elementId = element.getAttribute('data-el-id');

                if (elementId && this.trackedElements.has(elementId)) {
                    this.updateElement(elementId);
                }
            }
        });
    }

    /**
     * Handle resize observer changes
     */
    private handleResizeChanges(entries: ResizeObserverEntry[]): void {
        entries.forEach((entry) => {
            const element = entry.target as HTMLElement;
            const elementId = element.getAttribute('data-el-id');

            if (elementId && this.trackedElements.has(elementId)) {
                this.updateElement(elementId);
            }
        });
    }

    /**
     * Get elements in viewport
     */
    getElementsInViewport(): TrackedElement[] {
        return this.getElementsBy({ inViewport: true });
    }

    /**
     * Get element at point
     */
    getElementAtPoint(x: number, y: number): TrackedElement | null {
        const element = document.elementFromPoint(x, y) as HTMLElement;
        if (!element) return null;

        const elementId = element.getAttribute('data-el-id');
        if (!elementId) return null;

        return this.getElement(elementId);
    }

    /**
     * Get elements by tag name
     */
    getElementsByTagName(tagName: string): TrackedElement[] {
        return this.getElementsBy({ tagName: tagName.toLowerCase() });
    }

    /**
     * Get visible elements
     */
    getVisibleElements(): TrackedElement[] {
        return this.getElementsBy({ isVisible: true });
    }

    /**
     * Get hidden elements
     */
    getHiddenElements(): TrackedElement[] {
        return this.getElementsBy({ isVisible: false });
    }

    /**
     * Check if element is being tracked
     */
    isTracked(elementId: string): boolean {
        return this.trackedElements.has(elementId);
    }

    /**
     * Export tracking data
     */
    exportData(): {
        timestamp: string;
        elements: TrackedElement[];
        stats: ReturnType<ElementTracker['getStats']>;
    } {
        return {
            timestamp: new Date().toISOString(),
            elements: Array.from(this.trackedElements.values()),
            stats: this.getStats()
        };
    }

    /**
     * Clear all tracking data
     */
    clear(): void {
        this.stopObservers();
        this.trackedElements.clear();
        this.observers.clear();

        if (this.isTracking) {
            this.startObservers();
        }

        this.emit('tracking-cleared');
    }
}