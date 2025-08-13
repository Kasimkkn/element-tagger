import { readFile, pathExists } from 'fs-extra';
import { resolve } from 'path';
import type { ElementTaggerOptions, ConfigValidationResult } from '../types/config';
import { DEFAULT_CONFIG } from './default-config';
import { validateConfig } from '../utils/validation';

/**
 * Load configuration from file
 */
export async function loadConfig(configPath?: string): Promise<ElementTaggerOptions> {
    const possiblePaths = [
        configPath,
        'element-tagger.config.js',
        'element-tagger.config.json',
        '.element-tagger.json',
        'package.json'
    ].filter(Boolean);

    for (const path of possiblePaths) {
        try {
            if (await pathExists(path!)) {
                const config = await loadConfigFromFile(path!);
                if (config) {
                    return mergeWithDefaults(config);
                }
            }
        } catch (error) {
            console.warn(`Failed to load config from ${path}:`, error);
        }
    }

    return DEFAULT_CONFIG;
}

/**
 * Load configuration from specific file
 */
async function loadConfigFromFile(filePath: string): Promise<ElementTaggerOptions | null> {
    const absolutePath = resolve(filePath);

    if (filePath.endsWith('.json') || filePath === 'package.json') {
        const content = await readFile(absolutePath, 'utf-8');
        const json = JSON.parse(content);

        if (filePath === 'package.json') {
            return json.elementTagger || null;
        }

        return json;
    }

    if (filePath.endsWith('.js')) {
        // Dynamic import for JS config files
        const config = await import(absolutePath);
        return config.default || config;
    }

    return null;
}

/**
 * Merge user config with defaults
 */
function mergeWithDefaults(userConfig: ElementTaggerOptions): ElementTaggerOptions {
    return {
        ...DEFAULT_CONFIG,
        ...userConfig,
        tagElements: {
            ...DEFAULT_CONFIG.tagElements,
            ...userConfig.tagElements
        },
        runtime: {
            ...DEFAULT_CONFIG.runtime,
            ...userConfig.runtime
        },
        editor: {
            ...DEFAULT_CONFIG.editor,
            ...userConfig.editor
        }
    };
}

/**
 * Validate configuration
 */
export function validateConfigObject(config: ElementTaggerOptions): ConfigValidationResult {
    return validateConfig(config);
}