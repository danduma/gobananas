import React, { useState, useEffect } from 'react';
import { Download, Sparkles, AlertCircle, Image as ImageIcon, Maximize2, Ratio, Cpu, Sidebar, ChevronLeft, ChevronRight, Key, X, Save, Loader2 } from 'lucide-react';
import { AspectRatio, LegacyGenerationConfig, ImageSize, Model } from '../types';
import { generateImageWithGemini, APIKeyError } from '../services/geminiService';
import { GenerationStorage } from '../services/generationStorage';
import { GenerationSidebar } from './GenerationSidebar';
import { GeneratedImage } from '../types';
import { FileSystemStorage } from '../services/fileSystemStorage';

// Custom styles for the temperature slider
const sliderStyles = `
  .slider::-webkit-slider-thumb {
    appearance: none;
    height: 16px;
    width: 16px;
    border-radius: 50%;
    background: #fbbf24;
    cursor: pointer;
    border: 2px solid #374151;
    box-shadow: 0 0 0 2px #1f2937;
  }
  .slider::-moz-range-thumb {
    height: 16px;
    width: 16px;
    border-radius: 50%;
    background: #fbbf24;
    cursor: pointer;
    border: 2px solid #374151;
    box-shadow: 0 0 0 2px #1f2937;
  }
`;

interface GeneratorProps {
  onResetKey: () => void;
}

