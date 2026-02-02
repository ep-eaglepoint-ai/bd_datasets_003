import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Collaborative Todo App',
  description: 'Real-time collaborative todo app with offline sync and conflict resolution',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
