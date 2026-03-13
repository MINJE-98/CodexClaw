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

function likelyCodingTask(text) {
  const normalized = text.toLowerCase();
  if (normalized.includes("```")) return true;
  if (/\b(src|tests|package\.json|dockerfile)\b/i.test(text)) return true;
  return CODING_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export class Router {
  constructor({ skills, isSkillEnabled = () => true }) {
    this.skills = skills;
    this.isSkillEnabled = isSkillEnabled;
  }

  async routeMessage(text, options = {}) {
    const raw = text.trim();
    const chatId = options.chatId;
    const githubSkill = this.skills.github;
    const mcpSkill = this.skills.mcp;

    if (githubSkill && this.isSkillEnabled(chatId, "github") && githubSkill.supports(raw)) {
      return {
        target: "skill",
        skill: "github",
        payload: raw
      };
    }

    if (mcpSkill && this.isSkillEnabled(chatId, "mcp") && mcpSkill.supports(raw)) {
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

    return {
      target: "pty",
      prompt: raw
    };
  }
}
