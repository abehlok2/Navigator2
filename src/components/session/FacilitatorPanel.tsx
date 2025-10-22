import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import { BackgroundPlayer, MicrophoneControl, RecordingControl } from '../audio';
import { ErrorDisplay } from './ErrorDisplay';
import { ParticipantList } from './ParticipantList';
import { SessionHeader } from './SessionHeader';
import { SessionNotes } from './SessionNotes';
import { Card } from '../ui';
import { useSessionStore } from '../../state/session';
import {
  FacilitatorAudioMixer,
  FacilitatorRecorder,
  getAudioLevel,
  stopMicrophoneStream,
} from '../../features/audio';
import type { ControlChannel } from '../../features/webrtc/ControlChannel';
import type { SessionError } from '../../features/webrtc/errors';
import { createSessionError } from '../../features/webrtc/errors';
import { addAudioTrack, replaceAudioTrack } from '../../features/webrtc/connection';
import type { PeerConnectionManager } from '../../features/webrtc/peerManager';

export type FacilitatorPlaybackState = 'playing' | 'paused' | 'stopped';

export interface FacilitatorPanelProps {
  controlChannel: ControlChannel | null;
  peerManager: PeerConnectionManager | null;
}

const panelStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
};

const contentLayoutStyles: CSSProperties = {
  display: 'grid',
  gap: '1.5rem',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  alignItems: 'start',
};

const controlsWrapperStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
};

const sidebarLayoutStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
};

const sectionStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const sectionHeadingStyles: CSSProperties = {
  margin: 0,
  fontSize: '1rem',
  fontWeight: 600,
  color: 'var(--text-primary, #ffffff)',
};

const sectionStatusStyles: CSSProperties = {
  margin: 0,
  fontSize: '0.85rem',
  color: 'var(--text-secondary, #a0a0a0)',
};

const controlsLayoutStyles: CSSProperties = {
  display: 'grid',
  gap: '1.5rem',
};

const toTitleCase = (value: string): string => {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
};

