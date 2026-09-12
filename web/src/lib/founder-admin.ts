const DEFAULT_FOUNDER_EMAIL = "founder@arkagentic.com";

export function getFounderAdminEmail(): string {
  return (process.env.FOUNDER_ADMIN_EMAIL || DEFAULT_FOUNDER_EMAIL).trim().toLowerCase();
}

export function isFounderAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === getFounderAdminEmail();
}
