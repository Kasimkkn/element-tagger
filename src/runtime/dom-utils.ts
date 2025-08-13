import { Logger } from '../utils/logger';

/**
 * DOM utility functions for runtime operations
 */
export class DOMUtils {
    private static readonly logger = new Logger('DOMUtils');

    /**
     * Find element by data-el-id attribute
     */
    static findElementById(elementId: string): HTMLElement | null {
        return document.querySelector(`[data-el-id="${elementId}"]`) as HTMLElement;
    }

    /**
     * Find all elements with data-el-id attributes
     */
    static findAllTaggedElements(): HTMLElement[] {
        return Array.from(document.querySelectorAll('[data-el-id]')) as HTMLElement[];
    }

    /**
     * Get element's data-el-id
     */
    static getElementId(element: HTMLElement): string | null {
        return element.getAttribute('data-el-id');
    }

    /**
     * Check if element has data-el-id attribute
     */
    static isTaggedElement(element: HTMLElement): boolean {
        return element.hasAttribute('data-el-id');
    }

    /**
     * Get element's bounding rectangle with scroll offset
     */
    static getElementRect(element: HTMLElement): DOMRect {
        const rect = element.getBoundingClientRect();
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        return new DOMRect(
            rect.left + scrollLeft,
            rect.top + scrollTop,
            rect.width,
            rect.height
        );
    }

    /**
     * Check if element is visible in viewport
     */
    static isElementVisible(element: HTMLElement): boolean {
        const rect = element.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(element);

        return (
            rect.width > 0 &&
            rect.height > 0 &&
            computedStyle.display !== 'none' &&
            computedStyle.visibility !== 'hidden' &&
            computedStyle.opacity !== '0' &&
            rect.bottom >= 0 &&
            rect.right >= 0 &&
            rect.top <= window.innerHeight &&
            rect.left <= window.innerWidth
        );
    }

    /**
     * Check if element is in viewport
     */
    static isElementInViewport(element: HTMLElement, threshold = 0): boolean {
        const rect = element.getBoundingClientRect();
        const windowHeight = window.innerHeight || document.documentElement.clientHeight;
        const windowWidth = window.innerWidth || document.documentElement.clientWidth;

        return (
            rect.top >= -threshold &&
            rect.left >= -threshold &&
            rect.bottom <= windowHeight + threshold &&
            rect.right <= windowWidth + threshold
        );
    }

    /**
     * Get element's computed style property
     */
    static getStyleProperty(element: HTMLElement, property: string): string {
        return window.getComputedStyle(element).getPropertyValue(property);
    }

    /**
     * Set element's style properties
     */
    static setStyles(element: HTMLElement, styles: Record<string, string>): void {
        Object.entries(styles).forEach(([property, value]) => {
            element.style.setProperty(property, value);
        });
    }

    /**
     * Get element's tag name
     */
    static getTagName(element: HTMLElement): string {
        return element.tagName.toLowerCase();
    }

    /**
     * Get element's text content (trimmed)
     */
    static getTextContent(element: HTMLElement): string {
        return (element.textContent || '').trim();
    }

