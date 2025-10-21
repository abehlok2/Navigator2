type RecorderErrorEvent = Event & {
  error?: DOMException;
};

export class SessionRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private recording = false;
  private startTime: number | null = null;
  private duration = 0;

  async start(stream: MediaStream): Promise<void> {
    if (!stream) {
      throw new Error('A valid MediaStream is required to start recording.');
    }

    if (this.recording) {
      throw new Error('Recording is already in progress.');
    }

    if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
      throw new Error('MediaRecorder API is not supported in this environment.');
    }

    const options = this.getSupportedOptions();

    try {
      this.mediaRecorder = new MediaRecorder(stream, options);
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : 'Failed to initialize media recorder.'
      );
    }

    this.chunks = [];
    this.duration = 0;

    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('MediaRecorder is not available.'));
        return;
      }

      const recorder = this.mediaRecorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      recorder.onerror = (event: RecorderErrorEvent) => {
        const errorMessage = event.error?.message ?? 'An unknown recording error occurred.';
        this.resetState();
        reject(new Error(errorMessage));
      };

      recorder.onstart = () => {
        this.recording = true;
        this.startTime = Date.now();
        resolve();
      };

      try {
        recorder.start();
      } catch (error) {
        this.resetState();
        reject(error instanceof Error ? error : new Error('Unable to start recording.'));
      }
    });
  }

  async stop(): Promise<Blob> {
    if (!this.mediaRecorder || !this.recording) {
      throw new Error('No active recording to stop.');
    }

    return new Promise<Blob>((resolve, reject) => {
      const recorder = this.mediaRecorder as MediaRecorder;
      const mimeType = recorder.mimeType || this.getSupportedOptions()?.mimeType || 'audio/webm';

      const handleStop = () => {
        recorder.onstop = null;
        recorder.onerror = null;
        this.recording = false;
        this.duration = this.startTime ? (Date.now() - this.startTime) / 1000 : this.duration;
        this.startTime = null;
        this.mediaRecorder = null;
        const blob = new Blob(this.chunks, { type: mimeType });
        this.chunks = [];
        resolve(blob);
      };

      const handleError = (error: DOMException | Error) => {
        recorder.onstop = null;
        recorder.onerror = null;
        const message = error instanceof DOMException || error instanceof Error
          ? error.message
          : 'Failed to stop recording.';
        this.resetState();
        reject(new Error(message));
      };

      recorder.onstop = handleStop;
      recorder.onerror = (event: RecorderErrorEvent) => {
        handleError(event.error ?? new Error('An unknown recording error occurred.'));
      };

      try {
        recorder.stop();
      } catch (error) {
        handleError(error as Error);
      }
    });
  }

  isRecording(): boolean {
    return this.recording;
  }

  getDuration(): number {
    if (this.recording && this.startTime) {
      return (Date.now() - this.startTime) / 1000;
    }

    return this.duration;
  }

  downloadRecording(blob: Blob, filename?: string): void {
    if (typeof window === 'undefined') {
      throw new Error('Downloading recordings is only supported in the browser.');
    }

    const resolvedFilename = filename ?? this.getDefaultFilename();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = resolvedFilename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  private getSupportedOptions(): MediaRecorderOptions | undefined {
    if (typeof MediaRecorder === 'undefined') {
      return undefined;
    }

    const preferredTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
    ];

    const mimeType = preferredTypes.find((type) => {
      try {
        return MediaRecorder.isTypeSupported(type);
      } catch (error) {
        return false;
      }
    });

    return mimeType ? { mimeType } : undefined;
  }

  private getDefaultFilename(): string {
    return `session-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
  }

  private resetState() {
    this.mediaRecorder = null;
    this.chunks = [];
    this.recording = false;
    this.startTime = null;
    this.duration = 0;
  }
}
