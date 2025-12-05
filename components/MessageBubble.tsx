import React from 'react';
import { ConversationMessage } from '../types';

interface MessageBubbleProps {
  message: ConversationMessage;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} w-full`}>
      <div
        className={`max-w-3xl rounded-2xl p-4 shadow-lg border ${
          isUser
            ? 'bg-yellow-500/10 border-yellow-400/30 text-yellow-100'
            : 'bg-slate-800 border-slate-700 text-slate-50'
        }`}
      >
        <div className="space-y-3">
          {message.content.map((content, idx) => {
            if (content.type === 'text') {
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
                  <img
                    src={content.url}
                    alt={content.imageId}
                    className="rounded-xl max-h-[420px] object-contain border border-slate-700"
                  />
                ) : (
                  <div className="rounded-xl h-48 bg-slate-900/60 border border-slate-700 flex items-center justify-center text-slate-500 text-sm">
                    Image loading...
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
