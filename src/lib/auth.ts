// Sign in with Google, no auth library. The browser's own button opens Google's account picker
// (Google Identity Services token popup, scopes openid email profile) and sends the short-lived
// access token here. Google's tokeninfo endpoint confirms it was issued to OUR client id (so a
// token minted for another app can't be replayed), then userinfo gives the name and photo.
// We keep a small HMAC-signed session cookie. Demo profiles (no account) stay open to everyone;
// a profile that belongs to a Google account only answers to its session.
import { createHmac, timingSafeEqual } from "node:crypto";

export type GoogleUser = { sub: string; email: string; name?: string; picture?: string };

/** Verify a Google access token and return who it belongs to. Throws on any problem. `get` is injectable for tests. */
export async function verifyAccessToken(token: string, clientId: string, get: (url: string) => Promise<Response> = fetch): Promise<GoogleUser> {
  if (!/^[\w.\-~+/]+=*$/.test(token)) throw new Error("malformed token");
  const info = await get(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
  if (!info.ok) throw new Error("token rejected by Google");
  const t = await info.json();
  if (t.aud !== clientId && t.azp !== clientId) throw new Error("token is for a different app");
  if (!(Number(t.expires_in) > 0)) throw new Error("token expired");
  if (t.email_verified !== true && t.email_verified !== "true") throw new Error("email not verified");
  const u = await get(`https://openidconnect.googleapis.com/v1/userinfo?access_token=${encodeURIComponent(token)}`);
  const user = u.ok ? await u.json() : {};
  if (user.sub && user.sub !== t.sub) throw new Error("token mismatch");
  return { sub: t.sub, email: t.email, name: user.name, picture: user.picture };
}

// ── Session cookie: base64url({p: profile_id, exp}) . HMAC-SHA256 ─────────────────────────
export const COOKIE = "pathway_session";
const DAYS = 30;

function secret(s = process.env.SESSION_SECRET) {
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return s;
}
const mac = (body: string, key: string) => createHmac("sha256", key).update(body).digest("base64url");

export function sign(profileId: string, key = secret()) {
  const body = Buffer.from(JSON.stringify({ p: profileId, exp: Date.now() + DAYS * 86_400_000 })).toString("base64url");
  return `${body}.${mac(body, key)}`;
}

export function unsign(token: string | undefined, key = secret()): string | null {
  const [body, sig] = (token ?? "").split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(mac(body, key));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const { p, exp } = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  return typeof p === "string" && exp > Date.now() ? p : null;
}

/** The signed-in profile id from the request's cookie, or null. */
export function sessionProfile(req: Request) {
  if (!process.env.SESSION_SECRET) return null;
  const raw = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return unsign(raw ? decodeURIComponent(raw) : undefined);
}

export const sessionCookie = (value: string, maxAge = DAYS * 86_400) =>
  `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
