import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Bone, Gate } from "@/components/ui";
import { CameraAwareness, Device, WakeWord } from "./Device";
import { Stage } from "./Stage";

export const metadata: Metadata = {
  title: "Pathway Beacon",
  description: "Your desk companion for a clearer next step. See your course status, keep your study plan in view, and talk to Viva.",
};

// Kiosk viewport: lock zoom so a double-tap or pinch on the touchscreen can't
// rescale the layout; the page is designed at 1024×600 and the Stage scales that
// design to whatever the screen is (see Stage.tsx).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function Page() {
  return (
    <Stage>
      <Gate fallback={<DeviceSkeleton />}>
        <Suspense>
          <Device />
        </Suspense>
      </Gate>
      <Suspense>
        <CameraAwareness />
      </Suspense>
      <WakeWord />
    </Stage>
  );
}

// The kiosk's own layout while it loads: Viva on the left, the five tiles on the right.
function DeviceSkeleton() {
  return (
    <main className="flex h-full w-full flex-col bg-polar" aria-busy="true" aria-label="Loading Pathway Beacon">
      <header className="flex items-center justify-between px-5 pb-3 pt-3.5">
        <Bone className="h-8 w-32 rounded-xl" />
        <Bone className="h-11 w-28" />
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-5 pb-5">
        <section className="panel flex flex-col items-center justify-center gap-4 p-4">
          <Bone className="size-[121px]" />
          <Bone className="h-7 w-44 rounded-xl" />
          <Bone className="h-4 w-52" />
        </section>
        <div className="grid grid-cols-2 grid-rows-3 gap-3">
          {["", "", "col-span-2", "", ""].map((span, i) => (
            <div key={i} className={`panel space-y-3 p-4 ${span}`}>
              <Bone className="h-3.5 w-20" />
              <Bone className="h-6 w-32" />
              <Bone className="h-3.5 w-24" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
