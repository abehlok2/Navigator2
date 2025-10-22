export class FacilitatorAudioMixer {
  private audioContext: AudioContext;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private explorerMicSources: Map<string, MediaStreamAudioSourceNode> = new Map();
  private explorerMicGains: Map<string, GainNode> = new Map();
  private backgroundSource: MediaElementAudioSourceNode | null = null;
  private backgroundAudioElement: HTMLAudioElement | null = null;
  private micGain: GainNode;
  private backgroundGain: GainNode;
  private masterGain: GainNode;
  private destination: MediaStreamAudioDestinationNode;

  constructor() {
    this.audioContext = new AudioContext({ sampleRate: 48000 });

    this.micGain = this.audioContext.createGain();
    this.backgroundGain = this.audioContext.createGain();
    this.masterGain = this.audioContext.createGain();
    this.destination = this.audioContext.createMediaStreamDestination();

    this.micGain.gain.value = 1.0;
    this.backgroundGain.gain.value = 0.7;
    this.masterGain.gain.value = 1.0;

    this.micGain.connect(this.masterGain);
    this.backgroundGain.connect(this.masterGain);

    // Connect to both broadcast destination (for peers) and local speakers (for facilitator to hear)
    this.masterGain.connect(this.destination);
    this.masterGain.connect(this.audioContext.destination);
  }

  connectMicrophone(micStream: MediaStream): void {
    if (this.micSource) {
      this.micSource.disconnect();
    }

    this.micSource = this.audioContext.createMediaStreamSource(micStream);
    this.micSource.connect(this.micGain);
  }

  /**
   * Connect an explorer's microphone to the mixer
   */
  connectExplorerMicrophone(participantId: string, micStream: MediaStream): void {
    // Remove existing connection if present
    this.disconnectExplorerMicrophone(participantId);

    // Create new source and gain for this explorer
    const source = this.audioContext.createMediaStreamSource(micStream);
    const gain = this.audioContext.createGain();
    gain.gain.value = 1.0;

    // Connect: Source → Gain → Master
    source.connect(gain);
    gain.connect(this.masterGain);

    // Store references
    this.explorerMicSources.set(participantId, source);
    this.explorerMicGains.set(participantId, gain);

    console.log(`[FacilitatorAudioMixer] Connected explorer microphone: ${participantId}`);
  }

  /**
   * Disconnect an explorer's microphone from the mixer
   */
  disconnectExplorerMicrophone(participantId: string): void {
    const source = this.explorerMicSources.get(participantId);
    const gain = this.explorerMicGains.get(participantId);

    if (source) {
      source.disconnect();
      this.explorerMicSources.delete(participantId);
    }

    if (gain) {
      gain.disconnect();
      this.explorerMicGains.delete(participantId);
    }

    if (source || gain) {
      console.log(`[FacilitatorAudioMixer] Disconnected explorer microphone: ${participantId}`);
    }
  }

  /**
   * Set volume for a specific explorer's microphone
   */
  setExplorerMicVolume(participantId: string, value: number): void {
    const gain = this.explorerMicGains.get(participantId);
    if (gain) {
      gain.gain.setValueAtTime(value, this.audioContext.currentTime);
    }
  }

  connectBackgroundAudio(audioElement: HTMLAudioElement): void {
    console.log('[FacilitatorAudioMixer] ========== CONNECTING BACKGROUND AUDIO ==========');
    console.log('[FacilitatorAudioMixer] Audio element provided:', !!audioElement);
    console.log('[FacilitatorAudioMixer] Audio element ready state:', audioElement?.readyState);
    console.log('[FacilitatorAudioMixer] Audio element duration:', audioElement?.duration);
    console.log('[FacilitatorAudioMixer] Audio element paused:', audioElement?.paused);
    console.log('[FacilitatorAudioMixer] Same audio element as before:', this.backgroundAudioElement === audioElement);
    console.log('[FacilitatorAudioMixer] Existing background source:', !!this.backgroundSource);

    // If the audio element hasn't changed and we already have a source, just ensure it's connected
    if (this.backgroundAudioElement === audioElement && this.backgroundSource) {
      // Already connected to this audio element, no need to recreate the source
      // Just ensure it's connected to the background gain
      console.log('[FacilitatorAudioMixer] Reusing existing audio source');
      try {
        this.backgroundSource.connect(this.backgroundGain);
        console.log('[FacilitatorAudioMixer] Reconnected existing source (or already connected)');
      } catch (error) {
        // Already connected, ignore the error
        console.log('[FacilitatorAudioMixer] Source already connected');
      }
      return;
    }

    // Disconnect previous source if it exists
    if (this.backgroundSource) {
      console.log('[FacilitatorAudioMixer] Disconnecting previous background source');
      this.backgroundSource.disconnect();
      this.backgroundSource = null;
    }

    // Create new source for the new audio element
    // Note: createMediaElementSource can only be called once per HTMLAudioElement
    console.log('[FacilitatorAudioMixer] Creating new MediaElementSource');
    console.log('[FacilitatorAudioMixer] AudioContext state:', this.audioContext.state);

    this.backgroundSource = this.audioContext.createMediaElementSource(audioElement);
    this.backgroundSource.connect(this.backgroundGain);
    this.backgroundAudioElement = audioElement;

    console.log('[FacilitatorAudioMixer] Background audio connected successfully');
    console.log('[FacilitatorAudioMixer] Background gain value:', this.backgroundGain.gain.value);
    console.log('[FacilitatorAudioMixer] Master gain value:', this.masterGain.gain.value);
    console.log('[FacilitatorAudioMixer] ========== BACKGROUND AUDIO CONNECTION COMPLETE ==========');
  }

  /**
   * Resume the audio context if it's suspended (required for browser autoplay policies)
   * Should be called on user interaction (e.g., clicking play button)
   */
  async resumeAudioContext(): Promise<void> {
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
        console.log('[FacilitatorAudioMixer] AudioContext resumed');
      } catch (error) {
        console.error('[FacilitatorAudioMixer] Failed to resume AudioContext:', error);
      }
    }
  }

  getMixedStream(): MediaStream {
    const stream = this.destination.stream;
    console.log('[FacilitatorAudioMixer] Getting mixed stream');
    console.log('[FacilitatorAudioMixer] Stream active:', stream.active);
    console.log('[FacilitatorAudioMixer] Stream tracks:', stream.getTracks().length);

    // Ensure all tracks are enabled
    stream.getTracks().forEach((track, index) => {
      if (!track.enabled) {
        console.log(`[FacilitatorAudioMixer] Enabling track ${index}`);
        track.enabled = true;
      }
      console.log(`[FacilitatorAudioMixer] Track ${index}: kind=${track.kind}, enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
    });

    return stream;
  }

  setMicVolume(value: number): void {
    this.micGain.gain.setValueAtTime(value, this.audioContext.currentTime);
  }

  setBackgroundVolume(value: number): void {
    this.backgroundGain.gain.setValueAtTime(value, this.audioContext.currentTime);
  }

  setMasterVolume(value: number): void {
    this.masterGain.gain.setValueAtTime(value, this.audioContext.currentTime);
  }

  fadeBackgroundVolume(targetValue: number, duration: number): void {
    const now = this.audioContext.currentTime;
    this.backgroundGain.gain.cancelScheduledValues(now);
    this.backgroundGain.gain.setValueAtTime(this.backgroundGain.gain.value, now);
    this.backgroundGain.gain.linearRampToValueAtTime(targetValue, now + duration);
  }

  disconnect(): void {
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }

    // Disconnect all explorer microphones
    this.explorerMicSources.forEach((source) => source.disconnect());
    this.explorerMicGains.forEach((gain) => gain.disconnect());
    this.explorerMicSources.clear();
    this.explorerMicGains.clear();

    if (this.backgroundSource) {
      this.backgroundSource.disconnect();
      this.backgroundSource = null;
    }
    this.backgroundAudioElement = null;

    void this.audioContext.close();
  }
}
