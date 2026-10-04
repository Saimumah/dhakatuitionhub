export function normalizeBdPhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("880")) {
    digits = "0" + digits.slice(3);
  }
  if (!digits.startsWith("0") && digits.length === 10) {
    digits = "0" + digits;
  }
  return digits;
}

export function isValidBdPhone(raw: string): boolean {
  return /^01[3-9]\d{8}$/.test(normalizeBdPhone(raw));
}
