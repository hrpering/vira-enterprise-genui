import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "../../airline-brand-kit/styles/base.css";
import "../../airline-brand-kit/styles/booking-flow.css";
import "./guidance.css";

export const metadata: Metadata = {
  title: "Airline Assistant · Vira GenUI",
  description: "Real LLM chat connected to Vira Enterprise GenUI.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
