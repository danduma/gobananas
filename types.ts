// Legacy single-shot generation types (kept for migration/back-compat)
export type AspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
export type ImageSize = '1K' | '2K' | '4K';
export type Model = 'gemini-3-pro-image-preview' | 'gemini-2.5-flash-image' | 'gemini-pro-vision';

export interface GenerationConfig {
  model: Model;
  temperature: number;
}

export interface LegacyGenerationConfig {
  prompt: string;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  model: Model;
  temperature?: number;
}

export interface GeneratedImage {
  id: string;
  url: string;
  timestamp: number;
  prompt: string;
  model: Model;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  temperature?: number;
  filename: string; // Filename for file system storage
}

// Conversation-centric types
export type MessageRole = 'user' | 'assistant';

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  imageId: string;
  mimeType: string;
  url?: string;
  isInputImage: boolean;
}

export type MessageContent = TextContent | ImageContent;

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  content: MessageContent[];
  timestamp: number;
}

export interface ConversationThread {
  id: string;
  messages: ConversationMessage[];
  thumbnailImageId?: string;
  createdAt: number;
  updatedAt: number;
  model: Model;
  temperature: number;
}

// Augment window to include the AI Studio specific API methods
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
}