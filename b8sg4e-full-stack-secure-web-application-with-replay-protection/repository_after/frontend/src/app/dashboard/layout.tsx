'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useWebSocket } from '@/lib/websocket';
import toast from 'react-hot-toast';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, isAuthenticated, isLoading, logout } = useAuth();
    const router = useRouter();

    const { status, isConnected } = useWebSocket({
        onMessage: (message) => {
            switch (message.type) {
                case 'PAYMENT_UPDATE':
                    toast.success('Payment status updated');
                    break;
                case 'SECURITY_ALERT':
                    toast.error('Security alert: ' + (message.message || 'Unusual activity detected'));
                    break;
                case 'PROFILE_UPDATED':
                    toast.success(message.message || 'Profile updated');
                    break;
            }
        },
        onOpen: () => {
            console.log('Real-time connection established');
        },
        onClose: () => {
            console.log('Real-time connection closed');
        },
    });

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push('/login');
        }
    }, [isAuthenticated, isLoading, router]);

    const handleLogout = async () => {
        await logout();
        toast.success('Logged out successfully');
        router.push('/login');
    };

    if (isLoading) {
        return (
            <div className="loading-overlay">
                <div className="loading-spinner" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return null;
    }

    return (
        <div style={{ minHeight: '100vh' }}>
            <nav className="navbar">
                <div className="container navbar-content">
                    <Link href="/dashboard" className="navbar-brand">
                        SecureAPI
                    </Link>

                    <div className="navbar-nav">
                        <Link href="/dashboard" className="navbar-link">
                            Dashboard
                        </Link>
                        <Link href="/dashboard/payments" className="navbar-link">
                            Payments
                        </Link>
                        <Link href="/dashboard/profile" className="navbar-link">
                            Profile
                        </Link>
                        {(user?.role === 'admin' || user?.role === 'superadmin') && (
                            <Link href="/dashboard/admin" className="navbar-link">
                                Admin
                            </Link>
                        )}

                        <div className="status-indicator" style={{ marginLeft: '0.5rem' }}>
                            <span className={`status-dot ${isConnected ? 'connected' : status === 'connecting' ? 'connecting' : 'disconnected'}`} />
                            <span className="text-xs text-muted">
                                {isConnected ? 'Live' : status === 'connecting' ? 'Connecting...' : 'Offline'}
                            </span>
                        </div>

                        <button onClick={handleLogout} className="btn btn-secondary btn-sm" style={{ marginLeft: '1rem' }}>
                            Logout
                        </button>
                    </div>
                </div>
            </nav>

            <main>
                {children}
            </main>
        </div>
    );
}
