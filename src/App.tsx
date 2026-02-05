import { useState, useCallback, useEffect } from 'react';
import { Header } from './components/Header';
import { ChatArea, MessageInput, type ChatMessageData } from './components/ChatArea';
import { ActionButtons } from './components/ActionButtons';
import { SideDrawer } from './components/SideDrawer';
import { IncidentButton } from './components/IncidentButton';
import { useSessionStore } from './stores/sessionStore';
import { useSyncStore } from './stores/syncStore';
import { db, type BehaviorEvent, type Incident } from './db/db';
import { parseUserInput, generateConfirmation, generateNoteDraft, type ParsedInput } from './services/llmService';
import './index.css';

function App() {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingData, setPendingData] = useState<ParsedInput | null>(null);
  const [selectedFunction, setSelectedFunction] = useState<string | null>(null);
  const [sessionTime, setSessionTime] = useState('00:00:00');

  const {
    behaviorEvents,
    skillTrials,
    noteDraft,
    isDrawerOpen,
    addBehaviorEvent,
    addSkillTrial,
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

        await db.behaviorEvents.add(event);
        addBehaviorEvent(event);
        incrementUnsyncedCount();
      }

      // Save skill trials
      if (pendingData.skillTrials && pendingData.skillTrials.length > 0) {
        for (const trial of pendingData.skillTrials) {
          const skillTrial = {
            sessionId: 1, // Demo session
            skillName: trial.skill,
            target: trial.target,
            promptLevel: trial.promptLevel as any || 'independent',
            response: trial.response as any || 'correct',
            reinforcementDelivered: false,
            timestamp: new Date(),
            createdAt: new Date(),
            synced: false
          };
          await db.skillTrials.add(skillTrial);
          // Note: need to add addSkillTrial to destructuring above if not present
          // userSessionStore destructuring has 'addSkillTrial' (verified in file view line 27)
          addSkillTrial(skillTrial);
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
  }, [pendingData, selectedFunction, addBehaviorEvent, incrementUnsyncedCount, addMessage]);

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

  const handleIncidentSubmit = useCallback(async (data: {
    incidentType: Incident['incidentType'];
    description: string;
    staffInvolved: string[];
    actionsToken: string[];
    injuries: string;
    parentNotified: boolean;
    supervisorNotified: boolean;
  }) => {
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

    await db.incidents.add(incident);
    incrementUnsyncedCount();

    addMessage('system', `⚠️ Incident report filed: ${data.incidentType}. ${data.parentNotified ? 'Parent notified.' : ''} ${data.supervisorNotified ? 'Supervisor notified.' : ''}`);
  }, [incrementUnsyncedCount, addMessage]);

  return (
    <div className="app-container">
      <Header
        clientName={clientName}
        sessionTime={sessionTime}
        onMenuClick={toggleDrawer}
      />

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
        onIncidentReport={() => { }} // Handled by IncidentButton
      />

      <MessageInput
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSendMessage}
        disabled={isProcessing}
        placeholder={isProcessing ? 'Processing...' : 'Type a message...'}
      />

      <SideDrawer
        isOpen={isDrawerOpen}
        onClose={() => setDrawerOpen(false)}
        behaviorEvents={behaviorEvents}
        skillTrials={skillTrials}
        noteDraft={noteDraft}
      />

      <IncidentButton onSubmit={handleIncidentSubmit} />
    </div>
  );
}

export default App;
