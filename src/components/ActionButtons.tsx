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
                <span className="icon">●</span>
                Log Behavior
            </button>

            <button className="action-btn" onClick={onLogSkillTrial}>
                Log Skill Trial
            </button>

            {onLogABC && (
                <button className="action-btn success" onClick={onLogABC}>
                    <span className="icon">●</span>
                    Log ABC
                </button>
            )}

            {onPromptLevel && (
                <button className="action-btn" onClick={onPromptLevel}>
                    Prompt Level
                </button>
            )}

            {onMaladaptiveBehavior && (
                <button className="action-btn behavior" onClick={onMaladaptiveBehavior}>
                    <span className="icon">⊕</span>
                    Maladaptive Behavior
                </button>
            )}

            {onDeliverReinforcement && (
                <button className="action-btn success" onClick={onDeliverReinforcement}>
                    <span className="icon">★</span>
                    Deliver Reinforcement
                </button>
            )}

            <button className="action-btn danger" onClick={onIncidentReport}>
                <span className="icon">⊕</span>
                Incident Report
            </button>
        </div>
    );
}
