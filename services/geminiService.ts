import { GoogleGenAI } from "@google/genai";
import { ConversationMessage, GenerationConfig, LegacyGenerationConfig, MessageContent } from '../types';
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

const formatBlockReason = (reason?: string) => {
  if (!reason || reason === 'BLOCK_REASON_UNSPECIFIED') return null;
  const normalized = reason.toUpperCase();
  switch (normalized) {
    case 'SAFETY':
      return 'blocked by Gemini safety filters';
    case 'OTHER':
      return 'blocked by Gemini for an unspecified policy reason';
    default:
      return `blocked: ${normalized.replace(/_/g, ' ').toLowerCase()}`;
  }
};

const getBlockMessage = (response: any): string | null => {
  const promptFeedback = response?.promptFeedback;
  const finishReason = response?.candidates?.[0]?.finishReason;
  const firstCandidate = response?.candidates?.[0];

  // Prefer explicit blockReason, then finishReason if it signals blocking.
  const reason =
    promptFeedback?.blockReason ||
    (typeof finishReason === 'string' && finishReason.toUpperCase() !== 'STOP' ? finishReason : null);
  const friendly = formatBlockReason(reason);

  // If we have promptFeedback but no explicit block reason, still surface it
  if (!friendly && !promptFeedback) return null;

  const safetyCategories = Array.isArray(promptFeedback?.safetyRatings)
    ? promptFeedback.safetyRatings
        .map((rating: any) => rating?.category)
        .filter(Boolean)
    : [];

  const candidateCategories = Array.isArray(firstCandidate?.safetyRatings)
    ? firstCandidate.safetyRatings.map((rating: any) => rating?.category).filter(Boolean)
    : [];

  const mergedCategories = [...new Set([...safetyCategories, ...candidateCategories])];

  const categoryText = mergedCategories.length ? ` (${mergedCategories.join(', ')})` : '';

  const base = friendly || 'model response blocked by Gemini';
  return `${base}${categoryText}. Please adjust the prompt or remove sensitive content.`;
};

const formatMessagesForGemini = async (messages: ConversationMessage[]) => {
  return Promise.all(messages.map(async (msg) => {
    const parts: any[] = [];

    for (const content of msg.content) {
      if (content.type === 'text') {
        const part: any = { text: content.text };
        if (content.isThought) {
          part.thought = true;
        }
        // ALWAYS attach the signature if we have it
        if (content.thoughtSignature) {
          part.thoughtSignature = content.thoughtSignature;
        }
        parts.push(part);
        continue;
      }

      const base64Data = await FileSystemStorage.loadImageData(
        content.imageId,
        content.isInputImage,
        content.mimeType
      );

      if (!base64Data) {
        // Skip missing image data but keep some context
        parts.push({
          text: '[image unavailable in history]',
        });
        continue;
      }

      const imagePart: any = {
        inlineData: {
          mimeType: content.mimeType,
          data: base64Data,
        },
      };

      if (content.thoughtSignature) {
        // Only attach signature if we actually have one
        imagePart.thoughtSignature = content.thoughtSignature;
      }

      parts.push(imagePart);
    }

    return {
      role: msg.role === 'user' ? 'user' : 'model',
      parts,
    };
  }));
};

const extractImageData = (response: any): MessageContent[] => {
  const contentParts: MessageContent[] = [];

  const blockMessage = getBlockMessage(response);
  if (blockMessage) {
    throw new Error(blockMessage);
  }

  if (response?.candidates && response.candidates.length > 0) {
    const parts = response.candidates[0].content?.parts || [];
    const accumulatedThoughts: string[] = [];
    // If the first part has a signature, we can use it as a fallback for subsequent parts if missing
    let fallbackSignature: string | undefined;

    for (const part of parts) {
      // Check all possible locations for signature
      // The API returns 'thought_signature' in JSON, but some SDKs might normalize it.
      // We check both snake_case and camelCase.
      const signature = (part as any).thought_signature || (part as any).thoughtSignature;
    
      if (part.text) {
        const isThought = part.thought || !!signature; // Treat as thought if marked or has signature
        accumulatedThoughts.push(part.text);
        contentParts.push({
          type: 'text',
          text: part.text,
          isThought: isThought,
          thoughtSignature: signature,
        });
      } else if (part.inlineData?.data) {
        const mimeType = part.inlineData.mimeType || 'image/png';
        contentParts.push({
          type: 'image',
          imageId: '', // To be filled by caller
          mimeType,
          isInputImage: false,
          url: `data:${mimeType};base64,${part.inlineData.data}`,
          thoughtSummaries: accumulatedThoughts.length ? [...accumulatedThoughts] : undefined,
          thoughtSignature: signature,
        });
      }
    }

    if (contentParts.some((p) => p.type === 'image')) {
      return contentParts;
    }
  }

  // If prompt feedback exists but no image, surface that context instead of a generic error.
  if (response?.promptFeedback) {
    const msg =
      getBlockMessage(response) ||
      'Model did not return image data. The prompt may have been blocked or filtered.';
    throw new Error(msg);
  }

  throw new Error('Model did not return image data. Try a different prompt/model or try again.');
};

export const generateImageFromConversation = async (
  messages: ConversationMessage[],
  config: GenerationConfig
): Promise<MessageContent[]> => {
  const apiKey = localStorage.getItem('gemini-api-key');
  if (!apiKey) {
    throw new APIKeyError();
  }

  const ai = new GoogleGenAI({ apiKey });

  const send = async (history: ConversationMessage[]) => {
    const geminiMessages = await formatMessagesForGemini(history);
    // SDK typings don’t expose imageConfig yet; cast request to any.
    const request: any = {
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
    };
    const response = await ai.models.generateContent(request);
    try {
      const normalized = (response as any)?.response ?? response;
      return extractImageData(normalized);
    } catch (err) {
      // Preserve explicit block errors, fallback to generic image-missing guidance
      if (err instanceof Error && err.message) {
        throw err;
      }
      throw new Error('Model did not return image data. Try a different prompt/model or try again.');
    }
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