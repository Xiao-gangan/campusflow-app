import type { ApiMethod } from "../contracts/api.ts";
import type { CampusRepository } from "../data/repository.ts";
import {
  anonymousActor,
  type Actor,
  type ActorResolver,
} from "./actor.ts";
import { auditActor, recordAuditSafely } from "../auth/audit.ts";
import { ApiError, failure, methodNotAllowed, notFound } from "./errors.ts";

export type ApiDependencies = {
  repository: CampusRepository;
  resolveActor: ActorResolver;
  now: () => Date;
};

export type RouteContext = {
  request: Request;
  url: URL;
  params: Record<string, string>;
  actor: Actor;
  deps: ApiDependencies;
};

export type RouteHandler = (
  context: RouteContext,
) => Promise<Response> | Response;

export type RouteOptions = {
  public?: boolean;
};

type RegisteredRoute = {
  method: ApiMethod;
  path: string;
  handler: RouteHandler;
  public: boolean;
};

function splitPath(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function matchPath(
  pattern: string,
  path: string,
): Record<string, string> | null {
  const patternSegments = splitPath(pattern);
  const pathSegments = splitPath(path);
  if (patternSegments.length !== pathSegments.length) return null;

  const params: Record<string, string> = {};

  for (let index = 0; index < patternSegments.length; index += 1) {
    const expected = patternSegments[index];
    const actual = pathSegments[index];

    if (expected.startsWith(":")) {
      try {
        params[expected.slice(1)] = decodeURIComponent(actual);
      } catch {
        return null;
      }
      continue;
    }

    if (expected !== actual) return null;
  }

  return params;
}

export function normalizeApiPath(pathname: string): string | null {
  const platformMatch = pathname.match(
    /^\/(?:functions\/v1\/)?(?:app|app-d[0-9a-f]{32})(\/api\/v1(?:\/.*)?)$/i,
  );
  const candidate = platformMatch ? platformMatch[1] : pathname;

  if (!candidate.startsWith("/api/v1")) return null;

  const normalized =
    candidate.length > "/api/v1".length && candidate.endsWith("/")
      ? candidate.replace(/\/+$/, "")
      : candidate;

  return normalized;
}

export class ApiRouter {
  private readonly routes: RegisteredRoute[] = [];

  add(
    method: ApiMethod,
    path: string,
    handler: RouteHandler,
    options: RouteOptions = {},
  ): this {
    this.routes.push({
      method,
      path,
      handler,
      public: options.public ?? false,
    });
    return this;
  }

  get(path: string, handler: RouteHandler, options?: RouteOptions): this {
    return this.add("GET", path, handler, options);
  }

  post(path: string, handler: RouteHandler, options?: RouteOptions): this {
    return this.add("POST", path, handler, options);
  }

  patch(path: string, handler: RouteHandler, options?: RouteOptions): this {
    return this.add("PATCH", path, handler, options);
  }

  delete(path: string, handler: RouteHandler, options?: RouteOptions): this {
    return this.add("DELETE", path, handler, options);
  }

  async handle(request: Request, deps: ApiDependencies): Promise<Response> {
    const url = new URL(request.url);
    const path = normalizeApiPath(url.pathname);
    if (!path) return notFound();

    const matchedRoutes = this.routes.filter(
      (route) => matchPath(route.path, path) !== null,
    );
    if (matchedRoutes.length === 0) return notFound();

    const method = request.method.toUpperCase() as ApiMethod;
    const route = matchedRoutes.find((item) => item.method === method);
    if (!route) {
      return methodNotAllowed([
        ...new Set(matchedRoutes.map((item) => item.method)),
      ]);
    }

    let actor: Actor = anonymousActor;

    try {
      actor = route.public ? anonymousActor : await deps.resolveActor(request);
      const params = matchPath(route.path, path) ?? {};
      return await route.handler({
        request,
        url,
        params,
        actor,
        deps,
      });
    } catch (error) {
      if (
        error instanceof ApiError &&
        [
          "unauthorized",
          "forbidden",
          "member_not_active",
          "invalid_bootstrap_token",
          "onboarding_expired",
          "onboarding_revoked",
        ].includes(error.code)
      ) {
        await recordAuditSafely(deps.repository, {
          ...auditActor(actor),
          action: "security.access_denied",
          targetType: "api",
          targetId: path,
          result: "denied",
          metadata: {
            method: request.method,
            reason: error.code,
          },
        });
      }

      return failure(error);
    }
  }
}
