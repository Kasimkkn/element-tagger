import * as t from '@babel/types';
import generate from '@babel/generator';
import type {
    ASTNode,
    JSXElement,
    JSXAttribute,
    ModificationResult,
    ModificationChange,
    ElementPosition
} from '../types/ast';
import type { DetectedElement } from '../types/ast';
import type { IDGenerationResult } from './id-generator';
import { Logger } from '../utils/logger';

/**
 * Configuration for code injection
 */
export interface CodeInjectorConfig {
    /** Attribute name for element IDs */
    attributeName?: string;

    /** Whether to preserve existing data-el-id attributes */
    preserveExisting?: boolean;

    /** Whether to format generated code */
    formatCode?: boolean;

    /** Generator options for code formatting */
    generatorOptions?: any;

    /** Whether to validate injected code */
    validateAfterInjection?: boolean;
}

/**
 * Injection context for a single element
 */
export interface InjectionContext {
    element: DetectedElement;
    idResult: IDGenerationResult;
    shouldInject: boolean;
}

/**
 * Batch injection request
 */
export interface BatchInjectionRequest {
    ast: ASTNode;
    contexts: InjectionContext[];
    filePath?: string;
}

/**
 * Code injector for adding data-el-id attributes to JSX elements
 */
export class CodeInjector {
    private readonly logger: Logger;
    private readonly config: Required<CodeInjectorConfig>;

    constructor(config: CodeInjectorConfig = {}) {
        this.logger = new Logger('CodeInjector');
        this.config = {
            attributeName: 'data-el-id',
            preserveExisting: true,
            formatCode: true,
            generatorOptions: {
                retainLines: true,
                compact: false,
                minified: false,
                comments: true
            },
            validateAfterInjection: false,
            ...config
        };
    }

    /**
     * Inject data-el-id attributes into AST for detected elements
     */
    async injectIntoAST(request: BatchInjectionRequest): Promise<ModificationResult> {
        this.logger.debug(`Injecting IDs into ${request.contexts.length} elements`);

        try {
            const changes: ModificationChange[] = [];
            let modified = false;

            // Process each injection context
            for (const context of request.contexts) {
                if (!context.shouldInject) {
                    this.logger.debug(`Skipping injection for ${context.idResult.id} (shouldInject: false)`);
                    continue;
                }

                const change = await this.injectSingleElement(context);
                if (change) {
                    changes.push(change);
                    modified = true;
                }
            }

            return {
                success: true,
                modified,
                changes
            };
        } catch (error) {
            this.logger.error('Failed to inject IDs into AST', error);
            return {
                success: false,
                modified: false,
                changes: [],
                error: error instanceof Error ? error.message : 'Unknown injection error'
            };
        }
    }

    /**
     * Inject ID into a single element
     */
    private async injectSingleElement(context: InjectionContext): Promise<ModificationChange | null> {
        const { element, idResult } = context;

        try {
            // Check if element already has the attribute
            const existingAttr = this.findExistingAttribute(element.node);

            if (existingAttr && this.config.preserveExisting) {
                this.logger.debug(`Preserving existing ${this.config.attributeName} for element`);
                return null;
            }

            // Create or update the attribute
            const change = existingAttr
                ? this.updateAttribute(element, existingAttr, idResult.id)
                : this.addAttribute(element, idResult.id);

            this.logger.debug(`${existingAttr ? 'Updated' : 'Added'} ${this.config.attributeName}="${idResult.id}"`);
            return change;
        } catch (error) {
            this.logger.error(`Failed to inject ID for element ${idResult.id}`, error);
            return null;
        }
    }

