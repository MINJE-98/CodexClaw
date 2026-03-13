import test from "node:test";
import assert from "node:assert/strict";
import {
  escapeMarkdownV2,
  extractReasoning,
  formatPtyOutput,
  splitTelegramMessage
} from "../src/bot/formatter.js";

test("escapeMarkdownV2 escapes Telegram MarkdownV2 special characters", () => {
  const input = "_*[]()~`>#+-=|{}.!\\";
  const escaped = escapeMarkdownV2(input);

  assert.equal(
    escaped,
    "\\_\\*\\[\\]\\(\\)\\~\\`\\>\\#\\+\\-\\=\\|\\{\\}\\.\\!\\\\"
  );
});

test("extractReasoning separates think blocks from visible output", () => {
  const result = extractReasoning("before<think>first</think>middle<think>second</think>after");

  assert.equal(result.cleanText, "beforemiddleafter");
  assert.deepEqual(result.reasoningBlocks, ["first", "second"]);
});

test("formatPtyOutput renders visible output and spoiler reasoning", () => {
  const rendered = formatPtyOutput("done<think>private reasoning</think>", {
    mode: "spoiler"
  });

  assert.match(rendered, /done/);
  assert.match(rendered, /Reasoning Stream/);
  assert.match(rendered, /\|\|private reasoning\|\|/);
});

test("splitTelegramMessage preserves content and avoids trailing escape characters in chunks", () => {
  const input = `${"a".repeat(9)}\\b`;
  const chunks = splitTelegramMessage(input, 10);

  assert.deepEqual(chunks, ["a".repeat(9), "\\b"]);
  assert.equal(chunks.join(""), input);
  assert.ok(chunks.every((chunk) => !chunk.endsWith("\\")));
});
