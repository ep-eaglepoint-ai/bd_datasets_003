import type { ReactNode } from "react";

export const metadata = {
  title: "SwiftTask",
  description: "Shared task board with optimistic concurrency control",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
