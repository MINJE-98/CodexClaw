export class SkillRegistry {
  constructor(skills = {}) {
    this.skillNames = Object.keys(skills).sort();
    this.chatStates = new Map();
  }

  normalizeSkillName(name) {
    return String(name || "").trim().toLowerCase();
  }

  ensureKnownSkill(name) {
    const normalized = this.normalizeSkillName(name);
    if (!this.skillNames.includes(normalized)) {
      throw new Error(`Unknown skill: ${name}`);
    }
    return normalized;
  }

  ensureChatState(chatId) {
    const key = String(chatId);
    const existing = this.chatStates.get(key);
    if (existing) return existing;

    const state = {
      enabledSkills: new Set(this.skillNames)
    };

    this.chatStates.set(key, state);
    return state;
  }

  list(chatId) {
    const state = this.ensureChatState(chatId);
    return this.skillNames.map((name) => ({
      name,
      enabled: state.enabledSkills.has(name)
    }));
  }

  isEnabled(chatId, name) {
    const normalized = this.ensureKnownSkill(name);
    const state = this.ensureChatState(chatId);
    return state.enabledSkills.has(normalized);
  }

  enable(chatId, name) {
    const normalized = this.ensureKnownSkill(name);
    const state = this.ensureChatState(chatId);
    state.enabledSkills.add(normalized);
    return this.list(chatId);
  }

  disable(chatId, name) {
    const normalized = this.ensureKnownSkill(name);
    const state = this.ensureChatState(chatId);
    state.enabledSkills.delete(normalized);
    return this.list(chatId);
  }
}
