export const ROUTES = [
  "/",
  "/recruitment",
  "/designer",
  "/invite/preview",
  "/invite/rsvp",
] as const;

export type AppRoute = (typeof ROUTES)[number];

export const DEFAULT_ROUTE: AppRoute = "/";

export function isAppRoute(value: string): value is AppRoute {
  return (ROUTES as readonly string[]).includes(value);
}

export function normalizePath(input: string): AppRoute {
  const withoutHash = input.trim().replace(/^#/, "");
  const pathOnly = withoutHash.split("?")[0]?.split("#")[0] ?? "/";
  const normalized =
    pathOnly.length > 1 && pathOnly.endsWith("/")
      ? pathOnly.replace(/\/+$/, "")
      : pathOnly;

  if (!normalized || normalized === "/") return DEFAULT_ROUTE;
  if (/^\/invite\/[a-f0-9]{64}$/u.test(normalized)) return "/invite/rsvp";
  return isAppRoute(normalized) ? normalized : DEFAULT_ROUTE;
}

export function parseHash(hash: string): AppRoute {
  return normalizePath(hash);
}

export function pathToHash(path: AppRoute): string {
  return `#${path}`;
}
