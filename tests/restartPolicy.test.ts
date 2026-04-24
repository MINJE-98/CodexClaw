import test from "node:test";
import assert from "node:assert/strict";
import { shouldSpawnDetachedRestart } from "../src/restartPolicy.js";

test("restart policy lets unmanaged processes spawn a replacement", () => {
  assert.equal(shouldSpawnDetachedRestart({}), true);
});

test("restart policy relies on launchd when XPC service name is present", () => {
  assert.equal(
    shouldSpawnDetachedRestart({ XPC_SERVICE_NAME: "com.minje.codexclaw" }),
    false
  );
});
