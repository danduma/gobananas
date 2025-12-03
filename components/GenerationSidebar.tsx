import React, { useState, useEffect } from 'react';
import { Clock, Download, Trash2, Cpu, Ratio, Maximize2, Grid, List } from 'lucide-react';
import { GeneratedImage } from '../types';
import { GenerationStorage } from '../services/generationStorage';

interface GenerationSidebarProps {
  onSelectGeneration: (generation: GeneratedImage) => void;
  currentGenerationId?: string;
  refreshTrigger?: number; // Used to trigger refresh from parent
}

export const GenerationSidebar: React.FC<GenerationSidebarProps> = ({
  onSelectGeneration,
  currentGenerationId,
  refreshTrigger
}) => {
  const [generations, setGenerations] = useState<GeneratedImage[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try {
      return (localStorage.getItem('nano-banana-sidebar-view') as 'grid' | 'list') || 'grid';
    } catch {
      return 'grid';
    }
  });

  const toggleViewMode = () => {
    const newMode = viewMode === 'grid' ? 'list' : 'grid';
    setViewMode(newMode);
    try {
      localStorage.setItem('nano-banana-sidebar-view', newMode);
    } catch (error) {
      console.warn('Failed to save view mode preference:', error);
    }
  };

  useEffect(() => {
    loadGenerations();
  }, [refreshTrigger]);

  // Also load generations when component mounts if directory access exists
  useEffect(() => {
    if (GenerationStorage.isReady()) {
      loadGenerations();
    }
  }, []);

  const loadGenerations = async () => {
    const loadedGenerations = await GenerationStorage.loadGenerations();
    setGenerations(loadedGenerations);
  };

  const handleDeleteGeneration = async (id: string) => {
    await GenerationStorage.deleteGeneration(id);
    setGenerations(prev => prev.filter(gen => gen.id !== id));
    setShowDeleteConfirm(null);
  };

  const handleDownloadImage = (generation: GeneratedImage) => {
    const link = document.createElement('a');
    link.href = generation.url;
    link.download = `nano-banana-${generation.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  const getModelDisplayName = (model: string) => {
    switch (model) {
      case 'gemini-3-pro-image-preview':
        return 'Nano Banana Pro';
      case 'gemini-2.5-flash-image':
        return 'Nano Banana';
      case 'gemini-pro-vision':
        return 'Gemini Pro Vision';
      default:
        return model;
    }
  };

  return (
    <div className="w-72 bg-slate-800 border-r border-slate-700 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Clock className="w-5 h-5 text-yellow-500 flex-shrink-0" />
            <h2 className="text-lg font-semibold text-white truncate">
              Generation History
            </h2>
          </div>
          <button
            onClick={toggleViewMode}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-colors flex-shrink-0"
            title={`Switch to ${viewMode === 'grid' ? 'list' : 'grid'} view`}
          >
            {viewMode === 'grid' ? (
              <List className="w-4 h-4" />
            ) : (
              <Grid className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="text-sm text-slate-400 mt-1">
          {GenerationStorage.isReady()
            ? `${generations.length} saved in ${GenerationStorage.getDirectoryName()}`
            : generations.length > 0
              ? `${generations.length} cached (reconnect folder to sync)`
              : 'Select a save folder to view generations'
          }
        </p>
      </div>

      {/* Generations List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {!GenerationStorage.isReady() && generations.length === 0 ? (
          <div className="p-6 text-center text-slate-500">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Select a save folder</p>
            <p className="text-xs opacity-70">Choose a folder in the main panel to start saving generations</p>
          </div>
        ) : (
          <div className={`p-2 ${viewMode === 'grid' ? 'space-y-2' : 'space-y-1'}`}>
            {generations.map((generation) => (
              viewMode === 'grid' ? (
                // Grid View (current layout)
                <div
                  key={generation.id}
                  className={`group relative bg-slate-700/50 rounded-lg border transition-all cursor-pointer ${
                    currentGenerationId === generation.id
                      ? 'border-yellow-500 bg-slate-700'
                      : 'border-slate-600 hover:border-slate-500'
                  }`}
                >
                  {/* Image Preview */}
                  <div className="h-32 rounded-t-lg overflow-hidden">
                    <img
                      src={generation.url}
                      alt={generation.prompt.substring(0, 50)}
                      className="w-full h-full object-cover"
                      onClick={() => onSelectGeneration(generation)}
                    />
                  </div>

                  {/* Content */}
                  <div className="p-3">
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-xs text-slate-400">
                        {formatTimestamp(generation.timestamp)}
                      </p>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadImage(generation);
                          }}
                          className="p-1 text-slate-400 hover:text-white hover:bg-slate-600 rounded"
                          title="Download"
                        >
                          <Download className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDeleteConfirm(generation.id);
                          }}
                          className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-600 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="space-y-1 text-xs text-slate-400">
                      <div className="flex items-center gap-1">
                        <Cpu className="w-3 h-3" />
                        <span>{getModelDisplayName(generation.model)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <Ratio className="w-3 h-3" />
                          <span>{generation.aspectRatio}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Maximize2 className="w-3 h-3" />
                          <span>{generation.imageSize}</span>
                        </div>
                      </div>
                    </div>

                    {/* Prompt Preview */}
                    <p className="text-xs text-slate-300 mt-2 line-clamp-3">
                      {generation.prompt}
                    </p>
                  </div>

                  {/* Delete Confirmation */}
                  {showDeleteConfirm === generation.id && (
                    <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm rounded-lg flex items-center justify-center p-4">
                      <div className="text-center">
                        <p className="text-white text-sm mb-3">Delete this generation?</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDeleteGeneration(generation.id)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(null)}
                            className="px-3 py-1 bg-slate-600 hover:bg-slate-700 text-white text-xs rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // List View (compact horizontal layout)
                <div
                  key={generation.id}
                  className={`group relative bg-slate-700/50 rounded-lg border transition-all cursor-pointer ${
                    currentGenerationId === generation.id
                      ? 'border-yellow-500 bg-slate-700'
                      : 'border-slate-600 hover:border-slate-500'
                  }`}
                  onClick={() => onSelectGeneration(generation)}
                >
                  <div className="flex p-3 gap-3">
                    {/* Thumbnail */}
                    <div className="flex-shrink-0">
                      <div className="w-16 h-16 rounded-lg overflow-hidden">
                        <img
                          src={generation.url}
                          alt={generation.prompt.substring(0, 30)}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-1">
                        <p className="text-xs text-slate-400">
                          {formatTimestamp(generation.timestamp)}
                        </p>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadImage(generation);
                            }}
                            className="p-1 text-slate-400 hover:text-white hover:bg-slate-600 rounded"
                            title="Download"
                          >
                            <Download className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDeleteConfirm(generation.id);
                            }}
                            className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-600 rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Compact Metadata */}
                      <div className="flex items-center gap-3 text-xs text-slate-400 mb-1">
                        <div className="flex items-center gap-1">
                          <Cpu className="w-3 h-3" />
                          <span>{getModelDisplayName(generation.model)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Ratio className="w-3 h-3" />
                          <span>{generation.aspectRatio}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Maximize2 className="w-3 h-3" />
                          <span>{generation.imageSize}</span>
                        </div>
                      </div>

                      {/* Prompt Preview */}
                      <p className="text-xs text-slate-300 line-clamp-2">
                        {generation.prompt}
                      </p>
                    </div>
                  </div>

                  {/* Delete Confirmation for List View */}
                  {showDeleteConfirm === generation.id && (
                    <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm rounded-lg flex items-center justify-center p-4">
                      <div className="text-center">
                        <p className="text-white text-sm mb-3">Delete this generation?</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDeleteGeneration(generation.id)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(null)}
                            className="px-3 py-1 bg-slate-600 hover:bg-slate-700 text-white text-xs rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            ))}
          </div>
        )}


      </div>


    </div>
  );
};
