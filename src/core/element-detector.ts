import * as t from '@babel/types';
import type {
    ASTNode,
    JSXElement,
    JSXFragment,
    JSXAttribute,
    ElementDetectionResult,
    DetectedElement,
    ElementAttribute,
    ElementPosition,
    NodePath
} from '../types/ast';
import type { TaggingOptions } from '../types';
import { Logger } from '../utils/logger';

/**
 * Element detector for finding taggable JSX elements in AST
 */
export class ElementDetector {
    private readonly logger: Logger;
    private readonly options: Required<TaggingOptions>;

    constructor(options: TaggingOptions = {}) {
        this.logger = new Logger('ElementDetector');
        this.options = {
            domElements: true,
            customComponents: false,
            fragments: false,
            textNodes: false,
            ...options
        };
    }

    /**
     * Detect all taggable elements in an AST
     */
    detectElements(ast: ASTNode, filePath?: string): ElementDetectionResult {
        this.logger.debug(`Detecting elements in ${filePath || 'AST'}`);

        const elements: DetectedElement[] = [];
        let domElements = 0;
        let customComponents = 0;
        let fragments = 0;

        try {
            this.traverse(ast, (node, path) => {
                const detected = this.analyzeNode(node, path);
                if (detected) {
                    elements.push(detected);

                    // Count by type
                    switch (detected.elementType) {
                        case 'dom':
                            domElements++;
                            break;
                        case 'component':
                            customComponents++;
                            break;
                        case 'fragment':
                            fragments++;
                            break;
                    }
                }
            });

            const result: ElementDetectionResult = {
                elements,
                totalCount: elements.length,
                domElements,
                customComponents,
                fragments
            };

            this.logger.debug(`Detected ${result.totalCount} elements: ${domElements} DOM, ${customComponents} components, ${fragments} fragments`);
            return result;
        } catch (error) {
            this.logger.error('Failed to detect elements', error);
            return {
                elements: [],
                totalCount: 0,
                domElements: 0,
                customComponents: 0,
                fragments: 0
            };
        }
    }

    /**
     * Analyze a single node to determine if it should be tagged
     */
    private analyzeNode(node: ASTNode, path: NodePath): DetectedElement | null {
        // Handle JSX Elements
        if (t.isJSXElement(node)) {
            return this.analyzeJSXElement(node as JSXElement, path);
        }

        // Handle JSX Fragments
        if (t.isJSXFragment(node) && this.options.fragments) {
            return this.analyzeJSXFragment(node as JSXFragment, path);
        }

        return null;
    }

    /**
     * Analyze JSX Element
     */
    private analyzeJSXElement(node: JSXElement, path: NodePath): DetectedElement | null {
        const tagName = this.getElementTagName(node);
        if (!tagName) return null;

        const elementType = this.determineElementType(tagName);

        // Check if we should process this element type
        if (!this.shouldProcessElementType(elementType)) {
            return null;
        }

        const attributes = this.extractAttributes(node);
        const position = this.getElementPosition(node);
        const hasDataElId = this.hasDataElIdAttribute(attributes);

        return {
            node,
            path,
            elementType,
            tagName,
            attributes,
            children: [], // Will be populated by traversal
            position,
            hasDataElId
        };
    }

    /**
     * Analyze JSX Fragment
     */
    private analyzeJSXFragment(node: JSXFragment, path: NodePath): DetectedElement | null {
        if (!this.options.fragments) return null;

        const position = this.getElementPosition(node);

        return {
            node,
            path,
            elementType: 'fragment',
            tagName: 'Fragment',
            attributes: [],
            children: [],
            position,
            hasDataElId: false
        };
    }

    /**
     * Get the tag name from a JSX element
     */
    private getElementTagName(element: JSXElement): string | null {
        const name = element.openingElement.name;

        if (t.isJSXIdentifier(name)) {
            return name.name;
        }

        if (t.isJSXMemberExpression(name)) {
            // Handle React.Component style names
            return this.getMemberExpressionName(name);
        }

        if (t.isJSXNamespacedName(name)) {
            // Handle xml:lang style names
            return `${name.namespace.name}:${name.name.name}`;
        }

        return null;
    }

    /**
     * Get full name from member expression (e.g., React.Component)
     */
    private getMemberExpressionName(memberExpr: t.JSXMemberExpression): string {
        const parts: string[] = [];
        let current: t.JSXElementName = memberExpr;

        while (t.isJSXMemberExpression(current)) {
            parts.unshift(current.property.name);
            current = current.object;
        }

        if (t.isJSXIdentifier(current)) {
            parts.unshift(current.name);
        }

        return parts.join('.');
    }

    /**
     * Determine if element is DOM element, custom component, or fragment
     */
    private determineElementType(tagName: string): 'dom' | 'component' | 'fragment' {
        // DOM elements start with lowercase
        if (tagName[0] === tagName[0].toLowerCase()) {
            return 'dom';
        }

        // Handle special cases
        if (tagName === 'Fragment' || tagName === 'React.Fragment') {
            return 'fragment';
        }

        // Custom components start with uppercase
        return 'component';
    }

    /**
     * Check if we should process this element type based on options
     */
    private shouldProcessElementType(elementType: 'dom' | 'component' | 'fragment'): boolean {
        switch (elementType) {
            case 'dom':
                return this.options.domElements;
            case 'component':
                return this.options.customComponents;
            case 'fragment':
                return this.options.fragments;
            default:
                return false;
        }
    }

