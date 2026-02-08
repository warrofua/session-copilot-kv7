// Professional Inline SVGs for "Agents of ABA" aesthetic
const icons = {
    behavior: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
    ),
    trial: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" />
        </svg>
    ),
    reinforcement: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 10v12" />
            <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
        </svg>
    ),
    incident: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
        </svg>
    ),
    zap: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2 L3 14 L12 14 L11 22 L21 10 L12 10 Z" />
        </svg>
    )
};

interface ActionButtonsProps {
    onLogBehavior: () => void;
    onLogSkillTrial: () => void;
    onLogABC?: () => void;
    onPromptLevel?: () => void;
    onDeliverReinforcement?: () => void;
    onIncidentReport: () => void;
    onMaladaptiveBehavior?: () => void;
}

export function ActionButtons({
    onLogBehavior,
    onLogSkillTrial,
    onLogABC,
    onPromptLevel,
    onDeliverReinforcement,
    onIncidentReport,
    onMaladaptiveBehavior,
}: ActionButtonsProps) {
    return (
        <div className="action-buttons">
            <button className="action-btn behavior" onClick={onLogBehavior}>
                <span className="icon">{icons.behavior}</span>
                Log Behavior
            </button>

            <button className="action-btn" onClick={onLogSkillTrial}>
                <span className="icon">{icons.trial}</span>
                Log Skill Trial
            </button>

            {onLogABC && (
                <button className="action-btn success" onClick={onLogABC}>
                    <span className="icon">{icons.zap}</span>
                    Log ABC
                </button>
            )}

            {onPromptLevel && (
                <button className="action-btn" onClick={onPromptLevel}>
                    <span className="icon">{icons.zap}</span>
                    Prompt Level
                </button>
            )}

            {onMaladaptiveBehavior && (
                <button className="action-btn behavior" onClick={onMaladaptiveBehavior}>
                    <span className="icon">{icons.incident}</span>
                    Maladaptive Behavior
                </button>
            )}

            {onDeliverReinforcement && (
                <button className="action-btn success" onClick={onDeliverReinforcement}>
                    <span className="icon">{icons.reinforcement}</span>
                    Deliver Reinforcement
                </button>
            )}

            <button className="action-btn danger" onClick={onIncidentReport}>
                <span className="icon">{icons.incident}</span>
                Incident Report
            </button>
        </div>
    );
}
