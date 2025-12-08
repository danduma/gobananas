import React, { useEffect, useState } from 'react';
import { Key, ExternalLink, Save, Loader2 } from 'lucide-react';
import { FileSystemStorage } from '../services/fileSystemStorage';

interface KeySelectorProps {
  onKeySelected: () => void;
}

export const KeySelector: React.FC<KeySelectorProps> = ({ onKeySelected }) => {
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const existing = localStorage.getItem('gemini-api-key');
      if (existing) {
        setApiKey(existing);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleSaveKey = async () => {
    if (!apiKey.trim()) {
      setError('Please enter an API key');
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      await FileSystemStorage.saveApiKey(apiKey.trim());
      onKeySelected();
    } catch (error) {
      console.error("Failed to save API key", error);
      setError('Failed to save API key. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveKey();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="max-w-md w-full bg-slate-800 rounded-2xl p-8 shadow-2xl border border-slate-700 text-center">
        <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <Key className="w-8 h-8 text-yellow-500" />
        </div>
        
        <h1 className="text-3xl font-bold text-white mb-2">Nano Banana Pro</h1>
        <p className="text-slate-400 mb-6">
          To generate high-quality 4K images with the Gemini 3 Pro model, you need a paid API key.
        </p>

        <div className="space-y-4 mb-6">
          <div>
            <label htmlFor="api-key" className="block text-sm font-medium text-slate-300 mb-2">
              Paste your Gemini API Key
            </label>
            <input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter your API key here..."
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              disabled={isSaving}
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            onClick={handleSaveKey}
            disabled={isSaving || !apiKey.trim()}
            className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:bg-slate-600 disabled:cursor-not-allowed text-slate-900 font-bold py-3 px-6 rounded-lg transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save API Key
              </>
            )}
          </button>
        </div>

        <div className="text-xs text-slate-500 border-t border-slate-700 pt-4">
          <p className="mb-2">This app requires a paid GCP project key for the Pro model.</p>
          <a 
            href="https://ai.google.dev/gemini-api/docs/billing" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-yellow-500 hover:text-yellow-400 flex items-center justify-center gap-1 transition-colors"
          >
            Billing Documentation <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
};