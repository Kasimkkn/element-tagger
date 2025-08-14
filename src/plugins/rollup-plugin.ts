import type { Plugin } from 'rollup';
import { createFilter } from '@rollup/pluginutils';
import { ElementTagger } from '../core';
import type { ElementTaggerOptions, ProcessingMode } from '../types/config';
import { Logger } from '../utils/logger';

/**
 * Rollup plugin configuration
 */
export interface RollupElementTaggerConfig {
    /** File patterns to include */
    include?: string | RegExp | Array<string | RegExp>;

    /** File patterns to exclude */
    exclude?: string | RegExp | Array<string | RegExp>;

    /** Processing mode */
    mode?: ProcessingMode;

    /** Element Tagger options */
    elementTaggerOptions?: ElementTaggerOptions;

    /** Enable in development mode */
    enableInDev?: boolean;

    /** Enable in production mode */
    enableInProd?: boolean;

    /** Mapping file output path */
    mappingFile?: string;

    /** Source map support */
    sourceMap?: boolean;
}

/**
 * Rollup plugin for Element Tagger integration
 */
export function RollupPlugin(userConfig: RollupElementTaggerConfig = {}): Plugin {
    const logger = new Logger('RollupPlugin');

    const config: Required<RollupElementTaggerConfig> = {
        include: /\.(jsx|tsx)$/,
        exclude: /node_modules/,
        mode: 'development',
        elementTaggerOptions: {},
        enableInDev: true,
        enableInProd: false,
        mappingFile: '.element-mapping.json',
        sourceMap: false,
        ...userConfig
    };

    const filter = createFilter(config.include, config.exclude);
    let elementTagger: ElementTagger;
    let isProduction = false;

    return {
        name: 'rollup-element-tagger',

        buildStart(options) {
            // Determine if this is a production build
            isProduction = process.env.NODE_ENV === 'production';

            // Skip if not enabled for current mode
            if (isProduction && !config.enableInProd) {
                logger.info('Skipping in production mode');
                return;
            }
            if (!isProduction && !config.enableInDev) {
                logger.info('Skipping in development mode');
                return;
            }

            // Determine processing mode
            const mode: ProcessingMode = isProduction
                ? (config.enableInProd ? 'production' : 'export')
                : 'development';

            // Initialize Element Tagger
            elementTagger = new ElementTagger({
                mode,
                mappingFile: config.mappingFile,
                watchFiles: !isProduction,
                ...config.elementTaggerOptions
            });

            logger.info(`Element Tagger initialized in ${mode} mode`);
        },

        async transform(code, id) {
            // Skip if not a target file
            if (!filter(id)) {
                return null;
            }

            // Skip if Element Tagger not initialized
            if (!elementTagger) {
                return null;
            }

            // Skip in export mode
            if (elementTagger.getMode() === 'export') {
                return null;
            }

            try {
                logger.debug(`Processing file: ${id}`);

                // Process the file
                const processedCode = await elementTagger.process(id);

                if (processedCode !== code) {
                    logger.debug(`Transformed file: ${id}`);
                    return {
                        code: processedCode,
                        map: config.sourceMap ? null : undefined // TODO: Add source map support
                    };
                }
            } catch (error) {
                logger.error(`Failed to process file: ${id}`, error);

                // In development, warn and continue
                if (!isProduction) {
                    logger.warn(`Skipping transformation for ${id} due to error`);
                    return null;
                } else {
                    // In production, fail
                    throw error;
                }
            }

            return null;
        },

        generateBundle(options, bundle) {
            // In export mode, clean up the output
            if (elementTagger?.getMode() === 'export') {
                logger.info('Cleaning exported bundle...');

                // Process each chunk to remove element tagger attributes
                Object.values(bundle).forEach(chunk => {
                    if (chunk.type === 'chunk' && chunk.code) {
                        // Simple regex cleanup (use AST stripper in production)
                        chunk.code = chunk.code.replace(/\s*data-el-id="[^"]*"/g, '');
                    }
                });
            }
        },

        async buildEnd(error) {
            if (error) return;

            // Process entire project in development mode
            if (elementTagger && !isProduction) {
                try {
                    logger.info('Processing project files...');
                    const projectRoot = process.cwd();
                    await elementTagger.processProject(projectRoot);
                    logger.info('Project processing completed');
                } catch (processError) {
                    logger.error('Failed to process project', processError);
                }
            }
        },

        async closeBundle() {
            // Cleanup
            if (elementTagger) {
                logger.info('Cleaning up Element Tagger...');
                elementTagger.dispose?.();
            }
        }
    };
}

/**
 * Default export
 */
export default RollupPlugin;

/**
 * Pre-configured plugin for development
 */
export function elementTaggerDev(options: Partial<RollupElementTaggerConfig> = {}): Plugin {
    return RollupPlugin({
        mode: 'development',
        enableInDev: true,
        enableInProd: false,
        ...options
    });
}

/**
 * Pre-configured plugin for production
 */
export function elementTaggerProd(options: Partial<RollupElementTaggerConfig> = {}): Plugin {
    return RollupPlugin({
        mode: 'production',
        enableInDev: false,
        enableInProd: true,
        ...options
    });
}

/**
 * Pre-configured plugin for export (clean code)
 */
export function elementTaggerExport(options: Partial<RollupElementTaggerConfig> = {}): Plugin {
    return RollupPlugin({
        mode: 'export',
        enableInDev: false,
        enableInProd: false,
        ...options
    });
}

/**
 * Example configurations for different use cases
 */
export const examples = {
    /**
     * Basic development setup
     */
    development: RollupPlugin({
        mode: 'development',
        include: /\.(jsx|tsx)$/,
        elementTaggerOptions: {
            tagElements: {
                domElements: true,
                customComponents: false
            }
        }
    }),

    /**
     * Production with user editing enabled
     */
    production: RollupPlugin({
        mode: 'production',
        enableInProd: true,
        elementTaggerOptions: {
            tagElements: {
                domElements: true,
                customComponents: true
            },
            runtime: {
                enableClickHandler: true,
                enableHighlighter: true
            }
        }
    }),

    /**
     * Clean export for deployment
     */
    export: RollupPlugin({
        mode: 'export',
        elementTaggerOptions: {
            export: {
                stripTaggingAttributes: true,
                minify: true
            }
        }
    })
};