# Go Bananas! Studio - Conversational Expansion Plan

## Overview
Transform Go Bananas! Studio from a single-shot image generator into a conversational, multimodal chat interface where users can iterate on images through natural language and provide input images.

## Key Features
1. **Conversational Interface**: Chat-style UI replacing the current single-shot generator
2. **Conversation Threads**: Linear threads with full history persistence
3. **Input Image Support**: Upload and drag-and-drop images to include in prompts
4. **Thread-Based History**: Sidebar shows conversation threads (not individual images)
5. **Smart Context Management**: Full history sent until token limits, then truncate to 50%

---

## Architecture Changes

### Data Model Evolution

**Current**: Individual image generations with metadata
**New**: Conversation threads containing message history

#### New Types (types.ts)

```typescript
// Message types
export type MessageRole = 'user' | 'assistant';

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  imageId: string;          // File reference: nano-banana-{id}.png or input-{id}.png
  mimeType: string;         // image/png, image/jpeg, etc.
  url?: string;             // Data URL or object URL for display
  isInputImage: boolean;    // true if user-uploaded, false if AI-generated
}

export type MessageContent = TextContent | ImageContent;

export interface ConversationMessage {
  id: string;                      // msg_{timestamp}_{random}
  role: MessageRole;
  content: MessageContent[];       // Array supports multimodal messages
  timestamp: number;
}

export interface ConversationThread {
  id: string;                      // thread_{timestamp}_{random}
  messages: ConversationMessage[];
  thumbnailImageId?: string;       // First generated image ID
  createdAt: number;
  updatedAt: number;
  model: Model;                    // Track which model is used
  temperature: number;             // Track generation settings
}

export interface GenerationConfig {
  model: Model;
  temperature: number;
  // Remove: prompt, aspectRatio, imageSize (now per-message in chat)
}
```

**Migration Note**: We can keep the old `GeneratedImage` type for backward compatibility, but new conversations use `ConversationThread`.

---

### File System Structure

**Current**:
```
user-selected-directory/
├── nano-banana-gen_123.png
├── nano-banana-gen_456.png
└── generations.json
```

**New**:
```
user-selected-directory/
├── nano-banana-gen_123.png          # AI-generated images
├── nano-banana-gen_456.png
├── input_images/                     # User-uploaded images
│   ├── input-upload_789.png
│   └── input-upload_012.jpg
└── conversations.json                # Thread metadata (replaces generations.json)
```

**conversations.json structure**:
```json
{
  "version": "2.0",
  "threads": [
    {
      "id": "thread_1234567890_abc",
      "messages": [
        {
          "id": "msg_1234567890_def",
          "role": "user",
          "content": [
            { "type": "text", "text": "Generate a sunset over mountains" }
          ],
          "timestamp": 1234567890000
        },
        {
          "id": "msg_1234567891_ghi",
          "role": "assistant",
          "content": [
            {
              "type": "image",
              "imageId": "gen_1234567891_xyz",
              "mimeType": "image/png",
              "isInputImage": false
            }
          ],
          "timestamp": 1234567891000
        }
      ],
      "thumbnailImageId": "gen_1234567891_xyz",
      "createdAt": 1234567890000,
      "updatedAt": 1234567891000,
      "model": "gemini-3-pro-image-preview",
      "temperature": 1.0
    }
  ]
}
```

---

## Component Architecture

### 1. ChatInterface.tsx (replaces Generator.tsx)

**Responsibilities**:
- Display conversation messages in chat format
- Input area with text + image attachment
- "New conversation" button
- Drag-and-drop zone for images
- Send messages to Gemini API
- Handle responses and update thread
- Auto-save to storage after each turn

**Layout**:
```
┌─────────────────────────────────────┐
│ Go Bananas! Studio      [New Chat]  │
├─────────────────────────────────────┤
│                                     │
│  [User]: Generate a sunset          │
│                                     │
│  [Assistant]: [Generated Image]     │
│                                     │
│  [User]: Make it more vibrant       │
│  [Image attachment thumbnail]       │
│                                     │
│  [Assistant]: [Generated Image]     │
│                                     │
│  ...                                │
│                                     │
├─────────────────────────────────────┤
│ [📎] [Type message...]     [Send]   │
└─────────────────────────────────────┘
```

**State Management**:
```typescript
const [currentThread, setCurrentThread] = useState<ConversationThread | null>(null);
const [messageInput, setMessageInput] = useState('');
const [attachedImages, setAttachedImages] = useState<File[]>([]);
const [isGenerating, setIsGenerating] = useState(false);
const [generationConfig, setGenerationConfig] = useState<GenerationConfig>({...});
```

