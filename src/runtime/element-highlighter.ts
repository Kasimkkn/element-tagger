import type { RuntimeConfig } from '../types/runtime';
import { Logger } from '../utils/logger';

/**
 * Highlight style configuration
 */
export interface HighlightStyle {
    /** Border color */
    borderColor?: string;

    /** Border width */
    borderWidth?: string;

    /** Border style */
    borderStyle?: string;

    /** Background color */
    backgroundColor?: string;

    /** Background opacity */
    opacity?: number;

    /** Box shadow */
    boxShadow?: string;

    /** Z-index */
    zIndex?: number;

    /** Animation duration */
    animationDuration?: string;

    /** Custom CSS properties */
    customCSS?: Record<string, string>;
}

/**
 * Highlighter configuration
 */
export interface ElementHighlighterConfig extends RuntimeConfig {
    /** Default highlight style */
    defaultStyle?: HighlightStyle;

    /** Hover highlight style */
    hoverStyle?: HighlightStyle;

    /** Selection highlight style */
    selectionStyle?: HighlightStyle;

    /** Error highlight style */
    errorStyle?: HighlightStyle;

    /** Enable hover effects */
    enableHoverEffects?: boolean;

    /** Enable animations */
    enableAnimations?: boolean;

    /** Auto-clear highlights after timeout */
    autoClearTimeout?: number;

    /** Show element info tooltip */
    showTooltip?: boolean;

    /** Tooltip position */
    tooltipPosition?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
}

/**
 * Highlighted element data
 */
interface HighlightedElement {
    elementId: string;
    element: HTMLElement;
    overlay: HTMLElement;
    style: HighlightStyle;
    tooltip?: HTMLElement;
    timestamp: number;
}

/**
 * Element highlighter for visual feedback
 */
export class ElementHighlighter {
    private readonly logger: Logger;
    private readonly config: Required<ElementHighlighterConfig>;
    private readonly highlights = new Map<string, HighlightedElement>();
    private readonly overlayContainer: HTMLElement;
    private isActive = false;
    private hoveredElement: string | null = null;

    constructor(config: ElementHighlighterConfig = {}) {
        this.logger = new Logger('ElementHighlighter');
        this.config = {
            enableClickHandler: true,
            enableHighlighter: true,
            highlightColor: '#007acc',
            highlightOpacity: 0.3,
            defaultStyle: {
                borderColor: '#007acc',
                borderWidth: '2px',
                borderStyle: 'solid',
                backgroundColor: 'rgba(0, 122, 204, 0.1)',
                opacity: 1,
                zIndex: 999999,
                animationDuration: '0.2s'
            },
            hoverStyle: {
                borderColor: '#00ff00',
                borderWidth: '1px',
                borderStyle: 'dashed',
                backgroundColor: 'rgba(0, 255, 0, 0.05)',
                opacity: 1,
                zIndex: 999998
            },
            selectionStyle: {
                borderColor: '#ff6b35',
                borderWidth: '3px',
                borderStyle: 'solid',
                backgroundColor: 'rgba(255, 107, 53, 0.15)',
                boxShadow: '0 0 10px rgba(255, 107, 53, 0.5)',
                opacity: 1,
                zIndex: 1000000
            },
            errorStyle: {
                borderColor: '#ff0000',
                borderWidth: '2px',
                borderStyle: 'solid',
                backgroundColor: 'rgba(255, 0, 0, 0.1)',
                boxShadow: '0 0 5px rgba(255, 0, 0, 0.8)',
                opacity: 1,
                zIndex: 999999
            },
            enableHoverEffects: true,
            enableAnimations: true,
            autoClearTimeout: 0, // 0 means no auto-clear
            showTooltip: true,
            tooltipPosition: 'top',
            ...config
        };

        // Merge default styles with config styles
        this.config.defaultStyle = { ...this.config.defaultStyle, ...config.defaultStyle };
        this.config.hoverStyle = { ...this.config.hoverStyle, ...config.hoverStyle };
        this.config.selectionStyle = { ...this.config.selectionStyle, ...config.selectionStyle };
        this.config.errorStyle = { ...this.config.errorStyle, ...config.errorStyle };

        // Create overlay container
        this.overlayContainer = this.createOverlayContainer();

        // Bind methods
        this.handleMouseOver = this.handleMouseOver.bind(this);
        this.handleMouseOut = this.handleMouseOut.bind(this);
        this.handleResize = this.handleResize.bind(this);
        this.handleScroll = this.handleScroll.bind(this);
    }

