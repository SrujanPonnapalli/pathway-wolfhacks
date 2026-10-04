// GET /api/knowledge/viva?profile=maya  ->  the last Viva turns (specialist, ms, tokens, facts used).
// POST { knowledge, courses, course? }  ->  the exact context pack Viva would read, with a token estimate.
import { compileContext, scopeFor } from "@/lib/knowledge/compile";
import { recentTurns } from "@/lib/knowledge/db";
import type { Knowledge } from "@/lib/knowledge/types";
import { route } from "@/lib/intel/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const profile = new URL(req.url).searchParams.get("profile") ?? "maya";
  return Response.json({ turns: await recentTurns(profile, 10) });
});

export const POST = route(async (req) => {
  const b = (await req.json().catch(() => null)) as { knowledge?: Knowledge; courses?: string[]; course?: string } | null;
  const kb = b?.knowledge ?? { sources: [], nodes: [], edges: [] };
  const all = b?.courses ?? [...new Set(kb.nodes.map((n) => n.course))];
  const pack = compileContext(kb, scopeFor("", b?.course, all));
  return Response.json({ text: pack.text, ids: pack.ids, approxTokens: Math.round(pack.text.length / 4) });
});
