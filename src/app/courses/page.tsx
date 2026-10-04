import { Suspense } from "react";
import { Gate } from "@/components/ui";
import { Courses } from "./Courses";

export default function Page() {
  return (
    <Gate wide>
      <Suspense>
        <Courses />
      </Suspense>
    </Gate>
  );
}
