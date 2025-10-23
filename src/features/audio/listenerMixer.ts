export class ListenerAudioMixer {
  private audioContext: AudioContext;
  private sources: Map<string, MediaStreamAudioSourceNode>;
  private gains: Map<string, GainNode>;
  private masterGain: GainNode;

  constructor() {
    this.audioContext = new AudioContext({ sampleRate: 48000 });
    this.sources = new Map();
    this.gains = new Map();

    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterGain.connect(this.audioContext.destination);
  }

  private getSourceKey(participantId: string, label: string): string {
    return `${participantId}::${label}`;
  }

  async addAudioSource(participantId: string, stream: MediaStream, label: string): Promise<void> {
    console.log(`[ListenerAudioMixer] Adding audio source for ${participantId} (${label})`);
    console.log(`[ListenerAudioMixer] Stream active: ${stream.active}, track count: ${stream.getAudioTracks().length}`);

    const sourceKey = this.getSourceKey(participantId, label);

    // Remove existing if present
    this.removeAudioSource(participantId, label);

    // Verify stream has active audio tracks
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.error(`[ListenerAudioMixer] No audio tracks in stream for ${participantId}`);
      return;
    }

    const track = audioTracks[0];
    console.log(`[ListenerAudioMixer] Track: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);

    // ⚠️ CRITICAL: Wait for track to be ready
    if (track.readyState !== 'live') {
      console.log(`[ListenerAudioMixer] Track for ${participantId} not live yet, waiting...`);
      await new Promise<void>((resolve) => {
        if (track.readyState === 'live') {
          resolve();
          return;
        }

        const checkReady = () => {
          if (track.readyState === 'live') {
            track.removeEventListener('unmute', checkReady);
            resolve();
          }
        };

        track.addEventListener('unmute', checkReady);

        const interval = setInterval(() => {
          if (track.readyState === 'live') {
            clearInterval(interval);
            track.removeEventListener('unmute', checkReady);
            resolve();
          }
        }, 100);

        setTimeout(() => {
          clearInterval(interval);
          track.removeEventListener('unmute', checkReady);
          console.warn(`[ListenerAudioMixer] Track readiness timeout for ${participantId}, proceeding anyway`);
          resolve();
        }, 5000);
      });
    }

    console.log(`[ListenerAudioMixer] Track is now ready: readyState=${track.readyState}, muted=${track.muted}`);

    // ⚠️ CRITICAL: Ensure AudioContext is running BEFORE creating the source
    await this.resumeAudioContext();

    // Create new source and gain
    const source = this.audioContext.createMediaStreamSource(stream);
    const gain = this.audioContext.createGain();
    gain.gain.value = 1.0;

    console.log(`[ListenerAudioMixer] AudioContext state: ${this.audioContext.state}, sample rate: ${this.audioContext.sampleRate}`);
    console.log(`[ListenerAudioMixer] Master gain value: ${this.masterGain.gain.value}`);

    // Connect: Source → Gain → Master
    source.connect(gain);
    gain.connect(this.masterGain);

    console.log(`[ListenerAudioMixer] Successfully connected audio source for ${participantId}`);

    // Store references
    this.sources.set(sourceKey, source);
    this.gains.set(sourceKey, gain);
  }

  removeAudioSource(participantId: string, label?: string): void {
    const keysToRemove = label
      ? [this.getSourceKey(participantId, label)]
      : Array.from(this.sources.keys()).filter((key) => key.startsWith(`${participantId}::`));

    keysToRemove.forEach((key) => {
      const source = this.sources.get(key);
      const gain = this.gains.get(key);

      if (source) {
        source.disconnect();
        this.sources.delete(key);
      }

      if (gain) {
        gain.disconnect();
        this.gains.delete(key);
      }
    });
  }

  setSourceVolume(participantId: string, value: number, label?: string): void {
    const keys = label
      ? [this.getSourceKey(participantId, label)]
      : Array.from(this.gains.keys()).filter((key) => key.startsWith(`${participantId}::`));

    keys.forEach((key) => {
      const gain = this.gains.get(key);
      if (gain) {
        gain.gain.setValueAtTime(value, this.audioContext.currentTime);
      }
    });
  }

  setMasterVolume(value: number): void {
    this.masterGain.gain.setValueAtTime(value, this.audioContext.currentTime);
  }

  /**
   * Resume the audio context if it's suspended (required for browser autoplay policies)
   * Should be called when receiving audio from facilitator
   */
  async resumeAudioContext(): Promise<void> {
    console.log(`[ListenerAudioMixer] Current AudioContext state: ${this.audioContext.state}`);

    if (this.audioContext.state === 'suspended') {
      try {
        console.log('[ListenerAudioMixer] Attempting to resume AudioContext...');
        await this.audioContext.resume();
        console.log(`[ListenerAudioMixer] AudioContext resumed successfully. New state: ${this.audioContext.state}`);
      } catch (error) {
        console.error('[ListenerAudioMixer] Failed to resume AudioContext:', error);
      }
    } else {
      console.log('[ListenerAudioMixer] AudioContext already running');
    }

    // Log active sources and gains
    console.log(`[ListenerAudioMixer] Active sources: ${this.sources.size}, Active gains: ${this.gains.size}`);
    this.sources.forEach((_, key) => {
      const gain = this.gains.get(key);
      console.log(`[ListenerAudioMixer] Source ${key}: gain value = ${gain?.gain.value ?? 'N/A'}`);
    });
  }

  muteSource(participantId: string, muted: boolean): void {
    this.setSourceVolume(participantId, muted ? 0 : 1.0);
  }

  disconnect(): void {
    this.sources.forEach(source => source.disconnect());
    this.gains.forEach(gain => gain.disconnect());
    this.sources.clear();
    this.gains.clear();
    void this.audioContext.close();
  }
}
