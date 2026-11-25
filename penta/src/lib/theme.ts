export type Theme = "light" | "dark";

export const themeCookieName = "penta-theme";

export const themeBootScript = `try{if(/(?:^|; )${themeCookieName}=dark(?:;|$)/.test(document.cookie))document.documentElement.dataset.theme="dark"}catch(e){}`;

const oneYearInSeconds = 60 * 60 * 24 * 365;

export function parseTheme(value: string | undefined): Theme {
  return value === "dark" ? "dark" : "light";
}

export function oppositeTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

export function themeCookie(theme: Theme): string {
  return `${themeCookieName}=${theme}; Path=/; Max-Age=${oneYearInSeconds}; SameSite=Lax`;
}

export function storedTheme(cookieText: string): Theme {
  const found = cookieText.split("; ").find((part) => part.startsWith(`${themeCookieName}=`));
  return parseTheme(found?.slice(themeCookieName.length + 1));
}

export function applyStoredTheme(root: HTMLElement, cookieText: string): void {
  const theme = storedTheme(cookieText);
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
}

export function switchTheme(root: HTMLElement, cookieJar: { cookie: string }): Theme {
  const next = oppositeTheme(parseTheme(root.dataset.theme));
  root.dataset.theme = next;
  try {
    cookieJar.cookie = themeCookie(next);
  } catch {
    return next;
  }
  return next;
}
