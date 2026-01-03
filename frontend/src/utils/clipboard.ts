/**
 * Utility functions for clipboard operations
 */

/**
 * Copy text to clipboard using modern API or fallback
 * @param text - The text to copy
 * @returns Promise that resolves when text is copied
 */
export const copyToClipboard = async (text: string): Promise<void> => {
  // Try modern clipboard API first
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  // Fallback for older browsers or when clipboard API is not available
  return new Promise((resolve, reject) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      const successful = document.execCommand('copy');
      if (successful) {
        resolve();
      } else {
        reject(new Error('Failed to copy text'));
      }
    } catch (err) {
      reject(err);
    } finally {
      document.body.removeChild(textArea);
    }
  });
};
