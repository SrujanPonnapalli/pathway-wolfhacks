import { Suspense } from "react";
import { Gate } from "@/components/ui";
import { VivaPage } from "./VivaPage";

export default function Page() {
  return (
    <Gate>
      <Suspense>
        <VivaPage />
      </Suspense>
    </Gate>
  );
}
