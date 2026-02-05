'use client';

import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

export default function DashboardPage() {
    const { user } = useAuth();

    return (
        <div className="container py-8">
            <div className="page-header" style={{ textAlign: 'left', paddingBottom: '2rem' }}>
                <h1 className="page-title">
                    Welcome, {user?.firstName}!
                </h1>
                <p className="page-subtitle">
                    Your secure dashboard with replay protection
                </p>
            </div>

            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                <div className="card">
                    <div className="card-body">
                        <div className="flex items-center gap-4" style={{ marginBottom: '1rem' }}>
                            <div style={{
                                width: '3rem',
                                height: '3rem',
                                borderRadius: 'var(--radius-lg)',
                                background: 'var(--gradient-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1.5rem',
                            }}>
                                🛡️
                            </div>
                            <div>
                                <h3 className="font-semibold">Security Status</h3>
                                <p className="text-sm text-muted">Account protection level</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 mb-4">
                            <span className={`badge ${user?.twoFactorEnabled ? 'badge-success' : 'badge-warning'}`}>
                                {user?.twoFactorEnabled ? '2FA Enabled' : '2FA Disabled'}
                            </span>
                            <span className="badge badge-primary">
                                {user?.role.toUpperCase()}
                            </span>
                        </div>

                        <Link href="/dashboard/profile" className="btn btn-secondary btn-sm w-full">
                            Manage Security
                        </Link>
                    </div>
                </div>

                <div className="card">
                    <div className="card-body">
                        <div className="flex items-center gap-4" style={{ marginBottom: '1rem' }}>
                            <div style={{
                                width: '3rem',
                                height: '3rem',
                                borderRadius: 'var(--radius-lg)',
                                background: 'var(--gradient-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1.5rem',
                            }}>
                                💳
                            </div>
                            <div>
                                <h3 className="font-semibold">Payments</h3>
                                <p className="text-sm text-muted">Manage transactions</p>
                            </div>
                        </div>

                        <p className="text-secondary text-sm mb-4">
                            Process secure payments protected by replay attack prevention and signature verification.
                        </p>

                        <Link href="/dashboard/payments" className="btn btn-secondary btn-sm w-full">
                            View Payments
                        </Link>
                    </div>
                </div>

                <div className="card">
                    <div className="card-body">
                        <div className="flex items-center gap-4" style={{ marginBottom: '1rem' }}>
                            <div style={{
                                width: '3rem',
                                height: '3rem',
                                borderRadius: 'var(--radius-lg)',
                                background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1.5rem',
                            }}>
                                👤
                            </div>
                            <div>
                                <h3 className="font-semibold">Profile</h3>
                                <p className="text-sm text-muted">Account settings</p>
                            </div>
                        </div>

                        <p className="text-secondary text-sm mb-4">
                            Update your profile information, change password, and manage two-factor authentication.
                        </p>

                        <Link href="/dashboard/profile" className="btn btn-secondary btn-sm w-full">
                            Edit Profile
                        </Link>
                    </div>
                </div>
            </div>

            <div className="card mt-8">
                <div className="card-header">
                    <h2 className="font-semibold">How Replay Protection Works</h2>
                </div>
                <div className="card-body">
                    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                        <div className="text-center">
                            <div style={{
                                width: '4rem',
                                height: '4rem',
                                margin: '0 auto 1rem',
                                borderRadius: '50%',
                                background: 'rgba(99, 102, 241, 0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1.5rem',
                            }}>
                                🔑
                            </div>
                            <h4 className="font-semibold mb-2">1. Nonce Generation</h4>
                            <p className="text-sm text-muted">
                                A cryptographically secure unique identifier is generated for each request
                            </p>
                        </div>

                        <div className="text-center">
                            <div style={{
                                width: '4rem',
                                height: '4rem',
                                margin: '0 auto 1rem',
                                borderRadius: '50%',
                                background: 'rgba(16, 185, 129, 0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1.5rem',
                            }}>
                                ⏰
                            </div>
                            <h4 className="font-semibold mb-2">2. Timestamp Expiry</h4>
                            <p className="text-sm text-muted">
                                Each request includes a timestamp validated within a 5-minute window
                            </p>
                        </div>

                        <div className="text-center">
                            <div style={{
                                width: '4rem',
                                height: '4rem',
                                margin: '0 auto 1rem',
                                borderRadius: '50%',
                                background: 'rgba(59, 130, 246, 0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1.5rem',
                            }}>
                                ✍️
                            </div>
                            <h4 className="font-semibold mb-2">3. HMAC Signature</h4>
                            <p className="text-sm text-muted">
                                Request payload is signed using HMAC-SHA256 for integrity verification
                            </p>
                        </div>

                        <div className="text-center">
                            <div style={{
                                width: '4rem',
                                height: '4rem',
                                margin: '0 auto 1rem',
                                borderRadius: '50%',
                                background: 'rgba(239, 68, 68, 0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1.5rem',
                            }}>
                                🚫
                            </div>
                            <h4 className="font-semibold mb-2">4. Replay Rejection</h4>
                            <p className="text-sm text-muted">
                                Used nonces are stored and any reuse attempt is immediately rejected
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
