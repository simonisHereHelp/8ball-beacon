import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "8ball Beacon Bot",
  description: "Local bot runtime for SEC filing polling"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
