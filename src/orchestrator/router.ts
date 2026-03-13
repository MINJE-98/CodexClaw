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
] as const;

export interface RoutableSkill {
  supports(text: string): boolean;
}

export interface RouterSkills {
  github?: RoutableSkill | null;
  mcp?: RoutableSkill | null;
}

export interface RouteMessageOptions {
  chatId?: string | number;
}

export interface SkillRouteResult {
  target: "skill";
  skill: "github" | "mcp";
  payload: string;
}

export interface PtyRouteResult {
  target: "pty";
  prompt: string;
}

export type RouteResult = SkillRouteResult | PtyRouteResult;

export interface RouterOptions {
  skills: RouterSkills;
  isSkillEnabled?: (
    chatId: string | number | undefined,
    skillName: string
  ) => boolean;
}

function likelyCodingTask(text: string): boolean {
  const normalized = text.toLowerCase();
  if (normalized.includes("```")) return true;
  if (/\b(src|tests|package\.json|dockerfile)\b/i.test(text)) return true;
  return CODING_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export class Router {
  private readonly skills: RouterSkills;
  private readonly isSkillEnabled: (
    chatId: string | number | undefined,
    skillName: string
  ) => boolean;

  constructor({ skills, isSkillEnabled = () => true }: RouterOptions) {
    this.skills = skills;
    this.isSkillEnabled = isSkillEnabled;
  }

  async routeMessage(
    text: string,
    options: RouteMessageOptions = {}
  ): Promise<RouteResult> {
    const raw = text.trim();
    const chatId = options.chatId;
    const githubSkill = this.skills.github;
    const mcpSkill = this.skills.mcp;

    if (
      githubSkill &&
      this.isSkillEnabled(chatId, "github") &&
      githubSkill.supports(raw)
    ) {
      return {
        target: "skill",
        skill: "github",
        payload: raw
      };
    }

    if (
      mcpSkill &&
      this.isSkillEnabled(chatId, "mcp") &&
      mcpSkill.supports(raw)
    ) {
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
