import { extname } from 'path';
import type { ElementTaggerOptions } from '../types/config';

/**
 * Validate element ID format
 */
export function validateElementId(id: string): boolean {
    if (!id || id.trim().length === 0) {
        return false;
    }

    // Should not contain invalid characters for HTML attributes
    const invalidChars = /[<>:"\/\\|?*\s]/;
    if (invalidChars.test(id)) {
        return false;
    }

    // Should not be too long
    if (id.length > 100) {
        return false;
    }

    return true;
}

/**
 * Validate file path
 */
export function validateFilePath(filePath: string): boolean {
    if (!filePath || filePath.trim().length === 0) {
        return false;
    }

    // Check for valid file extension
    const ext = extname(filePath).toLowerCase();
    const validExtensions = ['.js', '.jsx', '.ts', '.tsx'];

    return validExtensions.includes(ext);
}

/**
 * Validate configuration object
 */
export function validateConfig(config: ElementTaggerOptions): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
} {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate mode
    if (config.mode && !['development', 'production', 'export'].includes(config.mode)) {
        errors.push(`Invalid mode: ${config.mode}`);
    }

    // Validate include patterns
    if (config.include && !Array.isArray(config.include)) {
        errors.push('Include patterns must be an array');
    }

    // Validate exclude patterns
    if (config.exclude && !Array.isArray(config.exclude)) {
        errors.push('Exclude patterns must be an array');
    }

    // Validate mapping file
    if (config.mappingFile && typeof config.mappingFile !== 'string') {
        errors.push('Mapping file must be a string');
    }

    // Validate ID generation options
    if (config.idGeneration) {
        const { hashLength, idFormat } = config.idGeneration;

        if (hashLength && (hashLength < 4 || hashLength > 32)) {
            warnings.push('Hash length should be between 4 and 32 characters');
        }

        if (idFormat && !idFormat.includes('{hash}')) {
            warnings.push('ID format should include {hash} placeholder');
        }
    }

    // Validate runtime options
    if (config.runtime) {
        const { highlightOpacity } = config.runtime;

        if (highlightOpacity && (highlightOpacity < 0 || highlightOpacity > 1)) {
            errors.push('Highlight opacity must be between 0 and 1');
        }
    }

    // Validate editor options
    if (config.editor) {
        const { autoSaveDelay } = config.editor;

        if (autoSaveDelay && autoSaveDelay < 100) {
            warnings.push('Auto-save delay should be at least 100ms');
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Validate JSX element name
 */
export function validateElementName(name: string): boolean {
    if (!name || name.trim().length === 0) {
        return false;
    }

    // Check for valid JSX element name format
    const validName = /^[a-zA-Z][a-zA-Z0-9._-]*$/;
    return validName.test(name);
}

/**
 * Validate attribute name
 */
export function validateAttributeName(name: string): boolean {
    if (!name || name.trim().length === 0) {
        return false;
    }

    // Check for valid HTML/JSX attribute name format
    const validAttribute = /^[a-zA-Z][a-zA-Z0-9-]*(:?[a-zA-Z][a-zA-Z0-9-]*)?$/;
    return validAttribute.test(name);
}

/**
 * Validate hash format
 */
export function validateHash(hash: string, expectedLength?: number): boolean {
    if (!hash || hash.trim().length === 0) {
        return false;
    }

    // Should contain only alphanumeric characters
    const validHash = /^[a-zA-Z0-9]+$/;
    if (!validHash.test(hash)) {
        return false;
    }

    // Check expected length if provided
    if (expectedLength && hash.length !== expectedLength) {
        return false;
    }

    return true;
}

/**
 * Validate line and column numbers
 */
export function validatePosition(line: number, column: number): boolean {
    return Number.isInteger(line) && Number.isInteger(column) && line > 0 && column >= 0;
}

/**
 * Validate file size (in bytes)
 */
export function validateFileSize(size: number, maxSize: number = 10 * 1024 * 1024): boolean {
    return Number.isInteger(size) && size > 0 && size <= maxSize;
}