    /**
     * Extract attributes from JSX element
     */
    private extractAttributes(element: JSXElement): ElementAttribute[] {
        return element.openingElement.attributes
            .filter((attr): attr is JSXAttribute => t.isJSXAttribute(attr))
            .map(attr => this.parseAttribute(attr));
    }

    /**
     * Parse a single JSX attribute
     */
    private parseAttribute(attr: JSXAttribute): ElementAttribute {
        const name = this.getAttributeName(attr);
        const value = this.getAttributeValue(attr);
        const isDataElId = name === 'data-el-id';

        return {
            name,
            value,
            isDataElId,
            node: attr
        };
    }

    /**
     * Get attribute name (handles namespaced attributes)
     */
    private getAttributeName(attr: JSXAttribute): string {
        if (t.isJSXIdentifier(attr.name)) {
            return attr.name.name;
        }

        if (t.isJSXNamespacedName(attr.name)) {
            return `${attr.name.namespace.name}:${attr.name.name.name}`;
        }

        return 'unknown';
    }

    /**
     * Get attribute value
     */
    private getAttributeValue(attr: JSXAttribute): string | null {
        if (!attr.value) {
            // Boolean attribute (e.g., <input disabled />)
            return null;
        }

        if (t.isStringLiteral(attr.value)) {
            return attr.value.value;
        }

        if (t.isJSXExpressionContainer(attr.value)) {
            // For expressions, we'll return a placeholder
            // In a real implementation, you might want to evaluate simple expressions
            return '{expression}';
        }

        return null;
    }

    /**
     * Check if element already has data-el-id attribute
     */
    private hasDataElIdAttribute(attributes: ElementAttribute[]): boolean {
        return attributes.some(attr => attr.isDataElId);
    }

    /**
     * Get element position in source code
     */
    private getElementPosition(node: ASTNode): ElementPosition {
        return {
            line: node.loc?.start.line || 0,
            column: node.loc?.start.column || 0,
            start: node.start || 0,
            end: node.end || 0
        };
    }

    /**
     * Simple AST traversal with visitor pattern
     */
    private traverse(node: ASTNode, visitor: (node: ASTNode, path: NodePath) => void): void {
        const path: NodePath = {
            node,
            replaceWith: () => { },
            remove: () => { },
            insertBefore: () => { },
            insertAfter: () => { },
            traverse: () => { },
            stop: () => { },
            skip: () => { },
            isJSXElement: () => t.isJSXElement(node),
            isJSXAttribute: () => t.isJSXAttribute(node),
            isJSXIdentifier: () => t.isJSXIdentifier(node)
        };

        this.visitNode(node, path, visitor);
    }

    /**
     * Visit a single node and its children
     */
    private visitNode(
        node: ASTNode,
        path: NodePath,
        visitor: (node: ASTNode, path: NodePath) => void
    ): void {
        if (!node || typeof node !== 'object') return;

        // Visit current node
        visitor(node, path);

        // Visit children
        for (const key in node) {
            if (key === 'parent' || key === 'loc' || key === 'range') continue;

            const child = (node as any)[key];

            if (Array.isArray(child)) {
                child.forEach((item, index) => {
                    if (item && typeof item === 'object' && item.type) {
                        const childPath: NodePath = {
                            ...path,
                            node: item,
                            parent: node,
                            key: index,
                            listKey: key,
                            container: child
                        };
                        this.visitNode(item, childPath, visitor);
                    }
                });
            } else if (child && typeof child === 'object' && child.type) {
                const childPath: NodePath = {
                    ...path,
                    node: child,
                    parent: node,
                    key,
                    container: node
                };
                this.visitNode(child, childPath, visitor);
            }
        }
    }

    /**
     * Filter elements by type
     */
    filterByType(elements: DetectedElement[], type: 'dom' | 'component' | 'fragment'): DetectedElement[] {
        return elements.filter(element => element.elementType === type);
    }

    /**
     * Find elements that don't have data-el-id
     */
    findUntaggedElements(elements: DetectedElement[]): DetectedElement[] {
        return elements.filter(element => !element.hasDataElId);
    }

    /**
     * Find elements by tag name
     */
    findByTagName(elements: DetectedElement[], tagName: string): DetectedElement[] {
        return elements.filter(element => element.tagName === tagName);
    }

    /**
     * Get statistics about detected elements
     */
    getStatistics(result: ElementDetectionResult): Record<string, any> {
        const untagged = result.elements.filter(el => !el.hasDataElId).length;
        const tagged = result.totalCount - untagged;

        return {
            total: result.totalCount,
            tagged,
            untagged,
            domElements: result.domElements,
            customComponents: result.customComponents,
            fragments: result.fragments,
            taggedPercentage: result.totalCount > 0 ? Math.round((tagged / result.totalCount) * 100) : 0
        };
    }

    /**
     * Check if an element should be tagged based on current options
     */
    shouldTagElement(element: DetectedElement): boolean {
        // Don't re-tag if already tagged
        if (element.hasDataElId) {
            return false;
        }

        // Check if element type should be processed
        return this.shouldProcessElementType(element.elementType);
    }

    /**
     * Create a new detector with different options
     */
    withOptions(options: Partial<TaggingOptions>): ElementDetector {
        return new ElementDetector({ ...this.options, ...options });
    }
}