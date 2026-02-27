#!/usr/bin/env bun
import { defineCommand, runMain } from "citty";
import pkg from "../../package.json";
import { encodeCommand } from "./commands/encode.ts";
import { recallCommand } from "./commands/recall.ts";
import { focusCommand } from "./commands/focus.ts";
import { inspectCommand } from "./commands/inspect.ts";
import { statsCommand } from "./commands/stats.ts";
import { listCommand } from "./commands/list.ts";
import { sleepCommand } from "./commands/sleep.ts";
import { healthCommand } from "./commands/health.ts";

const main = defineCommand({
  meta: {
    name: "engram",
    version: pkg.version,
    description: "Human memory for artificial minds",
  },
  subCommands: {
    encode: encodeCommand,
    recall: recallCommand,
    focus: focusCommand,
    inspect: inspectCommand,
    list: listCommand,
    stats: statsCommand,
    sleep: sleepCommand,
    health: healthCommand,
  },
});

runMain(main);
