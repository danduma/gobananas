// File System Access API based storage for images and metadata
// This allows saving to actual local files instead of browser storage

export class FileSystemStorage {
  private static directoryHandle: FileSystemDirectoryHandle | null = null;
  private static readonly METADATA_FILE = 'generations.json';
  private static readonly CONVERSATIONS_FILE = 'conversations.json';
  private static readonly INPUT_IMAGES_DIR = 'input_images';

  // Request permission to access a directory
  static async selectDirectory(): Promise<boolean> {
    if (!('showDirectoryPicker' in window)) {
      console.warn('File System Access API is not supported in this browser.');
      return false;
    }
    try {
      // @ts-ignore: Property 'showDirectoryPicker' might not exist on type 'Window'
      this.directoryHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents'
      });
      return true;
    } catch (error) {
      console.warn('Directory selection cancelled or failed:', error);
      return false;
    }
  }

  // Check if we have directory access
  static hasDirectoryAccess(): boolean {
    return this.directoryHandle !== null;
  }

  // Save an image file
  static async saveImage(generationId: string, base64Data: string, mimeType: string = 'image/png'): Promise<string> {
    if (!this.directoryHandle) {
      throw new Error('No directory selected for saving');
    }

    try {
      // Create a unique filename
      const filename = `nano-banana-${generationId}.png`;
      const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: true });

      // Convert base64 to blob using fetch (more reliable)
      const response = await fetch(`data:${mimeType};base64,${base64Data}`);
      const blob = await response.blob();

      // Write the file
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      // Return the relative path for metadata
      return filename;
    } catch (error) {
      console.error('Failed to save image:', error);
      throw error;
    }
  }

  static async ensureInputImagesDirectory(): Promise<FileSystemDirectoryHandle> {
    if (!this.directoryHandle) {
      throw new Error('No directory selected');
    }

    return this.directoryHandle.getDirectoryHandle(this.INPUT_IMAGES_DIR, { create: true });
  }

  static async saveInputImage(file: File, imageId: string): Promise<void> {
    if (!this.directoryHandle) {
      throw new Error('No directory selected for saving input images');
    }

    const inputDir = await this.ensureInputImagesDirectory();
    const fileHandle = await inputDir.getFileHandle(imageId, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file);
    await writable.close();
  }

  static async deleteInputImage(imageId: string): Promise<void> {
    if (!this.directoryHandle) {
      return;
    }

    try {
      const inputDir = await this.ensureInputImagesDirectory();
      await inputDir.removeEntry(imageId);
    } catch (error) {
      console.warn('Failed to delete input image:', error);
    }
  }

  static async deleteGeneratedImage(imageId: string): Promise<void> {
    if (!this.directoryHandle) {
      return;
    }

    try {
      const filename = `nano-banana-${imageId}.png`;
      await this.directoryHandle.removeEntry(filename);
    } catch (error) {
      console.warn('Failed to delete generated image:', error);
    }
  }

  private static async loadFileAsBase64(fileHandle: FileSystemFileHandle): Promise<string> {
    const file = await fileHandle.getFile();
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary);
  }

  static async loadImageData(imageId: string, isInputImage: boolean): Promise<string> {
    if (!this.directoryHandle) {
      throw new Error('No directory selected');
    }

    if (isInputImage) {
      const inputDir = await this.ensureInputImagesDirectory();
      const fileHandle = await inputDir.getFileHandle(imageId);
      return this.loadFileAsBase64(fileHandle);
    }

    const filename = `nano-banana-${imageId}.png`;
    const fileHandle = await this.directoryHandle.getFileHandle(filename);
    return this.loadFileAsBase64(fileHandle);
  }

  static async saveConversations(data: object): Promise<void> {
    if (!this.directoryHandle) {
      throw new Error('No directory selected for saving conversations');
    }

    const fileHandle = await this.directoryHandle.getFileHandle(this.CONVERSATIONS_FILE, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
  }

  static async loadConversations(): Promise<any | null> {
    if (!this.directoryHandle) {
      return null;
    }

    try {
      const fileHandle = await this.directoryHandle.getFileHandle(this.CONVERSATIONS_FILE);
      const file = await fileHandle.getFile();
      const text = await file.text();
      return JSON.parse(text);
    } catch (error) {
      console.log('No conversations file yet, starting fresh');
      return null;
    }
  }

  // Load metadata from file
  static async loadMetadata(): Promise<any[]> {
    if (!this.directoryHandle) {
      return [];
    }

    try {
      const fileHandle = await this.directoryHandle.getFileHandle(this.METADATA_FILE);
      const file = await fileHandle.getFile();
      const content = await file.text();
      return JSON.parse(content);
    } catch (error) {
      // File doesn't exist yet, return empty array
      console.log('Metadata file not found, starting fresh');
      return [];
    }
  }

  // Save metadata to file
  static async saveMetadata(generations: any[]): Promise<void> {
    if (!this.directoryHandle) {
      throw new Error('No directory selected for saving');
    }

    try {
      const fileHandle = await this.directoryHandle.getFileHandle(this.METADATA_FILE, { create: true });
      const metadata = JSON.stringify(generations, null, 2);

      const writable = await fileHandle.createWritable();
      await writable.write(metadata);
      await writable.close();
    } catch (error) {
      console.error('Failed to save metadata:', error);
      throw error;
    }
  }

  // Load an image file
  static async loadImage(filename: string): Promise<string> {
    if (!this.directoryHandle) {
      throw new Error('No directory selected');
    }

    try {
      const fileHandle = await this.directoryHandle.getFileHandle(filename);
      const file = await fileHandle.getFile();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    } catch (error) {
      console.error('Failed to load image:', error);
      throw error;
    }
  }

  // Delete a generation (image file and update metadata)
  static async deleteGeneration(generationId: string, filename: string): Promise<void> {
    if (!this.directoryHandle) {
      return;
    }

    try {
      // Delete the image file
      await this.directoryHandle.removeEntry(filename);

      // Update metadata
      const generations = await this.loadMetadata();
      const filtered = generations.filter((gen: any) => gen.id !== generationId);
      await this.saveMetadata(filtered);
    } catch (error) {
      console.error('Failed to delete generation:', error);
    }
  }

  

  // Get directory name for display
  static getDirectoryName(): string | null {
    return this.directoryHandle?.name || null;
  }
}
