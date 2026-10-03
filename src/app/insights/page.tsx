import { Suspense } from "react";
import { Gate } from "@/components/ui";
import { Insights } from "./Insights";

export default function Page() {
  return (
    <Gate>
      <Suspense>
        <Insights />
      </Suspense>
    </Gate>
  );
}