export const FacilitatorPanel = ({ controlChannel, peerManager }: FacilitatorPanelProps) => {
  const roomId = useSessionStore((state) => state.roomId);
  const participants = useSessionStore((state) => state.participants);
  const connectionStatus = useSessionStore((state) => state.connectionStatus);

  const [mixer, setMixer] = useState<FacilitatorAudioMixer | null>(null);
  const [recorder, setRecorder] = useState<FacilitatorRecorder | null>(null);
  const [audioPlayer, setAudioPlayer] = useState<HTMLAudioElement | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [playbackState, setPlaybackState] = useState<FacilitatorPlaybackState>('stopped');
  const [microphoneStream, setMicrophoneStream] = useState<MediaStream | null>(null);
  const [isMicrophoneActive, setIsMicrophoneActive] = useState(false);
  const [audioLevels, setAudioLevels] = useState<{ microphone: number }>({ microphone: 0 });
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [backgroundVolume, setBackgroundVolume] = useState(1);
  const [audioDuration, setAudioDuration] = useState(0);
  const [sessionError, setSessionError] = useState<SessionError | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const recorderRef = useRef<FacilitatorRecorder | null>(null);
  const levelAnimationRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const audioSendersRef = useRef<Map<string, RTCRtpSender>>(new Map());
  const lastProgressSecondRef = useRef<number | null>(null);

  // Broadcast audio track to all peer connections
  const broadcastAudioTrack = useCallback(
    async (mixedStream: MediaStream) => {
      if (!peerManager) {
        console.warn('No peer manager available to broadcast audio');
        return;
      }

      const participantIds = peerManager.getParticipantIds();
      const senders = audioSendersRef.current;

      // Clean up senders for participants that are no longer connected
      for (const [participantId, sender] of senders.entries()) {
        if (!participantIds.includes(participantId)) {
          const pc = peerManager.getConnection(participantId);
          if (!pc || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
            console.log(`[FacilitatorPanel] Removing stale sender for ${participantId}`);
            senders.delete(participantId);
          }
        }
      }

      for (const participantId of participantIds) {
        const pc = peerManager.getConnection(participantId);
        if (!pc) {
          continue;
        }

        // Skip if connection is closed or failed
        if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
          console.log(`[FacilitatorPanel] Skipping broadcast to closed/failed connection: ${participantId}`);
          senders.delete(participantId);
          continue;
        }

        try {
          const existingSender = senders.get(participantId);

          if (existingSender) {
            // Replace track on existing sender
            await replaceAudioTrack(existingSender, mixedStream);
            console.log(`[FacilitatorPanel] Replaced audio track for ${participantId}`);
          } else {
            // Add new track and store sender
            const sender = await addAudioTrack(pc, mixedStream);
            senders.set(participantId, sender);
            console.log(`[FacilitatorPanel] Added audio track for ${participantId}`);

            // Create offer and send via signaling
            // Note: The negotiationNeeded event in SessionPage will handle this
          }
        } catch (error) {
          console.error(`[FacilitatorPanel] Failed to broadcast audio to ${participantId}:`, error);
          // Remove sender on error as it may be invalid
          senders.delete(participantId);
        }
      }
    },
    [peerManager],
  );

  // Remove audio tracks from all peer connections
  const detachAudioSenders = useCallback(async () => {
    const senders = audioSendersRef.current;

    for (const [participantId, sender] of senders.entries()) {
      try {
        // Check if the peer connection is still open before trying to replace track
        const pc = peerManager?.getConnection(participantId);
        if (pc && pc.connectionState !== 'closed' && pc.connectionState !== 'failed') {
          await sender.replaceTrack(null);
          console.log(`[FacilitatorPanel] Cleared audio track for ${participantId}`);
        } else {
          console.log(`[FacilitatorPanel] Skipping closed/failed connection for ${participantId}`);
        }
      } catch (error) {
        console.error(`[FacilitatorPanel] Failed to clear audio track for ${participantId}:`, error);
      }
    }

    senders.clear();
  }, [peerManager]);

  const sessionOverview = useMemo(
    () => ({
      roomId: roomId ?? '—',
      participantCount: participants.length,
      connectionStatus,
    }),
    [connectionStatus, participants.length, roomId],
  );

  // Helper function to safely send control messages
  // Messages are automatically buffered if channels aren't ready yet
  const sendControlMessage = useCallback(
    <T extends import('../../types/control-messages').ControlMessageType>(
      type: T,
      data?: Omit<import('../../types/control-messages').ControlMessageEventMap[T], 'type' | 'timestamp'>,
    ) => {
      if (!controlChannel) {
        console.warn(`Control channel not initialized. Cannot send message: ${type}`);
        return;
      }

      try {
        // ControlChannel.send() will automatically buffer messages if channels aren't ready
        controlChannel.send(type, data);
      } catch (error) {
        console.error(`Failed to send control message (${type}):`, error);
      }
    },
    [controlChannel],
  );

  // Start periodic progress updates when playing
  const startProgressUpdates = useCallback(() => {
    if (progressIntervalRef.current !== null || !audioPlayer) {
      return; // Already running or no audio source
    }

    progressIntervalRef.current = window.setInterval(() => {
      const currentTime = audioPlayer.currentTime || 0;
      const durationValue = Number.isFinite(audioPlayer.duration) ? audioPlayer.duration : 0;

      setPlaybackPosition(currentTime);
      setAudioDuration(durationValue);

      const wholeSeconds = Math.floor(currentTime);
      if (lastProgressSecondRef.current !== wholeSeconds) {
        lastProgressSecondRef.current = wholeSeconds;
        sendControlMessage('audio:progress', {
          currentTime,
          duration: durationValue,
        });
      }
    }, 1000); // Send updates every second
  }, [audioPlayer, sendControlMessage]);

  // Stop periodic progress updates
  const stopProgressUpdates = useCallback(() => {
    if (progressIntervalRef.current !== null) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    lastProgressSecondRef.current = null;
  }, []);

  const stopLevelMonitoring = useCallback(() => {
    if (levelAnimationRef.current !== null) {
      cancelAnimationFrame(levelAnimationRef.current);
      levelAnimationRef.current = null;
    }
    setAudioLevels({ microphone: 0 });
  }, []);

  const startLevelMonitoring = useCallback(
    (stream: MediaStream) => {
      if (typeof window === 'undefined') {
        return;
      }

      stopLevelMonitoring();

      const updateLevel = () => {
        try {
          const level = getAudioLevel(stream);
          setAudioLevels({ microphone: level });
        } catch (error) {
          console.error('Unable to read microphone level:', error);
          stopLevelMonitoring();
          return;
        }

        levelAnimationRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    },
    [stopLevelMonitoring],
  );

  const handleMicrophoneToggle = useCallback(
    (active: boolean, stream?: MediaStream) => {
      setIsMicrophoneActive(active);

      if (active && stream) {
        setMicrophoneStream(stream);
        streamRef.current = stream;
        setRecordingBlob(null);
        startLevelMonitoring(stream);

        if (mixer) {
          try {
            mixer.connectMicrophone(stream);
            // Broadcast the updated mixed stream to all peer connections
            const mixedStream = mixer.getMixedStream();
            void broadcastAudioTrack(mixedStream);
          } catch (error) {
            console.error('Unable to connect microphone to mixer:', error);
          }
        }
      } else {
        const currentStream = streamRef.current;
        if (currentStream) {
          stopMicrophoneStream(currentStream);
        }
        streamRef.current = null;
        setMicrophoneStream(null);
        stopLevelMonitoring();
        setAudioLevels({ microphone: 0 });

        // If background audio is also not playing, detach all audio senders
        // Otherwise, update with the background-only stream
        if (mixer && audioPlayer && playbackState === 'playing') {
          const mixedStream = mixer.getMixedStream();
          void broadcastAudioTrack(mixedStream);
        } else {
          void detachAudioSenders();
        }
      }
    },
    [broadcastAudioTrack, detachAudioSenders, mixer, audioPlayer, playbackState, startLevelMonitoring, stopLevelMonitoring],
  );

  const handleRecordingStart = useCallback(async () => {
    if (!mixer) {
      throw new Error('Audio mixer is not ready.');
    }

    const recorderInstance = recorderRef.current ?? recorder;
    if (!recorderInstance) {
      throw new Error('Recorder is not initialized.');
    }

    if (recorderInstance.isRecording()) {
      throw new Error('Recording is already in progress.');
    }

    await recorderInstance.start(mixer.getMixedStream());
    recorderRef.current = recorderInstance;
    setRecordingBlob(null);
    setIsRecording(true);

    // Send recording start message
    sendControlMessage('recording:start', {});
  }, [mixer, recorder, sendControlMessage]);

  const handleRecordingStop = useCallback(async () => {
    const recorderInstance = recorderRef.current ?? recorder;

    if (!recorderInstance || !recorderInstance.isRecording()) {
      throw new Error('No recording is currently in progress.');
    }

    const blob = await recorderInstance.stop();
    setRecordingBlob(blob);
    setIsRecording(false);

    // Send recording stop message
    sendControlMessage('recording:stop', {});

    return blob;
  }, [recorder, sendControlMessage]);

  const handleRecordingDownload = useCallback(
    (blob: Blob) => {
      const recorderInstance = recorderRef.current ?? recorder;
      if (!recorderInstance) {
        throw new Error('Recorder is not initialized.');
      }

      recorderInstance
        .download(blob)
        .catch((error) => {
          console.error('Unable to download recording:', error);
          setSessionError({
            type: 'recording-failed',
            reason: error instanceof Error ? error.message : 'Unknown error occurred',
          });
        });
    },
    [recorder],
  );

  // Error handlers
  const handleMicrophoneError = useCallback((error: unknown) => {
    console.error('Microphone error:', error);
    const sessionErr = createSessionError(error, 'microphone');
    setSessionError(sessionErr);
  }, []);

  const handleRecordingError = useCallback((error: unknown, context: 'start' | 'stop' | 'download') => {
    console.error('Recording error:', error, context);
    const reason = error instanceof Error ? error.message : 'Unknown error occurred';
    setSessionError({
      type: 'recording-failed',
      reason,
    });
    setIsRecording(false);
  }, []);

  const handleAudioLoadError = useCallback((error: unknown, context: 'load' | 'play') => {
    console.error('Audio error:', error, context);
    if (context === 'load') {
      setSessionError({
        type: 'audio-load-failed',
        filename: currentFile?.name || 'audio file',
      });
    }
  }, [currentFile]);

  const handleDismissError = useCallback(() => {
    setSessionError(null);
  }, []);

  const handleAudioLoad = useCallback(
    (file: File, audio: HTMLAudioElement) => {
      console.log('[FacilitatorPanel] ========== AUDIO FILE LOADED ==========');
      console.log('[FacilitatorPanel] File:', file.name);
      console.log('[FacilitatorPanel] Duration:', audio.duration);
      console.log('[FacilitatorPanel] Ready state:', audio.readyState);
      console.log('[FacilitatorPanel] Mixer available:', !!mixer);

      setCurrentFile(file);
      setPlaybackState('stopped');
      setPlaybackPosition(0);
      setSessionError(null);
      setAudioPlayer(audio);

      const durationValue = Number.isFinite(audio.duration) ? audio.duration : 0;
      setAudioDuration(durationValue);
      lastProgressSecondRef.current = null;
      stopProgressUpdates();

      const targetVolume = Math.min(Math.max(backgroundVolume, 0), 1);
      audio.volume = targetVolume;

      if (mixer) {
        try {
          console.log('[FacilitatorPanel] Connecting background audio to mixer...');
          mixer.connectBackgroundAudio(audio);
          mixer.setBackgroundVolume(targetVolume);
          console.log('[FacilitatorPanel] Background audio connected successfully');
        } catch (error) {
          console.error('[FacilitatorPanel] Unable to connect background audio to mixer:', error);
        }
      } else {
        console.warn('[FacilitatorPanel] No mixer available to connect audio');
      }

      sendControlMessage('audio:file-loaded', {
        fileName: file.name,
        duration: durationValue,
      });

      console.log('[FacilitatorPanel] ========== AUDIO FILE LOAD COMPLETE ==========');
    },
    [backgroundVolume, mixer, sendControlMessage, stopProgressUpdates],
  );

  const handlePlay = useCallback(() => {
    console.log('[FacilitatorPanel] ========== PLAY CLICKED ==========');
    console.log('[FacilitatorPanel] Current file:', currentFile?.name);
    console.log('[FacilitatorPanel] Mixer available:', !!mixer);
    console.log('[FacilitatorPanel] Audio player available:', !!audioPlayer);

    setPlaybackState('playing');
    setSessionError(null);
    startProgressUpdates();

    // Resume audio context to ensure audio plays (browser autoplay policy)
    if (mixer) {
      console.log('[FacilitatorPanel] Resuming audio context...');
      void mixer.resumeAudioContext();
      const mixedStream = mixer.getMixedStream();
      console.log('[FacilitatorPanel] Mixed stream active:', mixedStream.active);
      console.log('[FacilitatorPanel] Mixed stream tracks:', mixedStream.getTracks().length);

      mixedStream.getTracks().forEach((track, index) => {
        console.log(`[FacilitatorPanel] Track ${index}: kind=${track.kind}, enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
      });

      console.log('[FacilitatorPanel] Broadcasting audio track to peers...');
      void broadcastAudioTrack(mixedStream);
    } else {
      console.warn('[FacilitatorPanel] No mixer available to broadcast');
    }

    sendControlMessage('audio:play', {
      fileName: currentFile?.name,
    });
    console.log('[FacilitatorPanel] ========== PLAY COMPLETE ==========');
  }, [broadcastAudioTrack, currentFile, mixer, sendControlMessage, startProgressUpdates, audioPlayer]);

  const handlePause = useCallback(() => {
    const currentTime = audioPlayer?.currentTime ?? playbackPosition;
    setPlaybackState('paused');
    setPlaybackPosition(currentTime);
    stopProgressUpdates();

    sendControlMessage('audio:pause', {
      currentTime,
    });
  }, [audioPlayer, playbackPosition, sendControlMessage, stopProgressUpdates]);

  const handleStop = useCallback(() => {
    setPlaybackState('stopped');
    setPlaybackPosition(0);
    stopProgressUpdates();

    if (audioPlayer) {
      audioPlayer.currentTime = 0;
    }

    // If microphone is also not active, detach all audio senders
    // Otherwise, keep broadcasting microphone-only stream
    if (mixer && isMicrophoneActive) {
      const mixedStream = mixer.getMixedStream();
      void broadcastAudioTrack(mixedStream);
    } else {
      void detachAudioSenders();
    }

    sendControlMessage('audio:stop', {});
  }, [audioPlayer, broadcastAudioTrack, detachAudioSenders, isMicrophoneActive, mixer, sendControlMessage, stopProgressUpdates]);

  const handleSeek = useCallback(
    (seconds: number) => {
      setPlaybackPosition(seconds);
      lastProgressSecondRef.current = Math.floor(seconds);

      const durationValue = audioPlayer
        ? Number.isFinite(audioPlayer.duration)
          ? audioPlayer.duration
          : audioDuration
        : audioDuration;

      sendControlMessage('audio:progress', {
        currentTime: seconds,
        duration: durationValue,
      });
    },
    [audioDuration, audioPlayer, sendControlMessage],
  );

  const handleBackgroundVolumeChange = useCallback(
    (value: number) => {
      const clamped = Math.min(Math.max(value, 0), 1);
      setBackgroundVolume(clamped);

      if (audioPlayer) {
        audioPlayer.volume = clamped;
      }

      if (mixer) {
        mixer.setBackgroundVolume(clamped);
      }

      sendControlMessage('audio:volume', {
        volume: clamped,
      });
    },
    [audioPlayer, mixer, sendControlMessage],
  );

  useEffect(() => {
    const newMixer = new FacilitatorAudioMixer();
    const newRecorder = new FacilitatorRecorder();

    setMixer(newMixer);
    setRecorder(newRecorder);
    recorderRef.current = newRecorder;

    return () => {
      stopLevelMonitoring();
      stopProgressUpdates();

      const currentStream = streamRef.current;
      if (currentStream) {
        stopMicrophoneStream(currentStream);
        streamRef.current = null;
      }

      void detachAudioSenders();

      newMixer.disconnect();

      const recorderInstance = recorderRef.current;
      if (recorderInstance?.isRecording()) {
        recorderInstance.stop().catch(() => {
          /* ignore cleanup errors */
        });
      }
      recorderRef.current = null;
    };
  }, [detachAudioSenders, stopLevelMonitoring, stopProgressUpdates]);

  useEffect(() => {
    const activeStream = microphoneStream;
    if (!activeStream) {
      return undefined;
    }

    const handleTrackEnded = () => {
      setIsMicrophoneActive(false);
      streamRef.current = null;
      setMicrophoneStream(null);
      stopLevelMonitoring();

      // If background audio is also not playing, detach all audio senders
      if (playbackState !== 'playing') {
        void detachAudioSenders();
      }
    };

    activeStream.getTracks().forEach((track) => {
      track.addEventListener('ended', handleTrackEnded);
    });

    return () => {
      activeStream.getTracks().forEach((track) => {
        track.removeEventListener('ended', handleTrackEnded);
      });
    };
  }, [detachAudioSenders, microphoneStream, playbackState, stopLevelMonitoring]);

  useEffect(() => {
    return () => {
      stopLevelMonitoring();
      stopProgressUpdates();
    };
  }, [stopLevelMonitoring, stopProgressUpdates]);

  useEffect(() => {
    const audio = audioPlayer;
    if (!audio) {
      return undefined;
    }

    const handleTimeUpdate = () => {
      setPlaybackPosition(audio.currentTime || 0);
    };

    const handleDurationChange = () => {
      setAudioDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleDurationChange);
    audio.addEventListener('durationchange', handleDurationChange);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleDurationChange);
      audio.removeEventListener('durationchange', handleDurationChange);
    };
  }, [audioPlayer]);

  useEffect(() => {
    if (audioPlayer) {
      audioPlayer.volume = Math.min(Math.max(backgroundVolume, 0), 1);
    }
  }, [audioPlayer, backgroundVolume]);

  useEffect(() => {
    if (mixer) {
      mixer.setBackgroundVolume(Math.min(Math.max(backgroundVolume, 0), 1));
    }
  }, [backgroundVolume, mixer]);

  // Handle latency ping messages and respond with pong
  useEffect(() => {
    if (!controlChannel) {
      return;
    }

    const handleLatencyPing = (message: import('../../types/control-messages').LatencyPingMessage) => {
      // Immediately respond with pong message containing the same pingId
      sendControlMessage('latency:pong', {
        pingId: message.pingId,
      });
    };

    controlChannel.on('latency:ping', handleLatencyPing);

    return () => {
      controlChannel.off('latency:ping', handleLatencyPing);
    };
  }, [controlChannel, sendControlMessage]);

  return (
    <section style={panelStyles} aria-label="Facilitator controls">
      <SessionHeader {...sessionOverview} />

      {/* Error Display */}
      {sessionError && (
        <ErrorDisplay
          error={sessionError}
          onDismiss={handleDismissError}
        />
      )}

      <div style={contentLayoutStyles}>
        <Card title="Facilitator Control Center">
          <div style={controlsWrapperStyles}>
            <div style={sectionStyles}>
              <h3 style={sectionHeadingStyles}>Background Audio Control</h3>
              <p style={sectionStatusStyles}>
                {currentFile ? `Current track: ${currentFile.name}` : 'No audio file selected.'} Playback is{' '}
                {toTitleCase(playbackState)}. Volume {Math.round(backgroundVolume * 100)}%. Position
                {' '}
                {Math.round(playbackPosition)}s.
              </p>
              <div style={controlsLayoutStyles}>
                <BackgroundPlayer
                  onFileLoad={handleAudioLoad}
                  onError={handleAudioLoadError}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onStop={handleStop}
                  onSeek={handleSeek}
                  onVolumeChange={handleBackgroundVolumeChange}
                />
              </div>
            </div>

            <div style={sectionStyles}>
              <h3 style={sectionHeadingStyles}>Voice Channel</h3>
              <p style={sectionStatusStyles}>
                Microphone is {isMicrophoneActive ? 'active' : 'inactive'}. Input level: {audioLevels.microphone}%.
              </p>
              <MicrophoneControl
                isActive={isMicrophoneActive}
                level={audioLevels.microphone}
                onToggle={handleMicrophoneToggle}
                onError={handleMicrophoneError}
              />
            </div>

            <div style={sectionStyles}>
              <h3 style={sectionHeadingStyles}>Recording</h3>
              <p style={sectionStatusStyles}>
                {isRecording
                  ? 'Recording in progress…'
                  : recordingBlob
                  ? `Last recording ready (${Math.round(recordingBlob.size / 1024)} KB).`
                  : 'Start a new recording to capture the session.'}
              </p>
              <RecordingControl
                onStart={handleRecordingStart}
                onStop={handleRecordingStop}
                onDownload={(blob) => {
                  setRecordingBlob(blob);
                  handleRecordingDownload(blob);
                }}
                onError={handleRecordingError}
              />
            </div>
          </div>
        </Card>

        <div style={sidebarLayoutStyles}>
          {roomId ? <SessionNotes roomId={roomId} /> : null}
          <ParticipantList />
        </div>
      </div>
    </section>
  );
};

FacilitatorPanel.displayName = 'FacilitatorPanel';

export default FacilitatorPanel;
