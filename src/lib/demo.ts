// Demo mode: the sample students (Maya, Jordan, Priya) and the blank judge profile only appear
// when this browser entered through /demo. Real visitors see their own account or the front door.
// A plain cookie, not a secret: it changes what's listed, not what anyone may access.
export const DEMO_COOKIE = "pathway_demo";
export const DEMO_IDS = ["maya", "jordan", "priya", "judge"];

/** Browser: is this tab in demo mode? */
export const isDemo = () => typeof document !== "undefined" && document.cookie.split(/;\s*/).includes(`${DEMO_COOKIE}=1`);

/** Browser: turn demo mode on (30 days) or off. */
export function setDemo(on: boolean) {
  document.cookie = `${DEMO_COOKIE}=${on ? "1" : ""}; Path=/; SameSite=Lax; Max-Age=${on ? 30 * 86_400 : 0}`;
}

/** Server: did this request come from a browser in demo mode? */
export const isDemoRequest = (req: Request) => !!req.headers.get("cookie")?.split(/;\s*/).includes(`${DEMO_COOKIE}=1`);
