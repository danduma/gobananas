import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Image as ImageIcon, Loader2, Paperclip, Send, Upload, Key } from 'lucide-react';
import {
  AspectRatio,
  ConversationMessage,
  ConversationThread,
  GenerationConfig,
  ImageSize,
  Model,
} from '../types';
import { ConversationStorage } from '../services/conversationStorage';
import { FileSystemStorage } from '../services/fileSystemStorage';
import { generateImageFromConversation } from '../services/geminiService';
import { MessageBubble } from './MessageBubble';
import { ImageAttachment } from './ImageAttachment';
import {
  ConversationSidebar,
  ConversationSidebarThread,
} from './ConversationSidebar';

interface ChatInterfaceProps {
  onResetKey: () => void;
}

type ThreadWithUi = ConversationSidebarThread;

const createId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ onResetKey }) => {
  const [messageInput, setMessageInput] = useState('');
  const [attachedImages, setAttachedImages] = useState<File[]>([]);
  const [threads, setThreads] = useState<ThreadWithUi[]>([]);
  const [currentThread, setCurrentThread] = useState<ThreadWithUi | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveDirectory, setSaveDirectory] = useState<string | null>(() => {
    try {
      return localStorage.getItem('nano-banana-save-directory');
    } catch {
      return null;
    }
  });
  const [selectingFolder, setSelectingFolder] = useState(false);
  const [model, setModel] = useState<Model>('gemini-3-pro-image-preview');
  const [temperature, setTemperature] = useState<number>(1);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [imageSize, setImageSize] = useState<ImageSize>('1K');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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
      if (FileSystemStorage.hasDirectoryAccess()) {
        await initializeThreads();
      }
    };
    bootstrap();
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentThread?.messages.length]);

  const initializeThreads = async () => {
    await ConversationStorage.migrateOldGenerations();
    await refreshThreads();
  };

  const refreshThreads = async () => {
    const loaded = await ConversationStorage.loadThreads();
    const withThumbs: ThreadWithUi[] = await Promise.all(
      loaded.map(async (thread) => {
        const computedThumb = thread.thumbnailImageId
          ? await loadImageUrl(thread.thumbnailImageId, false)
          : undefined;
        return {
          ...thread,
          thumbnailUrl: computedThumb || thread.thumbnailUrl,
          lastMessagePreview: getLastTextPreview(thread),
        };
      })
    );

    setThreads(withThumbs);

    // Backfill missing thumbnails for existing threads so previews persist
    const backfillNeeded = withThumbs.filter(
      (thread, idx) => !loaded[idx]?.thumbnailUrl && thread.thumbnailUrl
    );
    if (backfillNeeded.length > 0) {
      await Promise.all(backfillNeeded.map((thread) => ConversationStorage.saveThread(thread)));
    }

    if (!currentThread && withThumbs.length > 0) {
      handleSelectThread(withThumbs[0].id);
    }
  };

  const getLastTextPreview = (thread: ConversationThread): string | undefined => {
    const lastMessage = thread.messages[thread.messages.length - 1];
    const textContent = lastMessage?.content.find((c) => c.type === 'text');
    return textContent && textContent.type === 'text' ? textContent.text : undefined;
  };

  const loadImageUrl = async (
    imageId: string,
    isInputImage: boolean,
    mimeType: string = 'image/png'
  ): Promise<string | undefined> => {
    try {
      const base64 = await FileSystemStorage.loadImageData(imageId, isInputImage, mimeType);
      if (!base64) return undefined;
      return `data:${mimeType};base64,${base64}`;
    } catch (err) {
      console.warn('Failed to load image data', err);
      return undefined;
    }
  };

  const hydrateThread = async (thread: ConversationThread): Promise<ThreadWithUi> => {
    const hydratedMessages: ConversationMessage[] = await Promise.all(
      thread.messages.map(async (msg) => {
        const content = await Promise.all(
          msg.content.map(async (item) => {
            if (item.type === 'image') {
              const url = await loadImageUrl(item.imageId, item.isInputImage, item.mimeType);
              return { ...item, url };
            }
            return item;
          })
        );
        return { ...msg, content };
      })
    );

    return {
      ...thread,
      messages: hydratedMessages,
      thumbnailUrl: thread.thumbnailImageId
        ? await loadImageUrl(thread.thumbnailImageId, false)
        : undefined,
      lastMessagePreview: getLastTextPreview(thread),
    };
  };

  const ensureDirectoryAccess = async (forcePick = false) => {
    // When the user explicitly clicks "Change folder" we want to force the picker
    // even if we already have a directory saved.
    if (!forcePick && FileSystemStorage.hasDirectoryAccess()) return true;

    const success = await FileSystemStorage.selectDirectory();
    if (success) {
      const dirName = FileSystemStorage.getDirectoryName();
      setSaveDirectory(dirName);
      try {
        localStorage.setItem('nano-banana-save-directory', dirName || '');
      } catch (err) {
        console.warn('Failed to store directory preference', err);
      }
      await initializeThreads();
    }
    return success;
  };

  const handleSelectDirectory = async () => {
    if (selectingFolder) return;
    setSelectingFolder(true);
    try {
      await ensureDirectoryAccess(true);
    } finally {
      setSelectingFolder(false);
    }
  };

  const addImageAttachments = (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) return;
    setAttachedImages((prev) => [...prev, ...images]);
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;
    addImageAttachments(Array.from(files));
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(event.clipboardData?.items || []);
    const images = items
      .map((item) => (item.kind === 'file' ? item.getAsFile() : null))
      .filter((file): file is File => Boolean(file && file.type.startsWith('image/')));
    if (images.length > 0) {
      event.preventDefault();
      addImageAttachments(images);
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    handleFilesSelected(event.dataTransfer.files);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleNewConversation = () => {
    setCurrentThread(null);
    setMessageInput('');
    setAttachedImages([]);
  };

  const handleSelectThread = async (threadId: string) => {
    const stored = await ConversationStorage.getThread(threadId);
    if (!stored) return;
    const hydrated = await hydrateThread(stored);
    setCurrentThread(hydrated);
    setModel(hydrated.model);
    setTemperature(hydrated.temperature);
  };

  const handleDeleteThread = async (threadId: string) => {
    await ConversationStorage.deleteThread(threadId);
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    if (currentThread?.id === threadId) {
      setCurrentThread(null);
    }
  };

  const buildUserMessage = async (): Promise<ConversationMessage> => {
    const contents: ConversationMessage['content'] = [];

    if (messageInput.trim()) {
      contents.push({
        type: 'text',
        text: `${messageInput.trim()}\n\n[Image settings: aspect ratio ${aspectRatio}, resolution ${imageSize}]`,
      });
    } else {
      contents.push({
        type: 'text',
        text: `[Image settings: aspect ratio ${aspectRatio}, resolution ${imageSize}]`,
      });
    }

    for (const file of attachedImages) {
      const extension = file.name.split('.').pop() || 'png';
      const imageId = `${createId('input')}.${extension}`;
      await FileSystemStorage.saveInputImage(file, imageId);
      const url = URL.createObjectURL(file);
      contents.push({
        type: 'image',
        imageId,
        mimeType: file.type || 'image/png',
        url,
        isInputImage: true,
      });
    }

    return {
      id: createId('msg'),
      role: 'user',
      content: contents,
      timestamp: Date.now(),
    };
  };

  const persistThread = async (thread: ThreadWithUi) => {
    await ConversationStorage.saveThread(thread);
    setThreads((prev) => {
      const updated = [...prev];
      const idx = updated.findIndex((t) => t.id === thread.id);
      if (idx >= 0) {
        updated[idx] = thread;
      } else {
        updated.unshift(thread);
      }
      return updated.sort((a, b) => b.updatedAt - a.updatedAt);
    });
  };

  const handleSendMessage = async () => {
    if (isGenerating) return;
    if (!messageInput.trim() && attachedImages.length === 0) return;

    const hasAccess = await ensureDirectoryAccess();
    if (!hasAccess) {
      setError('Please select a save folder to continue.');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const userMessage = await buildUserMessage();

      const baseThread: ConversationThread = currentThread
        ? currentThread
        : {
            id: createId('thread'),
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            model,
            temperature,
          };

      const workingThread: ThreadWithUi = {
        ...baseThread,
        messages: [...baseThread.messages, userMessage],
      };

      // Immediately reflect the new user message and hide the empty-state placeholder
      setCurrentThread(workingThread);
      setThreads((prev) => {
        const existingIndex = prev.findIndex((t) => t.id === workingThread.id);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...workingThread,
            lastMessagePreview: getLastTextPreview(workingThread),
          };
          return updated;
        }
        return [
          {
            ...workingThread,
            lastMessagePreview: getLastTextPreview(workingThread),
          },
          ...prev,
        ];
      });

      const generationConfig: GenerationConfig = {
        model: workingThread.model,
        temperature: workingThread.temperature,
        aspectRatio,
        imageSize,
      };

      const { dataUrl: imageDataUrl, mimeType, thoughtSummaries } = await generateImageFromConversation(workingThread.messages, generationConfig);
      const base64Data = imageDataUrl.split(',')[1];
      const imageId = createId('gen');
      await FileSystemStorage.saveImage(imageId, base64Data, mimeType);

      const assistantMessage: ConversationMessage = {
        id: createId('msg'),
        role: 'assistant',
        content: [
          {
            type: 'image',
            imageId,
            mimeType,
            isInputImage: false,
            url: imageDataUrl,
            thoughtSummaries,
          },
        ],
        timestamp: Date.now(),
      };

      const updatedThread: ThreadWithUi = {
        ...workingThread,
        messages: [...workingThread.messages, assistantMessage],
        updatedAt: Date.now(),
        thumbnailImageId: workingThread.thumbnailImageId || imageId,
        thumbnailUrl: workingThread.thumbnailUrl || imageDataUrl,
        lastMessagePreview: getLastTextPreview(workingThread) || getLastTextPreview({
          ...workingThread,
          messages: [...workingThread.messages, assistantMessage],
        }),
      };

      await persistThread(updatedThread);
      setCurrentThread(updatedThread);
      setMessageInput('');
      setAttachedImages([]);
    } catch (err: any) {
      if (err?.name === 'APIKeyError') {
        onResetKey();
        return;
      }
      console.error(err);
      setError(err?.message || 'Failed to generate image.');
    } finally {
      setIsGenerating(false);
    }
  };

  const renderMessages = () => {
    if (!currentThread || currentThread.messages.length === 0) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
          <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
            <ImageIcon className="w-8 h-8" />
          </div>
          <p className="text-lg font-semibold text-white">Start a conversation</p>
          <p className="text-sm text-slate-400">Describe what you want to see or attach a reference.</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {currentThread.messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {isGenerating && (
          <div className="flex justify-start w-full">
            <div className="max-w-3xl rounded-2xl p-4 shadow-lg border bg-slate-800 border-slate-700 text-slate-50 flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />
              <span className="text-sm text-slate-300">BananaBot is thinking...</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="h-screen bg-slate-900 text-slate-100 flex overflow-hidden"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <ConversationSidebar
        threads={threads}
        currentThreadId={currentThread?.id}
        onSelectThread={handleSelectThread}
        onDeleteThread={handleDeleteThread}
        onNewThread={handleNewConversation}
      />

      <div className="flex-1 flex flex-col">
        <div className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Go Bananas! Studio</h1>
            <p className="text-slate-400 text-sm">Chat your way to better images.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-400">
              {FileSystemStorage.hasDirectoryAccess()
                ? `Saving to: ${saveDirectory || 'selected folder'}`
                : saveDirectory
                  ? `${saveDirectory} (reconnect)`
                  : 'No save folder selected'}
            </div>
            <button
              onClick={handleSelectDirectory}
              disabled={selectingFolder}
              className={`px-3 py-2 rounded-lg border text-slate-200 text-sm flex items-center gap-2 ${
                selectingFolder
                  ? 'border-slate-700 bg-slate-800 cursor-wait text-slate-400'
                  : 'border-slate-700 hover:border-yellow-400'
              }`}
            >
              {selectingFolder
                ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Opening...
                  </>
                )
                : FileSystemStorage.hasDirectoryAccess()
                  ? 'Change folder'
                  : 'Select folder'}
            </button>
            <button
              onClick={onResetKey}
              className="px-3 py-2 rounded-lg border border-slate-700 hover:border-yellow-400 text-slate-200 text-sm flex items-center gap-2"
            >
              <Key className="w-4 h-4" />
              Change key
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {renderMessages()}
          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className="mx-6 mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/40 text-red-200 flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        <div className="border-t border-slate-800 bg-slate-900/70 px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <label className="text-sm text-slate-300 flex items-center gap-2">
              Model
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as Model)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 w-full"
              >
                <option value="gemini-3-pro-image-preview">Gemini 3 Pro Image Preview</option>
                <option value="gemini-2.5-flash-image">Gemini 2.5 Flash Image</option>
              </select>
            </label>
            <label className="text-sm text-slate-300 flex items-center gap-2">
              Temperature
              <div className="flex items-center gap-2 w-full">
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
                  className="flex-1 accent-yellow-500"
                />
                <span className="text-xs text-slate-400 w-10 text-right">{temperature.toFixed(1)}</span>
              </div>
            </label>
            <label className="text-sm text-slate-300 flex items-center gap-2">
              Aspect ratio
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 w-full"
              >
                <option value="1:1">1:1</option>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="4:3">4:3</option>
                <option value="3:4">3:4</option>
              </select>
            </label>
            <label className="text-sm text-slate-300 flex items-center gap-2">
              Resolution
              <select
                value={imageSize}
                onChange={(e) => setImageSize(e.target.value as ImageSize)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 w-full"
              >
                <option value="1K">1K</option>
                <option value="2K">2K</option>
                <option value="4K">4K</option>
              </select>
            </label>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-3">
            <div className="relative">
              <textarea
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onPaste={handlePaste}
                placeholder="Describe the image you want or ask for tweaks..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 pr-28 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none resize-none"
                rows={3}
                disabled={isGenerating}
              />
              <div className="absolute right-3 bottom-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-10 h-10 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-100 flex items-center justify-center border border-slate-600"
                  title="Attach images"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={isGenerating || (!messageInput.trim() && attachedImages.length === 0)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center border font-semibold transition-colors ${
                    isGenerating || (!messageInput.trim() && attachedImages.length === 0)
                      ? 'bg-slate-700 text-slate-400 border-slate-600 cursor-not-allowed'
                      : 'bg-yellow-500 text-slate-900 border-yellow-400 hover:bg-yellow-400'
                  }`}
                  title="Send"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
              <ImageAttachment files={attachedImages} onRemove={handleRemoveAttachment} />
            </div>

            <input
              type="file"
              accept="image/*"
              multiple
              ref={fileInputRef}
              className="hidden"
              onChange={(e) => handleFilesSelected(e.target.files)}
            />

            <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
              <Upload className="w-4 h-4" />
              Drag and drop images anywhere to attach.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
