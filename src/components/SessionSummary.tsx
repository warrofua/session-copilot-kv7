import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { BehaviorEvent, SkillTrial } from '../db/db';

export interface SessionSummaryContentProps {
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

function capitalize(str: string): string {
    if (!str) return '';
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
    if (!draft) return '';
    // Bold key terms
    return draft
        .replace(/Client/g, '<strong>Client</strong>')
        .replace(/Staff/g, '<strong>Staff</strong>');
}
