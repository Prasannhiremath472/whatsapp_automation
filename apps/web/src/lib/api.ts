/**
 * Thin fetch client for the Genie REST API (/api/v1).
 *
 * - Adds the bearer token and transparently refreshes it once on a 401.
 * - Throws ApiError with the server's message (and per-field `issues` for
 *   validation failures) so screens can show something useful.
 * - Tokens live in localStorage: they are readable by any script on the page,
 *   so never render untrusted HTML in this app.
 */
export const API_BASE_URL: string =
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:3000/api/v1";

const STORAGE_KEY = "genie.session.v1";

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export const tokenStore = {
  get(): Tokens | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Tokens) : null;
    } catch {
      return null;
    }
  },
  set(tokens: Tokens): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
    } catch {
      /* storage unavailable: session lasts until reload */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  },
};

export const UNAUTHORIZED_EVENT = "genie:unauthorized";

export interface ApiIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly issues: ApiIssue[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query): string {
  const url = new URL(API_BASE_URL + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "")
      url.searchParams.set(key, String(value));
  }
  return url.toString();
}

let refreshing: Promise<boolean> | null = null;

/** Exchanges the refresh token for a new pair. Concurrent callers share one request. */
function refreshTokens(): Promise<boolean> {
  refreshing ??= (async () => {
    const current = tokenStore.get();
    if (!current) return false;
    try {
      const res = await fetch(buildUrl("/auth/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as Tokens;
      tokenStore.set({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  let issues: ApiIssue[] = [];
  try {
    const body = (await res.json()) as { message?: string | string[]; issues?: ApiIssue[] };
    if (Array.isArray(body.message)) message = body.message.join(", ");
    else if (body.message) message = body.message;
    if (Array.isArray(body.issues) && body.issues.length) {
      issues = body.issues;
      message = body.issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join("; ");
    }
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(message, res.status, issues);
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Send a file as the raw request body (its own MIME type becomes the Content-Type). */
  rawBody?: Blob;
  query?: Query;
  signal?: AbortSignal;
  /** Skip auth header / refresh handling (login, refresh). */
  anonymous?: boolean;
}

async function send(path: string, opts: RequestOptions, retried = false): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.rawBody) headers["Content-Type"] = opts.rawBody.type;
  else if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const tokens = opts.anonymous ? null : tokenStore.get();
  if (tokens) headers["Authorization"] = `Bearer ${tokens.accessToken}`;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? "GET",
      headers,
      body: opts.rawBody ?? (opts.body !== undefined ? JSON.stringify(opts.body) : null),
      signal: opts.signal ?? null,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError("Cannot reach the server. Check your connection and try again.", 0);
  }

  if (res.status === 401 && !opts.anonymous && !retried) {
    if (await refreshTokens()) return send(path, opts, true);
    tokenStore.clear();
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  return res;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await send(path, opts);
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Downloads an authenticated endpoint's response as a file (e.g. CSV export). */
export async function downloadFile(path: string, filename: string, query?: Query): Promise<void> {
  const res = await send(path, query ? { query } : {});
  if (!res.ok) throw await parseError(res);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
