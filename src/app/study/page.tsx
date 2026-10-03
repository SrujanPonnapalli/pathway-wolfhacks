import { Suspense } from "react";
import { Gate } from "@/components/ui";
import { Study } from "./Study";

export default function Page() {
  return (
    <Gate>
      <Suspense>
        <Study />
      </Suspense>
    </Gate>
  );
}