export const Generator: React.FC<GeneratorProps> = ({ onResetKey }) => {
  const [prompt, setPrompt] = useState(() => {
    try {
      return localStorage.getItem('gemini-prompt') || '';
    } catch {
      return '';
    }
  });
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [imageSize, setImageSize] = useState<ImageSize>('1K');
  const [model, setModel] = useState<Model>('gemini-3-pro-image-preview');
  const [temperature, setTemperature] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentGenerationId, setCurrentGenerationId] = useState<string | undefined>(undefined);
  const [saveDirectory, setSaveDirectory] = useState<string | null>(() => {
    try {
      return localStorage.getItem('nano-banana-save-directory');
    } catch {
      return null;
    }
  });
  const [sidebarRefreshTrigger, setSidebarRefreshTrigger] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('nano-banana-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newApiKey, setNewApiKey] = useState('');
  const [keyModalSaving, setKeyModalSaving] = useState(false);
  const [keyModalError, setKeyModalError] = useState('');

  useEffect(() => {
    const bootstrap = async () => {
      await FileSystemStorage.init();
      const dirName = FileSystemStorage.getDirectoryName();
      if (dirName) {
        setSaveDirectory(dirName);
        try {
          localStorage.setItem('nano-banana-save-directory', dirName);
        } catch {
          // ignore
        }
      }
    };
    bootstrap();
  }, []);

  // Save prompt to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('gemini-prompt', prompt);
    } catch (error) {
      console.warn('Failed to save prompt to localStorage:', error);
    }
  }, [prompt]);

  const handleSelectGeneration = (generation: GeneratedImage) => {
    setGeneratedImage(generation.url);
    setCurrentGenerationId(generation.id);
    // Optionally populate the form with the generation's settings
    setPrompt(generation.prompt);
    setModel(generation.model);
    setAspectRatio(generation.aspectRatio);
    setImageSize(generation.imageSize);
    setTemperature(generation.temperature ?? 1);
  };

  const handleSelectDirectory = async () => {
    const success = await FileSystemStorage.selectDirectory();
    if (success) {
      const dirName = FileSystemStorage.getDirectoryName();
      setSaveDirectory(dirName);
      try {
        localStorage.setItem('nano-banana-save-directory', dirName || '');
      } catch (error) {
        console.warn('Failed to save directory preference:', error);
      }
      // Refresh sidebar to load existing generations from the folder
      setSidebarRefreshTrigger(prev => prev + 1);
    }
  };

  const toggleSidebar = () => {
    const newCollapsed = !sidebarCollapsed;
    setSidebarCollapsed(newCollapsed);
    try {
      localStorage.setItem('nano-banana-sidebar-collapsed', newCollapsed.toString());
    } catch (error) {
      console.warn('Failed to save sidebar preference:', error);
    }
  };

  const handleChangeKey = () => {
    setShowKeyModal(true);
    setNewApiKey('');
    setKeyModalError('');
  };

  const handleSaveNewKey = async () => {
    if (!newApiKey.trim()) {
      setKeyModalError('Please enter an API key');
      return;
    }

    setKeyModalSaving(true);
    setKeyModalError('');
    try {
      // Store the new API key in localStorage
      localStorage.setItem('gemini-api-key', newApiKey.trim());
      setShowKeyModal(false);
      // Show a brief success message or just close the modal
    } catch (error) {
      console.error("Failed to save API key", error);
      setKeyModalError('Failed to save API key. Please try again.');
    } finally {
      setKeyModalSaving(false);
    }
  };

  const handleCancelKeyChange = () => {
    setShowKeyModal(false);
    setNewApiKey('');
    setKeyModalError('');
  };

  // Try to restore directory access on page load
  useEffect(() => {
    const restoreDirectoryAccess = async () => {
      if (saveDirectory && !FileSystemStorage.hasDirectoryAccess()) {
        // We can't actually restore the permission, but we can show the UI state
        // The user will need to re-select, but at least we remember their preference
        console.log('Directory previously selected:', saveDirectory);
      }
    };
    restoreDirectoryAccess();
  }, [saveDirectory]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    if (!GenerationStorage.isReady()) {
      const success = await FileSystemStorage.selectDirectory();
      if (!success) {
        setError('Please select a save folder to continue generating images.');
        return;
      }
      const dirName = FileSystemStorage.getDirectoryName();
      setSaveDirectory(dirName);
      try {
        localStorage.setItem('nano-banana-save-directory', dirName || '');
      } catch (error) {
        console.warn('Failed to save directory preference:', error);
      }
    }

    setLoading(true);
    setError(null);
    setGeneratedImage(null);
    setCurrentGenerationId(undefined);

    try {
      const config: LegacyGenerationConfig = {
        prompt,
        aspectRatio,
        imageSize,
        model,
        temperature,
      };

      const result = await generateImageWithGemini(config);
      setGeneratedImage(result);

      // Extract base64 data from data URL and save generation
      const base64Data = result.split(',')[1]; // Remove 'data:image/png;base64,' prefix
      const savedGeneration = await GenerationStorage.saveGeneration(config, result, base64Data);

      // Set the current generation ID
      setCurrentGenerationId(savedGeneration.id);

      // Trigger sidebar refresh
      setSidebarRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      if (err instanceof APIKeyError) {
        onResetKey();
        return;
      }
      setError(err.message || 'An unexpected error occurred while generating the image.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: sliderStyles }} />
      <div className="h-screen bg-slate-900 text-slate-100 flex overflow-hidden">
      {/* Sidebar */}
      {!sidebarCollapsed && (
        <GenerationSidebar
          onSelectGeneration={handleSelectGeneration}
          currentGenerationId={currentGenerationId}
          refreshTrigger={sidebarRefreshTrigger}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 p-4 md:p-8 relative">
        {/* Sidebar Toggle Button */}
        <button
          onClick={toggleSidebar}
          className="fixed top-4 left-4 z-50 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg p-2 shadow-lg transition-colors"
          title={sidebarCollapsed ? 'Show History' : 'Hide History'}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-5 h-5 text-slate-300" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-slate-300" />
          )}
        </button>

        <div className="max-w-5xl mx-auto grid grid-cols-1 xl:grid-cols-2 gap-8">
        
        {/* Left Panel: Controls */}
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-extrabold bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
                  Go Bananas! Studio
                </h1>
                <p className="text-slate-400">Create stunning visuals with 🍌.</p>
              </div>
              <button
                onClick={handleChangeKey}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-slate-300 hover:text-white transition-colors text-sm flex items-center gap-2"
                title="Change API Key"
              >
                <Key className="w-4 h-4" />
                Change Key
              </button>
            </div>
          </div>

          <form onSubmit={handleGenerate} className="space-y-6 bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="A futuristic city with flying cars in a neon noir style..."
                className="w-full h-32 bg-slate-900 border border-slate-700 rounded-xl p-4 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none resize-none transition-all"
                required
              />
            </div>

            {/* Directory Status Indicator */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  FileSystemStorage.hasDirectoryAccess()
                    ? 'bg-green-400'
                    : saveDirectory
                      ? 'bg-yellow-400'
                      : 'bg-red-400'
                }`} />
                <span className="text-slate-400">
                  {FileSystemStorage.hasDirectoryAccess()
                    ? `Saving to: ${saveDirectory}`
                    : saveDirectory
                      ? `${saveDirectory} (reconnect needed)`
                      : 'No save folder selected'
                  }
                </span>
              </div>
              <button
                type="button"
                onClick={handleSelectDirectory}
                className="text-slate-400 hover:text-white transition-colors underline text-xs"
              >
                {FileSystemStorage.hasDirectoryAccess() ? 'Change' : 'Select'}
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300 flex items-center gap-2">
                  <Cpu className="w-4 h-4" /> AI Model
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value as Model)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-100 focus:ring-2 focus:ring-yellow-500 outline-none"
                >
                  <option value="gemini-3-pro-image-preview">Nano Banana Pro (Gemini 3 Pro Image Preview)</option>
                  <option value="gemini-2.5-flash-image">Nano Banana (Gemini 2.5 Flash Image)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-300 flex items-center gap-2">
                    <Ratio className="w-4 h-4" /> Aspect Ratio
                  </label>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-100 focus:ring-2 focus:ring-yellow-500 outline-none"
                  >
                    <option value="1:1">1:1 (Square)</option>
                    <option value="16:9">16:9 (Landscape)</option>
                    <option value="9:16">9:16 (Portrait)</option>
                    <option value="4:3">4:3 (Standard)</option>
                    <option value="3:4">3:4 (Tall)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-300 flex items-center gap-2">
                    <Maximize2 className="w-4 h-4" /> Resolution
                  </label>
                  <select
                    value={imageSize}
                    onChange={(e) => setImageSize(e.target.value as ImageSize)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-100 focus:ring-2 focus:ring-yellow-500 outline-none"
                  >
                    <option value="1K">1K (Fast)</option>
                    <option value="2K">2K (High Quality)</option>
                    <option value="4K">4K (Ultra HD)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> Temperature
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
                    className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-100 text-sm focus:ring-1 focus:ring-yellow-500 outline-none"
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Conservative (0)</span>
                  <span>Balanced (1)</span>
                  <span>Creative (2)</span>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all transform ${
                loading || !prompt.trim()
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-400 hover:to-orange-500 text-white shadow-lg shadow-orange-500/20 active:scale-[0.98]'
              }`}
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate Image
                </>
              )}
            </button>
            
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex items-start gap-3 text-red-400 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}
          </form>
          
        </div>

        {/* Right Panel: Preview */}
        <div className="flex flex-col h-full min-h-[500px] bg-slate-800/30 rounded-3xl border-2 border-dashed border-slate-700 p-2 relative overflow-hidden group">
          
          {generatedImage ? (
            <div className="relative w-full h-full flex items-center justify-center bg-black/50 rounded-2xl overflow-hidden">
               <img 
                 src={generatedImage} 
                 alt={prompt}
                 className="max-w-full max-h-full object-contain shadow-2xl"
               />
               <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                 <a
                   href={generatedImage}
                   download={`gemini-pro-${Date.now()}.png`}
                   className="bg-slate-900/80 hover:bg-slate-900 text-white p-3 rounded-full backdrop-blur-sm transition-colors border border-slate-600"
                   title="Download Image"
                 >
                   <Download className="w-5 h-5" />
                 </a>
               </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
              <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                <ImageIcon className="w-10 h-10 opacity-50" />
              </div>
              <p className="text-lg font-medium">No image generated yet</p>
              <p className="text-sm opacity-60">Enter a prompt to start creating</p>
            </div>
          )}

          {loading && (
             <div className="absolute inset-0 z-10 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center">
                <div className="w-12 h-12 border-4 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin mb-4" />
                <p className="text-yellow-500 font-medium animate-pulse">Dreaming up pixels...</p>
             </div>
          )}
        </div>

        </div>
      </div>

      {/* API Key Change Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="max-w-md w-full bg-slate-800 rounded-2xl p-8 shadow-2xl border border-slate-700 relative">
            {/* Close button */}
            <button
              onClick={handleCancelKeyChange}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Key className="w-8 h-8 text-yellow-500" />
            </div>

            <h2 className="text-2xl font-bold text-white mb-2 text-center">Change API Key</h2>
            <p className="text-slate-400 mb-6 text-center">
              Enter your new Gemini API key below. Your current key will be replaced.
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label htmlFor="new-api-key" className="block text-sm font-medium text-slate-300 mb-2">
                  New Gemini API Key
                </label>
                <input
                  id="new-api-key"
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="Enter your new API key..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  disabled={keyModalSaving}
                  autoFocus
                />
              </div>

              {keyModalError && (
                <p className="text-red-400 text-sm">{keyModalError}</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleCancelKeyChange}
                  disabled={keyModalSaving}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-slate-300 hover:text-white py-3 px-4 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNewKey}
                  disabled={keyModalSaving || !newApiKey.trim()}
                  className="flex-1 bg-yellow-500 hover:bg-yellow-400 disabled:bg-slate-600 disabled:cursor-not-allowed text-slate-900 font-bold py-3 px-4 rounded-lg transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2"
                >
                  {keyModalSaving ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      Save Key
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
};