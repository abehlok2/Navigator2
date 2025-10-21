import { RecordingError, RecorderErrorEvent } from './recordingError';

export class FacilitatorRecorder {
  private recorder: MediaRecorder | null = null;

  private chunks: Blob[] = [];

  private startTime = 0;

  private duration = 0;

  private stream: MediaStream | null = null;

  async start(mixedStream: MediaStream): Promise<void> {
    if (!mixedStream) {
      throw new RecordingError('A valid MediaStream must be provided to start recording.');
    }

    if (this.isRecording()) {
      throw new RecordingError('Recording is already in progress.');
    }

    if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
      throw new RecordingError('MediaRecorder API is not supported in this environment.');
    }

    this.stream = mixedStream;
    this.chunks = [];
    this.startTime = Date.now();
    this.duration = 0;

    const mimeType = this.getBestMimeType();

    try {
      this.recorder = new MediaRecorder(mixedStream, {
        mimeType,
        audioBitsPerSecond: 192000,
      });
    } catch (error) {
      this.resetOnError();
      throw new RecordingError('Failed to start recording', error);
    }

    this.recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.recorder.onerror = (event) => {
      console.error('Recording error:', event);
    };

    try {
      this.recorder.start(1000);
    } catch (error) {
      this.resetOnError();
      throw new RecordingError('Failed to start recording', error);
    }
  }

  async stop(): Promise<Blob> {
    if (!this.recorder) {
      throw new Error('Recorder not started');
    }

    return new Promise<Blob>((resolve, reject) => {
      const recorder = this.recorder as MediaRecorder;

      recorder.onstop = () => {
        const blob = new Blob(this.chunks, {
          type: recorder.mimeType || this.getBestMimeType(),
        });
        this.duration = this.startTime ? Date.now() - this.startTime : 0;
        this.startTime = 0;
        this.chunks = [];
        this.detachRecorder();
        this.stream = null;
        resolve(blob);
      };

      recorder.onerror = (event: RecorderErrorEvent) => {
        this.resetOnError();
        const error = event.error ?? new DOMException('An unknown recording error occurred.', 'UnknownError');
        reject(error);
      };

      try {
        recorder.stop();
      } catch (error) {
        this.resetOnError();
        reject(error instanceof Error ? error : new RecordingError('Failed to stop recording', error));
      }
    });
  }

  getDuration(): number {
    return this.isRecording() && this.startTime
      ? Date.now() - this.startTime
      : this.duration;
  }

  isRecording(): boolean {
    return this.recorder?.state === 'recording';
  }

  private getBestMimeType(): string {
    if (typeof MediaRecorder === 'undefined') {
      return 'audio/webm';
    }

    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'audio/webm';
  }

  async download(blob: Blob, filename?: string): Promise<void> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      throw new RecordingError('Downloading recordings is only supported in the browser.');
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename || `facilitator-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  private detachRecorder(): void {
    if (this.recorder) {
      this.recorder.ondataavailable = null;
      this.recorder.onerror = null;
      this.recorder.onstop = null;
    }

    this.recorder = null;
  }

  private resetOnError(): void {
    this.detachRecorder();
    this.stream = null;
    this.chunks = [];
    this.startTime = 0;
    this.duration = 0;
  }
}