    /**
     * Get element's attributes as object
     */
    static getAttributes(element: HTMLElement): Record<string, string> {
        const attributes: Record<string, string> = {};
        for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes[i];
            attributes[attr.name] = attr.value;
        }
        return attributes;
    }

    /**
     * Generate CSS selector for element
     */
    static generateSelector(element: HTMLElement): string {
        const path: string[] = [];
        let current: Element | null = element;

        while (current && current !== document.body) {
            let selector = current.tagName.toLowerCase();

            // Use ID if available
            if (current.id) {
                selector += `#${CSS.escape(current.id)}`;
                path.unshift(selector);
                break;
            }

            // Use classes if available
            if (current.className) {
                const classes = current.className.split(/\s+/).filter(c => c.trim());
                if (classes.length > 0) {
                    selector += '.' + classes.map(c => CSS.escape(c)).join('.');
                }
            }

            // Add nth-child if needed for uniqueness
            const parent = current.parentElement;
            if (parent) {
                const siblings = Array.from(parent.children).filter(el =>
                    el.tagName === current!.tagName
                );

                if (siblings.length > 1) {
                    const index = siblings.indexOf(current) + 1;
                    selector += `:nth-child(${index})`;
                }
            }

            path.unshift(selector);
            current = current.parentElement;
        }

        return path.join(' > ');
    }

    /**
     * Find element by selector
     */
    static findBySelector(selector: string): HTMLElement | null {
        try {
            return document.querySelector(selector) as HTMLElement;
        } catch (error) {
            this.logger.warn(`Invalid selector: ${selector}`, error);
            return null;
        }
    }

    /**
     * Find elements by selector
     */
    static findAllBySelector(selector: string): HTMLElement[] {
        try {
            return Array.from(document.querySelectorAll(selector)) as HTMLElement[];
        } catch (error) {
            this.logger.warn(`Invalid selector: ${selector}`, error);
            return [];
        }
    }

    /**
     * Get element's parent with data-el-id
     */
    static findTaggedParent(element: HTMLElement): HTMLElement | null {
        let current: HTMLElement | null = element.parentElement;

        while (current && current !== document.body) {
            if (this.isTaggedElement(current)) {
                return current;
            }
            current = current.parentElement;
        }

        return null;
    }

    /**
     * Get element's children with data-el-id
     */
    static findTaggedChildren(element: HTMLElement): HTMLElement[] {
        return Array.from(element.querySelectorAll('[data-el-id]')) as HTMLElement[];
    }

    /**
     * Get element's siblings with data-el-id
     */
    static findTaggedSiblings(element: HTMLElement): HTMLElement[] {
        if (!element.parentElement) return [];

        return Array.from(element.parentElement.querySelectorAll('[data-el-id]'))
            .filter(el => el !== element) as HTMLElement[];
    }

    /**
     * Check if element contains another element
     */
    static contains(parent: HTMLElement, child: HTMLElement): boolean {
        return parent.contains(child);
    }

    /**
     * Get element's distance from another element
     */
    static getDistance(element1: HTMLElement, element2: HTMLElement): number {
        const rect1 = element1.getBoundingClientRect();
        const rect2 = element2.getBoundingClientRect();

        const centerX1 = rect1.left + rect1.width / 2;
        const centerY1 = rect1.top + rect1.height / 2;
        const centerX2 = rect2.left + rect2.width / 2;
        const centerY2 = rect2.top + rect2.height / 2;

        return Math.sqrt(
            Math.pow(centerX2 - centerX1, 2) + Math.pow(centerY2 - centerY1, 2)
        );
    }

    /**
     * Get element's position relative to document
     */
    static getDocumentPosition(element: HTMLElement): { x: number; y: number } {
        const rect = element.getBoundingClientRect();
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        return {
            x: rect.left + scrollLeft,
            y: rect.top + scrollTop
        };
    }

    /**
     * Scroll element into view
     */
    static scrollIntoView(element: HTMLElement, options?: ScrollIntoViewOptions): void {
        element.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'center',
            ...options
        });
    }

    /**
     * Get element's z-index
     */
    static getZIndex(element: HTMLElement): number {
        const zIndex = this.getStyleProperty(element, 'z-index');
        return zIndex === 'auto' ? 0 : parseInt(zIndex, 10) || 0;
    }

    /**
     * Get element at point
     */
    static getElementAtPoint(x: number, y: number): HTMLElement | null {
        return document.elementFromPoint(x, y) as HTMLElement;
    }

    /**
     * Get elements at point
     */
    static getElementsAtPoint(x: number, y: number): HTMLElement[] {
        return Array.from(document.elementsFromPoint(x, y)) as HTMLElement[];
    }

    /**
     * Check if point is inside element
     */
    static isPointInElement(x: number, y: number, element: HTMLElement): boolean {
        const rect = element.getBoundingClientRect();
        return (
            x >= rect.left &&
            x <= rect.right &&
            y >= rect.top &&
            y <= rect.bottom
        );
    }

    /**
     * Get element's center point
     */
    static getCenterPoint(element: HTMLElement): { x: number; y: number } {
        const rect = element.getBoundingClientRect();
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
    }

    /**
     * Create element with attributes
     */
    static createElement(
        tagName: string,
        attributes?: Record<string, string>,
        textContent?: string
    ): HTMLElement {
        const element = document.createElement(tagName);

        if (attributes) {
            Object.entries(attributes).forEach(([name, value]) => {
                element.setAttribute(name, value);
            });
        }

        if (textContent) {
            element.textContent = textContent;
        }

        return element;
    }

    /**
     * Remove element from DOM
     */
    static removeElement(element: HTMLElement): void {
        if (element.parentElement) {
            element.parentElement.removeChild(element);
        }
    }

    /**
     * Clone element
     */
    static cloneElement(element: HTMLElement, deep = true): HTMLElement {
        return element.cloneNode(deep) as HTMLElement;
    }

    /**
     * Check if element is editable
     */
    static isEditable(element: HTMLElement): boolean {
        const tagName = this.getTagName(element);
        const contentEditable = element.getAttribute('contenteditable');

        return (
            tagName === 'input' ||
            tagName === 'textarea' ||
            contentEditable === 'true' ||
            contentEditable === ''
        );
    }

    /**
     * Check if element is interactive
     */
    static isInteractive(element: HTMLElement): boolean {
        const tagName = this.getTagName(element);
        const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', 'details', 'summary'];

        return (
            interactiveTags.includes(tagName) ||
            element.hasAttribute('onclick') ||
            element.hasAttribute('onmousedown') ||
            element.hasAttribute('onmouseup') ||
            element.getAttribute('role') === 'button' ||
            element.getAttribute('tabindex') !== null ||
            this.isEditable(element)
        );
    }

    /**
     * Get element's computed dimensions
     */
    static getDimensions(element: HTMLElement): {
        width: number;
        height: number;
        offsetWidth: number;
        offsetHeight: number;
        clientWidth: number;
        clientHeight: number;
        scrollWidth: number;
        scrollHeight: number;
    } {
        const rect = element.getBoundingClientRect();

        return {
            width: rect.width,
            height: rect.height,
            offsetWidth: element.offsetWidth,
            offsetHeight: element.offsetHeight,
            clientWidth: element.clientWidth,
            clientHeight: element.clientHeight,
            scrollWidth: element.scrollWidth,
            scrollHeight: element.scrollHeight
        };
    }

    /**
     * Wait for element to appear in DOM
     */
    static waitForElement(
        selector: string,
        timeout = 5000
    ): Promise<HTMLElement | null> {
        return new Promise((resolve) => {
            const element = this.findBySelector(selector);
            if (element) {
                resolve(element);
                return;
            }

            const observer = new MutationObserver(() => {
                const element = this.findBySelector(selector);
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    }

    /**
     * Observe element changes
     */
    static observeElement(
        element: HTMLElement,
        callback: (mutations: MutationRecord[]) => void,
        options: MutationObserverInit = {}
    ): MutationObserver {
        const observer = new MutationObserver(callback);
        observer.observe(element, {
            attributes: true,
            childList: true,
            subtree: true,
            ...options
        });
        return observer;
    }

    /**
     * Get element's accessibility information
     */
    static getAccessibilityInfo(element: HTMLElement): {
        role: string | null;
        label: string | null;
        description: string | null;
        tabIndex: number;
        ariaHidden: boolean;
        ariaDisabled: boolean;
        ariaExpanded: boolean | null;
    } {
        return {
            role: element.getAttribute('role'),
            label: element.getAttribute('aria-label') || element.getAttribute('title'),
            description: element.getAttribute('aria-describedby'),
            tabIndex: element.tabIndex,
            ariaHidden: element.getAttribute('aria-hidden') === 'true',
            ariaDisabled: element.getAttribute('aria-disabled') === 'true',
            ariaExpanded: element.hasAttribute('aria-expanded')
                ? element.getAttribute('aria-expanded') === 'true'
                : null
        };
    }

    /**
     * Check if element matches media query
     */
    static matchesMediaQuery(query: string): boolean {
        try {
            return window.matchMedia(query).matches;
        } catch (error) {
            this.logger.warn(`Invalid media query: ${query}`, error);
            return false;
        }
    }

    /**
     * Get viewport dimensions
     */
    static getViewportDimensions(): {
        width: number;
        height: number;
        scrollX: number;
        scrollY: number;
    } {
        return {
            width: window.innerWidth || document.documentElement.clientWidth,
            height: window.innerHeight || document.documentElement.clientHeight,
            scrollX: window.pageXOffset || document.documentElement.scrollLeft,
            scrollY: window.pageYOffset || document.documentElement.scrollTop
        };
    }

    /**
     * Check if device supports touch
     */
    static isTouchDevice(): boolean {
        return (
            'ontouchstart' in window ||
            navigator.maxTouchPoints > 0 ||
            (navigator as any).msMaxTouchPoints > 0
        );
    }

    /**
     * Get device pixel ratio
     */
    static getDevicePixelRatio(): number {
        return window.devicePixelRatio || 1;
    }
}