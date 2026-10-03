// POST multipart { file (csv), question?, target? }  ->  { profile, insights }
// GET ?question=...  ->  same, over data/student_outcomes.csv (the WolfHacks dataset)
// Numbers are computed in code; Gemini only interprets them.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { interpretDataset, profileDataset } from "@/lib/intel/dataset";
import { readUpload, route, str } from "@/lib/intel/http";

export const POST = route(async (req) => {
  const { bytes, form } = await readUpload(req);
  const profile = profileDataset(bytes.toString("utf8"), { target: str(form.get("target")) || undefined });
  const insights = str(form.get("skip_ai")) === "1" ? null : await interpretDataset(profile, str(form.get("question")) || undefined);
  return Response.json({ profile, insights });
});

export const GET = route(async (req) => {
  const url = new URL(req.url);
  const csv = await readFile(path.join(process.cwd(), "data", "student_outcomes.csv"), "utf8");
  const profile = profileDataset(csv, { target: url.searchParams.get("target") ?? "at_risk" });
  const insights = url.searchParams.get("skip_ai") === "1" ? null : await interpretDataset(profile, url.searchParams.get("question") ?? undefined);
  return Response.json({ profile, insights });
});
