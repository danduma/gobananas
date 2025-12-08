import { GoogleGenAI } from "@google/genai";
import { ConversationMessage, GenerationConfig, LegacyGenerationConfig } from '../types';
import { FileSystemStorage } from './fileSystemStorage';

export class APIKeyError extends Error {
  constructor() {
    super('API_KEY_INVALID');
    this.name = 'APIKeyError';
  }
}

export const generateImageWithGemini = async (config: LegacyGenerationConfig): Promise<string> => {
  // Get the API key from localStorage
  const apiKey = localStorage.getItem('gemini-api-key');
  if (!apiKey) {
    throw new APIKeyError();
  }

  const ai = new GoogleGenAI({ apiKey });

  // Enhance prompt with aspect ratio and image size specifications
  const enhancedPrompt = `${config.prompt}. Generate this image with ${config.aspectRatio} aspect ratio at ${config.imageSize} resolution.`;

  try {
    const generationConfig: any = {
      model: config.model,
      contents: enhancedPrompt,
    };

    // Add temperature if specified (for supported models)
    if (config.temperature !== undefined) {
      generationConfig.generationConfig = {
        temperature: config.temperature,
      };
    }

    const response = await ai.models.generateContent(generationConfig);

    // Iterate through parts to find the image data
    if (response.candidates && response.candidates.length > 0) {
      const parts = response.candidates[0].content.parts;
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          const base64Data = part.inlineData.data;
          const mimeType = part.inlineData.mimeType || 'image/png';
          return `data:${mimeType};base64,${base64Data}`;
        }
      }
    }

    throw new Error("No image data found in response");

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    
    // Check for specific error indicating the API key is invalid or project not found
    if (error.message && (error.message.includes('Requested entity was not found') || error.message.includes('API key not valid'))) {
      throw new APIKeyError();
    }
    
    throw error;
  }
};

const isContextLimitError = (error: any) => {
  const message = error?.message || '';
  return message.toLowerCase().includes('token') || message.toLowerCase().includes('context');
};

const formatMessagesForGemini = async (messages: ConversationMessage[]) => {
  return Promise.all(messages.map(async (msg) => {
    const parts = await Promise.all(msg.content.map(async (content) => {
      if (content.type === 'text') {
        const part: any = { text: content.text };
        return part;
      }

      const base64Data = await FileSystemStorage.loadImageData(content.imageId, content.isInputImage);
      const part: any = {
        inlineData: {
          mimeType: content.mimeType,
          data: base64Data,
        },
      };
      return part;
    }));

    return {
      role: msg.role === 'user' ? 'user' : 'model',
      parts,
    };
  }));
};

const extractImageData = (response: any): { dataUrl: string; mimeType: string; thoughtSummaries?: string[] } => {
  const thoughtSummaries: string[] = [];

  if (response?.candidates && response.candidates.length > 0) {
    const parts = response.candidates[0].content?.parts || [];
    for (const part of parts) {
      if (part.thought && part.text) {
        thoughtSummaries.push(part.text);
      }
    }
    for (const part of parts) {
      // Skip thought-only parts
      if (part.inlineData?.data && !part.thought) {
        const mimeType = part.inlineData.mimeType || 'image/png';
        return {
          dataUrl: `data:${mimeType};base64,${part.inlineData.data}`,
          mimeType,
          thoughtSummaries: thoughtSummaries.length ? thoughtSummaries : undefined,
        };
      }
    }
  }

  throw new Error('No image data found in response');
};

export const generateImageFromConversation = async (
  messages: ConversationMessage[],
  config: GenerationConfig
): Promise<{ dataUrl: string; mimeType: string; thoughtSummaries?: string[] }> => {
  const apiKey = localStorage.getItem('gemini-api-key');
  if (!apiKey) {
    throw new APIKeyError();
  }

  const ai = new GoogleGenAI({ apiKey });

  const send = async (history: ConversationMessage[]) => {
    const geminiMessages = await formatMessagesForGemini(history);
      const response = await ai.models.generateContent({
      model: config.model,
      contents: geminiMessages,
      generationConfig: {
        temperature: config.temperature,
        imageConfig: {
          aspectRatio: config.aspectRatio,
          imageSize: config.imageSize,
        },
      },
      thinkingConfig: {
        includeThoughts: true,
      },
    });
    return extractImageData(response);
  };

  try {
    return await send(messages);
  } catch (error) {
    if (isContextLimitError(error)) {
      const midpoint = Math.floor(messages.length / 2);
      const truncated = messages.slice(midpoint);
      console.warn(`Context limit reached. Truncating from ${messages.length} to ${truncated.length} messages`);
      return send(truncated);
    }
    throw error;
  }
};