import React from 'react';

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
  modalComponent?: React.ComponentType<any>; // Modal component for image search UI
}

class ImageSearchExtensionManager {
  private extensions: Map<string, ImageSearchExtension> = new Map();

  register(extension: ImageSearchExtension) {
    this.extensions.set(extension.id, extension);
  }

  unregister(extensionId: string) {
    this.extensions.delete(extensionId);
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

  // Get the first available modal component from any extension
  getModalComponent(): React.ComponentType<any> | null {
    const extensions = Array.from(this.extensions.values());
    for (const extension of extensions) {
      if (extension.modalComponent) {
        return extension.modalComponent;
      }
    }
    return null;
  }

  // Check if any extension has a modal component
  hasModalComponent(): boolean {
    const extensions = Array.from(this.extensions.values());
    return extensions.some(ext => ext.modalComponent !== undefined);
  }
}

export const imageSearchExtensionManager = new ImageSearchExtensionManager();
