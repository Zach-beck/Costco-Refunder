import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function repoRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../../../..");
}
