import { test } from "node:test";
import assert from "node:assert/strict";
import { easternToUtc } from "./time.ts";

test("Eastern wall-clock time converts to UTC across DST", () => {
  assert.equal(easternToUtc("2026-10-06T09:35"), "2026-10-06T13:35:00.000Z"); // EDT, UTC-4
  assert.equal(easternToUtc("2026-12-01T09:35"), "2026-12-01T14:35:00.000Z"); // EST, UTC-5
});
