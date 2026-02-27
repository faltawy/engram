import { $ } from "bun";
import { mkdir } from "fs/promises";

const targets = [
  "bun-linux-x64",
  "bun-linux-arm64",
  "bun-darwin-x64",
  "bun-darwin-arm64",
  "bun-windows-x64",
];

const entries = [
  { src: "src/cli/index.ts", name: "engram" },
  { src: "src/mcp/server.ts", name: "engram-mcp" },
];

const cross = process.argv.includes("--cross");

await mkdir("dist", { recursive: true });

if (cross) {
  for (const target of targets) {
    const ext = target.includes("windows") ? ".exe" : "";
    for (const entry of entries) {
      const outfile = `dist/${entry.name}-${target}${ext}`;
      console.log(`Building ${outfile}...`);
      await $`bun build ${entry.src} --compile --target ${target} --outfile ${outfile}`;
    }
  }
} else {
  for (const entry of entries) {
    console.log(`Building ${entry.name}...`);
    await $`bun build ${entry.src} --compile --outfile dist/${entry.name}`;
  }
}

console.log("Done.");
