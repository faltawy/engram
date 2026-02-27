import { $ } from "bun";
import { mkdir } from "fs/promises";

await mkdir("dist", { recursive: true });

console.log("Building CLI binary...");
await $`bun build src/cli/index.ts --compile --outfile dist/engram`;

console.log("Building MCP server binary...");
await $`bun build src/mcp/server.ts --compile --outfile dist/engram-mcp`;

console.log("Done. Binaries in dist/");
