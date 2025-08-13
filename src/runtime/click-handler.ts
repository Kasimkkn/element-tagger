import { EventEmitter } from 'events';
import type { RuntimeConfig } from '../types/runtime';
import { Logger } from '../utils/logger';

/**
 * Click event data
 */
export interface ClickEventData {
    elementId: string;
    element: HTMLElement;
    event: MouseEvent;
    timestamp: number;
    position: {
        x: number;
        y: number;
        clientX: number;
        clientY: number;
        pageX: number;
        pageY: number;
    };
    modifiers: {
        ctrl: boolean;
        shift: boolean;
        alt: boolean;
        meta: boolean;
    };
    elementInfo: {
        tagName: string;
        className: string;
        id: string;
        textContent: string;
        attributes: Record<string, string>;
    };
}

/**
 * Click handler configuration
 */
export interface ClickHandlerConfig extends RuntimeConfig {
    /** Enable double-click detection */
    enableDoubleClick?: boolean;

    /** Double-click timeout (ms) */
    doubleClickTimeout?: number;

    /** Enable right-click handling */
    enableRightClick?: boolean;

    /** Enable touch events */
    enableTouch?: boolean;

    /** Prevent default click behavior */
    preventDefault?: boolean;

    /** Stop event propagation */
    stopPropagation?: boolean;

    /** Only handle tagged elements */
    taggedElementsOnly?: boolean;

    /** Debug mode - log all clicks */
    debug?: boolean;
}

/**
 * Click handler for tagged elements
 */
export class ClickHandler extends EventEmitter {
    private readonly logger: Logger;
    private readonly config: Required<ClickHandlerConfig>;
    private isActive = false;
    private clickTimeouts = new Map<string, NodeJS.Timeout>();
    private lastClickTime = 0;
    private lastClickedElement: HTMLElement | null = null;

    constructor(config: ClickHandlerConfig = {}) {
        super();
        this.logger = new Logger('ClickHandler');
        this.config = {
            enableClickHandler: true,
            enableHighlighter: true,
            highlightColor: '#007acc',
            highlightOpacity: 0.3,
            enableDoubleClick: true,
            doubleClickTimeout: 300,
            enableRightClick: true,
            enableTouch: true,
            preventDefault: false,
            stopPropagation: false,
            taggedElementsOnly: true,
            debug: false,
            ...config
        };

        this.handleClick = this.handleClick.bind(this);
        this.handleContextMenu = this.handleContextMenu.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
    }

    /**
     * Start click handling
     */
    start(): void {
        if (this.isActive) {
            this.logger.warn('Click handler already active');
            return;
        }

        this.logger.info('Starting click handler');
        this.isActive = true;

        // Add event listeners
        document.addEventListener('click', this.handleClick, true);

        if (this.config.enableRightClick) {
            document.addEventListener('contextmenu', this.handleContextMenu, true);
        }

        if (this.config.enableTouch) {
            document.addEventListener('touchstart', this.handleTouchStart, { passive: true });
            document.addEventListener('touchend', this.handleTouchEnd, { passive: true });
        }

        this.emit('handler-started');
    }

    /**
     * Stop click handling
     */
    stop(): void {
        if (!this.isActive) {
            return;
        }

        this.logger.info('Stopping click handler');
        this.isActive = false;

        // Remove event listeners
        document.removeEventListener('click', this.handleClick, true);
        document.removeEventListener('contextmenu', this.handleContextMenu, true);
        document.removeEventListener('touchstart', this.handleTouchStart);
        document.removeEventListener('touchend', this.handleTouchEnd);

        // Clear timeouts
        this.clickTimeouts.forEach(timeout => clearTimeout(timeout));
        this.clickTimeouts.clear();

        this.emit('handler-stopped');
    }

