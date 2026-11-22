export const sessionCookieOptions = {
  secure: process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://") ?? false,
};
