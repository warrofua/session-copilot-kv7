import React, { useState, useEffect } from 'react';

const TERMS_VERSION = '1.0';
const STORAGE_KEY = 'agentic_aba_terms_accepted_version';

export const TermsModal: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const acceptedVersion = localStorage.getItem(STORAGE_KEY);
        if (acceptedVersion !== TERMS_VERSION) {
            setIsOpen(true);
        }
    }, []);

    const handleAccept = () => {
        localStorage.setItem(STORAGE_KEY, TERMS_VERSION);
        setIsOpen(false);
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
        }}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '2rem',
                maxWidth: '600px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}>
                <h2 style={{
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    marginBottom: '1rem',
                    color: '#1a202c'
                }}>
                    Terms of Service & Disclaimer
                </h2>

                <div style={{
                    marginBottom: '1.5rem',
                    color: '#4a5568',
                    lineHeight: '1.6'
                }}>
                    <div style={{
                        backgroundColor: '#fff5f5',
                        borderLeft: '4px solid #f56565',
                        padding: '1rem',
                        marginBottom: '1.5rem',
                        fontWeight: '500'
                    }}>
                        "Agents of ABA is a data management and educational utility designed to assist parents and professionals in tracking behavior. It is not a substitute for professional Applied Behavior Analysis (ABA) services, diagnosis, or medical advice."
                    </div>

                    <p style={{ marginBottom: '1rem' }}>
                        <strong>For RBTs/Professionals:</strong> This tool does not constitute supervision. All clinical decisions and data interpretation must be overseen by a qualified BCBA.
                    </p>

                    <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: '1.5rem', marginBottom: '0.5rem' }}>Data Privacy & Security</h3>
                    <p style={{ marginBottom: '1rem' }}>
                        This application uses an <strong>Offline-First</strong> architecture. Your session data is stored locally on your device in your browser's database.
                    </p>
                    <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                        <li>We do not have access to your raw session logs.</li>
                        <li>If you clear your browser cache, your local data may be lost.</li>
                        <li>You are responsible for ensuring your device is secure and HIPAA-compliant if used for clinical data.</li>
                    </ul>

                    <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: '1.5rem', marginBottom: '0.5rem' }}>AI Disclaimer</h3>
                    <p>
                        The AI features use Large Language Models to assist with data entry. AI can make mistakes. <strong>Always verify</strong> the logged data before submitting session notes. You are solely responsible for the accuracy of your documentation.
                    </p>
                </div>

                <button
                    onClick={handleAccept}
                    style={{
                        width: '100%',
                        backgroundColor: '#3182ce',
                        color: 'white',
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        fontWeight: '600',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2b6cb0'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#3182ce'}
                >
                    I Agree & Understand
                </button>
            </div>
        </div>
    );
};
