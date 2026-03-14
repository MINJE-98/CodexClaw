import assert from "node:assert/strict";
import test from "node:test";
import { toErrorMessage } from "../src/lib/errors.js";

test("toErrorMessage returns the original message for Error instances", () => {
  assert.equal(toErrorMessage(new Error("boom")), "boom");
});

test("toErrorMessage stringifies non-Error values with the shared fallback", () => {
  assert.equal(toErrorMessage("plain failure"), "plain failure");
  assert.equal(toErrorMessage({ code: "E_FAIL" }), "[object Object]");
  assert.equal(toErrorMessage(null), "null");
  assert.equal(toErrorMessage(undefined), "undefined");
});
