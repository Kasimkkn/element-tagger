// rollup.config.js
import typescript from "@rollup/plugin-typescript";

export default {
    input: "src/index.ts",
    output: [
        {
            file: "dist/index.cjs",
            format: "cjs",
        },
        {
            file: "dist/index.esm.js",
            format: "esm",
        },
    ],
    plugins: [typescript()],
};
