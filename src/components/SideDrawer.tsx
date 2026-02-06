import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Session } from '../db/db';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../stores/sessionStore';
import { format } from 'date-fns';

interface SideDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    /** ID of the currently active session to highlight in the tree */
    currentSessionId?: number;
}

// Helper to format session time range
const formatSessionRange = (start: Date, end?: Date) => {
    const dateStr = format(start, 'MMM d');
    const timeStart = format(start, 'h:mm a');
    const timeEnd = end ? format(end, 'h:mm a') : 'Now';
    return `${dateStr}, ${timeStart} - ${timeEnd}`;
};

/**
 * Navigation drawer displaying the caseload tree (Learners -> Sessions) and admin menu.
 * Uses `useLiveQuery` to reactively fetch session data from Dexie.
 */
export function SideDrawer({ isOpen, onClose, currentSessionId }: SideDrawerProps) {
    const { user, learners } = useAuth();
    const navigate = useNavigate();

    // -- State --
    const [expandedLearnerIds, setExpandedLearnerIds] = useState<Set<string>>(new Set());
    const [selectedSessionId, setSelectedSessionId] = useState<number | undefined>(currentSessionId);

    // -- Data Fetching --
    // Fetch recent sessions only (limit 200) to avoid performance degradation
    const allSessions = useLiveQuery(() => db.sessions.orderBy('startTime').reverse().limit(200).toArray(), []);

    // -- Derived Data --
    const sessionsByLearner = useMemo(() => {
        if (!allSessions) return {};
        const groups: Record<string, Session[]> = {};
        allSessions.forEach(session => {
            if (!groups[session.clientId]) {
                groups[session.clientId] = [];
            }
            groups[session.clientId].push(session);
        });
        return groups;
    }, [allSessions]);

    // -- Handlers --
    const toggleLearner = (learnerId: string) => {
        const newSet = new Set(expandedLearnerIds);
        if (newSet.has(learnerId)) {
            newSet.delete(learnerId);
        } else {
            newSet.add(learnerId);
        }
        setExpandedLearnerIds(newSet);
    };

    const { setCurrentSession } = useSessionStore();

    const handleSessionClick = (session: Session) => {
        setSelectedSessionId(session.id);
        setCurrentSession(session);
        onClose(); // Close drawer to view session
    };

    const navigateTo = (path: string) => {
        navigate(path);
        onClose();
    };

    // If still loading Auth or DB
    if (!user) return null;

    return (
        <>
            <div
                className={`drawer-overlay ${isOpen ? 'open' : ''}`}
                onClick={onClose}
            />

            <aside className={`side-drawer ${isOpen ? 'open' : ''}`}>
                <div className="drawer-header">
                    <h2 className="drawer-title">Caseload Navigator</h2>
                    <button className="drawer-close" onClick={onClose} aria-label="Close">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="drawer-content">
                    {/* Admin Navigation Section */}
                    <section className="drawer-section">
                        <h3 className="drawer-section-title">Menu</h3>
                        <div className="drawer-nav-list">
                            <button className="drawer-nav-btn" onClick={() => navigateTo('/app')}>
                                Dashboard
                            </button>
                            {(user.role === 'manager' || user.role === 'bcba') && (
                                <>
                                    <button className="drawer-nav-btn learners" onClick={() => navigateTo('/admin/learners')}>
                                        Caseload (Learners)
                                    </button>
                                    <button className="drawer-nav-btn audit" onClick={() => navigateTo('/admin/audit')}>
                                        Audit Log
                                    </button>
                                </>
                            )}
                            {user.role === 'manager' && (
                                <button className="drawer-nav-btn billing" onClick={() => navigateTo('/admin/billing')}>
                                    Billing & Plans
                                </button>
                            )}
                            {user.role === 'manager' && (
                                <button className="drawer-nav-btn users" onClick={() => navigateTo('/admin/users')}>
                                    User Management
                                </button>
                            )}
                        </div>
                    </section>

                    {/* Learner Tree Section */}
                    <section className="drawer-section">
                        <h3 className="drawer-section-title">History by Learner</h3>
                        <div className="learner-tree">
                            {learners.map(learner => {
                                const sessions = sessionsByLearner[learner.id] || [];
                                const isExpanded = expandedLearnerIds.has(learner.id);
                                const hasSessions = sessions.length > 0;

                                return (
                                    <div key={learner.id} className="tree-node-learner">
                                        <button
                                            className={`tree-learner-btn ${isExpanded ? 'expanded' : ''}`}
                                            onClick={() => toggleLearner(learner.id)}
                                        >
                                            <span className="tree-chevron">▸</span>
                                            <span className="tree-learner-name">{learner.name}</span>
                                            <span className="tree-count-badge">{sessions.length}</span>
                                        </button>

                                        {isExpanded && (
                                            <div className="tree-children">
                                                {!hasSessions ? (
                                                    <div className="tree-empty">No recorded sessions</div>
                                                ) : (
                                                    sessions.map(session => (
                                                        <button
                                                            key={session.id}
                                                            className={`tree-session-item ${selectedSessionId === session.id ? 'selected' : ''} ${currentSessionId === session.id ? 'active-now' : ''}`}
                                                            onClick={() => session.id && handleSessionClick(session)}
                                                        >
                                                            <span className="tree-session-icon">📄</span>
                                                            <div className="tree-session-info">
                                                                <span className="tree-session-time">
                                                                    {formatSessionRange(session.startTime, session.endTime)}
                                                                </span>
                                                                {session.status === 'in-progress' && (
                                                                    <span className="status-indicator">In Progress</span>
                                                                )}
                                                            </div>
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {learners.length === 0 && (
                                <div className="drawer-empty">No learners assigned.</div>
                            )}
                        </div>
                    </section>
                </div>
            </aside >
        </>
    );
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