    /**
     * Start the highlighter
     */
    start(): void {
        if (this.isActive) {
            this.logger.warn('Element highlighter already active');
            return;
        }

        this.logger.info('Starting element highlighter');
        this.isActive = true;

        // Add overlay container to DOM
        document.body.appendChild(this.overlayContainer);

        // Add event listeners
        if (this.config.enableHoverEffects) {
            document.addEventListener('mouseover', this.handleMouseOver);
            document.addEventListener('mouseout', this.handleMouseOut);
        }

        window.addEventListener('resize', this.handleResize);
        window.addEventListener('scroll', this.handleScroll, true);
    }

    /**
     * Stop the highlighter
     */
    stop(): void {
        if (!this.isActive) {
            return;
        }

        this.logger.info('Stopping element highlighter');
        this.isActive = false;

        // Remove event listeners
        document.removeEventListener('mouseover', this.handleMouseOver);
        document.removeEventListener('mouseout', this.handleMouseOut);
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('scroll', this.handleScroll, true);

        // Clear all highlights
        this.clearAll();

        // Remove overlay container
        if (this.overlayContainer.parentElement) {
            this.overlayContainer.parentElement.removeChild(this.overlayContainer);
        }
    }

    /**
     * Highlight an element
     */
    highlight(elementId: string, style?: HighlightStyle): boolean {
        const element = document.querySelector(`[data-el-id="${elementId}"]`) as HTMLElement;

        if (!element) {
            this.logger.warn(`Element not found for highlighting: ${elementId}`);
            return false;
        }

        // Remove existing highlight if any
        this.unhighlight(elementId);

        const finalStyle = { ...this.config.defaultStyle, ...style };
        const overlay = this.createHighlightOverlay(element, finalStyle);

        let tooltip: HTMLElement | undefined;
        if (this.config.showTooltip) {
            tooltip = this.createTooltip(element, elementId);
        }

        const highlighted: HighlightedElement = {
            elementId,
            element,
            overlay,
            style: finalStyle,
            tooltip,
            timestamp: Date.now()
        };

        this.highlights.set(elementId, highlighted);
        this.overlayContainer.appendChild(overlay);

        if (tooltip) {
            this.overlayContainer.appendChild(tooltip);
        }

        // Auto-clear if configured
        if (this.config.autoClearTimeout > 0) {
            setTimeout(() => {
                this.unhighlight(elementId);
            }, this.config.autoClearTimeout);
        }

        this.logger.debug(`Highlighted element: ${elementId}`);
        return true;
    }

    /**
     * Remove highlight from element
     */
    unhighlight(elementId: string): boolean {
        const highlighted = this.highlights.get(elementId);

        if (!highlighted) {
            return false;
        }

        // Remove overlay
        if (highlighted.overlay.parentElement) {
            highlighted.overlay.parentElement.removeChild(highlighted.overlay);
        }

        // Remove tooltip
        if (highlighted.tooltip && highlighted.tooltip.parentElement) {
            highlighted.tooltip.parentElement.removeChild(highlighted.tooltip);
        }

        this.highlights.delete(elementId);
        this.logger.debug(`Unhighlighted element: ${elementId}`);

        return true;
    }

    /**
     * Highlight with selection style
     */
    select(elementId: string): boolean {
        return this.highlight(elementId, this.config.selectionStyle);
    }

    /**
     * Highlight with error style
     */
    error(elementId: string): boolean {
        return this.highlight(elementId, this.config.errorStyle);
    }

