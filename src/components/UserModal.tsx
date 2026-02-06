import { useEffect, useState } from 'react';
import { userService } from '../services/userService';
import { learnerService } from '../services/learnerService';
import type { User } from '../contexts/AuthContext';
import type { Learner } from '../db/db';

interface UserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUserSaved: () => void;
    editingUser?: User | null;
}

export function UserModal({ isOpen, onClose, onUserSaved, editingUser }: UserModalProps) {
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [role, setRole] = useState<'bcba' | 'rbt' | 'manager'>('rbt');
    const [password, setPassword] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [assignedLearnerIds, setAssignedLearnerIds] = useState<string[]>([]);

    // Data state
    const [learners, setLearners] = useState<Learner[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const isEditMode = Boolean(editingUser);

    useEffect(() => {
        if (isOpen) {
            loadLearners();
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        setError('');
        if (editingUser) {
            setEmail(editingUser.email);
            setName(editingUser.name);
            setRole(editingUser.role === 'manager' || editingUser.role === 'bcba' || editingUser.role === 'rbt' ? editingUser.role : 'rbt');
            setIsActive(editingUser.isActive);
            // Ensure we use the array from the user object, defaulting to empty
            setAssignedLearnerIds(editingUser.assignedLearnerIds || []);
            setPassword('');
            return;
        }
        setEmail('');
        setName('');
        setRole('rbt');
        setPassword('');
        setIsActive(true);
        setAssignedLearnerIds([]);
    }, [editingUser, isOpen]);

    async function loadLearners() {
        try {
            const data = await learnerService.getLearners();
            setLearners(data);
        } catch (err) {
            console.error('Failed to load learners:', err);
            // Don't block the modal, just show generic error if needed or empty list
        }
    }

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            if (editingUser) {
                await userService.updateUser({
                    id: editingUser.id,
                    name: name.trim(),
                    role,
                    isActive,
                    assignedLearnerIds
                });
            } else {
                await userService.createUser({
                    email: email.trim(),
                    name: name.trim(),
                    role,
                    password,
                    assignedLearnerIds
                });
            }
            onUserSaved();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : `Failed to ${isEditMode ? 'update' : 'create'} user`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLearnerToggle = (learnerId: string) => {
        setAssignedLearnerIds(prev =>
            prev.includes(learnerId)
                ? prev.filter(id => id !== learnerId)
                : [...prev, learnerId]
        );
    };

    return (
        <div className={`modal-overlay ${isOpen ? 'open' : ''}`} aria-labelledby="user-modal-title" role="dialog" aria-modal="true">
            <div className="modal admin-modal">
                <div className="modal-header">
                    <h3 id="user-modal-title" className="modal-title admin-modal-title">
                        {isEditMode ? 'Edit User' : 'Add New User'}
                    </h3>
                    <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">
                        ✕
                    </button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        {error && (
                            <div className="admin-error">
                                {error}
                            </div>
                        )}
                        <div className="admin-form-grid">
                            <div className="form-group">
                                <label htmlFor="user-name" className="form-label">Full Name</label>
                                <input
                                    type="text"
                                    id="user-name"
                                    autoComplete="name"
                                    required
                                    className="form-input"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="user-email" className="form-label">Email</label>
                                <input
                                    type="email"
                                    id="user-email"
                                    autoComplete="email"
                                    required
                                    disabled={isEditMode}
                                    className="form-input"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="user-role" className="form-label">Role</label>
                                <select
                                    id="user-role"
                                    className="form-select"
                                    value={role}
                                    onChange={(e) => setRole(e.target.value as 'bcba' | 'rbt' | 'manager')}
                                >
                                    <option value="rbt">RBT</option>
                                    <option value="bcba">BCBA</option>
                                    <option value="manager">Manager</option>
                                </select>
                            </div>
                            {!isEditMode && (
                                <div className="form-group">
                                    <label htmlFor="user-password" className="form-label">Password</label>
                                    <input
                                        type="password"
                                        id="user-password"
                                        autoComplete="new-password"
                                        required
                                        minLength={6}
                                        className="form-input"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                </div>
                            )}
                            {isEditMode && (
                                <div className="form-group">
                                    <label htmlFor="user-status" className="form-label">Status</label>
                                    <select
                                        id="user-status"
                                        className="form-select"
                                        value={isActive ? 'active' : 'inactive'}
                                        onChange={(e) => setIsActive(e.target.value === 'active')}
                                    >
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        <div className="form-group" style={{ marginTop: '1rem' }}>
                            <label className="form-label">Assigned Learners</label>
                            <div className="learner-checklist">
                                {learners.length === 0 ? (
                                    <div style={{ padding: '0.5rem', color: '#64748b', fontSize: '0.875rem' }}>
                                        No learners found.
                                    </div>
                                ) : (
                                    learners.filter(l => l.status === 'active').map(learner => (
                                        <label key={learner.id} className="learner-checklist-item">
                                            <input
                                                type="checkbox"
                                                checked={assignedLearnerIds.includes(learner.id)}
                                                onChange={() => handleLearnerToggle(learner.id)}
                                            />
                                            {learner.name}
                                        </label>
                                    ))
                                )}
                            </div>
                            <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                                Selected learners will be visible to this user.
                            </p>
                        </div>

                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="btn btn-primary"
                        >
                            {isLoading ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save Changes' : 'Create User')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
