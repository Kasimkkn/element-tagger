import * as t from '@babel/types';
import traverse, { TraverseOptions, NodePath as BabelNodePath } from '@babel/traverse';
import type {
    ASTNode,
    ASTVisitor,
    NodePath
} from '../types/ast';
import { Logger } from '../utils/logger';

/**
 * Traversal configuration options
 */
export interface TraversalConfig {
    /** Whether to traverse in reverse order */
    reverse?: boolean;

    /** Maximum depth to traverse */
    maxDepth?: number;

    /** Node types to skip during traversal */
    skipTypes?: string[];

    /** Whether to include comments in traversal */
    includeComments?: boolean;

    /** Custom traversal filter */
    filter?: (node: ASTNode) => boolean;
}

/**
 * Traversal state for tracking context
 */
export interface TraversalState {
    depth: number;
    path: string[];
    visited: Set<ASTNode>;
    stopped: boolean;
    skipped: boolean;
}

/**
 * Advanced AST traverser with enhanced functionality
 */
export class ASTTraverser {
    private readonly logger: Logger;
    private readonly config: TraversalConfig;

    constructor(config: TraversalConfig = {}) {
        this.logger = new Logger('ASTTraverser');
        this.config = {
            reverse: false,
            maxDepth: Infinity,
            skipTypes: [],
            includeComments: false,
            ...config
        };
    }

    /**
     * Traverse AST using Babel's traverse with visitor pattern
     */
    traverse(ast: ASTNode, visitor: ASTVisitor): void {
        try {
            const babelVisitor = this.convertToBabelVisitor(visitor);
            traverse(ast as any, babelVisitor);
        } catch (error) {
            this.logger.error('Failed to traverse AST with Babel', error);
            // Fallback to manual traversal
            this.manualTraverse(ast, visitor);
        }
    }

    /**
     * Manual traversal implementation for more control
     */
    manualTraverse(ast: ASTNode, visitor: ASTVisitor): void {
        const state: TraversalState = {
            depth: 0,
            path: [],
            visited: new Set(),
            stopped: false,
            skipped: false
        };

        this.visitNode(ast, null, visitor, state);
    }

    /**
     * Traverse with callback function (simplified interface)
     */
    walk(ast: ASTNode, callback: (node: ASTNode, parent?: ASTNode) => void | boolean): void {
        const visitor: ASTVisitor = {
            enter: (node, parent) => {
                const result = callback(node, parent);
                return result;
            }
        };

        this.manualTraverse(ast, visitor);
    }

    /**
     * Find nodes matching a predicate
     */
    findNodes(ast: ASTNode, predicate: (node: ASTNode) => boolean): ASTNode[] {
        const found: ASTNode[] = [];

        this.walk(ast, (node) => {
            if (predicate(node)) {
                found.push(node);
            }
        });

        return found;
    }

    /**
     * Find first node matching a predicate
     */
    findNode(ast: ASTNode, predicate: (node: ASTNode) => boolean): ASTNode | null {
        let result: ASTNode | null = null;

        this.walk(ast, (node) => {
            if (predicate(node)) {
                result = node;
                return false; // Stop traversal
            }
        });

        return result;
    }

    /**
     * Find nodes by type
     */
    findByType(ast: ASTNode, nodeType: string): ASTNode[] {
        return this.findNodes(ast, (node) => node.type === nodeType);
    }

    /**
     * Get all JSX elements
     */
    getJSXElements(ast: ASTNode): ASTNode[] {
        return this.findByType(ast, 'JSXElement');
    }

    /**
     * Get all JSX fragments
     */
    getJSXFragments(ast: ASTNode): ASTNode[] {
        return this.findByType(ast, 'JSXFragment');
    }

    /**
     * Get node path information
     */
    getNodePath(ast: ASTNode, targetNode: ASTNode): string[] {
        let path: string[] = [];

        this.walk(ast, (node, parent) => {
            if (node === targetNode) {
                return false; // Found target, stop
            }

            // Build path
            if (parent) {
                for (const [key, value] of Object.entries(parent)) {
                    if (value === node) {
                        path.push(key);
                        break;
                    } else if (Array.isArray(value)) {
                        const index = value.indexOf(node);
                        if (index !== -1) {
                            path.push(`${key}[${index}]`);
                            break;
                        }
                    }
                }
            }
        });

        return path;
    }

