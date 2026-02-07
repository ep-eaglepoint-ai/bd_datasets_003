'use client';

import { useState, FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import toast from 'react-hot-toast';

export default function ProfilePage() {
    const { user, refreshUser } = useAuth();
    const {
        isLoading,
        updateProfile,
        changePassword,
        deleteAccount,
        setup2FA,
        verify2FA,
        disable2FA,
    } = useProfile();

    const [profileForm, setProfileForm] = useState({
        firstName: user?.firstName || '',
        lastName: user?.lastName || '',
        phone: user?.phone || '',
    });

    const [passwordForm, setPasswordForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        twoFactorToken: '',
    });

    const [deleteForm, setDeleteForm] = useState({
        password: '',
        twoFactorToken: '',
    });

    const [twoFASetup, setTwoFASetup] = useState<{
        secret: string;
        qrCode: string;
    } | null>(null);
    const [twoFAToken, setTwoFAToken] = useState('');
    const [activeSection, setActiveSection] = useState<'profile' | 'password' | '2fa' | 'delete'>('profile');

    const handleUpdateProfile = async (e: FormEvent) => {
        e.preventDefault();

        const result = await updateProfile(profileForm);

        if (result.success) {
            toast.success('Profile updated successfully');
            await refreshUser();
        } else {
            toast.error(result.error || 'Failed to update profile');
        }
    };

    const handleChangePassword = async (e: FormEvent) => {
        e.preventDefault();

        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        if (passwordForm.newPassword.length < 8) {
            toast.error('Password must be at least 8 characters');
            return;
        }

        const result = await changePassword(
            passwordForm.currentPassword,
            passwordForm.newPassword,
            user?.twoFactorEnabled ? passwordForm.twoFactorToken : undefined
        );

        if (result.success) {
            toast.success('Password changed. Please login again.');
        } else {
            toast.error(result.error || 'Failed to change password');
        }
    };

    const handleSetup2FA = async () => {
        const result = await setup2FA();

        if (result.success && result.secret && result.qrCode) {
            setTwoFASetup({ secret: result.secret, qrCode: result.qrCode });
        } else {
            toast.error(result.error || 'Failed to setup 2FA');
        }
    };

    const handleVerify2FA = async () => {
        if (!/^\d{6}$/.test(twoFAToken)) {
            toast.error('Enter a valid 6-digit code');
            return;
        }

        const result = await verify2FA(twoFAToken);

        if (result.success) {
            toast.success('2FA enabled successfully');
            setTwoFASetup(null);
            setTwoFAToken('');
            await refreshUser();
        } else {
            toast.error(result.error || 'Invalid token');
        }
    };

    const handleDisable2FA = async () => {
        if (!/^\d{6}$/.test(twoFAToken)) {
            toast.error('Enter a valid 6-digit code');
            return;
        }

        const result = await disable2FA(twoFAToken);

        if (result.success) {
            toast.success('2FA disabled successfully');
            setTwoFAToken('');
            await refreshUser();
        } else {
            toast.error(result.error || 'Invalid token');
        }
    };

    const handleDeleteAccount = async (e: FormEvent) => {
        e.preventDefault();

        if (!confirm('Are you absolutely sure? This action cannot be undone.')) {
            return;
        }

        const result = await deleteAccount(
            deleteForm.password,
            user?.twoFactorEnabled ? deleteForm.twoFactorToken : undefined
        );

        if (result.success) {
            toast.success('Account deleted');
        } else {
            toast.error(result.error || 'Failed to delete account');
        }
    };

    return (
        <div className="container py-8">
            <div className="mb-6">
                <h1 className="page-title" style={{ fontSize: '1.75rem' }}>Profile Settings</h1>
                <p className="text-secondary">Manage your account and security</p>
            </div>

            <div className="grid" style={{ gridTemplateColumns: '240px 1fr', gap: '1.5rem' }}>
                <div className="card" style={{ height: 'fit-content' }}>
                    <div className="card-body" style={{ padding: 0 }}>
                        <nav>
                            {[
                                { key: 'profile', label: 'Profile', icon: '👤' },
                                { key: 'password', label: 'Password', icon: '🔑' },
                                { key: '2fa', label: 'Two-Factor Auth', icon: '🛡️' },
                                { key: 'delete', label: 'Delete Account', icon: '⚠️' },
                            ].map((item) => (
                                <button
                                    key={item.key}
                                    onClick={() => setActiveSection(item.key as typeof activeSection)}
                                    className="w-full text-left"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.75rem',
                                        padding: '1rem 1.25rem',
                                        background: activeSection === item.key ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                                        border: 'none',
                                        borderLeft: activeSection === item.key ? '3px solid var(--primary)' : '3px solid transparent',
                                        color: activeSection === item.key ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        transition: 'all var(--transition-fast)',
                                    }}
                                >
                                    <span>{item.icon}</span>
                                    <span>{item.label}</span>
                                </button>
                            ))}
                        </nav>
                    </div>
                </div>

                <div className="card">
                    <div className="card-body">
                        {activeSection === 'profile' && (
                            <form onSubmit={handleUpdateProfile}>
                                <h2 className="font-semibold mb-4">Profile Information</h2>

                                <div className="form-group">
                                    <label className="form-label">Email</label>
                                    <input
                                        type="email"
                                        className="form-input"
                                        value={user?.email}
                                        disabled
                                        style={{ opacity: 0.6 }}
                                    />
                                    <p className="form-hint">Email cannot be changed</p>
                                </div>

                                <div className="grid grid-2" style={{ gap: '1rem' }}>
                                    <div className="form-group">
                                        <label className="form-label">First Name</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={profileForm.firstName}
                                            onChange={(e) => setProfileForm(prev => ({ ...prev, firstName: e.target.value }))}
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Last Name</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={profileForm.lastName}
                                            onChange={(e) => setProfileForm(prev => ({ ...prev, lastName: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Phone (Optional)</label>
                                    <input
                                        type="tel"
                                        className="form-input"
                                        value={profileForm.phone}
                                        onChange={(e) => setProfileForm(prev => ({ ...prev, phone: e.target.value }))}
                                    />
                                </div>

                                <button type="submit" className="btn btn-primary" disabled={isLoading}>
                                    {isLoading ? 'Saving...' : 'Save Changes'}
                                </button>
                            </form>
                        )}

                        {activeSection === 'password' && (
                            <form onSubmit={handleChangePassword}>
                                <h2 className="font-semibold mb-4">Change Password</h2>

                                <div className="form-group">
                                    <label className="form-label">Current Password</label>
                                    <input
                                        type="password"
                                        className="form-input"
                                        value={passwordForm.currentPassword}
                                        onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">New Password</label>
                                    <input
                                        type="password"
                                        className="form-input"
                                        value={passwordForm.newPassword}
                                        onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Confirm New Password</label>
                                    <input
                                        type="password"
                                        className="form-input"
                                        value={passwordForm.confirmPassword}
                                        onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                                    />
                                </div>

                                {user?.twoFactorEnabled && (
                                    <div className="form-group">
                                        <label className="form-label">2FA Code</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="000000"
                                            maxLength={6}
                                            value={passwordForm.twoFactorToken}
                                            onChange={(e) => setPasswordForm(prev => ({ ...prev, twoFactorToken: e.target.value.replace(/\D/g, '') }))}
                                        />
                                    </div>
                                )}

                                <button type="submit" className="btn btn-primary" disabled={isLoading}>
                                    {isLoading ? 'Changing...' : 'Change Password'}
                                </button>
                            </form>
                        )}

                        {activeSection === '2fa' && (
                            <div>
                                <h2 className="font-semibold mb-4">Two-Factor Authentication</h2>

                                {user?.twoFactorEnabled ? (
                                    <div>
                                        <div className="alert alert-success mb-4">
                                            <span>✓</span>
                                            <span>Two-factor authentication is enabled</span>
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label">Enter 2FA code to disable</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                placeholder="000000"
                                                maxLength={6}
                                                value={twoFAToken}
                                                onChange={(e) => setTwoFAToken(e.target.value.replace(/\D/g, ''))}
                                            />
                                        </div>

                                        <button
                                            onClick={handleDisable2FA}
                                            className="btn btn-danger"
                                            disabled={isLoading}
                                        >
                                            {isLoading ? 'Disabling...' : 'Disable 2FA'}
                                        </button>
                                    </div>
                                ) : twoFASetup ? (
                                    <div>
                                        <p className="text-secondary mb-4">
                                            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                                        </p>

                                        <div className="text-center mb-4" style={{
                                            background: 'white',
                                            padding: '1rem',
                                            borderRadius: 'var(--radius-lg)',
                                            display: 'inline-block',
                                        }}>
                                            <img src={twoFASetup.qrCode} alt="2FA QR Code" style={{ display: 'block' }} />
                                        </div>

                                        <div className="alert alert-info mb-4">
                                            <span>Secret key: <code style={{ wordBreak: 'break-all' }}>{twoFASetup.secret}</code></span>
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label">Verification Code</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                placeholder="000000"
                                                maxLength={6}
                                                value={twoFAToken}
                                                onChange={(e) => setTwoFAToken(e.target.value.replace(/\D/g, ''))}
                                            />
                                            <p className="form-hint">Enter the 6-digit code from your authenticator app</p>
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleVerify2FA}
                                                className="btn btn-primary"
                                                disabled={isLoading}
                                            >
                                                {isLoading ? 'Verifying...' : 'Verify & Enable'}
                                            </button>
                                            <button
                                                onClick={() => { setTwoFASetup(null); setTwoFAToken(''); }}
                                                className="btn btn-secondary"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <p className="text-secondary mb-4">
                                            Add an extra layer of security to your account by enabling two-factor authentication.
                                        </p>

                                        <button
                                            onClick={handleSetup2FA}
                                            className="btn btn-primary"
                                            disabled={isLoading}
                                        >
                                            {isLoading ? 'Setting up...' : 'Setup 2FA'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeSection === 'delete' && (
                            <form onSubmit={handleDeleteAccount}>
                                <h2 className="font-semibold mb-4 text-danger">Delete Account</h2>

                                <div className="alert alert-error mb-4">
                                    <span>⚠️</span>
                                    <span>This action is irreversible. All your data will be permanently deleted.</span>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Password</label>
                                    <input
                                        type="password"
                                        className="form-input"
                                        value={deleteForm.password}
                                        onChange={(e) => setDeleteForm(prev => ({ ...prev, password: e.target.value }))}
                                    />
                                </div>

                                {user?.twoFactorEnabled && (
                                    <div className="form-group">
                                        <label className="form-label">2FA Code</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="000000"
                                            maxLength={6}
                                            value={deleteForm.twoFactorToken}
                                            onChange={(e) => setDeleteForm(prev => ({ ...prev, twoFactorToken: e.target.value.replace(/\D/g, '') }))}
                                        />
                                    </div>
                                )}

                                <button type="submit" className="btn btn-danger" disabled={isLoading}>
                                    {isLoading ? 'Deleting...' : 'Delete My Account'}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
