import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { DevServerManager } from "../src/runner/devServerManager.js";

class FakeChildProcess extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly pid: number;
  killedWith: NodeJS.Signals | undefined;

  constructor(pid: number) {
    super();
    this.pid = pid;
    this.killedWith = undefined;
  }

  kill(signal?: NodeJS.Signals): boolean {
    this.killedWith = signal;
    this.emit("close", null, signal || "SIGTERM");
    return true;
  }
}

function createWorkspace(
  scripts: Record<string, string>,
  lockfile = "package-lock.json"
): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claws-dev-server-"));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify(
      {
        name: "sample-app",
        private: true,
        scripts
      },
      null,
      2
    )
  );
  fs.writeFileSync(path.join(root, lockfile), "");
  return root;
}

test("dev server manager prefers the dev script and captures a detected URL", async () => {
  const workdir = createWorkspace({
    dev: "vite",
    start: "node server.js"
  });
  const spawned: Array<{ command: string; args: string[]; cwd?: string }> = [];
  const child = new FakeChildProcess(111);
  const manager = new DevServerManager({
    spawnProcess: (command, args, options) => {
      spawned.push({ command, args, cwd: options.cwd });
      return child as any;
    }
  });

  const result = await manager.start({
    workdir,
    chatId: 1
  });

  assert.equal(result.started, true);
  assert.deepEqual(spawned, [
    {
      command: "npm",
      args: ["run", "dev"],
      cwd: workdir
    }
  ]);

  child.stdout.emit("data", "Local: http://127.0.0.1:5173/\n");

  const status = manager.getStatus(workdir);
  assert.equal(status.running, true);
  assert.equal(status.scriptName, "dev");
  assert.equal(status.detectedUrl, "http://127.0.0.1:5173/");
  assert.match(manager.getLogs(workdir), /127\.0\.0\.1:5173/);
});

test("dev server manager falls back to the start script when dev is missing", async () => {
  const workdir = createWorkspace({
    start: "node server.js"
  });
  const spawned: Array<{ command: string; args: string[] }> = [];
  const manager = new DevServerManager({
    spawnProcess: (command, args) => {
      spawned.push({ command, args });
      return new FakeChildProcess(222) as any;
    }
  });

  const result = await manager.start({
    workdir,
    chatId: 1
  });

  assert.equal(result.started, true);
  assert.equal(result.scriptName, "start");
  assert.deepEqual(spawned, [
    {
      command: "npm",
      args: ["run", "start"]
    }
  ]);
});

test("dev server manager keeps one running server per repo workdir", async () => {
  const workdir = createWorkspace({
    dev: "vite"
  });
  const child = new FakeChildProcess(333);
  const manager = new DevServerManager({
    spawnProcess: () => child as any
  });

  const first = await manager.start({
    workdir,
    chatId: 1
  });
  const second = await manager.start({
    workdir,
    chatId: 2
  });

  assert.equal(first.started, true);
  assert.equal(second.started, false);
  assert.equal(second.reason, "already_running");
  assert.equal(manager.getStatus(workdir).startedByChatId, "1");

  const stopped = manager.stop(workdir);
  assert.equal(stopped, true);
  assert.equal(child.killedWith, "SIGTERM");
});
