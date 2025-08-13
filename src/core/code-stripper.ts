import * as t from '@babel/types';
import generate from '@babel/generator';
import type {
    ASTNode,
    JSXElement,
    JSXAttribute,
    ModificationResult,
    ModificationChange
} from '../types/ast';
import { ASTTraverser } from './ast-traverser';
import { Logger } from '../utils/logger';

/**
 * Configuration for code stripping
 */
export interface CodeStripperConfig {
    /** Attributes to strip from elements */
    attributesToStrip?: string[];

    /** Whether to strip all data-* attributes */
    stripAllDataAttributes?: boolean;

    /** Whether to preserve comments */
    preserveComments?: boolean;

    /** Whether to minify output */
    minifyOutput?: boolean;

    /** Custom attribute filter function */
    attributeFilter?: (name: string, value: string | null) => boolean;

    /** Generator options for output formatting */
    generatorOptions?: any;
}

/**
 * Stripping statistics
 */
export interface StrippingStats {
    elementsProcessed: number;
    attributesRemoved: number;
    attributeTypes: Record<string, number>;
    filesProcessed: number;
}

/**
 * Code stripper for removing unwanted attributes from JSX elements
 * Primarily used for export mode to generate clean production code
 */
export class CodeStripper {
    private readonly logger: Logger;
    private readonly config: Required<CodeStripperConfig>;
    private readonly traverser: ASTTraverser;
    private readonly stats: StrippingStats = {
        elementsProcessed: 0,
        attributesRemoved: 0,
        attributeTypes: {},
        filesProcessed: 0
    };

    constructor(config: CodeStripperConfig = {}) {
        this.logger = new Logger('CodeStripper');
        this.config = {
            attributesToStrip: ['data-el-id'],
            stripAllDataAttributes: false,
            preserveComments: true,
            minifyOutput: false,
            attributeFilter: undefined,
            generatorOptions: {
                retainLines: false,
                compact: false,
                minified: false,
                comments: true
            },
            ...config
        };

        // Override generator options based on config
        if (this.config.minifyOutput) {
            this.config.generatorOptions = {
                ...this.config.generatorOptions,
                compact: true,
                minified: true,
                comments: false
            };
        }

        if (!this.config.preserveComments) {
            this.config.generatorOptions.comments = false;
        }

        this.traverser = new ASTTraverser();
    }

    /**
     * Strip unwanted attributes from AST
     */
    async stripFromAST(ast: ASTNode): Promise<ModificationResult> {
        this.logger.debug('Stripping attributes from AST');

        try {
            const changes: ModificationChange[] = [];
            let modified = false;

            this.traverser.walk(ast, (node) => {
                if (t.isJSXElement(node)) {
                    const element = node as JSXElement;
                    const elementChanges = this.stripElementAttributes(element);

                    if (elementChanges.length > 0) {
                        changes.push(...elementChanges);
                        modified = true;
                        this.stats.elementsProcessed++;
                    }
                }
            });

            this.stats.attributesRemoved += changes.length;

            return {
                success: true,
                modified,
                changes
            };
        } catch (error) {
            this.logger.error('Failed to strip attributes from AST', error);
            return {
                success: false,
                modified: false,
                changes: [],
                error: error instanceof Error ? error.message : 'Unknown stripping error'
            };
        }
    }

    /**
     * Strip attributes from a single JSX element
     */
    private stripElementAttributes(element: JSXElement): ModificationChange[] {
        const changes: ModificationChange[] = [];
        const originalLength = element.openingElement.attributes.length;

        // Filter out unwanted attributes
        element.openingElement.attributes = element.openingElement.attributes.filter(attr => {
            if (!t.isJSXAttribute(attr)) {
                return true; // Keep non-attribute nodes (like spreads)
            }

            const attributeName = this.getAttributeName(attr);
            const attributeValue = this.getAttributeValue(attr);

            if (this.shouldStripAttribute(attributeName, attributeValue)) {
                // Record the change
                changes.push({
                    type: 'remove',
                    attribute: attributeName,
                    oldValue: attributeValue,
                    position: this.getElementPosition(element)
                });

                // Update stats
                this.stats.attributeTypes[attributeName] =
                    (this.stats.attributeTypes[attributeName] || 0) + 1;

                return false; // Remove this attribute
            }

            return true; // Keep this attribute
        });

        return changes;
    }

