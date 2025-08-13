import * as t from '@babel/types';
import generate from '@babel/generator';
import type { ASTNode, ModificationResult } from '../types/ast';
import type { ChangeRecord } from './change-tracker';
import { Logger } from '../utils/logger';

/**
 * Update operation for AST modifications
 */
export interface ASTUpdateOperation {
    type: 'add-attribute' | 'remove-attribute' | 'update-attribute' | 'replace-element' | 'remove-element';
    elementPath: string;
    attribute?: {
        name: string;
        value?: string;
    };
    newElement?: ASTNode;
}

/**
 * AST update configuration
 */
export interface ASTUpdaterConfig {
    /** Preserve existing comments */
    preserveComments?: boolean;

    /** Validate AST after updates */
    validateAfterUpdate?: boolean;

    /** Generate source maps */
    generateSourceMaps?: boolean;

    /** Code formatting options */
    formatOptions?: any;
}

/**
 * AST updater for applying changes to syntax trees
 */
export class ASTUpdater {
    private readonly logger: Logger;
    private readonly config: Required<ASTUpdaterConfig>;

    constructor(config: ASTUpdaterConfig = {}) {
        this.logger = new Logger('ASTUpdater');
        this.config = {
            preserveComments: true,
            validateAfterUpdate: true,
            generateSourceMaps: false,
            formatOptions: {
                retainLines: true,
                compact: false,
                comments: true
            },
            ...config
        };
    }

    /**
     * Apply changes to AST
     */
    async applyChanges(ast: ASTNode, changes: ChangeRecord[]): Promise<ModificationResult> {
        this.logger.debug(`Applying ${changes.length} changes to AST`);

        try {
            let modified = false;
            const appliedChanges = [];

            for (const change of changes) {
                const changeResult = await this.applyChange(ast, change);
                if (changeResult.modified) {
                    modified = true;
                    appliedChanges.push(...changeResult.changes);
                }
            }

            return {
                success: true,
                modified,
                changes: appliedChanges
            };
        } catch (error) {
            this.logger.error('Failed to apply changes to AST', error);
            return {
                success: false,
                modified: false,
                changes: [],
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Apply single change to AST
     */
    private async applyChange(ast: ASTNode, change: ChangeRecord): Promise<ModificationResult> {
        switch (change.type) {
            case 'attribute-added':
            case 'attribute-modified':
                return this.updateElementAttribute(ast, change);

            case 'attribute-removed':
                return this.removeElementAttribute(ast, change);

            case 'element-added':
                return this.addElement(ast, change);

            case 'element-removed':
                return this.removeElement(ast, change);

            case 'element-modified':
                return this.modifyElement(ast, change);

            default:
                this.logger.warn(`Unsupported change type: ${change.type}`);
                return {
                    success: true,
                    modified: false,
                    changes: []
                };
        }
    }

    /**
     * Update element attribute
     */
    private updateElementAttribute(ast: ASTNode, change: ChangeRecord): ModificationResult {
        const element = this.findElementByPosition(ast, change.position);
        if (!element || !t.isJSXElement(element)) {
            return {
                success: false,
                modified: false,
                changes: [],
                error: 'Element not found'
            };
        }

        const attributeName = change.metadata?.attributeName || 'data-el-id';
        const attributeValue = change.after?.value || '';

        // Find existing attribute
        const existingAttr = element.openingElement.attributes.find(attr =>
            t.isJSXAttribute(attr) &&
            t.isJSXIdentifier(attr.name) &&
            attr.name.name === attributeName
        );

        if (existingAttr && t.isJSXAttribute(existingAttr)) {
            // Update existing attribute
            existingAttr.value = t.stringLiteral(attributeValue);
        } else {
            // Add new attribute
            const newAttribute = t.jsxAttribute(
                t.jsxIdentifier(attributeName),
                t.stringLiteral(attributeValue)
            );
            element.openingElement.attributes.unshift(newAttribute);
        }

        return {
            success: true,
            modified: true,
            changes: [{
                type: existingAttr ? 'update' : 'add',
                elementId: change.elementId,
                attribute: attributeName,
                newValue: attributeValue,
                position: change.position!
            }]
        };
    }

    /**
     * Remove element attribute
     */
    private removeElementAttribute(ast: ASTNode, change: ChangeRecord): ModificationResult {
        const element = this.findElementByPosition(ast, change.position);
        if (!element || !t.isJSXElement(element)) {
            return {
                success: false,
                modified: false,
                changes: [],
                error: 'Element not found'
            };
        }

        const attributeName = change.metadata?.attributeName || 'data-el-id';
        const originalLength = element.openingElement.attributes.length;

        // Remove attribute
        element.openingElement.attributes = element.openingElement.attributes.filter(attr =>
            !(t.isJSXAttribute(attr) &&
                t.isJSXIdentifier(attr.name) &&
                attr.name.name === attributeName)
        );

        const removed = element.openingElement.attributes.length < originalLength;

        return {
            success: true,
            modified: removed,
            changes: removed ? [{
                type: 'remove',
                elementId: change.elementId,
                attribute: attributeName,
                position: change.position!
            }] : []
        };
    }

    /**
     * Add new element
     */
    private addElement(ast: ASTNode, change: ChangeRecord): ModificationResult {
        // This would require more complex logic to determine where to insert
        // For now, we'll log and skip
        this.logger.warn('Element addition not yet implemented');
        return {
            success: true,
            modified: false,
            changes: []
        };
    }

    /**
     * Remove element
     */
    private removeElement(ast: ASTNode, change: ChangeRecord): ModificationResult {
        // This would require finding the parent and removing the element
        // For now, we'll log and skip
        this.logger.warn('Element removal not yet implemented');
        return {
            success: true,
            modified: false,
            changes: []
        };
    }

    /**
     * Modify existing element
     */
    private modifyElement(ast: ASTNode, change: ChangeRecord): ModificationResult {
        // Handle element modifications (tag name changes, etc.)
        this.logger.warn('Element modification not yet implemented');
        return {
            success: true,
            modified: false,
            changes: []
        };
    }

    /**
     * Find element by position
     */
    private findElementByPosition(ast: ASTNode, position?: { line: number; column: number }): ASTNode | null {
        if (!position) return null;

        let found: ASTNode | null = null;

        this.traverse(ast, (node) => {
            if (node.loc &&
                node.loc.start.line === position.line &&
                node.loc.start.column === position.column) {
                found = node;
                return false; // Stop traversal
            }
        });

        return found;
    }

    /**
     * Simple AST traversal
     */
    private traverse(node: ASTNode, visitor: (node: ASTNode) => boolean | void): void {
        if (!node || typeof node !== 'object') return;

        const result = visitor(node);
        if (result === false) return; // Stop traversal

        for (const key in node) {
            if (key === 'parent' || key === 'loc' || key === 'range') continue;

            const child = (node as any)[key];
            if (Array.isArray(child)) {
                for (const item of child) {
                    if (item && typeof item === 'object' && item.type) {
                        this.traverse(item, visitor);
                    }
                }
            } else if (child && typeof child === 'object' && child.type) {
                this.traverse(child, visitor);
            }
        }
    }

    /**
     * Generate code from AST
     */
    async generateCode(ast: ASTNode): Promise<string> {
        try {
            const result = generate(ast, this.config.formatOptions);
            return result.code;
        } catch (error) {
            this.logger.error('Failed to generate code from AST', error);
            throw error;
        }
    }

    /**
     * Validate AST structure
     */
    private validateAST(ast: ASTNode): boolean {
        try {
            // Basic validation - ensure we can generate code
            generate(ast);
            return true;
        } catch {
            return false;
        }
    }
}