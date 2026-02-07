'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

export default function RegisterPage() {
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        firstName: '',
        lastName: '',
        phone: '',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const { register } = useAuth();
    const router = useRouter();

    const validateForm = () => {
        const newErrors: Record<string, string> = {};

        if (!formData.firstName.trim()) {
            newErrors.firstName = 'First name is required';
        }

        if (!formData.lastName.trim()) {
            newErrors.lastName = 'Last name is required';
        }

        if (!formData.email) {
            newErrors.email = 'Email is required';
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
            newErrors.email = 'Please enter a valid email';
        }

        if (!formData.password) {
            newErrors.password = 'Password is required';
        } else if (formData.password.length < 8) {
            newErrors.password = 'Password must be at least 8 characters';
        } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
            newErrors.password = 'Password must contain uppercase, lowercase, and number';
        }

        if (formData.password !== formData.confirmPassword) {
            newErrors.confirmPassword = 'Passwords do not match';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        if (!validateForm()) return;

        setIsLoading(true);

        try {
            const result = await register({
                email: formData.email,
                password: formData.password,
                firstName: formData.firstName,
                lastName: formData.lastName,
                phone: formData.phone || undefined,
            });

            if (result.success) {
                toast.success('Account created successfully!');
                router.push('/dashboard');
            } else {
                toast.error(result.error || 'Registration failed');
            }
        } catch {
            toast.error('An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center" style={{ minHeight: '100vh', padding: '2rem' }}>
            <div className="card" style={{ width: '100%', maxWidth: '28rem' }}>
                <div className="card-header text-center">
                    <h1 className="page-title" style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>
                        Create Account
                    </h1>
                    <p className="text-secondary text-sm">
                        Join our secure platform today
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="card-body">
                    <div className="grid grid-2" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                            <label htmlFor="firstName" className="form-label">First Name</label>
                            <input
                                type="text"
                                id="firstName"
                                name="firstName"
                                className={`form-input ${errors.firstName ? 'error' : ''}`}
                                placeholder="John"
                                value={formData.firstName}
                                onChange={handleChange}
                                disabled={isLoading}
                            />
                            {errors.firstName && <p className="form-error">{errors.firstName}</p>}
                        </div>

                        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                            <label htmlFor="lastName" className="form-label">Last Name</label>
                            <input
                                type="text"
                                id="lastName"
                                name="lastName"
                                className={`form-input ${errors.lastName ? 'error' : ''}`}
                                placeholder="Doe"
                                value={formData.lastName}
                                onChange={handleChange}
                                disabled={isLoading}
                            />
                            {errors.lastName && <p className="form-error">{errors.lastName}</p>}
                        </div>
                    </div>

                    <div className="form-group">
                        <label htmlFor="email" className="form-label">Email Address</label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            className={`form-input ${errors.email ? 'error' : ''}`}
                            placeholder="you@example.com"
                            value={formData.email}
                            onChange={handleChange}
                            disabled={isLoading}
                        />
                        {errors.email && <p className="form-error">{errors.email}</p>}
                    </div>

                    <div className="form-group">
                        <label htmlFor="phone" className="form-label">Phone (Optional)</label>
                        <input
                            type="tel"
                            id="phone"
                            name="phone"
                            className="form-input"
                            placeholder="+1 234 567 8900"
                            value={formData.phone}
                            onChange={handleChange}
                            disabled={isLoading}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password" className="form-label">Password</label>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            className={`form-input ${errors.password ? 'error' : ''}`}
                            placeholder="••••••••"
                            value={formData.password}
                            onChange={handleChange}
                            disabled={isLoading}
                        />
                        {errors.password && <p className="form-error">{errors.password}</p>}
                        <p className="form-hint">Min 8 characters with uppercase, lowercase, and number</p>
                    </div>

                    <div className="form-group">
                        <label htmlFor="confirmPassword" className="form-label">Confirm Password</label>
                        <input
                            type="password"
                            id="confirmPassword"
                            name="confirmPassword"
                            className={`form-input ${errors.confirmPassword ? 'error' : ''}`}
                            placeholder="••••••••"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            disabled={isLoading}
                        />
                        {errors.confirmPassword && <p className="form-error">{errors.confirmPassword}</p>}
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary w-full"
                        disabled={isLoading}
                        style={{ marginTop: '1rem' }}
                    >
                        {isLoading ? (
                            <>
                                <span className="spinner" />
                                Creating Account...
                            </>
                        ) : (
                            'Create Account'
                        )}
                    </button>
                </form>

                <div className="card-footer text-center">
                    <p className="text-sm text-secondary">
                        Already have an account?{' '}
                        <Link href="/login" className="font-semibold">
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
