/**
 * Plugin types for build tool integration
 */

export interface PluginBase {
    name: string;
    version?: string;
    description?: string;
}

export interface VitePluginConfig extends PluginBase {
    include?: string[];
    exclude?: string[];
    mode?: 'development' | 'production' | 'export';
    elementTaggerOptions?: any;
}

export interface WebpackPluginConfig extends PluginBase {
    include?: string[];
    exclude?: string[];
    mode?: 'development' | 'production' | 'export';
    elementTaggerOptions?: any;
}

export interface NextPluginConfig extends PluginBase {
    elementTaggerOptions?: any;
}

export interface BuildToolPlugin {
    apply(compiler: any): void;
    options?: Record<string, any>;
}