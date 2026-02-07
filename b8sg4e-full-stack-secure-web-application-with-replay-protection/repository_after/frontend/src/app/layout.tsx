import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/contexts/AuthContext';
import './globals.css';

export const metadata: Metadata = {
    title: 'SecureAPI - Replay Protected Application',
    description: 'Full-stack secure web application with replay attack protection, JWT authentication, and role-based access control',
    keywords: ['security', 'replay protection', 'authentication', 'jwt', 'next.js'],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
            </head>
            <body>
                <AuthProvider>
                    {children}
                    <Toaster
                        position="top-right"
                        toastOptions={{
                            duration: 4000,
                            style: {
                                background: 'rgba(26, 26, 46, 0.95)',
                                color: '#f8fafc',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                backdropFilter: 'blur(20px)',
                            },
                            success: {
                                iconTheme: {
                                    primary: '#10b981',
                                    secondary: '#f8fafc',
                                },
                            },
                            error: {
                                iconTheme: {
                                    primary: '#ef4444',
                                    secondary: '#f8fafc',
                                },
                            },
                        }}
                    />
                </AuthProvider>
            </body>
        </html>
    );
}