    /**
     * Determine if an attribute should be stripped
     */
    private shouldStripAttribute(name: string, value: string | null): boolean {
        // Use custom filter if provided
        if (this.config.attributeFilter) {
            return this.config.attributeFilter(name, value);
        }

        // Check specific attributes to strip
        if (this.config.attributesToStrip.includes(name)) {
            return true;
        }

        // Check if we should strip all data attributes
        if (this.config.stripAllDataAttributes && name.startsWith('data-')) {
            return true;
        }

        return false;
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
     * Get attribute value as string
     */
    private getAttributeValue(attr: JSXAttribute): string | null {
        if (!attr.value) return null;

        if (t.isStringLiteral(attr.value)) {
            return attr.value.value;
        }

        if (t.isJSXExpressionContainer(attr.value)) {
            return '{expression}';
        }

        return null;
    }

    /**
     * Get element position for change tracking
     */
    private getElementPosition(element: JSXElement): any {
        return {
            line: element.loc?.start.line || 0,
            column: element.loc?.start.column || 0,
            start: element.start || 0,
            end: element.end || 0
        };
    }

    /**
     * Strip attributes and generate clean code
     */
    async stripAndGenerate(ast: ASTNode): Promise<{
        code: string;
        result: ModificationResult;
    }> {
        // Strip attributes from AST
        const result = await this.stripFromAST(ast);

        if (!result.success) {
            throw new Error(result.error || 'Stripping failed');
        }

        // Generate code from modified AST
        const code = await this.generateCode(ast);

        return { code, result };
    }

    /**
     * Generate code from AST
     */
    async generateCode(ast: ASTNode): Promise<string> {
        try {
            const result = generate(ast, this.config.generatorOptions);
            return result.code;
        } catch (error) {
            this.logger.error('Failed to generate code from AST', error);
            throw new Error(`Code generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Strip specific attributes by name
     */
    async stripAttributes(ast: ASTNode, attributeNames: string[]): Promise<ModificationResult> {
        const originalConfig = this.config.attributesToStrip;
        this.config.attributesToStrip = attributeNames;

        try {
            const result = await this.stripFromAST(ast);
            return result;
        } finally {
            this.config.attributesToStrip = originalConfig;
        }
    }

    /**
     * Strip all data attributes
     */
    async stripAllDataAttributes(ast: ASTNode): Promise<ModificationResult> {
        const originalConfig = this.config.stripAllDataAttributes;
        this.config.stripAllDataAttributes = true;

        try {
            const result = await this.stripFromAST(ast);
            return result;
        } finally {
            this.config.stripAllDataAttributes = originalConfig;
        }
    }

    /**
     * Clean code for production (strip common development attributes)
     */
    async cleanForProduction(ast: ASTNode): Promise<{
        code: string;
        result: ModificationResult;
    }> {
        const productionStripper = new CodeStripper({
            attributesToStrip: [
                'data-el-id',
                'data-testid',
                'data-test',
                'data-cy',
                'data-test-id',
                'data-automation',
                'data-qa',
                'data-debug'
            ],
            stripAllDataAttributes: false,
            preserveComments: false,
            minifyOutput: true
        });

        return await productionStripper.stripAndGenerate(ast);
    }

    /**
     * Remove only element tagger specific attributes
     */
    async stripTaggerAttributes(ast: ASTNode): Promise<ModificationResult> {
        return await this.stripAttributes(ast, ['data-el-id']);
    }

    /**
     * Check if AST has any strippable attributes
     */
    hasStrippableAttributes(ast: ASTNode): boolean {
        let hasAttributes = false;

        this.traverser.walk(ast, (node) => {
            if (hasAttributes) return false; // Early exit

            if (t.isJSXElement(node)) {
                const element = node as JSXElement;

                for (const attr of element.openingElement.attributes) {
                    if (t.isJSXAttribute(attr)) {
                        const name = this.getAttributeName(attr);
                        const value = this.getAttributeValue(attr);

                        if (this.shouldStripAttribute(name, value)) {
                            hasAttributes = true;
                            return false; // Stop traversal
                        }
                    }
                }
            }
        });

        return hasAttributes;
    }

    /**
     * Get count of strippable attributes
     */
    countStrippableAttributes(ast: ASTNode): number {
        let count = 0;

        this.traverser.walk(ast, (node) => {
            if (t.isJSXElement(node)) {
                const element = node as JSXElement;

                for (const attr of element.openingElement.attributes) {
                    if (t.isJSXAttribute(attr)) {
                        const name = this.getAttributeName(attr);
                        const value = this.getAttributeValue(attr);

                        if (this.shouldStripAttribute(name, value)) {
                            count++;
                        }
                    }
                }
            }
        });

        return count;
    }

    /**
     * Preview what would be stripped without modifying the AST
     */
    previewStripping(ast: ASTNode): {
        attributesToRemove: Array<{
            element: string;
            attribute: string;
            value: string | null;
            line: number;
            column: number;
        }>;
        totalCount: number;
    } {
        const attributesToRemove: Array<{
            element: string;
            attribute: string;
            value: string | null;
            line: number;
            column: number;
        }> = [];

        this.traverser.walk(ast, (node) => {
            if (t.isJSXElement(node)) {
                const element = node as JSXElement;
                const elementName = this.getElementName(element);

                for (const attr of element.openingElement.attributes) {
                    if (t.isJSXAttribute(attr)) {
                        const name = this.getAttributeName(attr);
                        const value = this.getAttributeValue(attr);

                        if (this.shouldStripAttribute(name, value)) {
                            attributesToRemove.push({
                                element: elementName,
                                attribute: name,
                                value,
                                line: element.loc?.start.line || 0,
                                column: element.loc?.start.column || 0
                            });
                        }
                    }
                }
            }
        });

        return {
            attributesToRemove,
            totalCount: attributesToRemove.length
        };
    }

    /**
     * Get element name from JSX element
     */
    private getElementName(element: JSXElement): string {
        const name = element.openingElement.name;

        if (t.isJSXIdentifier(name)) {
            return name.name;
        }

        if (t.isJSXMemberExpression(name)) {
            // Handle React.Component style names
            const parts: string[] = [];
            let current = name;

            while (t.isJSXMemberExpression(current)) {
                parts.unshift(current.property.name);
                current = current.object as any;
            }

            if (t.isJSXIdentifier(current)) {
                parts.unshift(current.name);
            }

            return parts.join('.');
        }

        return 'unknown';
    }

    /**
     * Get stripping statistics
     */
    getStats(): StrippingStats {
        return { ...this.stats };
    }

    /**
     * Reset statistics
     */
    resetStats(): void {
        Object.assign(this.stats, {
            elementsProcessed: 0,
            attributesRemoved: 0,
            attributeTypes: {},
            filesProcessed: 0
        });
    }

    /**
     * Create a new stripper with different config
     */
    withConfig(newConfig: Partial<CodeStripperConfig>): CodeStripper {
        return new CodeStripper({ ...this.config, ...newConfig });
    }
}