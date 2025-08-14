import type { Plugin, ResolvedConfig } from 'vite';
import { ElementTagger } from '../core';
import type { ElementTaggerOptions, ProcessingMode } from '../types/config';
import type { VitePluginOptions } from '../types';
import { Logger } from '../utils/logger';

/**
 * Vite plugin configuration
 */
export interface ViteElementTaggerConfig extends VitePluginOptions {
    /** Element Tagger options */
    elementTaggerOptions?: ElementTaggerOptions;

    /** Enable in development mode */
    enableInDev?: boolean;

    /** Enable in production mode */
    enableInProd?: boolean;

    /** Enable file watching */
    enableWatch?: boolean;

    /** Mapping file output path */
    mappingFile?: string;

    /** Custom filter function */
    filter?: (id: string) => boolean;
}

/**
 * Vite plugin for Element Tagger integration
 */
export function VitePlugin(userConfig: ViteElementTaggerConfig = {}): Plugin {
    const logger = new Logger('VitePlugin');
    let elementTagger: ElementTagger;
    let viteConfig: ResolvedConfig;

    const config: Required<ViteElementTaggerConfig> = {
        include: ['**/*.{jsx,tsx}'],
        exclude: ['node_modules/**', 'dist/**'],
        mode: 'development',
        elementTaggerOptions: {},
        enableInDev: true,
        enableInProd: false,
        enableWatch: true,
        mappingFile: '.element-mapping.json',
        filter: (id: string) => /\.(jsx|tsx)$/.test(id),
        ...userConfig
    };

    return {
        name: 'vite-element-tagger',

        configResolved(resolvedConfig) {
            viteConfig = resolvedConfig;

            // Determine processing mode based on Vite command
            const mode: ProcessingMode = viteConfig.command === 'build'
                ? (config.enableInProd ? 'production' : 'export')
                : 'development';

            // Initialize Element Tagger
            elementTagger = new ElementTagger({
                mode,
                include: config.include,
                exclude: config.exclude,
                mappingFile: config.mappingFile,
                watchFiles: config.enableWatch && viteConfig.command === 'serve',
                ...config.elementTaggerOptions
            });

            logger.info(`Element Tagger initialized in ${mode} mode`);
        },

        async buildStart() {
            if (!elementTagger) return;

            // In build mode, process all files upfront
            if (viteConfig.command === 'build') {
                try {
                    const projectRoot = viteConfig.root || process.cwd();
                    logger.info('Processing project files...');

                    await elementTagger.processProject(projectRoot);
                    logger.info('Project processing completed');
                } catch (error) {
                    logger.error('Failed to process project', error);
                    if (viteConfig.command === 'build') {
                        throw error; // Fail the build if processing fails
                    }
                }
            }
        },

        async transform(code, id) {
            // Skip if not a target file
            if (!config.filter(id)) {
                return null;
            }

            // Skip in export mode
            if (elementTagger?.getMode() === 'export') {
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
                        map: null // TODO: Add source map support
                    };
                }
            } catch (error) {
                logger.error(`Failed to process file: ${id}`, error);

                // In development, warn and continue
                if (viteConfig.command === 'serve') {
                    logger.warn(`Skipping transformation for ${id} due to error`);
                    return null;
                } else {
                    // In build, fail
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
                        // This is a simplified cleanup - in reality you'd use the AST stripper
                        chunk.code = chunk.code.replace(/\s*data-el-id="[^"]*"/g, '');
                    }
                });
            }
        },

        async closeBundle() {
            // Cleanup
            if (elementTagger) {
                logger.info('Cleaning up Element Tagger...');
                elementTagger.dispose?.();
            }
        },

        handleHotUpdate({ file, server }) {
            // Handle HMR updates in development
            if (config.enableWatch && config.filter(file)) {
                logger.debug(`Hot update for: ${file}`);

                // Re-process the file
                elementTagger?.process(file).catch(error => {
                    logger.error(`Failed to process HMR update for ${file}`, error);
                });

                // Let Vite handle the actual HMR
                return undefined;
            }
        }
    };
}

/**
 * Default export with common configuration
 */
export default VitePlugin;

/**
 * Pre-configured plugin for development
 */
export function elementTaggerDev(options: Partial<ViteElementTaggerConfig> = {}): Plugin {
    return VitePlugin({
        mode: 'development',
        enableInDev: true,
        enableInProd: false,
        enableWatch: true,
        ...options
    });
}

/**
 * Pre-configured plugin for production
 */
export function elementTaggerProd(options: Partial<ViteElementTaggerConfig> = {}): Plugin {
    return VitePlugin({
        mode: 'production',
        enableInDev: false,
        enableInProd: true,
        enableWatch: false,
        ...options
    });
}

/**
 * Pre-configured plugin for export (clean code)
 */
export function elementTaggerExport(options: Partial<ViteElementTaggerConfig> = {}): Plugin {
    return VitePlugin({
        mode: 'export',
        enableInDev: false,
        enableInProd: false,
        enableWatch: false,
        ...options
    });
}