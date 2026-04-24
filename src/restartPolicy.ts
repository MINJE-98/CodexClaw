export function shouldSpawnDetachedRestart(
  env: Record<string, string | undefined> = process.env
): boolean {
  return !env.XPC_SERVICE_NAME;
}
