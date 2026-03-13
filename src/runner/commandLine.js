export function parseCommandLine(value = "") {
  const matches = String(value).match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  return matches.map((part) => part.replace(/^['"]|['"]$/g, ""));
}

export function hasForbiddenShellSyntax(value = "") {
  const raw = String(value);
  return /[;&|<>`]/.test(raw) || /\$\(/.test(raw) || /[\r\n]/.test(raw);
}

export function matchesAllowedCommandPrefix(argv, allowedPrefixes) {
  if (!Array.isArray(argv) || !argv.length) return false;

  return allowedPrefixes.some((prefix) => {
    if (
      !Array.isArray(prefix) ||
      !prefix.length ||
      prefix.length > argv.length
    ) {
      return false;
    }

    return prefix.every((token, index) => argv[index] === token);
  });
}
