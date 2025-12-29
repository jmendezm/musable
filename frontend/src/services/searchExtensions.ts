export interface SearchResultItem {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  duration?: number;
  source: string;
  type: 'song' | 'video' | 'track';
  metadata?: Record<string, any>;
}

export interface SearchExtension {
  id: string;
  name: string;
  canHandle: (query: string) => boolean;
  search: (query: string) => Promise<SearchResultItem[]>;
  renderComponent?: React.ComponentType<any>;
}

export interface SearchExtensionProps {
  results: SearchResultItem[];
  onDownloadComplete?: () => void;
}

class SearchExtensionManager {
  private extensions: Map<string, SearchExtension> = new Map();

  register(extension: SearchExtension) {
    this.extensions.set(extension.id, extension);
  }

  unregister(extensionId: string) {
    this.extensions.delete(extensionId);
  }

  getExtensions(): SearchExtension[] {
    return Array.from(this.extensions.values());
  }

  async searchAll(query: string): Promise<Map<string, SearchResultItem[]>> {
    console.log('[SearchExtensionManager] 🔍 searchAll called with query:', query);
    const resultMap = new Map<string, SearchResultItem[]>();

    const allExtensions = Array.from(this.extensions.values());
    console.log('[SearchExtensionManager] 📋 Total extensions registered:', allExtensions.length);
    console.log('[SearchExtensionManager] 📋 Extension IDs:', allExtensions.map(e => e.id));

    const searchableExtensions = allExtensions.filter(
      ext => ext.canHandle(query)
    );

    console.log('[SearchExtensionManager] ✅ Extensions that can handle query:', searchableExtensions.map(e => e.id));

    const searchPromises = searchableExtensions.map(async (extension) => {
      console.log(`[SearchExtensionManager] 🔍 Calling search on extension: ${extension.id}`);
      try {
        const results = await extension.search(query);
        console.log(`[SearchExtensionManager] ✅ Extension ${extension.id} returned ${results.length} results`);
        return { extensionId: extension.id, results };
      } catch (error) {
        console.error(`[SearchExtensionManager] ❌ Search error in extension ${extension.id}:`, error);
        return { extensionId: extension.id, results: [] };
      }
    });

    const searchResults = await Promise.all(searchPromises);

    searchResults.forEach(({ extensionId, results }) => {
      console.log(`[SearchExtensionManager] 📝 Setting results for ${extensionId}:`, results.length, 'items');
      resultMap.set(extensionId, results);
    });

    console.log('[SearchExtensionManager] 📦 Final result map:', Array.from(resultMap.entries()));
    return resultMap;
  }

  getExtension(extensionId: string): SearchExtension | undefined {
    return this.extensions.get(extensionId);
  }
}

export const searchExtensionManager = new SearchExtensionManager();