    /**
     * Handle click events
     */
    private handleClick(event: MouseEvent): void {
        if (!this.isActive) return;

        const target = event.target as HTMLElement;
        const elementData = this.findTaggedElement(target);

        if (!elementData && this.config.taggedElementsOnly) {
            return;
        }

        const element = elementData?.element || target;
        const elementId = elementData?.elementId || this.generateTempId(element);

        if (this.config.debug) {
            this.logger.debug(`Click detected: ${elementId}`, { event, element });
        }

        // Handle event options
        if (this.config.preventDefault) {
            event.preventDefault();
        }

        if (this.config.stopPropagation) {
            event.stopPropagation();
        }

        // Create click event data
        const clickData = this.createClickEventData(elementId, element, event);

        // Handle double-click detection
        if (this.config.enableDoubleClick) {
            this.handleDoubleClick(clickData);
        } else {
            this.emit('element-clicked', clickData);
        }

        // Update last click info
        this.lastClickTime = Date.now();
        this.lastClickedElement = element;
    }

    /**
     * Handle right-click (context menu) events
     */
    private handleContextMenu(event: MouseEvent): void {
        if (!this.isActive) return;

        const target = event.target as HTMLElement;
        const elementData = this.findTaggedElement(target);

        if (!elementData && this.config.taggedElementsOnly) {
            return;
        }

        const element = elementData?.element || target;
        const elementId = elementData?.elementId || this.generateTempId(element);

        if (this.config.preventDefault) {
            event.preventDefault();
        }

        if (this.config.stopPropagation) {
            event.stopPropagation();
        }

        const clickData = this.createClickEventData(elementId, element, event);
        this.emit('element-right-clicked', clickData);
    }

    /**
     * Handle touch start events
     */
    private handleTouchStart(event: TouchEvent): void {
        if (!this.isActive || event.touches.length !== 1) return;

        const touch = event.touches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement;

        if (!target) return;

        const elementData = this.findTaggedElement(target);
        if (!elementData && this.config.taggedElementsOnly) {
            return;
        }

        // Store touch start info for touch end handling
        (target as any)._touchStartTime = Date.now();
    }

    /**
     * Handle touch end events
     */
    private handleTouchEnd(event: TouchEvent): void {
        if (!this.isActive || event.changedTouches.length !== 1) return;

        const touch = event.changedTouches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement;

        if (!target) return;

        const elementData = this.findTaggedElement(target);
        if (!elementData && this.config.taggedElementsOnly) {
            return;
        }

        const element = elementData?.element || target;
        const elementId = elementData?.elementId || this.generateTempId(element);

        // Check if this is a tap (quick touch)
        const touchStartTime = (target as any)._touchStartTime;
        const touchDuration = Date.now() - (touchStartTime || 0);

        if (touchDuration < 500) { // Consider as tap if less than 500ms
            // Create synthetic mouse event for consistency
            const syntheticEvent = new MouseEvent('click', {
                clientX: touch.clientX,
                clientY: touch.clientY,
                button: 0,
                bubbles: true
            });

            const clickData = this.createClickEventData(elementId, element, syntheticEvent);
            this.emit('element-touched', clickData);
        }
    }

    /**
     * Handle double-click detection
     */
    private handleDoubleClick(clickData: ClickEventData): void {
        const { elementId } = clickData;
        const currentTime = Date.now();

        // Clear existing timeout for this element
        if (this.clickTimeouts.has(elementId)) {
            clearTimeout(this.clickTimeouts.get(elementId)!);
            this.clickTimeouts.delete(elementId);
        }

        // Check if this is a double-click
        const isDoubleClick =
            this.lastClickedElement === clickData.element &&
            currentTime - this.lastClickTime <= this.config.doubleClickTimeout;

        if (isDoubleClick) {
            this.emit('element-double-clicked', clickData);
        } else {
            // Set timeout for single click
            const timeout = setTimeout(() => {
                this.emit('element-clicked', clickData);
                this.clickTimeouts.delete(elementId);
            }, this.config.doubleClickTimeout);

            this.clickTimeouts.set(elementId, timeout);
        }
    }

    /**
     * Find tagged element from event target
     */
    private findTaggedElement(target: HTMLElement): { element: HTMLElement; elementId: string } | null {
        let current: HTMLElement | null = target;

        while (current && current !== document.body) {
            const elementId = current.getAttribute('data-el-id');
            if (elementId) {
                return { element: current, elementId };
            }
            current = current.parentElement;
        }

        return null;
    }