**Key Functions**:
- `startNewConversation()` - Creates fresh thread
- `loadConversation(threadId)` - Loads existing thread from storage
- `handleSendMessage()` - Processes user input and calls API
- `handleImageAttachment(files)` - Handles uploads and drag-drop
- `handleDragOver/Drop()` - Drag-and-drop handlers

### 2. ConversationSidebar.tsx (replaces GenerationSidebar.tsx)

**Responsibilities**:
- Display list of conversation threads
- Show thumbnail (first generated image)
- Show last message preview or creation date
- Click to load/resume conversation
- Delete threads

**Thread Item Display**:
```
┌──────────────────────────┐
│ [Thumbnail]  Thread Info │
│              Last: "Make │
│              it darker"  │
│              2 hours ago │
└──────────────────────────┘
```

**View Options**:
- Grid view: Larger thumbnails
- List view: More metadata visible

### 3. MessageBubble.tsx (new component)

**Responsibilities**:
- Render individual messages in chat
- Different styles for user vs assistant
- Display text content
- Display images (generated or input)
- Image loading states
- Click to expand images

**Variations**:
```typescript
// User message with text
<MessageBubble role="user">
  <p>Generate a sunset over mountains</p>
</MessageBubble>

// User message with text + image attachment
<MessageBubble role="user">
  <p>Make it look like this style:</p>
  <img src="..." alt="Reference image" />
</MessageBubble>

// Assistant message with generated image
<MessageBubble role="assistant">
  <img src="..." alt="Generated image" />
  <button>Download</button>
</MessageBubble>
```

### 4. ImageAttachment.tsx (new component)

**Responsibilities**:
- Preview attached images before sending
- Remove attachments
- Show file names and sizes
- Handle multiple images

---

## Service Layer Changes

### 1. geminiService.ts Updates

**Current**: Single prompt → single image
**New**: Conversation history → image response

#### Key Changes:

**A. New Function Signature**:
```typescript
export async function generateImageFromConversation(
  messages: ConversationMessage[],
  config: GenerationConfig
): Promise<string> {
  // Returns base64 data URL of generated image
}
```

**B. Message Formatting for Gemini**:
```typescript
// Convert our message format to Gemini's format
const geminiMessages = await Promise.all(messages.map(async (msg) => {
  const parts = await Promise.all(msg.content.map(async (content) => {
    if (content.type === 'text') {
      return { text: content.text };
    } else {
      // Load image from file system
      const imageData = await loadImageAsBase64(content.imageId, content.isInputImage);
      return {
        inlineData: {
          mimeType: content.mimeType,
          data: imageData
        }
      };
    }
  }));

  return {
    role: msg.role === 'user' ? 'user' : 'model',
    parts
  };
}));
```

**C. Context Truncation**:
```typescript
async function truncateConversationIfNeeded(
  messages: ConversationMessage[]
): Promise<ConversationMessage[]> {
  try {
    // Try sending full history
    return messages;
  } catch (error) {
    if (isContextLimitError(error)) {
      // Token limit hit - truncate to 50%
      const midpoint = Math.floor(messages.length / 2);
      console.warn(`Context limit reached. Truncating from ${messages.length} to ${midpoint} messages`);
      return messages.slice(midpoint);
    }
    throw error;
  }
}
```

**D. API Call**:
```typescript
const response = await ai.models.generateContent({
  model: config.model,
  contents: geminiMessages,
  generationConfig: {
    temperature: config.temperature
  }
});
```

### 2. conversationStorage.ts (new service)

Replaces `generationStorage.ts` with thread-based storage.

**Key Functions**:

```typescript
export class ConversationStorage {
  // Load all threads
  static async loadThreads(): Promise<ConversationThread[]>;

  // Save a thread (create or update)
  static async saveThread(thread: ConversationThread): Promise<void>;

  // Delete a thread
  static async deleteThread(threadId: string): Promise<void>;

  // Get a specific thread
  static async getThread(threadId: string): Promise<ConversationThread | null>;

  // Add a message to a thread
  static async addMessageToThread(
    threadId: string,
    message: ConversationMessage
  ): Promise<void>;

  // Migrate old generations to conversations (one-time)
  static async migrateOldGenerations(): Promise<void>;
}
```

**Implementation Notes**:
- Read/write conversations.json via FileSystemStorage
- Keep last 50 threads (configurable)
- Sort by updatedAt (most recent first)
- Atomic saves to prevent corruption

