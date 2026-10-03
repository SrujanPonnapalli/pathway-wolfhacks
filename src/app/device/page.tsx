import { Suspense } from "react";
import { Gate } from "@/components/ui";
import { Device } from "./Device";

export default function Page() {
  return (
    <Gate>
      <Suspense>
        <Device />
      </Suspense>
    </Gate>
  );
}
