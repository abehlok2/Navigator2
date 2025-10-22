export type AudioPlayerEvent = 'timeupdate' | 'ended';

export class AudioPlayer {
  private audio: HTMLAudioElement;
  private objectUrl: string | null = null;
  private eventHandlers = new Map<AudioPlayerEvent, Set<EventListener>>();

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'metadata';
  }

  async loadFile(file: File): Promise<void> {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }

    const url = URL.createObjectURL(file);
    this.objectUrl = url;
    this.audio.src = url;
    this.audio.currentTime = 0;

    await new Promise<void>((resolve, reject) => {
      const handleLoadedMetadata = () => {
        cleanup();
        resolve();
      };

      const handleError = () => {
        cleanup();
        reject(new Error('Failed to load audio file'));
      };

      const cleanup = () => {
        this.audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        this.audio.removeEventListener('error', handleError);
      };

      this.audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      this.audio.addEventListener('error', handleError);
    });
  }

  play(): Promise<void> {
    return this.audio.play();
  }

  pause(): void {
    this.audio.pause();
  }

  stop(): void {
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  seek(seconds: number): void {
    if (!Number.isFinite(seconds)) {
      return;
    }

    const duration = this.getDuration();
    if (duration > 0) {
      this.audio.currentTime = Math.min(Math.max(seconds, 0), duration);
    } else {
      this.audio.currentTime = Math.max(seconds, 0);
    }
  }

  setVolume(level: number): void {
    if (!Number.isFinite(level)) {
      return;
    }

    const clamped = Math.min(Math.max(level, 0), 1);
    this.audio.volume = clamped;
  }

  getCurrentTime(): number {
    return this.audio.currentTime || 0;
  }

  getDuration(): number {
    const { duration } = this.audio;
    return Number.isFinite(duration) ? duration : 0;
  }

  getVolume(): number {
    return this.audio.volume;
  }

  on(event: AudioPlayerEvent, handler: EventListener): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    const handlers = this.eventHandlers.get(event);
    handlers?.add(handler);
    this.audio.addEventListener(event, handler);
  }

  off(event: AudioPlayerEvent, handler: EventListener): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(event);
      }
    }
    this.audio.removeEventListener(event, handler);
  }

  destroy(): void {
    this.stop();

    // Clean up all registered event handlers
    for (const [event, handlers] of this.eventHandlers.entries()) {
      for (const handler of handlers) {
        this.audio.removeEventListener(event, handler);
      }
    }
    this.eventHandlers.clear();

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.audio.src = '';
  }
}
