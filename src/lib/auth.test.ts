import { test } from "node:test";
import assert from "node:assert/strict";
import { sign, unsign, verifyAccessToken } from "./auth.ts";

// Fake Google: tokeninfo and userinfo answers keyed by URL.
const google = (info: object | null, user: object = { sub: "123", name: "Ada L", picture: "p.png" }) => async (url: string) =>
  url.includes("tokeninfo") ? (info ? Response.json(info) : new Response("bad", { status: 400 })) : Response.json(user);
const good = { aud: "client", azp: "client", sub: "123", email: "a@ncsu.edu", email_verified: "true", expires_in: "3500" };

test("Google access tokens: accepted only when issued to our client, live and verified", async () => {
  assert.deepEqual(await verifyAccessToken("ya29.ok", "client", google(good)), { sub: "123", email: "a@ncsu.edu", name: "Ada L", picture: "p.png" });
  await assert.rejects(verifyAccessToken("ya29.ok", "client", google({ ...good, aud: "other", azp: "other" })), /different app/);
  await assert.rejects(verifyAccessToken("ya29.ok", "client", google({ ...good, expires_in: "0" })), /expired/);
  await assert.rejects(verifyAccessToken("ya29.ok", "client", google({ ...good, email_verified: "false" })), /verified/);
  await assert.rejects(verifyAccessToken("ya29.ok", "client", google(null)), /rejected/);
  await assert.rejects(verifyAccessToken("ya29.ok", "client", google(good, { sub: "999" })), /mismatch/);
  await assert.rejects(verifyAccessToken("x&aud=client", "client", google(good)), /malformed/);
});

test("session cookies round-trip and reject tampering", () => {
  const key = "x".repeat(40);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const t = sign("g-abc", key);
  assert.equal(unsign(t, key), "g-abc");
  assert.equal(unsign(t, "y".repeat(40)), null);
  const [, mac] = t.split(".");
  assert.equal(unsign(`${b64({ p: "maya", exp: Date.now() + 1e6 })}.${mac}`, key), null);
  assert.equal(unsign(undefined, key), null);
});
