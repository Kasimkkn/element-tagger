import { createHash } from 'crypto';

/**
 * Generate a hash from input string
 */
export function generateHash(input: string, algorithm: string = 'md5', length?: number): string {
    const hash = createHash(algorithm).update(input).digest('hex');
    return length ? hash.substring(0, length) : hash;
}

/**
 * Generate a stable hash for element identification
 */
export function generateStableHash(
    filePath: string,
    elementType: string,
    line: number,
    column: number,
    attributes: Record<string, any> = {},
    length: number = 8
): string {
    const parts = [
        filePath,
        elementType,
        line.toString(),
        column.toString(),
        JSON.stringify(attributes)
    ];

    const input = parts.join('|');
    return generateHash(input, 'md5', length);
}

/**
 * Generate hash from file content
 */
export function generateContentHash(content: string, length: number = 8): string {
    return generateHash(content, 'sha256', length);
}

/**
 * Generate short hash for IDs
 */
export function generateShortHash(input: string): string {
    return generateHash(input, 'md5', 8);
}

/**
 * Generate UUID-like hash
 */
export function generateUUID(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `${timestamp}-${random}`;
}