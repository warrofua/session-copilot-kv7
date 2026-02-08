import { useAuth } from '../hooks/useAuth';

export function RoleToggle() {
    const { user, setDemoRole } = useAuth();

    if (!user) return null;

    const currentRole = user.role || 'rbt';
    const isRbt = currentRole === 'rbt';

    const toggleRole = () => {
        const newRole = isRbt ? 'bcba' : 'rbt';
        setDemoRole(newRole);
    };

    return (
        <div className="role-toggle-widget">
            <div className={`role-indicator ${isRbt ? 'rbt' : 'bcba'}`}>
                {isRbt ? 'RBT View' : 'BCBA View'}
            </div>
            <button className="role-switch-btn" onClick={toggleRole}>
                Switch to {isRbt ? 'BCBA' : 'RBT'}
            </button>
        </div>
    );
}
