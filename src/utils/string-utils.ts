/**
 * Convert string to PascalCase
 */
export function toPascalCase(str: string): string {
    return str
        .replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '')
        .replace(/^(.)/, char => char.toUpperCase());
}

/**
 * Convert string to camelCase
 */
export function toCamelCase(str: string): string {
    return str
        .replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '')
        .replace(/^(.)/, char => char.toLowerCase());
}

/**
 * Convert string to kebab-case
 */
export function toKebabCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase();
}

/**
 * Convert string to snake_case
 */
export function toSnakeCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/[\s-]+/g, '_')
        .toLowerCase();
}

/**
 * Sanitize string for use as identifier
 */
export function sanitizeString(str: string): string {
    return str
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .replace(/^[0-9]/, '_$&'); // Ensure doesn't start with number
}

/**
 * Truncate string to maximum length
 */
export function truncate(str: string, maxLength: number, suffix: string = '...'): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Capitalize first letter
 */
export function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Check if string is valid identifier
 */
export function isValidIdentifier(str: string): boolean {
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(str);
}

/**
 * Escape HTML characters
 */
export function escapeHtml(str: string): string {
    const htmlEscapes: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };

    return str.replace(/[&<>"']/g, char => htmlEscapes[char]);
}

/**
 * Remove whitespace from both ends
 */
export function trim(str: string): string {
    return str.trim();
}

/**
 * Pad string to specified length
 */
export function pad(str: string, length: number, char: string = ' '): string {
    return str.padStart(length, char);
}

/**
 * Check if string contains only whitespace
 */
export function isWhitespace(str: string): boolean {
    return /^\s*$/.test(str);
}

/**
 * Generate random string
 */
export function randomString(length: number = 8): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}