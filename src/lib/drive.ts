// Pick files from the student's Google Drive with Google's own Picker. Scope is drive.file: Pathway
// can open only the files the student picks (non-sensitive, no "unverified app" screen), asked for
// at the moment it's needed (incremental authorization), never at sign-in.
// Needs NEXT_PUBLIC_GOOGLE_CLIENT_ID, NEXT_PUBLIC_GOOGLE_API_KEY, and the Picker + Drive APIs enabled.
import { script as loadGis } from "./gcalPersonal";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
const APP_ID = CLIENT_ID?.split("-")[0]; // the Cloud project number
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const TYPES = ["application/pdf", "image/png", "image/jpeg", "text/plain", "application/vnd.google-apps.document"].join(",");

type Doc = { id: string; name: string; mimeType: string };
type PickerNs = {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (id?: string) => { setMimeTypes(t: string): unknown; setIncludeFolders(b: boolean): unknown };
  ViewId: { DOCS: string };
  Feature: { MULTISELECT_ENABLED: string };
  Action: { PICKED: string; CANCEL: string };
};
type PickerBuilder = {
  addView(v: unknown): PickerBuilder;
  enableFeature(f: string): PickerBuilder;
  setOAuthToken(t: string): PickerBuilder;
  setDeveloperKey(k: string): PickerBuilder;
  setAppId(a: string): PickerBuilder;
  setTitle(t: string): PickerBuilder;
  setCallback(cb: (d: { action: string; docs?: Doc[] }) => void): PickerBuilder;
  build(): { setVisible(v: boolean): void };
};
type G = { picker?: PickerNs; accounts?: NonNullable<Window["google"]>["accounts"] };
type Gapi = { load(lib: string, cb: () => void): void };
const win = () => window as unknown as { google?: G; gapi?: Gapi };

export const driveReady = () => !!(CLIENT_ID && API_KEY);

let token: { value: string; exp: number } | null = null;

function loadPicker(): Promise<void> {
  if (win().google?.picker) return Promise.resolve();
  return new Promise((res, rej) => {
    const go = () => win().gapi!.load("picker", () => res());
    if (win().gapi) return go();
    const s = document.createElement("script");
    s.src = "https://apis.google.com/js/api.js";
    s.onload = go;
    s.onerror = () => rej(new Error("Couldn't load Google Drive."));
    document.head.appendChild(s);
  });
}

/** Load both Google scripts ahead of the click, so the consent popup opens straight from the tap. */
export const prepareDrive = () => (driveReady() ? Promise.all([loadGis(), loadPicker()]).then(() => {}) : Promise.resolve());

/** Call from a click. Resolves with the picked files as File objects (Google Docs come as PDF), or [] if cancelled. */
export function pickFromDrive(): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const oauth = win().google?.accounts?.oauth2;
    if (!driveReady() || !oauth || !win().google?.picker) return reject(new Error("Google Drive is still loading. Try again in a second."));
    const open = (accessToken: string) => {
      const p = win().google!.picker!;
      const view = new p.DocsView(p.ViewId.DOCS);
      view.setMimeTypes(TYPES);
      view.setIncludeFolders(true);
      new p.PickerBuilder()
        .addView(view)
        .enableFeature(p.Feature.MULTISELECT_ENABLED)
        .setOAuthToken(accessToken)
        .setDeveloperKey(API_KEY!)
        .setAppId(APP_ID!)
        .setTitle("Pick your syllabi")
        .setCallback((d) => {
          if (d.action === p.Action.CANCEL) resolve([]);
          if (d.action === p.Action.PICKED) download(accessToken, d.docs ?? []).then(resolve, reject);
        })
        .build()
        .setVisible(true);
    };
    if (token && token.exp > Date.now()) return open(token.value);
    oauth
      .initTokenClient({
        client_id: CLIENT_ID!,
        scope: SCOPE,
        callback: (r) => {
          if (!r.access_token) return resolve([]);
          token = { value: r.access_token, exp: Date.now() + ((r.expires_in ?? 3600) - 60) * 1000 };
          open(r.access_token);
        },
        error_callback: () => resolve([]),
      })
      .requestAccessToken();
  });
}

async function download(accessToken: string, docs: Doc[]) {
  return Promise.all(
    docs.map(async (d) => {
      const gdoc = d.mimeType === "application/vnd.google-apps.document";
      const url = `https://www.googleapis.com/drive/v3/files/${d.id}${gdoc ? "/export?mimeType=application/pdf" : "?alt=media"}`;
      const r = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
      if (!r.ok) throw new Error(`Couldn't open ${d.name} from Drive.`);
      return new File([await r.blob()], gdoc ? `${d.name}.pdf` : d.name, { type: gdoc ? "application/pdf" : d.mimeType });
    }),
  );
}
