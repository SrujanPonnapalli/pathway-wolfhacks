import { Suspense } from "react";
import { Gate } from "@/components/ui";
import { Insights } from "./Insights";

export default function Page() {
  return (
    <Gate wide>
      <Suspense>
        <Insights />
      </Suspense>
    </Gate>
  );
}
