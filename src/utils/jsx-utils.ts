import * as t from '@babel/types';
import type { JSXElement, JSXFragment, JSXAttribute } from '../types/ast';

/**
 * Check if node is JSX element
 */
export function isJSXElement(node: any): node is JSXElement {
    return t.isJSXElement(node);
}

/**
 * Check if node is JSX fragment
 */
export function isJSXFragment(node: any): node is JSXFragment {
    return t.isJSXFragment(node);
}

/**
 * Get JSX element name as string
 */
export function getJSXElementName(element: JSXElement): string | null {
    const name = element.openingElement.name;

    if (t.isJSXIdentifier(name)) {
        return name.name;
    }

    if (t.isJSXMemberExpression(name)) {
        return getMemberExpressionName(name);
    }

    if (t.isJSXNamespacedName(name)) {
        return `${name.namespace.name}:${name.name.name}`;
    }

    return null;
}

/**
 * Get member expression name (e.g., React.Component)
 */
function getMemberExpressionName(memberExpr: t.JSXMemberExpression): string {
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
 * Check if element has specific attribute
 */
export function hasJSXAttribute(element: JSXElement, attributeName: string): boolean {
    return element.openingElement.attributes.some(attr =>
        t.isJSXAttribute(attr) && getAttributeName(attr) === attributeName
    );
}

/**
 * Get JSX attribute value
 */
export function getJSXAttributeValue(attr: JSXAttribute): string | null {
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
 * Get attribute name
 */
function getAttributeName(attr: JSXAttribute): string {
    if (t.isJSXIdentifier(attr.name)) {
        return attr.name.name;
    }

    if (t.isJSXNamespacedName(attr.name)) {
        return `${attr.name.namespace.name}:${attr.name.name.name}`;
    }

    return 'unknown';
}

/**
 * Check if element has JSX attributes
 */
export function hasJSXAttributes(element: JSXElement): boolean {
    return element.openingElement.attributes.length > 0;
}

/**
 * Get all JSX attributes as key-value pairs
 */
export function getJSXAttributes(element: JSXElement): Record<string, string | null> {
    const attributes: Record<string, string | null> = {};

    element.openingElement.attributes.forEach(attr => {
        if (t.isJSXAttribute(attr)) {
            const name = getAttributeName(attr);
            const value = getJSXAttributeValue(attr);
            attributes[name] = value;
        }
    });

    return attributes;
}

/**
 * Check if element is DOM element (lowercase tag)
 */
export function isDOMElement(element: JSXElement): boolean {
    const name = getJSXElementName(element);
    if (!name) return false;
    return name[0] === name[0].toLowerCase();
}

/**
 * Check if element is React component (uppercase tag)
 */
export function isReactComponent(element: JSXElement): boolean {
    const name = getJSXElementName(element);
    if (!name) return false;
    return name[0] === name[0].toUpperCase();
}

/**
 * Check if element is self-closing
 */
export function isSelfClosing(element: JSXElement): boolean {
    return element.openingElement.selfClosing || element.closingElement === null;
}