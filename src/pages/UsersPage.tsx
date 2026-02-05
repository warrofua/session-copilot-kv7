import { useEffect, useState } from 'react';
import type { User } from '../contexts/AuthContext';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/userService';
import { useNavigate } from 'react-router-dom';
import { UserModal } from '../components/UserModal';
import './AdminPages.css';

export default function UsersPage() {
    const { user: currentUser, isLoading: isAuthLoading } = useAuth();
    const navigate = useNavigate();
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);

    useEffect(() => {
        if (isAuthLoading) {
            return;
        }
        if (!currentUser || currentUser.role !== 'manager') {
            navigate('/app');
            return;
        }
        loadUsers();
    }, [currentUser, isAuthLoading, navigate]);

    async function loadUsers() {
        try {
            setIsLoading(true);
            const data = await userService.getUsers();
            setUsers(data);
        } catch (err) {
            setError('Failed to load users');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }

    if (isAuthLoading || isLoading) return <div className="admin-loading">Loading users...</div>;
    const editingUser = editingUserId ? users.find((person) => person.id === editingUserId) ?? null : null;

    return (
        <div className="admin-page">
            <div className="admin-page-shell">
                <div className="admin-page-header">
                    <div>
                        <button
                            onClick={() => navigate('/app')}
                            className="admin-back-btn"
                        >
                            ← Back to Session
                        </button>
                        <h1 className="admin-page-title">Users</h1>
                        <p className="admin-page-subtitle">
                            A list of all users in your organization including their name, role, and email.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowAddModal(true)}
                        className="admin-primary-btn"
                    >
                        Add User
                    </button>
                </div>

                <div className="admin-content">
                    {error && (
                        <div className="admin-error">
                            {error}
                        </div>
                    )}

                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Role</th>
                                    <th>Email</th>
                                    <th>Status</th>
                                    <th aria-label="actions" />
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((person) => (
                                    <tr key={person.email}>
                                        <td>{person.name}</td>
                                        <td style={{ textTransform: 'capitalize' }}>{person.role}</td>
                                        <td>{person.email}</td>
                                        <td>
                                            <span className={`status-pill ${person.isActive ? 'active' : 'inactive'}`}>
                                                {person.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td>
                                            <button
                                                type="button"
                                                className="admin-link-btn"
                                                onClick={() => setEditingUserId(person.id)}
                                            >
                                                Edit
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal placeholder */}
            {showAddModal && (
                <UserModal
                    isOpen={showAddModal}
                    onClose={() => setShowAddModal(false)}
                    onUserSaved={loadUsers}
                />
            )}
            {editingUser && (
                <UserModal
                    isOpen={Boolean(editingUser)}
                    editingUser={editingUser}
                    onClose={() => setEditingUserId(null)}
                    onUserSaved={loadUsers}
                />
            )}
        </div>
    );
}
