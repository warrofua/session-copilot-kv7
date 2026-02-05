import { useEffect, useState } from 'react';
import { learnerService } from '../services/learnerService';
import type { Learner } from '../db/db';

interface LearnerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLearnerSaved: () => void;
    editingLearner?: Learner | null;
}

export function LearnerModal({ isOpen, onClose, onLearnerSaved, editingLearner }: LearnerModalProps) {
    const [name, setName] = useState('');
    const [dob, setDob] = useState('');
    const [status, setStatus] = useState<'active' | 'inactive' | 'discharged'>('active');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const isEditMode = Boolean(editingLearner);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        setError('');
        if (editingLearner) {
            setName(editingLearner.name);
            setDob(editingLearner.dob ? editingLearner.dob.slice(0, 10) : '');
            setStatus(editingLearner.status);
            return;
        }
        setName('');
        setDob('');
        setStatus('active');
    }, [editingLearner, isOpen]);

    if (!isOpen) return null;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            if (editingLearner) {
                await learnerService.updateLearner({
                    id: editingLearner.id,
                    name: name.trim(),
                    dob,
                    status
                });
            } else {
                await learnerService.createLearner({
                    name: name.trim(),
                    dob,
                    status
                });
            }
            onLearnerSaved();
            onClose();
        } catch (err: any) {
            setError(err.message || `Failed to ${isEditMode ? 'update' : 'create'} learner`);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className={`modal-overlay ${isOpen ? 'open' : ''}`} aria-labelledby="learner-modal-title" role="dialog" aria-modal="true">
            <div className="modal admin-modal">
                <div className="modal-header">
                    <h3 id="learner-modal-title" className="modal-title admin-modal-title">
                        {isEditMode ? 'Edit Learner' : 'Add New Learner'}
                    </h3>
                    <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">
                        ✕
                    </button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        {error && <div className="admin-error">{error}</div>}
                        <div className="admin-form-grid">
                            <div className="form-group">
                                <label htmlFor="learner-name" className="form-label">Name</label>
                                <input
                                    type="text"
                                    id="learner-name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="form-input"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="learner-dob" className="form-label">Date of Birth</label>
                                <input
                                    type="date"
                                    id="learner-dob"
                                    value={dob}
                                    onChange={(e) => setDob(e.target.value)}
                                    className="form-input"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="learner-status" className="form-label">Status</label>
                                <select
                                    id="learner-status"
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value as 'active' | 'inactive' | 'discharged')}
                                    className="form-select"
                                >
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                    <option value="discharged">Discharged</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" disabled={isLoading} className="btn btn-primary">
                            {isLoading ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save Changes' : 'Create Learner')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
