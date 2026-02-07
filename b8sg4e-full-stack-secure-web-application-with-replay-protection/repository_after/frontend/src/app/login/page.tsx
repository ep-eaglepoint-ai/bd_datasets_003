'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [totpToken, setTotpToken] = useState('');
    const [requires2FA, setRequires2FA] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [errors, setErrors] = useState<{ email?: string; password?: string; totp?: string }>({});

    const { login } = useAuth();
    const router = useRouter();

    const validateForm = () => {
        const newErrors: { email?: string; password?: string; totp?: string } = {};

        if (!email) {
            newErrors.email = 'Email is required';
        } else if (!/\S+@\S+\.\S+/.test(email)) {
            newErrors.email = 'Please enter a valid email';
        }

        if (!password) {
            newErrors.password = 'Password is required';
        } else if (password.length < 6) {
            newErrors.password = 'Password must be at least 6 characters';
        }

        if (requires2FA && !totpToken) {
            newErrors.totp = '2FA token is required';
        } else if (requires2FA && !/^\d{6}$/.test(totpToken)) {
            newErrors.totp = 'Enter a valid 6-digit code';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        if (!validateForm()) return;

        setIsLoading(true);

        try {
            const result = await login(email, password, requires2FA ? totpToken : undefined);

            if (result.success) {
                toast.success('Welcome back!');
                router.push('/dashboard');
            } else if (result.requires2FA) {
                setRequires2FA(true);
                toast('Please enter your 2FA code', { icon: '🔐' });
            } else {
                toast.error(result.error || 'Login failed');
            }
        } catch {
            toast.error('An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center" style={{ minHeight: '100vh', padding: '2rem' }}>
            <div className="card" style={{ width: '100%', maxWidth: '24rem' }}>
                <div className="card-header text-center">
                    <h1 className="page-title" style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>
                        Welcome Back
                    </h1>
                    <p className="text-secondary text-sm">
                        Sign in to your secure account
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="card-body">
                    <div className="form-group">
                        <label htmlFor="email" className="form-label">Email Address</label>
                        <input
                            type="email"
                            id="email"
                            className={`form-input ${errors.email ? 'error' : ''}`}
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={isLoading}
                        />
                        {errors.email && <p className="form-error">{errors.email}</p>}
                    </div>

                    <div className="form-group">
                        <label htmlFor="password" className="form-label">Password</label>
                        <input
                            type="password"
                            id="password"
                            className={`form-input ${errors.password ? 'error' : ''}`}
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={isLoading}
                        />
                        {errors.password && <p className="form-error">{errors.password}</p>}
                    </div>

                    {requires2FA && (
                        <div className="form-group">
                            <label htmlFor="totpToken" className="form-label">2FA Code</label>
                            <input
                                type="text"
                                id="totpToken"
                                className={`form-input ${errors.totp ? 'error' : ''}`}
                                placeholder="000000"
                                value={totpToken}
                                onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                disabled={isLoading}
                                maxLength={6}
                                autoFocus
                            />
                            {errors.totp && <p className="form-error">{errors.totp}</p>}
                            <p className="form-hint">Enter the 6-digit code from your authenticator app</p>
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary w-full"
                        disabled={isLoading}
                        style={{ marginTop: '1rem' }}
                    >
                        {isLoading ? (
                            <>
                                <span className="spinner" />
                                Signing in...
                            </>
                        ) : (
                            'Sign In'
                        )}
                    </button>
                </form>

                <div className="card-footer text-center">
                    <p className="text-sm text-secondary">
                        Don&apos;t have an account?{' '}
                        <Link href="/register" className="font-semibold">
                            Create one
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
