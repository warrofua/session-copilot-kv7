import type { BehaviorEvent, SkillTrial } from '../db/db';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface SideDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    behaviorEvents: BehaviorEvent[];
    skillTrials: SkillTrial[];
    noteDraft: string;
}

interface SessionSummaryContentProps {
    behaviorEvents: BehaviorEvent[];
    skillTrials: SkillTrial[];
    noteDraft: string;
    onNavigateComplete?: () => void;
}

export function SessionSummaryContent({
    behaviorEvents,
    skillTrials,
    noteDraft,
    onNavigateComplete
}: SessionSummaryContentProps) {
    const { user } = useAuth();
    const navigate = useNavigate();

    const navigateTo = (path: string) => {
        navigate(path);
        onNavigateComplete?.();
    };

    return (
        <div className="drawer-content">
            <section className="drawer-section">
                <h3 className="drawer-section-title">Navigation</h3>
                <div className="drawer-nav-list">
                    <button
                        className="drawer-nav-btn"
                        onClick={() => navigateTo('/app')}
                    >
                        Dashboard
                    </button>
                    {user?.role === 'manager' && (
                        <button
                            className="drawer-nav-btn users"
                            onClick={() => navigateTo('/admin/users')}
                        >
                            User Management
                        </button>
                    )}
                    {(user?.role === 'manager' || user?.role === 'bcba') && (
                        <button
                            className="drawer-nav-btn learners"
                            onClick={() => navigateTo('/admin/learners')}
                        >
                            Caseload (Learners)
                        </button>
                    )}
                    {(user?.role === 'manager' || user?.role === 'bcba') && (
                        <button
                            className="drawer-nav-btn audit"
                            onClick={() => navigateTo('/admin/audit')}
                        >
                            Audit Log
                        </button>
                    )}
                    {user?.role === 'manager' && (
                        <button
                            className="drawer-nav-btn billing"
                            onClick={() => navigateTo('/admin/billing')}
                        >
                            Billing & Plans
                        </button>
                    )}
                </div>
            </section>

            <section className="drawer-section">
                <h3 className="drawer-section-title">Behavior Events</h3>
                {behaviorEvents.length === 0 ? (
                    <p className="drawer-empty">No behaviors logged yet</p>
                ) : (
                    <div className="event-list">
                        {behaviorEvents.map((event, idx) => (
                            <div key={event.id || idx} className="event-item">
                                <span className="event-icon">▸</span>
                                <div className="event-details">
                                    <span className="event-label">
                                        {formatBehaviorSummary(event)}
                                    </span>
                                    {event.antecedent && (
                                        <div className="event-value">
                                            <strong>Antecedent:</strong> {event.antecedent}
                                        </div>
                                    )}
                                    {event.functionGuess && (
                                        <div className="event-value">
                                            <strong>Likely Function:</strong> {capitalize(event.functionGuess)}
                                        </div>
                                    )}
                                    {event.intervention && (
                                        <div className="event-value">
                                            <strong>Intervention:</strong> {event.intervention}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="drawer-section">
                <h3 className="drawer-section-title">Skill Trials</h3>
                {skillTrials.length === 0 ? (
                    <p className="drawer-empty">No skill trials logged yet</p>
                ) : (
                    <div className="event-list">
                        {skillTrials.map((trial, idx) => (
                            <div key={trial.id || idx} className="event-item">
                                <span className="event-icon">▸</span>
                                <div className="event-details">
                                    <span className="event-label">{trial.skillName}: {trial.target}</span>
                                    <div className="event-value">
                                        <strong>Response:</strong> {capitalize(trial.response)}
                                        {trial.promptLevel !== 'independent' && ` (${trial.promptLevel})`}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="drawer-section">
                <h3 className="drawer-section-title">Session Notes Draft</h3>
                <div className="notes-draft">
                    {noteDraft ? (
                        <div dangerouslySetInnerHTML={{ __html: formatNoteDraft(noteDraft) }} />
                    ) : (
                        <p className="drawer-empty italic">
                            Notes will be generated as you log session data...
                        </p>
                    )}
                </div>
            </section>
        </div>
    );
}

export function SideDrawer({
    isOpen,
    onClose,
    behaviorEvents,
    skillTrials,
    noteDraft
}: SideDrawerProps) {
    return (
        <>
            <div
                className={`drawer-overlay ${isOpen ? 'open' : ''}`}
                onClick={onClose}
            />

            <aside className={`side-drawer ${isOpen ? 'open' : ''}`}>
                <div className="drawer-header">
                    <h2 className="drawer-title">Session Summary</h2>
                    <button className="drawer-close" onClick={onClose} aria-label="Close">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <SessionSummaryContent
                    behaviorEvents={behaviorEvents}
                    skillTrials={skillTrials}
                    noteDraft={noteDraft}
                    onNavigateComplete={onClose}
                />
            </aside >
        </>
    );
}

function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatBehaviorSummary(event: BehaviorEvent): string {
    if (event.duration) {
        return `${event.behaviorType}: ${event.duration}s`;
    }
    if (event.count && event.count > 1) {
        return `${event.count}x ${event.behaviorType}`;
    }
    return event.behaviorType;
}

function formatNoteDraft(draft: string): string {
    // Bold key terms
    return draft
        .replace(/Client/g, '<strong>Client</strong>')
        .replace(/Staff/g, '<strong>Staff</strong>');
}

// Definition Guardrail Component
interface GuardrailPopupProps {
    behaviorType: string;
    definition: string;
    examples: string[];
    nonExamples: string[];
    onConfirm: () => void;
    onReject: (correctType: string) => void;
    alternativeType?: string;
}

export function GuardrailPopup({
    behaviorType,
    definition,
    examples,
    nonExamples,
    onConfirm,
    onReject,
    alternativeType = 'Other'
}: GuardrailPopupProps) {
    return (
        <div className="guardrail-popup">
            <div className="guardrail-title">Log {behaviorType}?</div>
            <div className="guardrail-definition">{definition}</div>
            {examples.length > 0 && (
                <div style={{ fontSize: '0.75rem', color: '#48BB78', marginBottom: '4px' }}>
                    ✓ Examples: {examples.join(', ')}
                </div>
            )}
            {nonExamples.length > 0 && (
                <div style={{ fontSize: '0.75rem', color: '#F56565', marginBottom: '8px' }}>
                    ✗ Non-examples: {nonExamples.join(', ')}
                </div>
            )}
            <div className="guardrail-buttons">
                <button className="message-btn primary" onClick={onConfirm}>
                    Yes
                </button>
                <button className="message-btn secondary" onClick={() => onReject(alternativeType)}>
                    No, it's {alternativeType}
                </button>
            </div>
        </div>
    );
}