### 3. fileSystemStorage.ts Updates

**New Functions**:

```typescript
export class FileSystemStorage {
  // Existing: saveImage, loadImage, deleteImage

  // Create input_images subdirectory if needed
  static async ensureInputImagesDirectory(): Promise<void>;

  // Save user-uploaded image to input_images/
  static async saveInputImage(file: File, imageId: string): Promise<void>;

  // Load any image (generated or input)
  static async loadImageData(
    imageId: string,
    isInputImage: boolean
  ): Promise<string>;

  // Save conversations.json
  static async saveConversations(data: object): Promise<void>;

  // Load conversations.json
  static async loadConversations(): Promise<object | null>;

  // Delete input image
  static async deleteInputImage(imageId: string): Promise<void>;
}
```

**Directory Handle Management**:
```typescript
// Get subdirectory handle for input_images
const inputImagesHandle = await this.directoryHandle.getDirectoryHandle(
  'input_images',
  { create: true }
);
```

---

## UI/UX Flow

### Flow 1: Starting a New Conversation

1. User clicks "New Conversation" button
2. Clear current thread state
3. Show empty chat interface
4. Focus on message input
5. User types prompt and/or attaches images
6. User clicks Send
7. Show loading state in chat
8. Call Gemini API with message
9. Receive generated image
10. Save input images to `/input_images/`
11. Save generated image to main directory
12. Create new ConversationThread in conversations.json
13. Set first generated image as thumbnail
14. Display assistant message with image
15. Update sidebar with new thread

### Flow 2: Continuing a Conversation

