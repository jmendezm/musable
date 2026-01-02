export interface SearchImage {
  id: string;
  url: string;
  thumbnail: string;
  title: string;
  source: string;
  width?: number;
  height?: number;
  videoId?: string;
  channelTitle?: string;
}

export interface ImageSearchExtension {
  id: string;
  name: string;
  description?: string;
  icon?: React.ComponentType<any>;
  search: (query: string, limit?: number) => Promise<SearchImage[]>;
}

class ImageSearchExtensionManager {
  private extensions: Map<string, ImageSearchExtension> = new Map();

  register(extension: ImageSearchExtension) {
    this.extensions.set(extension.id, extension);
    console.log(`[ImageSearchExtensionManager] Registered image search extension: ${extension.id} (${extension.name})`);
  }

  unregister(extensionId: string) {
    this.extensions.delete(extensionId);
    console.log(`[ImageSearchExtensionManager] Unregistered image search extension: ${extensionId}`);
  }

  getExtensions(): ImageSearchExtension[] {
    return Array.from(this.extensions.values());
  }

  getExtension(extensionId: string): ImageSearchExtension | undefined {
    return this.extensions.get(extensionId);
  }

  hasExtensions(): boolean {
    return this.extensions.size > 0;
  }

  // Get first available extension (for default "Search Online" button)
  getFirstExtension(): ImageSearchExtension | undefined {
    return Array.from(this.extensions.values())[0];
  }
}

export const imageSearchExtensionManager = new ImageSearchExtensionManager();
