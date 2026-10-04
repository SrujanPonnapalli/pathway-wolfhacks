"use client";

import { Gate } from "@/components/ui";
import { Calendar } from "./Calendar";

export default function Page() {
  return (
    <Gate wide>
      <Calendar />
    </Gate>
  );
}
