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

  addAudioSource(participantId: string, stream: MediaStream, label: string): void {
    console.log(`[ListenerAudioMixer] Adding audio source for ${participantId} (${label})`);
    console.log(`[ListenerAudioMixer] Stream active: ${stream.active}, track count: ${stream.getAudioTracks().length}`);

    // Log track details
    stream.getAudioTracks().forEach((track, index) => {
      console.log(`[ListenerAudioMixer] Track ${index}: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
    });

    // Remove existing if present
    this.removeAudioSource(participantId);

    // Verify stream has active audio tracks
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.error(`[ListenerAudioMixer] No audio tracks in stream for ${participantId}`);
      return;
    }

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
    this.sources.set(participantId, source);
    this.gains.set(participantId, gain);

    // Attempt to resume audio context immediately
    void this.resumeAudioContext();
  }

  removeAudioSource(participantId: string): void {
    const source = this.sources.get(participantId);
    const gain = this.gains.get(participantId);

    if (source) {
      source.disconnect();
      this.sources.delete(participantId);
    }

    if (gain) {
      gain.disconnect();
      this.gains.delete(participantId);
    }
  }

  setSourceVolume(participantId: string, value: number): void {
    const gain = this.gains.get(participantId);
    if (gain) {
      gain.gain.setValueAtTime(value, this.audioContext.currentTime);
    }
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
    this.sources.forEach((_, id) => {
      const gain = this.gains.get(id);
      console.log(`[ListenerAudioMixer] Source ${id}: gain value = ${gain?.gain.value ?? 'N/A'}`);
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
