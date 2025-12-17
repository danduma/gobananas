import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Download, MoreVertical } from 'lucide-react';
import { ConversationMessage } from '../types';

interface MessageBubbleProps {
  message: ConversationMessage;
  onFork: (messageId: string) => void;
  onRerun: (messageId: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onFork, onRerun }) => {
  const isUser = message.role === 'user';
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleThoughts = (id: string) => {
    setExpandedThoughts((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} w-full`}
      onMouseLeave={() => setMenuOpen(false)}
    >
      <div
        className={`relative max-w-3xl rounded-2xl p-4 shadow-lg border ${
          isUser
            ? 'bg-yellow-500/10 border-yellow-400/30 text-yellow-100'
            : 'bg-slate-800 border-slate-700 text-slate-50'
        }`}
      >
        <div className="absolute top-2 right-2">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="p-1.5 rounded-full hover:bg-slate-700/50 text-slate-300"
            aria-label="Message actions"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-40 rounded-lg border border-slate-700 bg-slate-900 shadow-lg z-10">
              <button
                type="button"
                onClick={() => {
                  onFork(message.id);
                  setMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 rounded-t-lg"
              >
                Fork from here
              </button>
              {isUser && (
                <button
                  type="button"
                  onClick={() => {
                    onRerun(message.id);
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 rounded-b-lg"
                >
                  Re-run from here
                </button>
              )}
            </div>
          )}
        </div>
        <div className="space-y-3">
          {message.content.map((content, idx) => {
            if (content.type === 'text') {
              if (content.isThought) return null;
              return (
                <p key={idx} className="whitespace-pre-wrap leading-relaxed">
                  {content.text}
                </p>
              );
            }

            return (
              <div key={idx} className="space-y-2">
                <div className="text-xs uppercase tracking-wide text-slate-400">
                  {content.isInputImage ? 'Attached image' : 'Generated image'}
                </div>
                {content.url ? (
                  <div className="relative group inline-block">
                    <img
                      src={content.url}
                      alt={content.imageId}
                      className="rounded-xl max-h-[420px] object-contain border border-slate-700"
                    />
                    <a
                      href={content.url}
                      download={content.imageId || 'image'}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity absolute top-2 right-2 bg-black/60 text-white rounded-full p-2 border border-white/10 shadow-lg backdrop-blur-sm"
                      aria-label="Download image"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                ) : (
                  <div className="rounded-xl h-48 bg-slate-900/60 border border-slate-700 flex items-center justify-center text-slate-500 text-sm">
                    Image loading...
                  </div>
                )}
                {content.thoughtSummaries && content.thoughtSummaries.length > 0 && (
                  <div className="bg-slate-900/60 border border-slate-700 rounded-xl">
                    <button
                      type="button"
                      onClick={() => toggleThoughts(`${message.id}-${content.imageId}-thoughts`)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 rounded-t-xl"
                    >
                      <span className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-400">
                        Model thoughts
                        <span className="text-slate-500 text-[10px]">({content.thoughtSummaries.length})</span>
                      </span>
                      {expandedThoughts[`${message.id}-${content.imageId}-thoughts`] ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                    {expandedThoughts[`${message.id}-${content.imageId}-thoughts`] && (
                      <div className="px-3 pb-3 space-y-2 text-sm text-slate-200">
                        {content.thoughtSummaries.map((summary, i) => (
                          <div
                            key={i}
                            className="rounded-lg border border-slate-800/80 bg-slate-900/80 px-3 py-2 leading-relaxed"
                          >
                            {summary}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="text-[11px] text-slate-400 mt-2 text-right">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};

