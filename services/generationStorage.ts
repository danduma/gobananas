import { GeneratedImage, LegacyGenerationConfig } from '../types';
import { FileSystemStorage } from './fileSystemStorage';

export class GenerationStorage {
  static async saveGeneration(config: LegacyGenerationConfig, imageUrl: string, imageData: string): Promise<GeneratedImage> {
    await FileSystemStorage.init();
    if (!FileSystemStorage.hasDirectoryAccess()) {
      throw new Error('No save directory selected. Please select a directory first.');
    }

    try {
      const generations = await FileSystemStorage.loadMetadata();

      const generationId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Save the image file first
      const filename = await FileSystemStorage.saveImage(generationId, imageData);

      const newGeneration: GeneratedImage & { filename: string } = {
        id: generationId,
        url: '', // Will be loaded from file when needed
        timestamp: Date.now(),
        prompt: config.prompt,
        model: config.model,
        aspectRatio: config.aspectRatio,
        imageSize: config.imageSize,
        filename: filename,
      };

      generations.unshift(newGeneration); // Add to beginning of array

      // Keep only the last 50 generations to prevent file system bloat
      if (generations.length > 50) {
        generations.splice(50);
      }

      await FileSystemStorage.saveMetadata(generations);
      return newGeneration;
    } catch (error) {
      console.warn('Failed to save generation:', error);
      throw error;
    }
  }

  static async loadGenerations(): Promise<GeneratedImage[]> {
    try {
      await FileSystemStorage.init();
      if (!FileSystemStorage.hasDirectoryAccess()) {
        return [];
      }

      const metadata = await FileSystemStorage.loadMetadata();

      // Load image URLs for each generation
      const generationsWithUrls = await Promise.all(
        metadata.map(async (gen: any) => {
          try {
            const url = await FileSystemStorage.loadImage(gen.filename);
            return {
              ...gen,
              url,
            } as GeneratedImage;
          } catch (error) {
            console.warn(`Failed to load image ${gen.filename}:`, error);
            return {
              ...gen,
              url: '', // Placeholder for missing image
            } as GeneratedImage;
          }
        })
      );

      return generationsWithUrls;
    } catch (error) {
      console.warn('Failed to load generations:', error);
      return [];
    }
  }

  static async deleteGeneration(id: string): Promise<void> {
    try {
      await FileSystemStorage.init();
      if (!FileSystemStorage.hasDirectoryAccess()) {
        return;
      }

      const generations = await FileSystemStorage.loadMetadata();
      const generation = generations.find((gen: any) => gen.id === id);

      if (generation) {
        await FileSystemStorage.deleteGeneration(id, generation.filename);
      }
    } catch (error) {
      console.warn('Failed to delete generation:', error);
    }
  }

  // Utility method to check if storage is ready
  static isReady(): boolean {
    return FileSystemStorage.hasDirectoryAccess();
  }

  // Get the selected directory name
  static getDirectoryName(): string | null {
    return FileSystemStorage.getDirectoryName();
  }
}
