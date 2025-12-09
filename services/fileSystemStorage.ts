const API_BASE = import.meta.env.VITE_API_BASE || '/api';

const toBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
};

type StorageConfig = {
  storagePath: string | null;
  apiKey: string | null;
};

export class FileSystemStorage {
  private static config: StorageConfig = { storagePath: null, apiKey: null };
  private static initialized = false;

  private static async refreshConfig(): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/config`);
      if (!res.ok) {
        throw new Error('Failed to load storage config');
      }
      const data = await res.json();
      this.config = { storagePath: data.storagePath || null, apiKey: data.apiKey || null };
      if (data.apiKey) {
        localStorage.setItem('gemini-api-key', data.apiKey);
      }
    } catch (error) {
      console.warn('Could not refresh storage config', error);
      this.config = { storagePath: null, apiKey: localStorage.getItem('gemini-api-key') || null };
    }
  }

  static async init(): Promise<void> {
    if (this.initialized) return;
    await this.refreshConfig();
    this.initialized = true;
  }

  static hasDirectoryAccess(): boolean {
    return Boolean(this.config.storagePath);
  }

  static getDirectoryName(): string | null {
    if (!this.config.storagePath) return null;
    const parts = this.config.storagePath.split(/[/\\]/).filter(Boolean);
    return parts[parts.length - 1] || this.config.storagePath;
  }

  static async selectDirectory(): Promise<boolean> {
    try {
      const pick = await fetch(`${API_BASE}/select-folder`);
      if (!pick.ok) {
        console.error('Folder selection cancelled');
        return false;
      }
      const { path: folderPath } = await pick.json();
      if (!folderPath) return false;
      const res = await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: folderPath }),
      });
      if (!res.ok) {
        console.error('Failed to set storage folder');
        return false;
      }
      const data = await res.json();
      this.config.storagePath = data.storagePath || null;
      return true;
    } catch (error) {
      console.error('Folder selection failed', error);
      return false;
    }
  }

  static async saveImage(generationId: string, base64Data: string, mimeType: string = 'image/png'): Promise<string> {
    const res = await fetch(`${API_BASE}/images/generated`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId: generationId, dataBase64: base64Data, mimeType }),
    });
    if (!res.ok) {
      throw new Error('Failed to save generated image');
    }
    const data = await res.json();
    return data.filename || '';
  }

  static async saveInputImage(file: File, imageId: string): Promise<void> {
    const base64 = await toBase64(file);
    const res = await fetch(`${API_BASE}/images/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId, dataBase64: base64, mimeType: file.type || 'image/png' }),
    });
    if (!res.ok) {
      throw new Error('Failed to save input image');
    }
  }

  static async deleteInputImage(imageId: string): Promise<void> {
    await fetch(`${API_BASE}/images/input/${encodeURIComponent(imageId)}`, { method: 'DELETE' });
  }

  static async deleteGeneratedImage(imageId: string, mimeType: string = 'image/png'): Promise<void> {
    await fetch(`${API_BASE}/images/generated/${encodeURIComponent(imageId)}?mimeType=${encodeURIComponent(mimeType)}`, {
      method: 'DELETE',
    });
  }

  static async loadImageData(imageId: string, isInputImage: boolean, mimeType: string = 'image/png'): Promise<string> {
    const res = await fetch(
      `${API_BASE}/images/${encodeURIComponent(imageId)}?type=${isInputImage ? 'input' : 'generated'}&mimeType=${encodeURIComponent(mimeType)}`
    );
    if (res.status === 404) {
      return '';
    }
    if (!res.ok) {
      throw new Error('Failed to load image data');
    }
    const data = await res.json();
    return data.dataBase64;
  }

  static async saveConversations(data: object): Promise<void> {
    const res = await fetch(`${API_BASE}/conversations/thread`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error('Failed to save conversation');
    }
  }

  static async loadConversations(): Promise<any | null> {
    const res = await fetch(`${API_BASE}/conversations`);
    if (!res.ok) {
      return null;
    }
    return res.json();
  }

  static async loadMetadata(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/metadata`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  }

  static async saveMetadata(generations: any[]): Promise<void> {
    const res = await fetch(`${API_BASE}/metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: generations }),
    });
    if (!res.ok) {
      throw new Error('Failed to save metadata');
    }
  }

  static async loadImage(filename: string): Promise<string> {
    const res = await fetch(`${API_BASE}/images/${encodeURIComponent(filename)}?type=generated`);
    if (!res.ok) {
      throw new Error('Failed to load image');
    }
    const data = await res.json();
    return `data:${data.mimeType || 'image/png'};base64,${data.dataBase64}`;
  }

  static async deleteGeneration(generationId: string, filename: string): Promise<void> {
    await fetch(`${API_BASE}/metadata/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: generationId, filename }),
    });
  }

  static async saveApiKey(apiKey: string): Promise<void> {
    const res = await fetch(`${API_BASE}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    if (!res.ok) {
      throw new Error('Failed to store API key');
    }
    this.config.apiKey = apiKey;
    localStorage.setItem('gemini-api-key', apiKey);
  }
}
