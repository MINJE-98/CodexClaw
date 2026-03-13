const CODING_KEYWORDS = [
  "code",
  "bug",
  "fix",
  "refactor",
  "function",
  "class",
  "typescript",
  "javascript",
  "node",
  "npm",
  "test",
  "lint",
  "build",
  "部署",
  "代码",
  "修复",
  "重构",
  "单测",
  "脚本"
];

const GENERAL_KEYWORDS = [
  "总结",
  "查资料",
  "知识库",
  "文档",
  "查询",
  "explain",
  "search",
  "mcp"
];

function likelyCodingTask(text) {
  const normalized = text.toLowerCase();
  if (normalized.includes("```")) return true;
  if (/\b(src|tests|package\.json|dockerfile)\b/i.test(text)) return true;
  return CODING_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function likelyGeneralTask(text) {
  const normalized = text.toLowerCase();
  return GENERAL_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export class Router {
  constructor({ skills }) {
    this.skills = skills;
  }

  async routeMessage(text) {
    const raw = text.trim();
    const githubSkill = this.skills.github;
    const mcpSkill = this.skills.mcp;

    if (githubSkill && githubSkill.supports(raw)) {
      return {
        target: "skill",
        skill: "github",
        payload: raw
      };
    }

    if (mcpSkill && mcpSkill.supports(raw)) {
      return {
        target: "skill",
        skill: "mcp",
        payload: raw
      };
    }

    if (likelyCodingTask(raw)) {
      return {
        target: "pty",
        prompt: raw
      };
    }

    if (mcpSkill && likelyGeneralTask(raw)) {
      return {
        target: "skill",
        skill: "mcp",
        payload: raw
      };
    }

    if (mcpSkill) {
      return {
        target: "skill",
        skill: "mcp",
        payload: raw
      };
    }

    return {
      target: "pty",
      prompt: raw
    };
  }
}
