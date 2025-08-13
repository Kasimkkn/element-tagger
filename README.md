element-tagger/
├── README.md
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── 
├── src/
│   ├── index.ts                     # Main entry point
│   │
│   ├── core/
│   │   ├── index.ts                 # Core exports
│   │   ├── ast-parser.ts            # Parse JSX/TSX files into AST
│   │   ├── ast-traverser.ts         # Walk through AST nodes
│   │   ├── element-detector.ts      # Identify taggable JSX elements
│   │   ├── id-generator.ts          # Generate stable unique IDs
│   │   ├── code-injector.ts         # Inject data-el-id into AST
│   │   ├── code-stripper.ts         # Remove data-el-id for export
│   │   └── file-processor.ts        # Process individual files
│   │
│   ├── storage/
│   │   ├── index.ts                 # Storage exports
│   │   ├── mapping-manager.ts       # Handle .element-mapping.json
│   │   ├── cache-manager.ts         # Performance caching
│   │   ├── file-watcher.ts          # Watch for file changes
│   │   └── persistence.ts           # Save/load operations
│   │
│   ├── modes/
│   │   ├── index.ts                 # Mode exports
│   │   ├── development.ts           # Dev mode with file watching
│   │   ├── production.ts            # User editing mode (full tagging)
│   │   └── export.ts                # Clean export mode (no tags)
│   │
│   ├── plugins/
│   │   ├── index.ts                 # Plugin exports
│   │   ├── vite-plugin.ts           # Vite integration
│   │   ├── webpack-plugin.ts        # Webpack integration
│   │   ├── next-plugin.ts           # Next.js integration
│   │   └── rollup-plugin.ts         # Rollup integration
│   │
│   ├── runtime/
│   │   ├── index.ts                 # Runtime exports
│   │   ├── element-tracker.ts       # Track DOM elements with IDs
│   │   ├── click-handler.ts         # Handle element clicks
│   │   ├── element-highlighter.ts   # Visual highlighting
│   │   └── dom-utils.ts             # DOM manipulation utilities
│   │
│   ├── editor/
│   │   ├── index.ts                 # Editor exports
│   │   ├── selection-manager.ts     # Manage selected elements
│   │   ├── properties-panel.ts      # Element properties interface
│   │   ├── inline-editor.ts         # Inline text editing
│   │   ├── style-editor.ts          # CSS style editing
│   │   └── content-editor.ts        # Content editing
│   │
│   ├── sync/
│   │   ├── index.ts                 # Sync exports
│   │   ├── code-synchronizer.ts     # Sync edits back to source files
│   │   ├── ast-updater.ts           # Update AST with changes
│   │   ├── file-writer.ts           # Write updated files
│   │   └── change-tracker.ts        # Track what changed
│   │
│   ├── export/
│   │   ├── index.ts                 # Export exports
│   │   ├── code-exporter.ts         # Export clean React code
│   │   ├── asset-bundler.ts         # Bundle assets
│   │   ├── project-generator.ts     # Generate complete project
│   │   └── zip-creator.ts           # Create downloadable zip
│   │
│   ├── utils/
│   │   ├── index.ts                 # Utils exports
│   │   ├── hash-generator.ts        # Generate stable hashes
│   │   ├── path-utils.ts            # File path utilities
│   │   ├── jsx-utils.ts             # JSX-specific utilities
│   │   ├── string-utils.ts          # String manipulation
│   │   ├── validation.ts            # Input validation
│   │   └── logger.ts                # Logging utilities
│   │
│   ├── types/
│   │   ├── index.ts                 # Main type definitions
│   │   ├── ast.ts                   # AST-related types
│   │   ├── mapping.ts               # Mapping file types
│   │   ├── config.ts                # Configuration types
│   │   ├── runtime.ts               # Runtime types
│   │   ├── editor.ts                # Editor types
│   │   ├── plugin.ts                # Plugin types
│   │   └── events.ts                # Event system types
│   │
│   └── config/
│       ├── index.ts                 # Config exports
│       ├── default-config.ts        # Default configuration
│       ├── config-validator.ts      # Validate user config
│       └── config-loader.ts         # Load configuration
│
├── examples/
│   ├── vite-react/                  # Vite + React example
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── next-app/                    # Next.js example
│   │   ├── pages/
│   │   ├── components/
│   │   ├── next.config.js
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── webpack-react/               # Webpack + React example
│       ├── src/
│       ├── webpack.config.js
│       ├── tsconfig.json
│       └── package.json
│
├── tests/
│   ├── unit/
│   │   ├── core/                    # Core functionality tests
│   │   │   ├── ast-parser.test.ts
│   │   │   ├── element-detector.test.ts
│   │   │   ├── id-generator.test.ts
│   │   │   └── code-injector.test.ts
│   │   ├── storage/                 # Storage tests
│   │   │   ├── mapping-manager.test.ts
│   │   │   └── cache-manager.test.ts
│   │   ├── modes/                   # Mode tests
│   │   │   ├── development.test.ts
│   │   │   ├── production.test.ts
│   │   │   └── export.test.ts
│   │   ├── runtime/                 # Runtime tests
│   │   │   ├── element-tracker.test.ts
│   │   │   └── click-handler.test.ts
│   │   ├── editor/                  # Editor tests
│   │   │   ├── selection-manager.test.ts
│   │   │   └── properties-panel.test.ts
│   │   ├── sync/                    # Sync tests
│   │   │   ├── code-synchronizer.test.ts
│   │   │   └── ast-updater.test.ts
│   │   ├── export/                  # Export tests
│   │   │   ├── code-exporter.test.ts
│   │   │   └── project-generator.test.ts
│   │   └── utils/                   # Utils tests
│   │       ├── hash-generator.test.ts
│   │       └── path-utils.test.ts
│   ├── integration/
│   │   ├── full-workflow.test.ts    # Complete workflow tests
│   │   ├── plugin-integration.test.ts
│   │   └── export-validation.test.ts
│   ├── fixtures/                    # Test fixture files
│   │   ├── components/              # Sample React components
│   │   │   ├── Hero.tsx
│   │   │   ├── Button.tsx
│   │   │   └── ContactForm.tsx
│   │   ├── projects/                # Sample projects
│   │   │   ├── simple-site/
│   │   │   └── complex-app/
│   │   └── expected-outputs/        # Expected test outputs
│   │       ├── tagged/
│   │       └── clean/
│   └── helpers/
│       ├── test-utils.ts            # Testing utilities
│       ├── mock-data.ts             # Mock data generators
│       └── ast-helpers.ts           # AST testing helpers
│
├── docs/
│   ├── api/
│   │   ├── core.md                  # Core API documentation
│   │   ├── plugins.md               # Plugin API
│   │   ├── runtime.md               # Runtime API
│   │   └── configuration.md         # Configuration options
│   ├── guides/
│   │   ├── getting-started.md       # Quick start guide
│   │   ├── integration.md           # Integration guide
│   │   ├── customization.md         # Customization options
│   │   └── troubleshooting.md       # Common issues
│   └── examples/
│       ├── basic-usage.md           # Basic usage examples
│       ├── advanced-config.md       # Advanced configuration
│       └── custom-plugins.md        # Custom plugin development
│
├── scripts/
│   ├── build.ts                     # Build script
│   ├── test.ts                      # Test runner
│   ├── dev.ts                       # Development server
│   └── release.ts                   # Release preparation
│
├── .element-mapping.json            # Example mapping file
├── .gitignore
├── .eslintrc.js
├── .prettierrc
├── jest.config.js
├── rollup.config.js                 # Build configuration
└── vitest.config.ts                 # Vitest configuration