    /**
     * Highlight with hover style
     */
    hover(elementId: string): boolean {
        if (this.hoveredElement === elementId) {
            return true;
        }

        // Clear previous hover
        if (this.hoveredElement) {
            this.unhighlight(`hover-${this.hoveredElement}`);
        }

        this.hoveredElement = elementId;
        return this.highlight(`hover-${elementId}`, this.config.hoverStyle);
    }

    /**
     * Clear hover highlight
     */
    clearHover(): boolean {
        if (!this.hoveredElement) {
            return false;
        }

        const result = this.unhighlight(`hover-${this.hoveredElement}`);
        this.hoveredElement = null;
        return result;
    }

    /**
     * Clear all highlights
     */
    clearAll(): void {
        const elementIds = Array.from(this.highlights.keys());
        elementIds.forEach(elementId => this.unhighlight(elementId));
        this.hoveredElement = null;
        this.logger.debug('Cleared all highlights');
    }

    /**
     * Update highlight position (useful after element moves)
     */
    updatePosition(elementId: string): boolean {
        const highlighted = this.highlights.get(elementId);

        if (!highlighted) {
            return false;
        }

        this.positionOverlay(highlighted.overlay, highlighted.element);

        if (highlighted.tooltip) {
            this.positionTooltip(highlighted.tooltip, highlighted.element);
        }

        return true;
    }

    /**
     * Update all highlight positions
     */
    updateAllPositions(): void {
        this.highlights.forEach((highlighted) => {
            this.updatePosition(highlighted.elementId);
        });
    }

    /**
     * Check if element is highlighted
     */
    isHighlighted(elementId: string): boolean {
        return this.highlights.has(elementId);
    }

    /**
     * Get highlighted elements
     */
    getHighlighted(): string[] {
        return Array.from(this.highlights.keys());
    }

    /**
     * Create overlay container
     */
    private createOverlayContainer(): HTMLElement {
        const container = document.createElement('div');
        container.id = 'element-tagger-highlights';
        container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 999990;
        `;
        return container;
    }

    /**
     * Create highlight overlay for element
     */
    private createHighlightOverlay(element: HTMLElement, style: HighlightStyle): HTMLElement {
        const overlay = document.createElement('div');
        overlay.className = 'element-tagger-highlight';

        // Apply styles
        this.applyHighlightStyle(overlay, style);

        // Position overlay
        this.positionOverlay(overlay, element);

        // Add animations if enabled
        if (this.config.enableAnimations) {
            overlay.style.transition = `all ${style.animationDuration || '0.2s'} ease-in-out`;
        }

        return overlay;
    }

    /**
     * Apply highlight style to overlay
     */
    private applyHighlightStyle(overlay: HTMLElement, style: HighlightStyle): void {
        overlay.style.cssText = `
            position: absolute;
            pointer-events: none;
            box-sizing: border-box;
            border: ${style.borderWidth || '2px'} ${style.borderStyle || 'solid'} ${style.borderColor || '#007acc'};
            background-color: ${style.backgroundColor || 'transparent'};
            opacity: ${style.opacity || 1};
            z-index: ${style.zIndex || 999999};
            ${style.boxShadow ? `box-shadow: ${style.boxShadow};` : ''}
        `;

        // Apply custom CSS properties
        if (style.customCSS) {
            Object.entries(style.customCSS).forEach(([property, value]) => {
                overlay.style.setProperty(property, value);
            });
        }
    }

    /**
     * Position overlay over element
     */
    private positionOverlay(overlay: HTMLElement, element: HTMLElement): void {
        const rect = element.getBoundingClientRect();
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        overlay.style.left = `${rect.left + scrollLeft}px`;
        overlay.style.top = `${rect.top + scrollTop}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
    }

