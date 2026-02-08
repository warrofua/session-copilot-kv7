import React, { useState, useEffect } from 'react';

const TERMS_VERSION = '1.0';
const STORAGE_KEY = 'agentic_aba_terms_accepted_version';

export const TermsModal: React.FC = () => {
    const [isOpen, setIsOpen] = useState(() => {
        try {
            const acceptedVersion = localStorage.getItem(STORAGE_KEY);
            return acceptedVersion !== TERMS_VERSION;
        } catch {
            return true;
        }
    });

    useEffect(() => {
        // No-op effect to satisfy mount logic if needed, but removed the setState calls
    }, []);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, [isOpen]);

    const handleAccept = () => {
        try {
            localStorage.setItem(STORAGE_KEY, TERMS_VERSION);
        } catch {
            // Continue with in-memory acceptance when storage is unavailable.
        }
        setIsOpen(false);
    };

    if (!isOpen) return null;

    return (
        <div className="terms-overlay" role="dialog" aria-modal="true" aria-labelledby="terms-title">
            <div className="terms-modal">
                <h2 id="terms-title" className="terms-title">
                    Terms of Service & Disclaimer
                </h2>

                <div className="terms-content">
                    <div className="terms-warning">
                        "Agents of ABA is a data management and educational utility designed to assist parents and professionals in tracking behavior. It is not a substitute for professional Applied Behavior Analysis (ABA) services, diagnosis, or medical advice."
                    </div>

                    <p>
                        <strong>For RBTs/Professionals:</strong> This tool does not constitute supervision. All clinical decisions and data interpretation must be overseen by a qualified BCBA.
                    </p>

                    <h3>Data Privacy & Security</h3>
                    <p>
                        This application uses an <strong>Offline-First</strong> architecture. Your session data is stored locally on your device in your browser's database.
                    </p>
                    <ul>
                        <li>We do not have access to your raw session logs.</li>
                        <li>If you clear your browser cache, your local data may be lost.</li>
                        <li>You are responsible for ensuring your device is secure and HIPAA-compliant if used for clinical data.</li>
                    </ul>

                    <h3>AI Disclaimer</h3>
                    <p>
                        The AI features use Large Language Models to assist with data entry. AI can make mistakes. <strong>Always verify</strong> the logged data before submitting session notes. You are solely responsible for the accuracy of your documentation.
                    </p>
                </div>

                <button
                    onClick={handleAccept}
                    data-testid="terms-accept-button"
                    className="terms-accept-btn"
                >
                    I Agree & Understand
                </button>
            </div>
        </div>
    );
};
