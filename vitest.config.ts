import { defineConfig } from "vitest/config";
import { transformWithOxc, type Plugin } from "vite";
import path from "node:path";

const tsxTransformPlugin = (): Plugin => ({
	name: "vitest-tsx-transform",
	enforce: "pre",
	async transform(code, id) {
		if (!id.endsWith(".tsx")) return null;
		return transformWithOxc(code, id, {
			lang: "tsx",
			jsx: {
				runtime: "automatic",
				importSource: "react",
			},
		});
	},
});

export default defineConfig({
	plugins: [tsxTransformPlugin()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		include: ["src/**/*.test.ts"],
	},
});
