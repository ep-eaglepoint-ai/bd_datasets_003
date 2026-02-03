/**
 * Root Layout
 *
 * Next.js App Router root layout component.
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'WealthWire - Transaction Management',
  description: 'Internal settlement system for transaction management and refunds',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-100">
        <header className="bg-white shadow-sm">
          <div className="max-w-4xl mx-auto px-6 py-4">
            <h1 className="text-xl font-bold text-gray-900">
              WealthWire
              <span className="text-sm font-normal text-gray-500 ml-2">
                Transaction Management
              </span>
            </h1>
          </div>
        </header>
        <main className="py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
