import type { NextConfig } from 'next';
import { ElementTagger } from '../core';
import type { ElementTaggerOptions, ProcessingMode } from '../types/config';
import type { NextPluginOptions } from '../types';
import { Logger } from '../utils/logger';

/**
 * Next.js plugin configuration
 */
export interface NextElementTaggerConfig extends NextPluginOptions {
    /** Element Tagger options */
    elementTaggerOptions?: ElementTaggerOptions;

    /** Enable in development mode */
    enableInDev?: boolean;

    /** Enable in production mode */
    enableInProd?: boolean;

    /** Enable in export mode */
    enableInExport?: boolean;

    /** Mapping file output path */
    mappingFile?: string;

    /** File patterns to include */
    include?: string[];

    /** File patterns to exclude */
    exclude?: string[];
}

/**
 * Next.js plugin for Element Tagger integration
 */
export function NextPlugin(userConfig: NextElementTaggerConfig = {}) {
    const logger = new Logger('NextPlugin');

    const config: Required<NextElementTaggerConfig> = {
        elementTaggerOptions: {},
        enableInDev: true,
        enableInProd: false,
        enableInExport: true,
        mappingFile: '.element-mapping.json',
        include: ['**/*.{jsx,tsx}'],
        exclude: ['node_modules/**', '.next/**', 'out/**'],
        ...userConfig
    };

    return (nextConfig: NextConfig = {}): NextConfig => {
        return {
            ...nextConfig,

            webpack: (webpackConfig: any, { buildId, dev, isServer, defaultLoaders, webpack }: any) => {
                // Call existing webpack config if it exists
                if (nextConfig.webpack) {
                    webpackConfig = nextConfig.webpack(webpackConfig, { buildId, dev, isServer, defaultLoaders, webpack });
                }

                // Skip server-side processing
                if (isServer) {
                    return webpackConfig;
                }

                // Determine mode
                const mode: ProcessingMode = dev
                    ? 'development'
                    : (config.enableInProd ? 'production' : 'export');

                // Skip if not enabled for current mode
                if (dev && !config.enableInDev) {
                    logger.info('Skipping in development mode');
                    return webpackConfig;
                }
                if (!dev && !config.enableInProd && !config.enableInExport) {
                    logger.info('Skipping in production/export mode');
                    return webpackConfig;
                }

                logger.info(`Adding Element Tagger webpack configuration (${mode} mode)`);

                // Add custom loader
                webpackConfig.module.rules.push({
                    test: /\.(jsx|tsx)$/,
                    exclude: /node_modules/,
                    use: [
                        defaultLoaders.babel,
                        {
                            loader: 'element-tagger-loader',
                            options: {
                                mode,
                                config: config.elementTaggerOptions,
                                mappingFile: config.mappingFile,
                                include: config.include,
                                exclude: config.exclude
                            }
                        }
                    ]
                });

                // Define the custom loader
                webpackConfig.resolveLoader = webpackConfig.resolveLoader || {};
                webpackConfig.resolveLoader.alias = webpackConfig.resolveLoader.alias || {};
                webpackConfig.resolveLoader.alias['element-tagger-loader'] = require.resolve('./element-tagger-loader');

                return webpackConfig;
            }
        };
    };
}

/**
 * Custom webpack loader for Next.js
 * This would typically be in a separate file, but included here for completeness
 */
const elementTaggerLoader = function (source: string) {
    const callback = this.async();
    const options = this.getOptions();

    // Initialize Element Tagger with options
    const elementTagger = new ElementTagger({
        mode: options.mode,
        include: options.include,
        exclude: options.exclude,
        mappingFile: options.mappingFile,
        ...options.config
    });

    // Skip processing in export mode
    if (options.mode === 'export') {
        callback(null, source);
        return;
    }

    // Process the file
    elementTagger.process(this.resourcePath)
        .then(processedCode => {
            callback(null, processedCode);
        })
        .catch(error => {
            // Log error but don't fail the build
            console.warn(`Element Tagger processing failed for ${this.resourcePath}:`, error.message);
            callback(null, source);
        });
};

// Export the loader (would be in separate file)
elementTaggerLoader.raw = false;

/**
 * Default export
 */
export default NextPlugin;

/**
 * Pre-configured plugin for development
 */
export function elementTaggerDev(options: Partial<NextElementTaggerConfig> = {}): (config: NextConfig) => NextConfig {
    return NextPlugin({
        enableInDev: true,
        enableInProd: false,
        enableInExport: false,
        ...options
    });
}

/**
 * Pre-configured plugin for production editing
 */
export function elementTaggerProd(options: Partial<NextElementTaggerConfig> = {}): (config: NextConfig) => NextConfig {
    return NextPlugin({
        enableInDev: false,
        enableInProd: true,
        enableInExport: false,
        ...options
    });
}

/**
 * Pre-configured plugin for export (clean code)
 */
export function elementTaggerExport(options: Partial<NextElementTaggerConfig> = {}): (config: NextConfig) => NextConfig {
    return NextPlugin({
        enableInDev: false,
        enableInProd: false,
        enableInExport: true,
        ...options
    });
}

/**
 * Helper for Next.js app directory
 */
export function withElementTagger(nextConfig: NextConfig = {}, elementTaggerConfig: NextElementTaggerConfig = {}): NextConfig {
    return NextPlugin(elementTaggerConfig)(nextConfig);
}

/**
 * Example usage configurations
 */
export const examples = {
    /**
     * For website builders - enable editing in production
     */
    websiteBuilder: NextPlugin({
        enableInDev: true,
        enableInProd: true,
        enableInExport: false,
        elementTaggerOptions: {
            mode: 'production',
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
     * For development - enable tagging for debugging
     */
    development: NextPlugin({
        enableInDev: true,
        enableInProd: false,
        enableInExport: false,
        elementTaggerOptions: {
            mode: 'development',
            tagElements: {
                domElements: true,
                customComponents: false
            }
        }
    }),

    /**
     * For clean exports - remove all tagging
     */
    cleanExport: NextPlugin({
        enableInDev: false,
        enableInProd: false,
        enableInExport: true,
        elementTaggerOptions: {
            mode: 'export',
            export: {
                stripTaggingAttributes: true,
                minify: true
            }
        }
    })
};