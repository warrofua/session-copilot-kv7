import { Link } from 'react-router-dom';
import './LandingPage.css';

export default function LoginPlaceholder() {
    return (
        <div className="login-placeholder">
            <h1>Login Coming Soon</h1>
            <p>
                We're building a secure authentication system.
                In the meantime, you can explore the demo.
            </p>
            <p>
                <Link to="/demo">Try the Demo</Link>
                {' '}&middot;{' '}
                <Link to="/">Back to Home</Link>
            </p>
        </div>
    );
}
