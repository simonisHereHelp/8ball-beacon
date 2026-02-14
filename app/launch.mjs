#!/usr/bin/env node
import { spawn } from "node:child_process";

const processes = [];

function run(name, cmd, args) {
  const child = spawn(cmd, args, {
    stdio: "inherit",
    shell: true,
    env: process.env
  });

  child.on("exit", (code, signal) => {
    console.log(`[launch] ${name} exited (code=${code ?? "null"}, signal=${signal ?? "none"})`);
    shutdown(name);
  });

  processes.push({ name, child });
  return child;
}

function shutdown(source) {
  for (const proc of processes) {
    if (proc.child.killed) continue;
    try {
      proc.child.kill("SIGTERM");
    } catch {
      // best effort
    }
  }

  if (source) {
    console.log(`[launch] shutting down because ${source} stopped`);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

run("next-start", "npm", ["run", "start"]);
run("bot", "npm", ["run", "bot"]);
