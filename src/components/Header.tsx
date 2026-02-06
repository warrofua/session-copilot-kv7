import { useState, useRef, useEffect } from 'react';
import { useSyncStore } from '../stores/syncStore';
import type { Learner } from '../services/authService';

interface HeaderProps {
    clientName: string;
    sessionTime: string;
    learners?: Learner[];
    onLearnerChange?: (learner: Learner) => void;
    onBack?: () => void;
    onMenuClick?: () => void;
}

export function Header({ clientName, sessionTime, learners = [], onLearnerChange, onBack, onMenuClick }: HeaderProps) {
    const { status, unsyncedCount } = useSyncStore();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getStatusLabel = () => {
        switch (status) {
            case 'offline': return 'Offline';
            case 'syncing': return 'Syncing...';
            case 'synced': return unsyncedCount > 0 ? `${unsyncedCount} pending` : 'Synced';
            case 'error': return 'Sync Error';
        }
    };

    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const handleLearnerSelect = (learner: Learner) => {
        onLearnerChange?.(learner);
        setDropdownOpen(false);
    };

    const hasMultipleLearners = learners.length > 1;

    return (
        <>
            <header className="header">
                <div className="header-left">
                    {onBack && (
                        <button className="header-back" onClick={onBack} aria-label="Go back">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M15 18l-6-6 6-6" />
                            </svg>
                        </button>
                    )}
                    <h1 className={`header-title ${onBack ? '' : 'no-back'}`}>Session Co-Pilot</h1>
                </div>
                <button className="header-menu" onClick={onMenuClick} aria-label="Menu">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                    </svg>
                </button>
            </header>

            <div className="session-info" ref={dropdownRef}>
                <div className="client-avatar">{getInitials(clientName)}</div>
                <div className="client-details">
                    <button
                        className={`client-name-btn ${hasMultipleLearners ? 'clickable' : ''}`}
                        onClick={() => hasMultipleLearners && setDropdownOpen(!dropdownOpen)}
                        disabled={!hasMultipleLearners}
                    >
                        {clientName}
                        {hasMultipleLearners && (
                            <svg className={`dropdown-chevron ${dropdownOpen ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M6 9l6 6 6-6" />
                            </svg>
                        )}
                    </button>
                    <div className="session-timer">{sessionTime} In Progress</div>
                </div>
                <div className={`sync-badge ${status}`}>
                    <span className="status-dot" />
                    {getStatusLabel()}
                </div>

                {dropdownOpen && hasMultipleLearners && (
                    <div className="learner-dropdown">
                        {learners.map(learner => (
                            <button
                                key={learner.id}
                                className={`learner-option ${learner.name === clientName ? 'selected' : ''}`}
                                onClick={() => handleLearnerSelect(learner)}
                            >
                                <span className="learner-option-avatar">{getInitials(learner.name)}</span>
                                {learner.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
