import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Gate } from "@/components/ui";
import { CameraAwareness, Device, WakeWord } from "./Device";
import { Stage } from "./Stage";

export const metadata: Metadata = { title: "Pathway Device" };

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
      <Gate>
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