    /**
     * Get parent node of a target node
     */
    getParent(ast: ASTNode, targetNode: ASTNode): ASTNode | null {
        let parent: ASTNode | null = null;

        this.walk(ast, (node) => {
            // Check if any child is our target
            for (const value of Object.values(node)) {
                if (value === targetNode) {
                    parent = node;
                    return false; // Stop traversal
                } else if (Array.isArray(value) && value.includes(targetNode)) {
                    parent = node;
                    return false; // Stop traversal
                }
            }
        });

        return parent;
    }

    /**
     * Get all children of a node
     */
    getChildren(node: ASTNode): ASTNode[] {
        const children: ASTNode[] = [];

        for (const value of Object.values(node)) {
            if (value && typeof value === 'object' && 'type' in value) {
                children.push(value as ASTNode);
            } else if (Array.isArray(value)) {
                for (const item of value) {
                    if (item && typeof item === 'object' && 'type' in item) {
                        children.push(item as ASTNode);
                    }
                }
            }
        }

        return children;
    }

    /**
     * Transform AST by replacing nodes
     */
    transform(ast: ASTNode, transformer: (node: ASTNode) => ASTNode | null): ASTNode {
        const transformNode = (node: ASTNode): ASTNode => {
            // Transform current node
            const transformed = transformer(node) || node;

            // Transform children
            const newNode = { ...transformed };

            for (const [key, value] of Object.entries(newNode)) {
                if (value && typeof value === 'object' && 'type' in value) {
                    (newNode as any)[key] = transformNode(value as ASTNode);
                } else if (Array.isArray(value)) {
                    (newNode as any)[key] = value.map(item =>
                        item && typeof item === 'object' && 'type' in item
                            ? transformNode(item as ASTNode)
                            : item
                    );
                }
            }

            return newNode;
        };

        return transformNode(ast);
    }

    /**
     * Convert our visitor to Babel's visitor format
     */
    private convertToBabelVisitor(visitor: ASTVisitor): TraverseOptions {
        const babelVisitor: any = {};

        // Handle generic enter/exit
        if (visitor.enter) {
            babelVisitor.enter = (path: BabelNodePath) => {
                const nodePath = this.createNodePath(path);
                return visitor.enter!(path.node as ASTNode, path.parent as ASTNode);
            };
        }

        if (visitor.exit) {
            babelVisitor.exit = (path: BabelNodePath) => {
                const nodePath = this.createNodePath(path);
                return visitor.exit!(path.node as ASTNode, path.parent as ASTNode);
            };
        }

        // Handle specific node type visitors
        for (const [nodeType, nodeVisitor] of Object.entries(visitor)) {
            if (nodeType !== 'enter' && nodeType !== 'exit' && typeof nodeVisitor === 'object') {
                babelVisitor[nodeType] = {
                    enter: nodeVisitor.enter ? (path: BabelNodePath) => {
                        return nodeVisitor.enter!(path.node as any, path.parent as ASTNode);
                    } : undefined,
                    exit: nodeVisitor.exit ? (path: BabelNodePath) => {
                        return nodeVisitor.exit!(path.node as any, path.parent as ASTNode);
                    } : undefined
                };
            }
        }

        return babelVisitor;
    }

    /**
     * Create our NodePath from Babel's NodePath
     */
    private createNodePath(babelPath: BabelNodePath): NodePath {
        return {
            node: babelPath.node as ASTNode,
            parent: babelPath.parent as ASTNode,
            key: babelPath.key,
            listKey: babelPath.listKey,
            container: babelPath.container as any,

            replaceWith: (node: ASTNode) => babelPath.replaceWith(node as any),
            remove: () => babelPath.remove(),
            insertBefore: (node: ASTNode) => babelPath.insertBefore(node as any),
            insertAfter: (node: ASTNode) => babelPath.insertAfter(node as any),

            traverse: (visitor: ASTVisitor) => {
                const babelVisitor = this.convertToBabelVisitor(visitor);
                babelPath.traverse(babelVisitor);
            },
            stop: () => babelPath.stop(),
            skip: () => babelPath.skip(),

            isJSXElement: () => t.isJSXElement(babelPath.node),
            isJSXAttribute: () => t.isJSXAttribute(babelPath.node),
            isJSXIdentifier: () => t.isJSXIdentifier(babelPath.node)
        };
    }