    /**
     * Create tooltip for element
     */
    private createTooltip(element: HTMLElement, elementId: string): HTMLElement {
        const tooltip = document.createElement('div');
        tooltip.className = 'element-tagger-tooltip';

        // Get element info
        const tagName = element.tagName.toLowerCase();
        const className = element.className ? `.${element.className.split(' ').join('.')}` : '';
        const id = element.id ? `#${element.id}` : '';
        const textContent = element.textContent?.slice(0, 50) || '';

        tooltip.innerHTML = `
            <div class="tooltip-header">
                <strong>${elementId}</strong>
            </div>
            <div class="tooltip-content">
                <div>${tagName}${id}${className}</div>
                ${textContent ? `<div class="tooltip-text">"${textContent}${textContent.length > 50 ? '...' : ''}"</div>` : ''}
            </div>
        `;

        // Apply tooltip styles
        tooltip.style.cssText = `
            position: absolute;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
            line-height: 1.4;
            max-width: 300px;
            z-index: 1000001;
            pointer-events: none;
            white-space: nowrap;
        `;

        // Add internal styles for tooltip content
        const style = tooltip.style;
        const headerDiv = tooltip.querySelector('.tooltip-header') as HTMLElement;
        const contentDiv = tooltip.querySelector('.tooltip-content') as HTMLElement;
        const textDiv = tooltip.querySelector('.tooltip-text') as HTMLElement;

        if (headerDiv) {
            headerDiv.style.marginBottom = '4px';
            headerDiv.style.borderBottom = '1px solid rgba(255, 255, 255, 0.3)';
            headerDiv.style.paddingBottom = '4px';
        }

        if (contentDiv) {
            contentDiv.style.opacity = '0.8';
        }

        if (textDiv) {
            textDiv.style.fontStyle = 'italic';
            textDiv.style.opacity = '0.7';
            textDiv.style.marginTop = '2px';
        }

        // Position tooltip
        this.positionTooltip(tooltip, element);

        return tooltip;
    }

    /**
     * Position tooltip relative to element
     */
    private positionTooltip(tooltip: HTMLElement, element: HTMLElement): void {
        const rect = element.getBoundingClientRect();
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        // Temporarily add to DOM to measure
        if (!tooltip.parentElement) {
            tooltip.style.visibility = 'hidden';
            document.body.appendChild(tooltip);
        }

        const tooltipRect = tooltip.getBoundingClientRect();

        let left = rect.left + scrollLeft;
        let top = rect.top + scrollTop;

        // Position based on config
        switch (this.config.tooltipPosition) {
            case 'top':
                top -= tooltipRect.height + 8;
                left += (rect.width - tooltipRect.width) / 2;
                break;
            case 'bottom':
                top += rect.height + 8;
                left += (rect.width - tooltipRect.width) / 2;
                break;
            case 'left':
                left -= tooltipRect.width + 8;
                top += (rect.height - tooltipRect.height) / 2;
                break;
            case 'right':
                left += rect.width + 8;
                top += (rect.height - tooltipRect.height) / 2;
                break;
            case 'auto':
            default:
                // Auto-position to stay in viewport
                if (rect.top - tooltipRect.height - 8 >= 0) {
                    // Position above
                    top -= tooltipRect.height + 8;
                    left += (rect.width - tooltipRect.width) / 2;
                } else if (rect.bottom + tooltipRect.height + 8 <= window.innerHeight) {
                    // Position below
                    top += rect.height + 8;
                    left += (rect.width - tooltipRect.width) / 2;
                } else {
                    // Position to the side
                    top += (rect.height - tooltipRect.height) / 2;
                    if (rect.left - tooltipRect.width - 8 >= 0) {
                        left -= tooltipRect.width + 8;
                    } else {
                        left += rect.width + 8;
                    }
                }
                break;
        }

        // Ensure tooltip stays in viewport
        left = Math.max(8, Math.min(left, window.innerWidth - tooltipRect.width - 8));
        top = Math.max(8, Math.min(top, window.innerHeight - tooltipRect.height - 8));

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
        tooltip.style.visibility = 'visible';

        // Remove from body if temporarily added
        if (tooltip.parentElement === document.body && !tooltip.parentElement.contains(this.overlayContainer)) {
            document.body.removeChild(tooltip);
        }
    }

    /**
     * Handle mouse over events for hover effects
     */
    private handleMouseOver(event: MouseEvent): void {
        if (!this.isActive || !this.config.enableHoverEffects) return;

        const target = event.target as HTMLElement;
        const elementId = target.getAttribute('data-el-id');

        if (elementId && elementId !== this.hoveredElement) {
            this.hover(elementId);
        }
    }

