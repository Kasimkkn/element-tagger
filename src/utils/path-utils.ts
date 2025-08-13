import { resolve, relative, extname, basename, dirname, sep } from 'path';

/**
 * Normalize file path for cross-platform compatibility
 */
export function normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
}

/**
 * Check if path is valid
 */
export function isValidPath(filePath: string): boolean {
    try {
        resolve(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get relative path from base directory
 */
export function getRelativePath(from: string, to: string): string {
    return normalizePath(relative(from, to));
}

/**
 * Get file extension
 */
export function getFileExtension(filePath: string): string {
    return extname(filePath).toLowerCase();
}

/**
 * Get file name without extension
 */
export function getFileName(filePath: string): string {
    const ext = extname(filePath);
    return basename(filePath, ext);
}

/**
 * Get directory name
 */
export function getDirectoryName(filePath: string): string {
    return dirname(filePath);
}

/**
 * Check if file is a React/JSX file
 */
export function isReactFile(filePath: string): boolean {
    const ext = getFileExtension(filePath);
    return ['.jsx', '.tsx', '.js', '.ts'].includes(ext);
}

/**
 * Check if file is TypeScript
 */
export function isTypeScriptFile(filePath: string): boolean {
    const ext = getFileExtension(filePath);
    return ext === '.ts' || ext === '.tsx';
}

/**
 * Join paths with forward slashes
 */
export function joinPaths(...paths: string[]): string {
    return normalizePath(paths.join(sep));
}

/**
 * Ensure path ends with slash
 */
export function ensureTrailingSlash(path: string): string {
    return path.endsWith('/') ? path : `${path}/`;
}

/**
 * Remove trailing slash
 */
export function removeTrailingSlash(path: string): string {
    return path.endsWith('/') ? path.slice(0, -1) : path;
}