    /**
     * Visit a single node and its children
     */
    private visitNode(
        node: ASTNode,
        parent: ASTNode | null,
        visitor: ASTVisitor,
        state: TraversalState
    ): void {
        if (!node || typeof node !== 'object' || state.stopped) return;

        // Check max depth
        if (state.depth > (this.config.maxDepth || Infinity)) return;

        // Check if already visited (prevent cycles)
        if (state.visited.has(node)) return;
        state.visited.add(node);

        // Check skip types
        if (this.config.skipTypes?.includes(node.type)) return;

        // Apply filter
        if (this.config.filter && !this.config.filter(node)) return;

        // Create node path
        const nodePath: NodePath = {
            node,
            parent,
            key: state.path[state.path.length - 1],
            container: parent,

            replaceWith: () => { },
            remove: () => { },
            insertBefore: () => { },
            insertAfter: () => { },
            traverse: () => { },
            stop: () => { state.stopped = true; },
            skip: () => { state.skipped = true; },

            isJSXElement: () => t.isJSXElement(node),
            isJSXAttribute: () => t.isJSXAttribute(node),
            isJSXIdentifier: () => t.isJSXIdentifier(node)
        };

        // Call enter visitor
        state.skipped = false;

        // Generic enter
        if (visitor.enter) {
            const result = visitor.enter(node, parent);
            if (result === false) {
                state.stopped = true;
                return;
            }
        }

        // Specific node type enter
        const nodeVisitor = visitor[node.type as keyof ASTVisitor];
        if (nodeVisitor && typeof nodeVisitor === 'object' && nodeVisitor.enter) {
            const result = nodeVisitor.enter(node as any, parent);
            if (result === false) {
                state.stopped = true;
                return;
            }
        }

        // Skip children if requested
        if (state.skipped || state.stopped) return;

        // Visit children
        const children = this.getChildren(node);
        if (this.config.reverse) {
            children.reverse();
        }

        for (const child of children) {
            const childState: TraversalState = {
                ...state,
                depth: state.depth + 1,
                path: [...state.path, 'child']
            };

            this.visitNode(child, node, visitor, childState);

            if (state.stopped) break;
        }

        // Call exit visitor
        if (!state.stopped) {
            // Specific node type exit
            if (nodeVisitor && typeof nodeVisitor === 'object' && nodeVisitor.exit) {
                nodeVisitor.exit(node as any, parent);
            }

            // Generic exit
            if (visitor.exit) {
                visitor.exit(node, parent);
            }
        }
    }

    /**
     * Get traversal statistics
     */
    getStats(ast: ASTNode): {
        totalNodes: number;
        nodeTypes: Record<string, number>;
        maxDepth: number;
        jsxElements: number;
    } {
        const stats = {
            totalNodes: 0,
            nodeTypes: {} as Record<string, number>,
            maxDepth: 0,
            jsxElements: 0
        };

        let currentDepth = 0;
        let maxDepth = 0;

        this.walk(ast, (node) => {
            stats.totalNodes++;
            stats.nodeTypes[node.type] = (stats.nodeTypes[node.type] || 0) + 1;

            if (node.type === 'JSXElement') {
                stats.jsxElements++;
            }

            currentDepth++;
            maxDepth = Math.max(maxDepth, currentDepth);
        });

        stats.maxDepth = maxDepth;
        return stats;
    }

    /**
     * Create a new traverser with different config
     */
    withConfig(newConfig: Partial<TraversalConfig>): ASTTraverser {
        return new ASTTraverser({ ...this.config, ...newConfig });
    }
}