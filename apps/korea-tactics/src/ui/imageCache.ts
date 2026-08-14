import { allAssetUrls } from "./assets";

/**
 * Shared HTMLImageElement cache for canvas drawing.
 * DOM <img> tags load independently; this is for Board drawImage.
 */
class ImageCache {
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly waiters = new Set<() => void>();
  private loading = false;
  private ready = false;

  get(src: string): HTMLImageElement | null {
    const img = this.images.get(src);
    if (!img || !img.complete || img.naturalWidth === 0) return null;
    return img;
  }

  /** True once the initial preload batch has settled (success or fail). */
  isReady(): boolean {
    return this.ready;
  }

  onReady(cb: () => void): () => void {
    if (this.ready) {
      cb();
      return () => undefined;
    }
    this.waiters.add(cb);
    return () => {
      this.waiters.delete(cb);
    };
  }

  preload(urls: string[] = allAssetUrls()): Promise<void> {
    if (this.loading || this.ready) {
      return this.ready
        ? Promise.resolve()
        : new Promise((resolve) => {
            this.onReady(() => resolve());
          });
    }
    this.loading = true;
    const unique = [...new Set(urls)];

    return Promise.all(
      unique.map(
        (src) =>
          new Promise<void>((resolve) => {
            const existing = this.images.get(src);
            if (existing?.complete && existing.naturalWidth > 0) {
              resolve();
              return;
            }
            const img = new Image();
            img.decoding = "async";
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = src;
            this.images.set(src, img);
          }),
      ),
    ).then(() => {
      this.ready = true;
      this.loading = false;
      for (const waiter of this.waiters) waiter();
      this.waiters.clear();
    });
  }
}

export const imageCache = new ImageCache();
