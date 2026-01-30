import React from 'react';
import { Clock, Plus, Trash2, Loader2 } from 'lucide-react';
import { ConversationThread } from '../types';

export interface ConversationSidebarThread extends ConversationThread {
  thumbnailUrl?: string;
  lastMessagePreview?: string;
}

interface ConversationSidebarProps {
  threads: ConversationSidebarThread[];
  currentThreadId?: string | null;
  onSelectThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onNewThread: () => void;
  generatingThreadIds: Set<string>;
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  threads,
  currentThreadId,
  onSelectThread,
  onDeleteThread,
  onNewThread,
  generatingThreadIds,
}) => {
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

  return (
    <div className="w-80 bg-slate-800 border-r border-slate-700 h-full flex flex-col">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white font-semibold">
          <Clock className="w-5 h-5 text-yellow-400" />
          Threads
        </div>
        <button
          onClick={onNewThread}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-500 text-slate-900 text-sm font-semibold hover:bg-yellow-400 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <div className="p-6 text-center text-slate-400">
            <p className="text-sm">No conversations yet</p>
            <p className="text-xs text-slate-500 mt-1">Start a new one to get going</p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {threads.map((thread) => {
              const isActive = thread.id === currentThreadId;
              return (
                <div
                  key={thread.id}
                  className={`group rounded-xl border cursor-pointer transition-colors ${
                    isActive
                      ? 'border-yellow-400 bg-yellow-500/10'
                      : 'border-slate-700 hover:border-slate-500 bg-slate-800/60'
                  }`}
                  onClick={() => onSelectThread(thread.id)}
                >
                  <div className="flex gap-3 p-3">
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-slate-900 border border-slate-700 flex-shrink-0">
                      {thread.thumbnailUrl ? (
                        <img
                          src={thread.thumbnailUrl}
                          alt="Thumbnail"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                          No preview
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-white font-semibold truncate flex-1 mr-2">
                          {thread.messages[0]?.content.find((c) => c.type === 'text')?.text ||
                            'New conversation'}
                        </p>
                        <div className="flex items-center gap-2">
                          {generatingThreadIds.has(thread.id) && (
                            <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm('Are you sure you want to delete this thread?')) {
                                onDeleteThread(thread.id);
                              }
                            }}
                            className="p-1 text-slate-400 hover:text-red-400"
                            title="Delete thread"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                        {thread.lastMessagePreview || ''}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Updated {formatTimestamp(thread.updatedAt)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};














