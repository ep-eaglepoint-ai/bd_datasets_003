'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

interface AdminUser {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    twoFactorEnabled: boolean;
    isDeleted: boolean;
    createdAt: string;
}

export default function AdminPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showDeleted, setShowDeleted] = useState(false);
    const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
    const [newRole, setNewRole] = useState('');
    const [twoFactorToken, setTwoFactorToken] = useState('');

    useEffect(() => {
        if (user && user.role !== 'admin' && user.role !== 'superadmin') {
            router.push('/dashboard');
            return;
        }
        fetchUsers();
    }, [user, router, showDeleted]);

    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            const response = await api.get<{ users: AdminUser[] }>(
                `/users/all?includeDeleted=${showDeleted}`,
                { requiresAuth: true }
            );

            if (response.success && response.data) {
                setUsers(response.data.users);
            }
        } catch (error) {
            toast.error('Failed to fetch users');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRoleChange = async () => {
        if (!selectedUser || !newRole) return;

        try {
            const response = await api.put(
                `/users/${selectedUser.id}/role`,
                { role: newRole },
                {
                    requiresAuth: true,
                    requiresReplayProtection: true,
                    twoFactorToken: user?.twoFactorEnabled ? twoFactorToken : undefined,
                }
            );

            if (response.success) {
                toast.success('Role updated successfully');
                setSelectedUser(null);
                setNewRole('');
                setTwoFactorToken('');
                fetchUsers();
            } else {
                toast.error(response.message || 'Failed to update role');
            }
        } catch (error) {
            toast.error('An error occurred');
        }
    };

    const handleRestore = async (userId: string) => {
        try {
            const response = await api.post(
                `/users/${userId}/restore`,
                {},
                { requiresAuth: true, requiresReplayProtection: true }
            );

            if (response.success) {
                toast.success('User restored successfully');
                fetchUsers();
            } else {
                toast.error(response.message || 'Failed to restore user');
            }
        } catch (error) {
            toast.error('An error occurred');
        }
    };

    const getRoleBadge = (role: string) => {
        switch (role) {
            case 'superadmin':
                return 'badge-danger';
            case 'admin':
                return 'badge-warning';
            default:
                return 'badge-primary';
        }
    };

    return (
        <div className="container py-8">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="page-title" style={{ fontSize: '1.75rem' }}>Admin Panel</h1>
                    <p className="text-secondary">Manage users and permissions</p>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={showDeleted}
                        onChange={(e) => setShowDeleted(e.target.checked)}
                        style={{ width: '1rem', height: '1rem' }}
                    />
                    <span className="text-sm">Show deleted users</span>
                </label>
            </div>

            <div className="card">
                <div className="card-body" style={{ padding: 0 }}>
                    {isLoading ? (
                        <div className="flex justify-center items-center py-8">
                            <div className="spinner" />
                        </div>
                    ) : (
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Security</th>
                                    <th>Status</th>
                                    <th>Joined</th>
                                    <th className="text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((adminUser) => (
                                    <tr key={adminUser.id} style={{ opacity: adminUser.isDeleted ? 0.6 : 1 }}>
                                        <td className="font-semibold">
                                            {adminUser.firstName} {adminUser.lastName}
                                        </td>
                                        <td className="text-muted text-sm">{adminUser.email}</td>
                                        <td>
                                            <span className={`badge ${getRoleBadge(adminUser.role)}`}>
                                                {adminUser.role}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`badge ${adminUser.twoFactorEnabled ? 'badge-success' : 'badge-warning'}`}>
                                                {adminUser.twoFactorEnabled ? '2FA On' : '2FA Off'}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`badge ${adminUser.isDeleted ? 'badge-danger' : 'badge-success'}`}>
                                                {adminUser.isDeleted ? 'Deleted' : 'Active'}
                                            </span>
                                        </td>
                                        <td className="text-muted text-sm">
                                            {new Date(adminUser.createdAt).toLocaleDateString()}
                                        </td>
                                        <td className="text-right">
                                            <div className="flex justify-end gap-2">
                                                {user?.role === 'superadmin' && adminUser.id !== user.id && !adminUser.isDeleted && (
                                                    <button
                                                        onClick={() => {
                                                            setSelectedUser(adminUser);
                                                            setNewRole(adminUser.role);
                                                        }}
                                                        className="btn btn-secondary btn-sm"
                                                    >
                                                        Change Role
                                                    </button>
                                                )}
                                                {adminUser.isDeleted && (
                                                    <button
                                                        onClick={() => handleRestore(adminUser.id)}
                                                        className="btn btn-primary btn-sm"
                                                    >
                                                        Restore
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {selectedUser && (
                <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">Change User Role</h2>
                            <button className="modal-close" onClick={() => setSelectedUser(null)}>
                                ✕
                            </button>
                        </div>
                        <div className="modal-body">
                            <p className="text-secondary mb-4">
                                Changing role for <strong>{selectedUser.firstName} {selectedUser.lastName}</strong>
                            </p>

                            <div className="form-group">
                                <label className="form-label">New Role</label>
                                <select
                                    className="form-input"
                                    value={newRole}
                                    onChange={(e) => setNewRole(e.target.value)}
                                >
                                    <option value="user">User</option>
                                    <option value="admin">Admin</option>
                                    <option value="superadmin">Super Admin</option>
                                </select>
                            </div>

                            {user?.twoFactorEnabled && (
                                <div className="form-group">
                                    <label className="form-label">2FA Code</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="000000"
                                        maxLength={6}
                                        value={twoFactorToken}
                                        onChange={(e) => setTwoFactorToken(e.target.value.replace(/\D/g, ''))}
                                    />
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setSelectedUser(null)}>
                                Cancel
                            </button>
                            <button className="btn btn-primary" onClick={handleRoleChange}>
                                Update Role
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
