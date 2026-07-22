const SHOWCASE_ACCOUNT_EMAILS = new Set(['reachshravanv@gmail.com'])

function normalizeAccountEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Match only explicitly allowlisted showcase accounts after email normalization. */
export function isShowcaseAccountEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return SHOWCASE_ACCOUNT_EMAILS.has(normalizeAccountEmail(email))
}
