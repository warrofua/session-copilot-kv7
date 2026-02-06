import { useState, useCallback, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Header } from './components/Header';
import { ChatArea, MessageInput, type ChatMessageData } from './components/ChatArea';
import { ActionButtons } from './components/ActionButtons';
import { SessionSummaryContent, SideDrawer } from './components/SideDrawer';
import { IncidentButton } from './components/IncidentButton';
import { useSessionStore } from './stores/sessionStore';
import { useSyncStore } from './stores/syncStore';
import { addBehaviorEvent, addIncident, addSkillTrial, getBehaviorEventsBySession, getSkillTrialsBySession, type BehaviorEvent, type Incident, type SkillTrial } from './db/db';
import { parseUserInput, generateConfirmation, generateNoteDraft, type ParsedInput } from './services/llmService';
import { TermsModal } from './components/TermsModal';
import { useEncryptionStore } from './stores/encryptionStore';

function App() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingData, setPendingData] = useState<ParsedInput | null>(null);
  const [selectedFunction, setSelectedFunction] = useState<string | null>(null);
  const [sessionTime, setSessionTime] = useState('00:00:00');
  const [incidentModalOpen, setIncidentModalOpen] = useState(false);
  const isEncryptionReady = useEncryptionStore((state) => state.isReady);

  // Live Queries (Reactive, Single Source of Truth)
  // Limit to 500 most recent items to avoid performance issues with large datasets
  const behaviorEvents = useLiveQuery(
    async () => {
      if (!isEncryptionReady) return [];
      return getBehaviorEventsBySession(1, 500);
    },
    [isEncryptionReady]
  ) || [];

  const skillTrials = useLiveQuery(
    async () => {
      if (!isEncryptionReady) return [];
      return getSkillTrialsBySession(1, 500);
    },
    [isEncryptionReady]
  ) || [];

  const {
    noteDraft,
    isDrawerOpen,
    setNoteDraft,
    toggleDrawer,
    setDrawerOpen
  } = useSessionStore();

  const { incrementUnsyncedCount } = useSyncStore();

  // Demo client name
  const clientName = 'Alex B.';

  // Session timer
  useEffect(() => {
    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const hours = Math.floor(elapsed / 3600000);
      const minutes = Math.floor((elapsed % 3600000) / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      setSessionTime(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Generate note draft when events change
  useEffect(() => {
    if (behaviorEvents.length > 0 || skillTrials.length > 0) {
      const behaviors = behaviorEvents.map(e => ({
        type: e.behaviorType,
        count: e.count,
        duration: e.duration,
        antecedent: e.antecedent,
        function: e.functionGuess,
        intervention: e.intervention
      }));
      const trials = skillTrials.map(t => ({
        skill: t.skillName,
        target: t.target,
        response: t.response
      }));
      generateNoteDraft(behaviors, trials, clientName).then(setNoteDraft);
    }
  }, [behaviorEvents, skillTrials, setNoteDraft]);

  const addMessage = useCallback((
    role: ChatMessageData['role'],
    content: string,
    options?: Partial<ChatMessageData>
  ) => {
    const message: ChatMessageData = {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      role,
      content,
      timestamp: new Date(),
      ...options
    };
    setMessages(prev => [...prev, message]);
    return message.id;
  }, []);

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() || isProcessing) return;

    const userMessage = inputValue.trim();
    setInputValue('');
    addMessage('user', userMessage);
    setIsProcessing(true);

    try {
      // Parse the input using LLM or mock
      const parsed = await parseUserInput(userMessage);

      // If no data extracted, ask for clarification
      if (parsed.behaviors.length === 0 && (!parsed.skillTrials || parsed.skillTrials.length === 0) && !parsed.incident && !parsed.note) {
        addMessage('assistant', "I didn't catch any specific behaviors or skills. Could you try rephrasing? (e.g. 'Log elopement for 2 mins')");
        return;
      }

      setPendingData(parsed);

      // Generate confirmation response
      const confirmation = generateConfirmation(parsed);

      // Add assistant response
      const buttons = confirmation.buttons.map(btn => ({
        ...btn,
        variant: btn.value === 'yes' ? 'primary' as const : 'secondary' as const
      }));

      addMessage('assistant', confirmation.message, { buttons });

      // If we need function clarification, add those buttons too
      if (parsed.behaviors.length > 0 && !parsed.functionGuess) {
        setTimeout(() => {
          addMessage('system', 'What was the likely function?', {
            functionButtons: [
              { label: 'Escape', value: 'escape' },
              { label: 'Tangible', value: 'tangible' },
              { label: 'Attention', value: 'attention' },
              { label: 'Automatic', value: 'automatic' },
              { label: 'Unsure', value: 'unsure' }
            ]
          });
        }, 500);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      addMessage('assistant', 'Sorry, I had trouble understanding that. Could you try rephrasing?');
    } finally {
      setIsProcessing(false);
    }
  }, [inputValue, isProcessing, addMessage]);

  const handleButtonClick = useCallback(async (action: string, value: string) => {
    if (!isEncryptionReady) {
      addMessage('assistant', 'Your local encryption key is not unlocked. Please sign out and sign in again to access session data.');
      return;
    }

    if (action === 'confirm' && value === 'yes' && pendingData) {
      // Save the behavior events
      for (const behavior of pendingData.behaviors) {
        const event: BehaviorEvent = {
          sessionId: 1, // Demo session
          behaviorType: behavior.type,
          count: behavior.count,
          duration: behavior.duration,
          antecedent: pendingData.antecedent,
          functionGuess: selectedFunction as BehaviorEvent['functionGuess'] || pendingData.functionGuess,
          timestamp: new Date(),
          createdAt: new Date(),
          synced: false
        };

        await addBehaviorEvent(event);
        incrementUnsyncedCount();
      }

      // Save skill trials
      if (pendingData.skillTrials && pendingData.skillTrials.length > 0) {
        for (const trial of pendingData.skillTrials) {
          const skillTrial: Omit<SkillTrial, 'id'> = {
            sessionId: 1, // Demo session
            skillName: trial.skill,
            target: trial.target,
            promptLevel: (trial.promptLevel as SkillTrial['promptLevel']) || 'independent',
            response: (trial.response as SkillTrial['response']) || 'correct',
            reinforcementDelivered: false,
            timestamp: new Date(),
            createdAt: new Date(),
            synced: false
          };
          await addSkillTrial(skillTrial);
          // Note: need to add addSkillTrial to destructuring above if not present
          // userSessionStore destructuring has 'addSkillTrial' (verified in file view line 27)
          incrementUnsyncedCount();
        }
      }

      addMessage('assistant', '✓ Data logged successfully!');

      // Ask for intervention if not specified
      if (!pendingData.intervention) {
        setTimeout(() => {
          addMessage('system', 'Intervention used?', {
            functionButtons: [
              { label: 'Block', value: 'Block' },
              { label: 'Redirect', value: 'Redirect' },
              { label: 'FCR', value: 'FCR' },
              { label: 'Extinction', value: 'Extinction' }
            ]
          });
        }, 300);
      }

      setPendingData(null);
      setSelectedFunction(null);
    } else if (action === 'confirm' && value === 'no') {
      addMessage('assistant', 'No problem! What would you like to log instead?');
      setPendingData(null);
    } else if (action === 'logBehavior') {
      addMessage('assistant', 'What behavior did you observe?');
    } else if (action === 'logSkillTrial') {
      addMessage('assistant', 'What skill trial would you like to log? Include the skill name, target, and result.');
    }
  }, [pendingData, selectedFunction, incrementUnsyncedCount, addMessage, isEncryptionReady]);

  const handleFunctionSelect = useCallback((func: string) => {
    setSelectedFunction(func);
    // Update the most recent behavior event with this function
    if (pendingData && pendingData.behaviors.length > 0) {
      setPendingData({
        ...pendingData,
        functionGuess: func as ParsedInput['functionGuess']
      });
    }
  }, [pendingData]);

  const handleLogBehavior = useCallback(() => {
    addMessage('assistant', 'What behavior did you observe? Describe what happened including duration or frequency if applicable.');
  }, [addMessage]);

  const handleLogSkillTrial = useCallback(() => {
    addMessage('assistant', 'What skill trial would you like to log? Include the skill name, target, prompt level, and response.');
  }, [addMessage]);

  const handleLogABC = useCallback(() => {
    addMessage('assistant', 'Describe the ABC: What was the Antecedent (what happened before), the Behavior, and the Consequence (what happened after)?');
  }, [addMessage]);

  const handleDeliverReinforcement = useCallback(() => {
    addMessage('assistant', 'What reinforcement was delivered? (e.g., verbal praise, token, preferred item)');
  }, [addMessage]);

  const goToUsers = useCallback(() => {
    navigate('/admin/users');
  }, [navigate]);

  const goToLearners = useCallback(() => {
    navigate('/admin/learners');
  }, [navigate]);

  const goToAuditLogs = useCallback(() => {
    navigate('/admin/audit');
  }, [navigate]);

  const handleIncidentSubmit = useCallback(async (data: {
    incidentType: Incident['incidentType'];
    description: string;
    staffInvolved: string[];
    actionsToken: string[];
    injuries: string;
    parentNotified: boolean;
    supervisorNotified: boolean;
  }) => {
    if (!isEncryptionReady) {
      addMessage('assistant', 'Your local encryption key is not unlocked. Please sign out and sign in again to access incident logging.');
      return;
    }

    const incident: Incident = {
      sessionId: 1,
      incidentType: data.incidentType,
      description: data.description,
      staffInvolved: data.staffInvolved,
      actionsToken: data.actionsToken,
      injuries: data.injuries,
      parentNotified: data.parentNotified,
      supervisorNotified: data.supervisorNotified,
      timestamp: new Date(),
      createdAt: new Date(),
      synced: false
    };

    await addIncident(incident);
    incrementUnsyncedCount();

    addMessage('system', `⚠️ Incident report filed: ${data.incidentType}. ${data.parentNotified ? 'Parent notified.' : ''} ${data.supervisorNotified ? 'Supervisor notified.' : ''}`);
  }, [incrementUnsyncedCount, addMessage, isEncryptionReady]);

  return (
    <div className="app-shell">
      <div className="app-container">
        <section className="app-main">
          <Header
            clientName={clientName}
            sessionTime={sessionTime}
            onMenuClick={toggleDrawer}
          />

          {!isEncryptionReady && (
            <div className="encryption-warning">
              Local encrypted data is currently locked. Sign out and sign in again to log session entries.
            </div>
          )}

          {(user?.role === 'manager' || user?.role === 'bcba') && (
            <div className="admin-quick-access">
              {user.role === 'manager' && (
                <button className="admin-chip users" onClick={goToUsers}>
                  <span>👥</span>
                  Manage Users
                </button>
              )}
              <button className="admin-chip learners" onClick={goToLearners}>
                <span>👶</span>
                Caseload
              </button>
              <button className="admin-chip audit" onClick={goToAuditLogs}>
                <span>🧾</span>
                Audit Log
              </button>
            </div>
          )}

          <ChatArea
            messages={messages}
            onButtonClick={handleButtonClick}
            onFunctionSelect={handleFunctionSelect}
            selectedFunction={selectedFunction || undefined}
          />

          <ActionButtons
            onLogBehavior={handleLogBehavior}
            onLogSkillTrial={handleLogSkillTrial}
            onLogABC={handleLogABC}
            onDeliverReinforcement={handleDeliverReinforcement}
            onIncidentReport={() => setIncidentModalOpen(true)}
          />

          <MessageInput
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSendMessage}
            disabled={isProcessing}
            placeholder={isProcessing ? 'Processing...' : 'Type a message...'}
          />
        </section>

        <aside className="desktop-summary" aria-label="Session summary panel">
          <div className="desktop-summary-header">
            <h2>Session Summary</h2>
            <p>Live records and draft notes</p>
          </div>
          <SessionSummaryContent
            behaviorEvents={behaviorEvents}
            skillTrials={skillTrials}
            noteDraft={noteDraft}
          />
        </aside>
      </div>

      <SideDrawer
        isOpen={isDrawerOpen}
        onClose={() => setDrawerOpen(false)}
        behaviorEvents={behaviorEvents}
        skillTrials={skillTrials}
        noteDraft={noteDraft}
      />

      <IncidentButton
        onSubmit={handleIncidentSubmit}
        isOpen={incidentModalOpen}
        onOpenChange={setIncidentModalOpen}
      />
      <TermsModal />
    </div>
  );
}

export default App;
