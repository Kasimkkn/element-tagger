import type { Compiler, WebpackPluginInstance } from 'webpack';
import { ElementTagger } from '../core';
import type { ElementTaggerOptions, ProcessingMode } from '../types/config';
import type { WebpackPluginOptions } from '../types';
import { Logger } from '../utils/logger';

/**
 * Webpack plugin configuration
 */
export interface WebpackElementTaggerConfig extends WebpackPluginOptions {
    /** Element Tagger options */
    elementTaggerOptions?: ElementTaggerOptions;

    /** Test pattern for files to process */
    test?: RegExp;

    /** Enable in development mode */
    enableInDev?: boolean;

    /** Enable in production mode */
    enableInProd?: boolean;

    /** Mapping file output path */
    mappingFile?: string;

    /** Apply to specific chunks */
    chunks?: string[];
}

/**
 * Webpack plugin for Element Tagger integration
 */
export class WebpackPlugin implements WebpackPluginInstance {
    private readonly logger: Logger;
    private readonly config: Required<WebpackElementTaggerConfig>;
    private elementTagger?: ElementTagger;

    constructor(userConfig: WebpackElementTaggerConfig = {}) {
        this.logger = new Logger('WebpackPlugin');
        this.config = {
            include: ['**/*.{jsx,tsx}'],
            exclude: ['node_modules/**', 'dist/**'],
            mode: 'development',
            elementTaggerOptions: {},
            test: /\.(jsx|tsx)$/,
            enableInDev: true,
            enableInProd: false,
            mappingFile: '.element-mapping.json',
            chunks: [],
            ...userConfig
        };
    }

    apply(compiler: Compiler): void {
        const isProduction = compiler.options.mode === 'production';
        const isDevelopment = compiler.options.mode === 'development';

        // Skip if not enabled for current mode
        if (isProduction && !this.config.enableInProd) {
            this.logger.info('Skipping in production mode');
            return;
        }
        if (isDevelopment && !this.config.enableInDev) {
            this.logger.info('Skipping in development mode');
            return;
        }

        // Determine processing mode
        const mode: ProcessingMode = isProduction
            ? (this.config.enableInProd ? 'production' : 'export')
            : 'development';

        // Initialize Element Tagger
        compiler.hooks.initialize.tap('WebpackElementTagger', () => {
            this.elementTagger = new ElementTagger({
                mode,
                include: this.config.include,
                exclude: this.config.exclude,
                mappingFile: this.config.mappingFile,
                watchFiles: isDevelopment,
                ...this.config.elementTaggerOptions
            });

            this.logger.info(`Element Tagger initialized in ${mode} mode`);
        });

        // Process files during compilation
        compiler.hooks.compilation.tap('WebpackElementTagger', (compilation) => {
            // Hook into the module processing
            compilation.hooks.buildModule.tap('WebpackElementTagger', (module: any) => {
                if (!this.shouldProcessModule(module)) {
                    return;
                }

                this.logger.debug(`Processing module: ${module.resource}`);
            });

            // Transform modules
            compilation.hooks.normalModuleLoader.tap('WebpackElementTagger', (loaderContext: any, module: any) => {
                if (!this.shouldProcessModule(module)) {
                    return;
                }

                // Add custom loader
                module.loaders.push({
                    loader: this.createInlineLoader(),
                    options: {
                        elementTagger: this.elementTagger,
                        config: this.config
                    }
                });
            });
        });

        // Process entire project after compilation
        compiler.hooks.afterCompile.tapAsync('WebpackElementTagger', async (compilation, callback) => {
            if (!this.elementTagger) {
                callback();
                return;
            }

            try {
                // Process project if in development mode
                if (isDevelopment) {
                    const projectRoot = compiler.context || process.cwd();
                    await this.elementTagger.processProject(projectRoot);
                    this.logger.info('Project processing completed');
                }
                callback();
            } catch (error) {
                this.logger.error('Failed to process project', error);
                callback(error as Error);
            }
        });

        // Clean up in export mode
        compiler.hooks.emit.tap('WebpackElementTagger', (compilation) => {
            if (this.elementTagger?.getMode() === 'export') {
                this.logger.info('Cleaning exported assets...');

                // Process each asset to remove element tagger attributes
                Object.keys(compilation.assets).forEach(assetName => {
                    if (/\.(js|jsx|ts|tsx)$/.test(assetName)) {
                        const asset = compilation.assets[assetName];
                        const source = asset.source();

                        if (typeof source === 'string') {
                            // Simple regex cleanup (in reality, use AST stripper)
                            const cleanedSource = source.replace(/\s*data-el-id="[^"]*"/g, '');

                            compilation.assets[assetName] = {
                                source: () => cleanedSource,
                                size: () => cleanedSource.length
                            };
                        }
                    }
                });
            }
        });

        // Cleanup
        compiler.hooks.done.tap('WebpackElementTagger', () => {
            if (this.elementTagger) {
                this.logger.info('Cleaning up Element Tagger...');
                this.elementTagger.dispose?.();
                this.elementTagger = undefined;
            }
        });
    }

    /**
     * Check if module should be processed
     */
    private shouldProcessModule(module: any): boolean {
        if (!module.resource) return false;

        // Check file extension
        if (!this.config.test.test(module.resource)) return false;

        // Check include/exclude patterns
        const relativePath = module.resource;

        // Simple pattern matching (use proper glob in production)
        const isIncluded = this.config.include.some(pattern => {
            const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
            return regex.test(relativePath);
        });

        const isExcluded = this.config.exclude.some(pattern => {
            const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
            return regex.test(relativePath);
        });

        return isIncluded && !isExcluded;
    }

    /**
     * Create inline loader for processing files
     */
    private createInlineLoader(): string {
        // Return the loader function as a string
        return `
        module.exports = function(source) {
            const callback = this.async();
            const { elementTagger } = this.query;
            
            if (!elementTagger) {
                callback(null, source);
                return;
            }

            elementTagger.process(this.resourcePath)
                .then(processedCode => {
                    callback(null, processedCode);
                })
                .catch(error => {
                    console.warn('Element Tagger processing failed:', error.message);
                    callback(null, source); // Fall back to original source
                });
        };`;
    }
}

/**
 * Default export
 */
export default WebpackPlugin;

/**
 * Factory function for easy usage
 */
export function createWebpackPlugin(config?: WebpackElementTaggerConfig): WebpackPlugin {
    return new WebpackPlugin(config);
}

/**
 * Pre-configured plugin for development
 */
export function elementTaggerDev(options: Partial<WebpackElementTaggerConfig> = {}): WebpackPlugin {
    return new WebpackPlugin({
        mode: 'development',
        enableInDev: true,
        enableInProd: false,
        ...options
    });
}

/**
 * Pre-configured plugin for production
 */
export function elementTaggerProd(options: Partial<WebpackElementTaggerConfig> = {}): WebpackPlugin {
    return new WebpackPlugin({
        mode: 'production',
        enableInDev: false,
        enableInProd: true,
        ...options
    });
}

/**
 * Pre-configured plugin for export (clean code)
 */
export function elementTaggerExport(options: Partial<WebpackElementTaggerConfig> = {}): WebpackPlugin {
    return new WebpackPlugin({
        mode: 'export',
        enableInDev: false,
        enableInProd: false,
        ...options
    });
}