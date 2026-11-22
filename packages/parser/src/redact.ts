const MEMBER_LINE =
  /((?:member|mbr)\s*#?\s*)([\d*][\d\s*]{6,})/gi;

export function redactReceiptText(text: string): string {
  return text.replace(MEMBER_LINE, "$1[redacted]");
}
