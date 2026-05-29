import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal X AI Operator",
  description: "Local-first personal X automation dashboard"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
