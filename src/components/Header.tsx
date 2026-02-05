import { useSyncStore } from '../stores/syncStore';

interface HeaderProps {
    clientName: string;
    sessionTime: string;
    onBack?: () => void;
    onMenuClick?: () => void;
}

export function Header({ clientName, sessionTime, onBack, onMenuClick }: HeaderProps) {
    const { status, unsyncedCount } = useSyncStore();

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
                    <h1 className="header-title" style={{ marginLeft: onBack ? 0 : '16px' }}>Session Co-Pilot</h1>
                </div>
                <button className="header-menu" onClick={onMenuClick} aria-label="Menu">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                    </svg>
                </button>
            </header>

            <div className="session-info">
                <div className="client-avatar">{getInitials(clientName)}</div>
                <div className="client-details">
                    <div className="client-name">{clientName}</div>
                    <div className="session-timer">{sessionTime} In Progress</div>
                </div>
                <div className={`sync-badge ${status}`}>
                    <span className="status-dot" />
                    {getStatusLabel()}
                </div>
            </div>
        </>
    );
}
