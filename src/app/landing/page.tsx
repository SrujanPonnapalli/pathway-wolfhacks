import type { Metadata } from "next";
import LandingPage from "./LandingPage";
import "./landing.css";

export const metadata: Metadata = {
  title: "Pathway | A clearer way through the semester",
  description: "See where you stand, understand why, and turn your next step into a real plan. Meet Pathway, a calmer study companion.",
};

export default function Page() {
  return <LandingPage />;
}
