import { useEffect, useState } from 'react';
import type { Learner } from '../db/db';
import { useAuth } from '../hooks/useAuth';
import { learnerService } from '../services/learnerService';
import { useNavigate } from 'react-router-dom';
import { LearnerModal } from '../components/LearnerModal';
import './AdminPages.css';

export default function LearnersPage() {
    const { user: currentUser, isLoading: isAuthLoading } = useAuth();
    const navigate = useNavigate();
    const [learners, setLearners] = useState<Learner[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingLearnerId, setEditingLearnerId] = useState<string | null>(null);

    useEffect(() => {
        if (isAuthLoading) {
            return;
        }
        const canAccessLearners = currentUser?.role === 'manager' || currentUser?.role === 'bcba';
        if (!canAccessLearners) {
            navigate('/app');
            return;
        }
        loadLearners();
    }, [currentUser, isAuthLoading, navigate]);

    async function loadLearners() {
        try {
            setIsLoading(true);
            const data = await learnerService.getLearners();
            setLearners(data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load learners');
        } finally {
            setIsLoading(false);
        }
    }

    if (isAuthLoading || isLoading) return <div className="admin-loading">Loading learners...</div>;
    const editingLearner = editingLearnerId ? learners.find((learner) => learner.id === editingLearnerId) ?? null : null;

    const canManage = currentUser?.role === 'manager' || currentUser?.role === 'bcba';

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
                        <h1 className="admin-page-title">Learners (Caseload)</h1>
                        <p className="admin-page-subtitle">
                            A list of all learners in your organization.
                        </p>
                    </div>
                    {canManage && (
                        <button
                            type="button"
                            onClick={() => setShowAddModal(true)}
                            className="admin-primary-btn"
                        >
                            Add Learner
                        </button>
                    )}
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
                                    <th>DOB</th>
                                    <th>Status</th>
                                    <th aria-label="actions" />
                                </tr>
                            </thead>
                            <tbody>
                                {learners.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="admin-empty">No learners found.</td>
                                    </tr>
                                ) : (
                                    learners.map((learner) => (
                                        <tr key={learner.id}>
                                            <td>{learner.name}</td>
                                            <td>{new Date(learner.dob).toLocaleDateString()}</td>
                                            <td>
                                                <span className={`status-pill ${learner.status}`}>
                                                    {learner.status.charAt(0).toUpperCase() + learner.status.slice(1)}
                                                </span>
                                            </td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="admin-link-btn"
                                                    onClick={() => setEditingLearnerId(learner.id)}
                                                >
                                                    Edit
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <LearnerModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                onLearnerSaved={loadLearners}
            />
            {editingLearner && (
                <LearnerModal
                    isOpen={Boolean(editingLearner)}
                    editingLearner={editingLearner}
                    onClose={() => setEditingLearnerId(null)}
                    onLearnerSaved={loadLearners}
                />
            )}
        </div>
    );
}