    /**
     * Generate temporary ID for untagged elements
     */
    private generateTempId(element: HTMLElement): string {
        const tagName = element.tagName.toLowerCase();
        const className = element.className ? `-${element.className.split(' ')[0]}` : '';
        const timestamp = Date.now().toString(36);
        return `temp-${tagName}${className}-${timestamp}`;
    }

    /**
     * Create click event data
     */
    private createClickEventData(elementId: string, element: HTMLElement, event: MouseEvent): ClickEventData {
        const attributes: Record<string, string> = {};
        for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes[i];
            attributes[attr.name] = attr.value;
        }

        return {
            elementId,
            element,
            event,
            timestamp: Date.now(),
            position: {
                x: event.offsetX || 0,
                y: event.offsetY || 0,
                clientX: event.clientX,
                clientY: event.clientY,
                pageX: event.pageX,
                pageY: event.pageY
            },
            modifiers: {
                ctrl: event.ctrlKey,
                shift: event.shiftKey,
                alt: event.altKey,
                meta: event.metaKey
            },
            elementInfo: {
                tagName: element.tagName.toLowerCase(),
                className: element.className,
                id: element.id,
                textContent: element.textContent?.slice(0, 100) || '',
                attributes
            }
        };
    }

    /**
     * Add click handler for specific element
     */
    onElementClick(elementId: string, handler: (data: ClickEventData) => void): void {
        this.on('element-clicked', (data: ClickEventData) => {
            if (data.elementId === elementId) {
                handler(data);
            }
        });
    }

    /**
     * Add double-click handler for specific element
     */
    onElementDoubleClick(elementId: string, handler: (data: ClickEventData) => void): void {
        this.on('element-double-clicked', (data: ClickEventData) => {
            if (data.elementId === elementId) {
                handler(data);
            }
        });
    }

    /**
     * Add right-click handler for specific element
     */
    onElementRightClick(elementId: string, handler: (data: ClickEventData) => void): void {
        this.on('element-right-clicked', (data: ClickEventData) => {
            if (data.elementId === elementId) {
                handler(data);
            }
        });
    }

    /**
     * Remove all handlers for specific element
     */
    removeElementHandlers(elementId: string): void {
        const events = ['element-clicked', 'element-double-clicked', 'element-right-clicked', 'element-touched'];

        events.forEach(eventName => {
            this.removeAllListeners(eventName);
        });
    }

    /**
     * Get click statistics
     */
    getStats(): {
        isActive: boolean;
        pendingTimeouts: number;
        lastClickTime: number;
        totalClicks: number;
    } {
        return {
            isActive: this.isActive,
            pendingTimeouts: this.clickTimeouts.size,
            lastClickTime: this.lastClickTime,
            totalClicks: this.listenerCount('element-clicked')
        };
    }

    /**
     * Simulate click on element
     */
    simulateClick(elementId: string, options: Partial<{
        clientX: number;
        clientY: number;
        button: number;
        ctrlKey: boolean;
        shiftKey: boolean;
        altKey: boolean;
        metaKey: boolean;
    }> = {}): boolean {
        const element = document.querySelector(`[data-el-id="${elementId}"]`) as HTMLElement;

        if (!element) {
            this.logger.warn(`Element not found for simulation: ${elementId}`);
            return false;
        }

        const rect = element.getBoundingClientRect();
        const syntheticEvent = new MouseEvent('click', {
            clientX: options.clientX || rect.left + rect.width / 2,
            clientY: options.clientY || rect.top + rect.height / 2,
            button: options.button || 0,
            ctrlKey: options.ctrlKey || false,
            shiftKey: options.shiftKey || false,
            altKey: options.altKey || false,
            metaKey: options.metaKey || false,
            bubbles: true,
            cancelable: true
        });

        element.dispatchEvent(syntheticEvent);
        return true;
    }

    /**
     * Enable/disable click handling
     */
    setEnabled(enabled: boolean): void {
        if (enabled && !this.isActive) {
            this.start();
        } else if (!enabled && this.isActive) {
            this.stop();
        }
    }

    /**
     * Check if click handler is active
     */
    isEnabled(): boolean {
        return this.isActive;
    }
}