    /**
     * Find existing data-el-id attribute on element
     */
    private findExistingAttribute(element: JSXElement): JSXAttribute | null {
        return element.openingElement.attributes.find((attr): attr is JSXAttribute =>
            t.isJSXAttribute(attr) &&
            this.getAttributeName(attr) === this.config.attributeName
        ) || null;
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
     * Add new data-el-id attribute to element
     */
    private addAttribute(element: DetectedElement, id: string): ModificationChange {
        const jsxElement = element.node as JSXElement;

        // Create new attribute
        const newAttribute = t.jsxAttribute(
            t.jsxIdentifier(this.config.attributeName),
            t.stringLiteral(id)
        );

        // Add to attributes array
        jsxElement.openingElement.attributes.unshift(newAttribute);

        return {
            type: 'add',
            elementId: id,
            attribute: this.config.attributeName,
            newValue: id,
            position: element.position
        };
    }

    /**
     * Update existing data-el-id attribute
     */
    private updateAttribute(
        element: DetectedElement,
        existingAttr: JSXAttribute,
        id: string
    ): ModificationChange {
        const oldValue = this.getAttributeValue(existingAttr);

        // Update attribute value
        existingAttr.value = t.stringLiteral(id);

        return {
            type: 'update',
            elementId: id,
            attribute: this.config.attributeName,
            oldValue,
            newValue: id,
            position: element.position
        };
    }

    /**
     * Get attribute value as string
     */
    private getAttributeValue(attr: JSXAttribute): string {
        if (!attr.value) return '';

        if (t.isStringLiteral(attr.value)) {
            return attr.value.value;
        }

        if (t.isJSXExpressionContainer(attr.value)) {
            // For expressions, we'll return a placeholder
            return '{expression}';
        }

        return '';
    }

    /**
     * Generate code from modified AST
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
     * Inject IDs and return modified code
     */
    async injectAndGenerate(request: BatchInjectionRequest): Promise<{
        code: string;
        result: ModificationResult;
    }> {
        // Inject IDs into AST
        const result = await this.injectIntoAST(request);

        if (!result.success) {
            throw new Error(result.error || 'Injection failed');
        }

        // Generate code from modified AST
        const code = await this.generateCode(request.ast);

        return { code, result };
    }

    /**
     * Validate that injection was successful
     */
    private async validateInjection(
        originalAST: ASTNode,
        modifiedAST: ASTNode,
        contexts: InjectionContext[]
    ): Promise<boolean> {
        try {
            // Count expected vs actual injections
            const expectedInjections = contexts.filter(ctx => ctx.shouldInject).length;
            let actualInjections = 0;

            // Traverse modified AST to count data-el-id attributes
            this.traverseAST(modifiedAST, (node) => {
                if (t.isJSXElement(node)) {
                    const hasDataElId = node.openingElement.attributes.some(attr =>
                        t.isJSXAttribute(attr) &&
                        this.getAttributeName(attr) === this.config.attributeName
                    );

                    if (hasDataElId) {
                        actualInjections++;
                    }
                }
            });

            const isValid = actualInjections >= expectedInjections;

            if (!isValid) {
                this.logger.warn(`Validation failed: expected ${expectedInjections}, actual ${actualInjections}`);
            }

            return isValid;
        } catch (error) {
            this.logger.error('Validation failed', error);
            return false;
        }
    }

    /**
     * Simple AST traversal utility
     */
    private traverseAST(node: ASTNode, visitor: (node: ASTNode) => void): void {
        if (!node || typeof node !== 'object') return;

        visitor(node);

        // Traverse child nodes
        for (const key in node) {
            if (key === 'parent' || key === 'loc' || key === 'range') continue;

            const child = (node as any)[key];

            if (Array.isArray(child)) {
                child.forEach(item => {
                    if (item && typeof item === 'object' && item.type) {
                        this.traverseAST(item, visitor);
                    }
                });
            } else if (child && typeof child === 'object' && child.type) {
                this.traverseAST(child, visitor);
            }
        }
    }

    /**
     * Remove data-el-id attributes from AST (for export mode)
     */
    async removeAttributes(ast: ASTNode): Promise<ModificationResult> {
        this.logger.debug('Removing data-el-id attributes from AST');

        try {
            const changes: ModificationChange[] = [];
            let modified = false;

            this.traverseAST(ast, (node) => {
                if (t.isJSXElement(node)) {
                    const originalLength = node.openingElement.attributes.length;

                    // Filter out data-el-id attributes
                    node.openingElement.attributes = node.openingElement.attributes.filter(attr => {
                        if (t.isJSXAttribute(attr) && this.getAttributeName(attr) === this.config.attributeName) {
                            const value = this.getAttributeValue(attr);
                            changes.push({
                                type: 'remove',
                                attribute: this.config.attributeName,
                                oldValue: value,
                                position: this.getNodePosition(node)
                            });
                            return false;
                        }
                        return true;
                    });

                    if (node.openingElement.attributes.length < originalLength) {
                        modified = true;
                    }
                }
            });

            return {
                success: true,
                modified,
                changes
            };
        } catch (error) {
            this.logger.error('Failed to remove attributes', error);
            return {
                success: false,
                modified: false,
                changes: [],
                error: error instanceof Error ? error.message : 'Unknown removal error'
            };
        }
    }

    /**
     * Get position from AST node
     */
    private getNodePosition(node: ASTNode): ElementPosition {
        return {
            line: node.loc?.start.line || 0,
            column: node.loc?.start.column || 0,
            start: node.start || 0,
            end: node.end || 0
        };
    }

    /**
     * Check if AST has any data-el-id attributes
     */
    hasDataElIdAttributes(ast: ASTNode): boolean {
        let hasAttributes = false;

        this.traverseAST(ast, (node) => {
            if (hasAttributes) return; // Early exit

            if (t.isJSXElement(node)) {
                const hasDataElId = node.openingElement.attributes.some(attr =>
                    t.isJSXAttribute(attr) &&
                    this.getAttributeName(attr) === this.config.attributeName
                );

                if (hasDataElId) {
                    hasAttributes = true;
                }
            }
        });

        return hasAttributes;
    }

    /**
     * Get statistics about injection operation
     */
    getInjectionStats(result: ModificationResult): {
        totalChanges: number;
        additions: number;
        updates: number;
        removals: number;
    } {
        const stats = {
            totalChanges: result.changes.length,
            additions: 0,
            updates: 0,
            removals: 0
        };

        result.changes.forEach(change => {
            switch (change.type) {
                case 'add':
                    stats.additions++;
                    break;
                case 'update':
                    stats.updates++;
                    break;
                case 'remove':
                    stats.removals++;
                    break;
            }
        });

        return stats;
    }

    /**
     * Create a new injector with different config
     */
    withConfig(newConfig: Partial<CodeInjectorConfig>): CodeInjector {
        return new CodeInjector({ ...this.config, ...newConfig });
    }
}