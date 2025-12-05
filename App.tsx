import React, { useEffect, useState } from 'react';
import { KeySelector } from './components/KeySelector';
import { ChatInterface } from './components/ChatInterface';

const App: React.FC = () => {
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(true);

  const checkKey = async () => {
    setChecking(true);
    try {
      const storedKey = localStorage.getItem('gemini-api-key');
      setHasKey(!!storedKey && storedKey.trim().length > 0);
    } catch (e) {
      console.error("Error checking API key", e);
      setHasKey(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkKey();
  }, []);

  const handleKeySelected = () => {
    setHasKey(true);
  };

  const handleResetKey = async () => {
    // If we get an error saying the key is invalid, we reset the UI state.
    // Clear the stored API key and return to the key selector screen.
    try {
      localStorage.removeItem('gemini-api-key');
    } catch (e) {
      console.error("Failed to clear API key", e);
    }
    setHasKey(false);
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-600 border-t-yellow-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!hasKey) {
    return <KeySelector onKeySelected={handleKeySelected} />;
  }

  return <ChatInterface onResetKey={handleResetKey} />;
};

export default App;