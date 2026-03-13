import test from "node:test";
import assert from "node:assert/strict";
import { createAuthMiddleware } from "../src/bot/middleware.js";

test("auth middleware allows whitelisted users", async () => {
  const middleware = createAuthMiddleware({
    telegram: {
      allowedUserIds: ["123"]
    }
  });

  let called = false;
  await middleware({ from: { id: 123 } }, async () => {
    called = true;
  });

  assert.equal(called, true);
});

test("auth middleware silently blocks non-whitelisted users", async () => {
  const middleware = createAuthMiddleware({
    telegram: {
      allowedUserIds: ["123"]
    }
  });

  let called = false;
  await middleware({ from: { id: 999 } }, async () => {
    called = true;
  });

  assert.equal(called, false);
});

test("auth middleware also checks callback query origin", async () => {
  const middleware = createAuthMiddleware({
    telegram: {
      allowedUserIds: ["555"]
    }
  });

  let called = false;
  await middleware({ callbackQuery: { from: { id: 555 } } }, async () => {
    called = true;
  });

  assert.equal(called, true);
});