    /**
     * Handle mouse out events for hover effects
     */
    private handleMouseOut(event: MouseEvent): void {
        if (!this.isActive || !this.config.enableHoverEffects) return;

        const target = event.target as HTMLElement;
        const elementId = target.getAttribute('data-el-id');

        if (elementId && elementId === this.hoveredElement) {
            // Check if mouse is still over the element or moved to a child
            const relatedTarget = event.relatedTarget as HTMLElement;
            if (!relatedTarget || !target.contains(relatedTarget)) {
                this.clearHover();
            }
        }
    }

    /**
     * Handle window resize
     */
    private handleResize(): void {
        if (this.isActive) {
            // Debounce resize updates
            clearTimeout((this as any)._resizeTimeout);
            (this as any)._resizeTimeout = setTimeout(() => {
                this.updateAllPositions();
            }, 100);
        }
    }

    /**
     * Handle scroll events
     */
    private handleScroll(): void {
        if (this.isActive) {
            // Debounce scroll updates
            clearTimeout((this as any)._scrollTimeout);
            (this as any)._scrollTimeout = setTimeout(() => {
                this.updateAllPositions();
            }, 16); // ~60fps
        }
    }

    /**
     * Highlight multiple elements
     */
    highlightMultiple(elementIds: string[], style?: HighlightStyle): number {
        let successCount = 0;

        elementIds.forEach(elementId => {
            if (this.highlight(elementId, style)) {
                successCount++;
            }
        });

        return successCount;
    }

    /**
     * Unhighlight multiple elements
     */
    unhighlightMultiple(elementIds: string[]): number {
        let successCount = 0;

        elementIds.forEach(elementId => {
            if (this.unhighlight(elementId)) {
                successCount++;
            }
        });

        return successCount;
    }

    /**
     * Flash highlight (temporary highlight)
     */
    flash(elementId: string, duration = 1000, style?: HighlightStyle): boolean {
        if (this.highlight(elementId, style)) {
            setTimeout(() => {
                this.unhighlight(elementId);
            }, duration);
            return true;
        }
        return false;
    }

    /**
     * Pulse effect (repeated flash)
     */
    pulse(elementId: string, pulses = 3, duration = 500, style?: HighlightStyle): boolean {
        let remaining = pulses * 2; // On/off cycles
        let isOn = false;

        const pulseInterval = setInterval(() => {
            if (isOn) {
                this.unhighlight(elementId);
            } else {
                this.highlight(elementId, style);
            }

            isOn = !isOn;
            remaining--;

            if (remaining <= 0) {
                clearInterval(pulseInterval);
                if (isOn) {
                    this.unhighlight(elementId);
                }
            }
        }, duration / 2);

        return true;
    }

    /**
     * Get highlight statistics
     */
    getStats(): {
        isActive: boolean;
        totalHighlights: number;
        hoveredElement: string | null;
        oldestHighlight?: number;
        newestHighlight?: number;
    } {
        const timestamps = Array.from(this.highlights.values()).map(h => h.timestamp);

        return {
            isActive: this.isActive,
            totalHighlights: this.highlights.size,
            hoveredElement: this.hoveredElement,
            oldestHighlight: timestamps.length > 0 ? Math.min(...timestamps) : undefined,
            newestHighlight: timestamps.length > 0 ? Math.max(...timestamps) : undefined
        };
    }

    /**
     * Create custom highlight style
     */
    createStyle(options: Partial<HighlightStyle>): HighlightStyle {
        return {
            ...this.config.defaultStyle,
            ...options
        };
    }

    /**
     * Enable/disable highlighter
     */
    setEnabled(enabled: boolean): void {
        if (enabled && !this.isActive) {
            this.start();
        } else if (!enabled && this.isActive) {
            this.stop();
        }
    }

    /**
     * Check if highlighter is active
     */
    isEnabled(): boolean {
        return this.isActive;
    }

    /**
     * Dispose highlighter and cleanup
     */
    dispose(): void {
        this.stop();
        this.clearAll();
    }
}