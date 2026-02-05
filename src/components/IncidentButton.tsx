import { useState } from 'react';

interface IncidentFormData {
    incidentType: 'injury' | 'restraint' | 'property-destruction' | 'elopement-serious' | 'other';
    description: string;
    staffInvolved: string[];
    actionsToken: string[];
    injuries: string;
    parentNotified: boolean;
    supervisorNotified: boolean;
}

interface IncidentButtonProps {
    onSubmit: (data: IncidentFormData) => void;
}

export function IncidentButton({ onSubmit }: IncidentButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [formData, setFormData] = useState<IncidentFormData>({
        incidentType: 'injury',
        description: '',
        staffInvolved: [],
        actionsToken: [],
        injuries: '',
        parentNotified: false,
        supervisorNotified: false
    });

    const handleSubmit = () => {
        onSubmit(formData);
        setIsOpen(false);
        // Reset form
        setFormData({
            incidentType: 'injury',
            description: '',
            staffInvolved: [],
            actionsToken: [],
            injuries: '',
            parentNotified: false,
            supervisorNotified: false
        });
    };

    const toggleAction = (action: string) => {
        setFormData(prev => ({
            ...prev,
            actionsToken: prev.actionsToken.includes(action)
                ? prev.actionsToken.filter(a => a !== action)
                : [...prev.actionsToken, action]
        }));
    };

    return (
        <>
            {/* Floating Action Button */}
            <button
                className="incident-fab"
                onClick={() => setIsOpen(true)}
                aria-label="Report incident"
            >
                !
            </button>

            {/* Modal */}
            <div className={`modal-overlay ${isOpen ? 'open' : ''}`}>
                <div className="modal">
                    <div className="modal-header">
                        <h2 className="modal-title">⚠️ Incident Report</h2>
                        <button className="drawer-close" onClick={() => setIsOpen(false)}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="modal-body">
                        <div className="form-group">
                            <label className="form-label">Incident Type</label>
                            <select
                                className="form-select"
                                value={formData.incidentType}
                                onChange={(e) => setFormData(prev => ({
                                    ...prev,
                                    incidentType: e.target.value as IncidentFormData['incidentType']
                                }))}
                            >
                                <option value="injury">Injury</option>
                                <option value="restraint">Restraint</option>
                                <option value="property-destruction">Property Destruction</option>
                                <option value="elopement-serious">Serious Elopement</option>
                                <option value="other">Other</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">What happened?</label>
                            <textarea
                                className="form-textarea"
                                placeholder="Describe the incident..."
                                value={formData.description}
                                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Actions Taken</label>
                            <div className="checkbox-group">
                                {['Block', 'Redirect', 'Verbal de-escalation', 'Physical intervention', 'First aid', 'Called supervisor'].map(action => (
                                    <label key={action} className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={formData.actionsToken.includes(action)}
                                            onChange={() => toggleAction(action)}
                                        />
                                        {action}
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Injuries (if any)</label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="Describe any injuries..."
                                value={formData.injuries}
                                onChange={(e) => setFormData(prev => ({ ...prev, injuries: e.target.value }))}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Notifications</label>
                            <div className="checkbox-group">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={formData.parentNotified}
                                        onChange={(e) => setFormData(prev => ({ ...prev, parentNotified: e.target.checked }))}
                                    />
                                    Parent/Guardian notified
                                </label>
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={formData.supervisorNotified}
                                        onChange={(e) => setFormData(prev => ({ ...prev, supervisorNotified: e.target.checked }))}
                                    />
                                    Supervisor notified
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button className="btn btn-secondary" onClick={() => setIsOpen(false)}>
                            Cancel
                        </button>
                        <button
                            className="btn btn-danger"
                            onClick={handleSubmit}
                            disabled={!formData.description}
                        >
                            Submit Report
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
