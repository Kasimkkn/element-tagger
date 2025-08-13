import type { ParserOptions } from '@babel/parser';
import type * as t from '@babel/types';

/**
 * Base AST Node interface extending Babel types
 */
export interface ASTNode extends t.Node {
    // Additional properties for our use case
    start?: number;
    end?: number;
    loc?: t.SourceLocation | null;
    leadingComments?: t.Comment[] | null;
    trailingComments?: t.Comment[] | null;
    innerComments?: t.Comment[] | null;
}

/**
 * JSX Element with enhanced typing
 */
export interface JSXElement extends ASTNode {
    type: 'JSXElement';
    openingElement: JSXOpeningElement;
    children: JSXChild[];
    closingElement: JSXClosingElement | null;
    selfClosing?: boolean;
}

/**
 * JSX Opening Element
 */
export interface JSXOpeningElement extends ASTNode {
    type: 'JSXOpeningElement';
    name: JSXElementName;
    attributes: JSXAttribute[];
    selfClosing: boolean;
}

/**
 * JSX Closing Element
 */
export interface JSXClosingElement extends ASTNode {
    type: 'JSXClosingElement';
    name: JSXElementName;
}

/**
 * JSX Element Name (identifier, member expression, or namespaced name)
 */
export type JSXElementName =
    | JSXIdentifier
    | JSXMemberExpression
    | JSXNamespacedName;

/**
 * JSX Identifier
 */
export interface JSXIdentifier extends ASTNode {
    type: 'JSXIdentifier';
    name: string;
}

/**
 * JSX Member Expression (e.g., React.Component)
 */
export interface JSXMemberExpression extends ASTNode {
    type: 'JSXMemberExpression';
    object: JSXElementName;
    property: JSXIdentifier;
}

/**
 * JSX Namespaced Name (e.g., xml:lang)
 */
export interface JSXNamespacedName extends ASTNode {
    type: 'JSXNamespacedName';
    namespace: JSXIdentifier;
    name: JSXIdentifier;
}

/**
 * JSX Attribute
 */
export interface JSXAttribute extends ASTNode {
    type: 'JSXAttribute';
    name: JSXIdentifier | JSXNamespacedName;
    value?: JSXAttributeValue | null;
}

/**
 * JSX Attribute Value types
 */
export type JSXAttributeValue =
    | t.StringLiteral
    | JSXExpressionContainer
    | JSXElement
    | JSXFragment;

/**
 * JSX Expression Container
 */
export interface JSXExpressionContainer extends ASTNode {
    type: 'JSXExpressionContainer';
    expression: t.Expression | JSXEmptyExpression;
}

/**
 * JSX Empty Expression
 */
export interface JSXEmptyExpression extends ASTNode {
    type: 'JSXEmptyExpression';
}

/**
 * JSX Fragment
 */
export interface JSXFragment extends ASTNode {
    type: 'JSXFragment';
    openingFragment: JSXOpeningFragment;
    children: JSXChild[];
    closingFragment: JSXClosingFragment;
}

/**
 * JSX Opening Fragment
 */
export interface JSXOpeningFragment extends ASTNode {
    type: 'JSXOpeningFragment';
}

/**
 * JSX Closing Fragment
 */
export interface JSXClosingFragment extends ASTNode {
    type: 'JSXClosingFragment';
}

/**
 * JSX Text
 */
export interface JSXText extends ASTNode {
    type: 'JSXText';
    value: string;
    raw?: string;
}

/**
 * JSX Child types
 */
export type JSXChild =
    | JSXElement
    | JSXFragment
    | JSXText
    | JSXExpressionContainer;

/**
 * Parse result from AST parser
 */
export interface ParseResult {
    success: boolean;
    ast?: ASTNode;
    content: string;
    filePath: string;
    hasJSX?: boolean;
    error?: string;
    metadata?: ParseMetadata;
}

/**
 * Metadata about parsed file
 */
export interface ParseMetadata {
    sourceType?: 'module' | 'script';
    isTypeScript: boolean;
    plugins: string[];
    parseTime?: number;
    size?: number;
}

/**
 * Parser configuration
 */
export interface ParserConfig {
    parserOptions?: Partial<ParserOptions>;
    additionalPlugins?: string[];
    enableSourceMaps?: boolean;
    preserveComments?: boolean;
}

/**
 * AST Traversal visitor pattern
 */
export type ASTVisitor = {
    [K in ASTNode['type']]?: {
        enter?: (node: Extract<ASTNode, { type: K }>, parent?: ASTNode) => void | boolean;
        exit?: (node: Extract<ASTNode, { type: K }>, parent?: ASTNode) => void;
    };
} & {
    enter?: (node: ASTNode, parent?: ASTNode) => void | boolean;
    exit?: (node: ASTNode, parent?: ASTNode) => void;
};

/**
 * Node path for traversal
 */
export interface NodePath<T extends ASTNode = ASTNode> {
    node: T;
    parent?: ASTNode;
    parentPath?: NodePath;
    key?: string | number;
    listKey?: string;
    container?: ASTNode | ASTNode[];

    // Path manipulation methods
    replaceWith(node: ASTNode): void;
    remove(): void;
    insertBefore(node: ASTNode): void;
    insertAfter(node: ASTNode): void;

    // Traversal methods
    traverse(visitor: ASTVisitor): void;
    stop(): void;
    skip(): void;

    // Utility methods
    isJSXElement(): this is NodePath<JSXElement>;
    isJSXAttribute(): this is NodePath<JSXAttribute>;
    isJSXIdentifier(): this is NodePath<JSXIdentifier>;

    // Scope and binding
    scope?: any; // We'll define this later if needed
}

/**
 * Element detection result
 */
export interface ElementDetectionResult {
    elements: DetectedElement[];
    totalCount: number;
    domElements: number;
    customComponents: number;
    fragments: number;
}

/**
 * Detected JSX element
 */
export interface DetectedElement {
    node: JSXElement | JSXFragment;
    path: NodePath;
    elementType: 'dom' | 'component' | 'fragment';
    tagName: string;
    attributes: ElementAttribute[];
    children: DetectedElement[];
    position: ElementPosition;
    hasDataElId: boolean;
}

/**
 * Element attribute
 */
export interface ElementAttribute {
    name: string;
    value?: string | null;
    isDataElId?: boolean;
    node: JSXAttribute;
}

/**
 * Element position in source
 */
export interface ElementPosition {
    line: number;
    column: number;
    start: number;
    end: number;
}

/**
 * AST modification result
 */
export interface ModificationResult {
    success: boolean;
    modified: boolean;
    changes: ModificationChange[];
    error?: string;
}

/**
 * AST modification change
 */
export interface ModificationChange {
    type: 'add' | 'update' | 'remove';
    elementId?: string;
    attribute?: string;
    oldValue?: string;
    newValue?: string;
    position: ElementPosition;
}