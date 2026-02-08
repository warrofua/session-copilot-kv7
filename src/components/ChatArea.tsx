import { useRef, useEffect } from 'react';

export interface ChatMessageData {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    buttons?: { label: string; action: string; value: string; variant?: 'primary' | 'secondary' | 'danger' }[];
    functionButtons?: { label: string; value: string }[];
    timestamp: Date;
}

interface ChatAreaProps {
    messages: ChatMessageData[];
    onButtonClick: (action: string, value: string) => void;
    onFunctionSelect?: (func: string) => void;
    selectedFunction?: string;
}

/**
 * Renders the chat history and message bubbles.
 * Handles auto-scrolling to the latest message.
 */
export function ChatArea({ messages, onButtonClick, onFunctionSelect, selectedFunction }: ChatAreaProps) {
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="chat-area">
            {messages.length === 0 && (
                <div className="chat-empty-state" aria-label="Session guidance">
                    <h3 className="chat-empty-title">Session <span>Documentation</span></h3>
                    <p className="chat-empty-copy">
                        Use the actions below or type natural-language notes.
                        The <strong>Agents of ABA</strong> engine will automatically parse your input.
                    </p>
                    <div className="chat-empty-hints">
                        <div className="hint-item">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                            </svg>
                            <span>Behavior + duration</span>
                        </div>
                        <div className="hint-item">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <circle cx="12" cy="12" r="2" />
                            </svg>
                            <span>Skill + response</span>
                        </div>
                        <div className="hint-item">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2v20M2 12h20" />
                            </svg>
                            <span>ABC notes</span>
                        </div>
                    </div>
                </div>
            )}
            {messages.map((msg) => (
                <div key={msg.id} className={`message ${msg.role}`}>
                    <div className="message-content">{msg.content}</div>

                    {msg.buttons && msg.buttons.length > 0 && (
                        <div className="message-buttons">
                            {msg.buttons.map((btn, idx) => (
                                <button
                                    key={idx}
                                    className={`message-btn ${btn.variant || 'secondary'}`}
                                    onClick={() => onButtonClick(btn.action, btn.value)}
                                >
                                    {btn.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {msg.functionButtons && msg.functionButtons.length > 0 && (
                        <div className="function-buttons">
                            {msg.functionButtons.map((btn, idx) => (
                                <button
                                    key={idx}
                                    className={`function-btn ${selectedFunction === btn.value ? 'selected' : ''}`}
                                    onClick={() => onFunctionSelect?.(btn.value)}
                                >
                                    {btn.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ))}
            <div ref={endRef} />
        </div>
    );
}

interface MessageInputProps {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    onVoice?: () => void;
    placeholder?: string;
    disabled?: boolean;
}

/**
 * Input field for chat messages with voice support button.
 */
export function MessageInput({
    value,
    onChange,
    onSend,
    onVoice,
    placeholder = 'Type a message...',
    disabled
}: MessageInputProps) {
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
    };

    return (
        <div className="input-area">
            <input
                type="text"
                className="input-field"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
            />
            <button className="voice-btn" onClick={onVoice} aria-label="Voice input">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
            </button>
        </div>
    );
}
