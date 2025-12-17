import { ConversationMessage, ConversationThread } from '../types';
import { FileSystemStorage } from './fileSystemStorage';

const MAX_THREADS = 50;

const sanitizeThread = (thread: ConversationThread): ConversationThread => {
  return {
    ...thread,
    // Keep thumbnailUrl for quick sidebar previews, but drop heavy inline message URLs.
    messages: thread.messages.map((msg) => ({
      ...msg,
      content: msg.content.map((item) =>
        item.type === 'image'
          ? {
              ...item,
              url: undefined,
              thoughtSignature: item.thoughtSignature,
            }
          : {
              ...item,
              thoughtSignature: item.thoughtSignature,
            }
      ),
    })),
  };
};

export class ConversationStorage {
  static async loadThreads(): Promise<ConversationThread[]> {
    await FileSystemStorage.init();
    const data = await FileSystemStorage.loadConversations();
    if (!data || !Array.isArray(data.threads)) {
      return [];
    }

    return [...data.threads].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  static async getThread(threadId: string): Promise<ConversationThread | null> {
    await FileSystemStorage.init();
    const threads = await this.loadThreads();
    return threads.find((thread) => thread.id === threadId) || null;
  }

  static async saveThread(thread: ConversationThread): Promise<void> {
    await FileSystemStorage.init();
    const threads = await this.loadThreads();
    const index = threads.findIndex((t) => t.id === thread.id);
    if (index >= 0) {
      threads[index] = thread;
    } else {
      threads.push(thread);
    }

    const trimmed = threads
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_THREADS);

    await this.saveAllThreads(trimmed);
  }

  static async addMessageToThread(threadId: string, message: ConversationMessage): Promise<void> {
    const threads = await this.loadThreads();
    const thread = threads.find((t) => t.id === threadId);
    if (!thread) {
      throw new Error('Thread not found');
    }

    thread.messages.push(message);
    thread.updatedAt = Date.now();

    await this.saveThread(thread);
  }

  static async deleteThread(threadId: string): Promise<void> {
    await FileSystemStorage.init();
    const threads = await this.loadThreads();
    const thread = threads.find((t) => t.id === threadId);

    if (thread) {
      await this.deleteThreadAssets(thread);
    }

    const filtered = threads.filter((threadItem) => threadItem.id !== threadId);
    await this.saveAllThreads(filtered);
  }

  static async migrateOldGenerations(): Promise<void> {
    await FileSystemStorage.init();
    const existing = await FileSystemStorage.loadConversations();
    if (existing && existing.version === '2.0') {
      return;
    }

    const oldGenerations = await FileSystemStorage.loadMetadata();
    if (!oldGenerations || oldGenerations.length === 0) {
      return;
    }

    const threads: ConversationThread[] = oldGenerations.map((gen: any) => ({
      id: `thread_migrated_${gen.id}`,
      messages: [
        {
          id: `msg_${gen.id}_user`,
          role: 'user',
          content: [{ type: 'text', text: gen.prompt }],
          timestamp: gen.timestamp,
        },
        {
          id: `msg_${gen.id}_assistant`,
          role: 'assistant',
          content: [
            {
              type: 'image',
              imageId: gen.id,
              mimeType: 'image/png',
              isInputImage: false,
            },
          ],
          timestamp: gen.timestamp + 1,
        },
      ],
      thumbnailImageId: gen.id,
      createdAt: gen.timestamp,
      updatedAt: gen.timestamp,
      model: gen.model,
      temperature: gen.temperature ?? 1,
    }));

    await this.saveAllThreads(threads);
  }

  private static async deleteThreadAssets(thread: ConversationThread): Promise<void> {
    if (!thread.messages) return;

    for (const message of thread.messages) {
      for (const content of message.content) {
        if (content.type === 'image') {
          if (content.isInputImage) {
            await FileSystemStorage.deleteInputImage(content.imageId);
          } else {
            await FileSystemStorage.deleteGeneratedImage(content.imageId);
          }
        }
      }
    }
  }

  private static async saveAllThreads(threads: ConversationThread[]): Promise<void> {
    const sanitized = threads.map(sanitizeThread);

    await FileSystemStorage.saveConversations({
      version: '2.0',
      threads: sanitized,
    });
  }
}

