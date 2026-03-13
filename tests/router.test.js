import test from "node:test";
import assert from "node:assert/strict";
import { Router } from "../src/orchestrator/router.js";

function createSkill(supports) {
  return { supports };
}

test("router prioritizes github skill when it claims the message", async () => {
  const router = new Router({
    skills: {
      github: createSkill(() => true),
      mcp: createSkill(() => false)
    }
  });

  const route = await router.routeMessage("push this repo");

  assert.deepEqual(route, {
    target: "skill",
    skill: "github",
    payload: "push this repo"
  });
});

test("router routes explicit MCP messages to mcp skill", async () => {
  const router = new Router({
    skills: {
      github: createSkill(() => false),
      mcp: createSkill((text) => text.startsWith("/mcp"))
    }
  });

  const route = await router.routeMessage("/mcp tools filesystem");

  assert.deepEqual(route, {
    target: "skill",
    skill: "mcp",
    payload: "/mcp tools filesystem"
  });
});

test("router sends coding tasks directly to codex PTY", async () => {
  const router = new Router({
    skills: {
      github: createSkill(() => false),
      mcp: createSkill(() => false)
    }
  });

  const route = await router.routeMessage("Please fix src/index.js and run tests");

  assert.deepEqual(route, {
    target: "pty",
    prompt: "Please fix src/index.js and run tests"
  });
});

test("router sends generic requests to MCP skill when available", async () => {
  const router = new Router({
    skills: {
      github: createSkill(() => false),
      mcp: createSkill(() => false)
    }
  });

  const route = await router.routeMessage("帮我总结这个项目");

  assert.deepEqual(route, {
    target: "skill",
    skill: "mcp",
    payload: "帮我总结这个项目"
  });
});

test("router falls back to PTY when no skill matches and no MCP skill exists", async () => {
  const router = new Router({
    skills: {
      github: createSkill(() => false),
      mcp: null
    }
  });

  const route = await router.routeMessage("hello there");

  assert.deepEqual(route, {
    target: "pty",
    prompt: "hello there"
  });
});
