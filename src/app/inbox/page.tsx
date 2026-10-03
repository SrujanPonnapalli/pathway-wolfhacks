"use client";

import { Suspense } from "react";
import { Gate } from "@/components/ui";
import { Inbox } from "./Inbox";

export default function Page() {
  return (
    <Gate>
      <Suspense>
        <Inbox />
      </Suspense>
    </Gate>
  );
}
