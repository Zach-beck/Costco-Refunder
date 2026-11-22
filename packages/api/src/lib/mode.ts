export function isLocalMode(): boolean {
  const value = process.env.LOCAL_MODE?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