1. User types follow-up message: "Make it darker"
2. Optional: Attach reference images
3. User clicks Send
4. Load full conversation history
5. Append new user message to thread
6. Call Gemini API with full history
7. Receive generated image
8. Save new images to file system
9. Append assistant message to thread
10. Update conversations.json
11. Display new message in chat
12. Update sidebar (thread's updatedAt timestamp)

### Flow 3: Resuming an Old Conversation

1. User clicks thread in sidebar
2. Load thread from conversations.json
3. Load all images referenced in messages
4. Render entire conversation history in chat
5. Scroll to bottom
6. User can continue the conversation

### Flow 4: Uploading Images

**Option A: Click to Upload**
1. User clicks attachment button 📎
2. File picker opens
3. User selects image(s)
4. Preview thumbnails appear in input area
5. User can remove unwanted attachments
6. User types text and sends

**Option B: Drag and Drop**
1. User drags image file(s) to window
2. Drop zone highlights
3. User drops files
4. Preview thumbnails appear
5. Continue as above

---

## Implementation Phases

### Phase 1: Data Model & Storage (Foundation)
**Files to create/modify**:
- `types.ts` - Add new conversation types
- `services/conversationStorage.ts` - Create new storage service
- `services/fileSystemStorage.ts` - Add input image handling

**Tasks**:
1. Define ConversationThread, ConversationMessage, MessageContent types
2. Implement ConversationStorage class
3. Add input_images directory creation
4. Add saveInputImage, loadImageData functions
5. Implement conversations.json read/write
6. Create migration function for old generations

### Phase 2: API Service Updates
**Files to modify**:
- `services/geminiService.ts`

**Tasks**:
1. Create generateImageFromConversation function
2. Implement message formatting for Gemini API
3. Add image loading from file system
4. Implement context truncation logic
5. Add proper error handling for context limits
6. Test multimodal message sending

### Phase 3: Core Chat UI
**Files to create/modify**:
- `components/MessageBubble.tsx` - Create new component
- `components/ImageAttachment.tsx` - Create new component
- `components/ChatInterface.tsx` - Create new component (or refactor Generator.tsx)

**Tasks**:
1. Build MessageBubble component (user/assistant variants)
2. Build ImageAttachment preview component
3. Create ChatInterface layout
4. Implement message input area
5. Add image attachment UI (click to upload)
6. Implement drag-and-drop zone
7. Add "New Conversation" button
8. Implement message sending logic
9. Add loading states during generation
10. Auto-scroll to latest message

### Phase 4: Conversation Management
**Files to modify**:
- `components/ChatInterface.tsx`
- `components/ConversationSidebar.tsx` (refactor from GenerationSidebar.tsx)

**Tasks**:
1. Implement startNewConversation function
2. Implement loadConversation function
3. Thread saving after each message
4. Thumbnail generation (first image)
5. Refactor sidebar to show threads
6. Thread preview with last message
7. Click to resume conversation
8. Delete thread functionality
9. Update thread timestamps

### Phase 5: Polish & Features
**Files to modify**:
- All components as needed

**Tasks**:
1. Add image expand/modal view
2. Download individual images from chat
3. Copy image to clipboard
4. Settings panel for model/temperature (per-thread)
5. Error handling UI (API errors, file system errors)
6. Empty states (no conversations, no messages)
7. Loading skeletons
8. Conversation search/filter
9. Export conversation (optional)
10. Dark mode support (optional)

---

## Technical Considerations

### 1. Context Window Management

**Gemini API Limits**:
- Gemini 3 Pro: ~2M tokens
- Gemini 2.5 Flash: ~1M tokens

**Strategy**:
- Send full conversation history by default
- Catch context limit errors (look for token/length error codes)
- On error: truncate to 50% of messages
- Retry with truncated history
- Consider adding a visual indicator in UI when truncation happens

**Future Enhancement**: Smart truncation
- Keep first message (establishes context)
- Keep last N messages
- Summarize middle portion

### 2. Image Size & Performance

**Challenges**:
- Large image files can slow down API calls
- Multiple images in history = larger payloads

**Optimizations**:
- Resize input images before sending (max 2048px)
- Use JPEG compression for photos (PNG for graphics)
- Lazy load images in chat history
- Consider image thumbnails in conversations.json

### 3. File System Access API Persistence

**Current Behavior**:
- Browser can lose directory handle on refresh
- User must re-select directory

**Improvement**:
- Use `directoryHandle.requestPermission()` on mount
- Prompt user to re-select if permission denied
- Store directory name in localStorage for UX

### 4. Conversation History Display

**Performance**:
- Long conversations = many messages to render
- Virtualization for very long threads?

**Initial Approach**:
- Render all messages (simpler)
- If performance issues arise, add virtualization library (react-window)

### 5. Migration from Old Format

**Strategy**:
```typescript
async function migrateOldGenerations() {
  const oldData = await FileSystemStorage.loadGenerations();
  if (!oldData || oldData.version === '2.0') return;

  // Convert each old generation to a single-message conversation
  const threads: ConversationThread[] = oldData.generations.map(gen => ({
    id: `thread_migrated_${gen.id}`,
    messages: [
      {
        id: `msg_${gen.id}_user`,
        role: 'user',
        content: [{ type: 'text', text: gen.prompt }],
        timestamp: gen.timestamp
      },
      {
        id: `msg_${gen.id}_assistant`,
        role: 'assistant',
        content: [{
          type: 'image',
          imageId: gen.id,
          mimeType: 'image/png',
          isInputImage: false
        }],
        timestamp: gen.timestamp + 1
      }
    ],
    thumbnailImageId: gen.id,
    createdAt: gen.timestamp,
    updatedAt: gen.timestamp,
    model: gen.model,
    temperature: gen.temperature || 1.0
  }));

  await ConversationStorage.saveAllThreads(threads);
}
```

Run migration on first load of new version.

---

## API Integration Details

### Gemini Multimodal API Format

**Request Format**:
```javascript
const response = await ai.models.generateContent({
  model: 'gemini-3-pro-image-preview',
  contents: [
    {
      role: 'user',
      parts: [
        { text: 'Generate a sunset over mountains' }
      ]
    },
    {
      role: 'model',
      parts: [
        {
          inlineData: {
            mimeType: 'image/png',
            data: 'base64encodedimage...'
          }
        }
      ]
    },
    {
      role: 'user',
      parts: [
        { text: 'Make it more vibrant' },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: 'base64encodedreferenceimage...'
          }
        }
      ]
    }
  ],
  generationConfig: {
    temperature: 1.0
  }
});
```

**Response Format**:
```javascript
{
  candidates: [
    {
      content: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: 'base64generatedimage...'
            }
          }
        ]
      }
    }
  ]
}
```

### Image-to-Image Generation

Gemini automatically handles image-to-image when:
1. Previous assistant message contains an image
2. User provides modification instruction
3. API uses context to modify the previous image

**Example Conversation**:
```
User: "Create a red car"
Assistant: [Image of red car]
User: "Make it blue"
Assistant: [Modified image with blue car]
```

No special parameters needed - the model understands context.

---

## File Structure Summary

```
/Users/masterman/NLP/gobananas/
├── App.tsx                              # Root (minimal changes)
├── index.tsx                            # Entry point (no changes)
├── types.ts                             # ✏️ ADD conversation types
├── components/
│   ├── KeySelector.tsx                  # No changes
│   ├── ChatInterface.tsx                # ✨ NEW (replaces Generator)
│   ├── MessageBubble.tsx                # ✨ NEW
│   ├── ImageAttachment.tsx              # ✨ NEW
│   ├── ConversationSidebar.tsx          # ✏️ REFACTOR (from GenerationSidebar)
│   ├── Generator.tsx                    # ❌ REMOVE (or keep for migration)
│   └── GenerationSidebar.tsx            # ❌ REMOVE (or rename)
└── services/
    ├── geminiService.ts                 # ✏️ MODIFY (add conversation support)
    ├── conversationStorage.ts           # ✨ NEW
    ├── fileSystemStorage.ts             # ✏️ MODIFY (add input image handling)
    └── generationStorage.ts             # 📦 KEEP (for migration only)
```

---

## Testing Checklist

### Basic Functionality
- [ ] Start new conversation with text prompt
- [ ] Generate first image in thread
- [ ] First image becomes thread thumbnail
- [ ] Continue conversation with follow-up prompt
- [ ] Generated images save to main directory
- [ ] Conversation saves to conversations.json

### Image Upload
- [ ] Click attachment button to upload image
- [ ] Drag and drop image to window
- [ ] Upload multiple images at once
- [ ] Preview attached images before sending
- [ ] Remove attached images
- [ ] Input images save to input_images/
- [ ] Input images display in chat correctly

### Conversation Management
- [ ] Thread appears in sidebar with thumbnail
- [ ] Click thread in sidebar loads conversation
- [ ] All messages and images display correctly
- [ ] Delete thread removes all associated data
- [ ] New conversation clears current chat
- [ ] Threads sorted by updatedAt (newest first)

### Context Handling
- [ ] Full conversation history sent to API
- [ ] Long conversations truncate at 50% on limit
- [ ] Truncated conversations still generate images
- [ ] Error messages for API failures

### File System
- [ ] input_images/ directory created automatically
- [ ] Images load correctly from file system
- [ ] Missing images handled gracefully (don't crash)
- [ ] Directory permission prompts work correctly

### Migration
- [ ] Old generations migrate to conversation threads
- [ ] Migrated threads display correctly
- [ ] Migrated images still accessible

### UI/UX
- [ ] Chat scrolls to bottom on new messages
- [ ] Loading states during generation
- [ ] Empty states (no threads, no messages)
- [ ] Responsive layout
- [ ] Image expand/zoom functionality
- [ ] Download individual images from chat

---

## Open Questions

1. **Model Selection**: Should users be able to change model mid-conversation, or is it locked per thread?
   - **Recommendation**: Lock per thread for consistency, but allow selection when starting new conversation

2. **Aspect Ratio/Resolution**: Current UI has these controls. In chat mode:
   - Remove these controls (let user specify in text: "generate in 16:9")
   - Keep as settings panel
   - **Recommendation**: Remove initially (simplify), can add advanced settings panel later

3. **Temperature**: Per-thread or per-message?
   - **Recommendation**: Per-thread (set at creation)

4. **Download All**: Should users be able to download all images from a thread at once?
   - **Recommendation**: Nice-to-have, not MVP

5. **Thread Naming**: Auto-generated from first prompt, or let users name threads?
   - **Recommendation**: Auto-generated initially, add rename feature later

---

## Success Criteria

**MVP is complete when**:
1. ✅ Users can start a new conversation with text prompt
2. ✅ Users can upload/drag-drop images to include in prompts
3. ✅ Users can continue conversations with follow-up messages
4. ✅ Full conversation history is sent to Gemini API
5. ✅ All messages display in chat-style interface
6. ✅ Sidebar shows conversation threads with thumbnails
7. ✅ Threads persist across browser sessions
8. ✅ Users can resume old conversations from sidebar
9. ✅ Input images save to input_images/ directory
10. ✅ Generated images save to main directory
11. ✅ Context truncation works when hitting limits

---

## Implementation Time Estimate

**Approximate effort by phase**:
- Phase 1 (Data Model & Storage): Foundation work
- Phase 2 (API Service): Critical path
- Phase 3 (Core Chat UI): Largest effort
- Phase 4 (Conversation Management): Integration
- Phase 5 (Polish): Nice-to-haves

**Total**: This is a significant refactor of the core application flow

---

## Notes

- Keep it simple: Avoid over-engineering
- Gemini API handles image-to-image automatically via conversation context
- File system structure stays flat (no nested folders per thread)
- Migration from old format should be seamless
- Focus on core conversation flow before adding bells and whistles
- The chat interface is more forgiving than the structured form (users can specify anything in natural language)
