const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");

const buildOptions = {
  entryPoints: {
    content: "src/content/content.ts",
    popup: "src/popup/popup.ts"
  },
  bundle: true,
  outdir: "dist",
  target: "chrome110",
  format: "iife",
  sourcemap: true,
  logLevel: "info"
};

async function run() {
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("Watching for changes...");
  } else {
    await esbuild.build(buildOptions);
  }
}

run().catch(() => process.exit(1));
