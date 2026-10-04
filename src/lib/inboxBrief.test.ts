import { test } from "node:test";
import assert from "node:assert/strict";
import { briefKey, ruleBrief } from "./inboxBrief.ts";
import type { Mail } from "./inbox.ts";

const m = (id: string, course: string, at: string, unread: boolean, needsReply = false): Mail => ({ id, course, from: "TA", subject: `s${id}`, snippet: "", body: "", at, unread, needsReply });

test("rule brief: replies first, then check-in courses, then newest; read mail stays out", () => {
  const mail = [m("a", "ST 311", "2026-10-06T09:00", true), m("b", "BIO 181", "2026-10-05T09:00", true), m("c", "MA 241", "2026-10-04T09:00", true, true), m("d", "CSC 216", "2026-10-07T09:00", false)];
  const b = ruleBrief(mail, [{ code: "BIO 181", checkIn: true }, { code: "ST 311", checkIn: false }]);
  assert.deepEqual(b.items.map((i) => i.mail), ["c", "b", "a"]);
  assert.equal(b.items[0].kind, "reply");
  assert.match(b.headline, /3 unread.*1 needs a reply/);
  assert.equal(ruleBrief([], []).items.length, 0);
});

test("brief key changes with mail state and course status, not otherwise", () => {
  const mail = [m("a", "ST 311", "2026-10-06T09:00", true)];
  const k = briefKey(mail, [{ code: "ST 311", checkIn: false }], "2026-10-06");
  assert.equal(k, briefKey(mail, [{ code: "ST 311", checkIn: false }], "2026-10-06"));
  assert.notEqual(k, briefKey(mail, [{ code: "ST 311", checkIn: true }], "2026-10-06"));
  assert.notEqual(k, briefKey([{ ...mail[0], unread: false }], [{ code: "ST 311", checkIn: false }], "2026-10-06"));
});
