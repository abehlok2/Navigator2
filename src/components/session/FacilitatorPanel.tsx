import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import { BackgroundPlayer, MicrophoneControl, RecordingControl } from '../audio';
import { NextTrackControl } from '../audio/NextTrackControl';
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
  const [nextTrackFile, setNextTrackFile] = useState<File | null>(null);
  const [isCrossfading, setIsCrossfading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  const recorderRef = useRef<FacilitatorRecorder | null>(null);
  const levelAnimationRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const facilitatorSendersRef = useRef<Map<string, RTCRtpSender>>(new Map());
  const backgroundSendersRef = useRef<Map<string, RTCRtpSender>>(new Map());
  const lastProgressSecondRef = useRef<number | null>(null);

  // Broadcast facilitator microphone track to all peer connections
  const broadcastFacilitatorTrack = useCallback(
    async (facilitatorStream: MediaStream) => {
      if (!peerManager) {
        console.warn('[FacilitatorPanel] No peer manager available to broadcast facilitator audio');
        return;
      }

      const participantIds = peerManager.getParticipantIds();
      const senders = facilitatorSendersRef.current;

      console.log('[FacilitatorPanel] Broadcasting facilitator track to peers...');

      // Clean up senders for participants that are no longer connected
      for (const [participantId, sender] of senders.entries()) {
        if (!participantIds.includes(participantId)) {
          const pc = peerManager.getConnection(participantId);
          if (!pc || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
            console.log(`[FacilitatorPanel] Removing stale facilitator sender for ${participantId}`);
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
            await replaceAudioTrack(existingSender, facilitatorStream);
            console.log(`[FacilitatorPanel] Replaced facilitator track for ${participantId}`);
          } else {
            // Add new track and store sender
            const sender = await addAudioTrack(pc, facilitatorStream, 'speech');
            senders.set(participantId, sender);
            console.log(`[FacilitatorPanel] Added facilitator track for ${participantId}`);
          }
        } catch (error) {
          console.error(`[FacilitatorPanel] Failed to broadcast facilitator audio to ${participantId}:`, error);
          // Remove sender on error as it may be invalid
          senders.delete(participantId);
        }
      }
    },
    [peerManager],
  );

  // Broadcast background audio track to all peer connections
  const broadcastBackgroundTrack = useCallback(
    async (backgroundStream: MediaStream) => {
      if (!peerManager) {
        console.warn('[FacilitatorPanel] No peer manager available to broadcast background audio');
        return;
      }

      const participantIds = peerManager.getParticipantIds();
      const senders = backgroundSendersRef.current;

      console.log('[FacilitatorPanel] Broadcasting background track to peers...');

      // Clean up senders for participants that are no longer connected
      for (const [participantId, sender] of senders.entries()) {
        if (!participantIds.includes(participantId)) {
          const pc = peerManager.getConnection(participantId);
          if (!pc || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
            console.log(`[FacilitatorPanel] Removing stale background sender for ${participantId}`);
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
            await replaceAudioTrack(existingSender, backgroundStream);
            console.log(`[FacilitatorPanel] Replaced background track for ${participantId}`);
          } else {
            // Add new track and store sender
            const sender = await addAudioTrack(pc, backgroundStream, 'music');
            senders.set(participantId, sender);
            console.log(`[FacilitatorPanel] Added background track for ${participantId}`);
          }
        } catch (error) {
          console.error(`[FacilitatorPanel] Failed to broadcast background audio to ${participantId}:`, error);
          // Remove sender on error as it may be invalid
          senders.delete(participantId);
        }
      }
    },
    [peerManager],
  );

  // Remove background audio tracks from all peer connections
  const detachBackgroundSenders = useCallback(async () => {
    const senders = backgroundSendersRef.current;

    console.log('[FacilitatorPanel] Detaching background senders...');

    for (const [participantId, sender] of senders.entries()) {
      try {
        // Check if the peer connection is still open before trying to remove track
        const pc = peerManager?.getConnection(participantId);
        if (pc && pc.connectionState !== 'closed' && pc.connectionState !== 'failed') {
          pc.removeTrack(sender);
          console.log(`[FacilitatorPanel] Removed background track for ${participantId}`);
        } else {
          console.log(`[FacilitatorPanel] Skipping closed/failed connection for ${participantId}`);
        }
      } catch (error) {
        console.error(`[FacilitatorPanel] Failed to remove background track for ${participantId}:`, error);
      }
    }

    senders.clear();
  }, [peerManager]);

  // Remove all audio tracks from all peer connections
  const detachAudioSenders = useCallback(async () => {
    console.log('[FacilitatorPanel] Detaching all audio senders...');
    await detachBackgroundSenders();

    const senders = facilitatorSendersRef.current;

    for (const [participantId, sender] of senders.entries()) {
      try {
        // Check if the peer connection is still open before trying to replace track
        const pc = peerManager?.getConnection(participantId);
        if (pc && pc.connectionState !== 'closed' && pc.connectionState !== 'failed') {
          await sender.replaceTrack(null);
          console.log(`[FacilitatorPanel] Cleared facilitator track for ${participantId}`);
        } else {
          console.log(`[FacilitatorPanel] Skipping closed/failed connection for ${participantId}`);
        }
      } catch (error) {
        console.error(`[FacilitatorPanel] Failed to clear facilitator track for ${participantId}:`, error);
      }
    }

    senders.clear();
  }, [detachBackgroundSenders, peerManager]);

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
            // Broadcast the facilitator microphone stream to all peer connections
            const facilitatorStream = mixer.getFacilitatorStream();
            void broadcastFacilitatorTrack(facilitatorStream);
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

        // Remove facilitator track (but keep background track if playing)
        const removeFacilitatorTracks = async () => {
          const senders = facilitatorSendersRef.current;
          for (const [participantId, sender] of senders.entries()) {
            try {
              const pc = peerManager?.getConnection(participantId);
              if (pc && pc.connectionState !== 'closed' && pc.connectionState !== 'failed') {
                await sender.replaceTrack(null);
                console.log(`[FacilitatorPanel] Cleared facilitator track for ${participantId}`);
              }
            } catch (error) {
              console.error(`[FacilitatorPanel] Failed to clear facilitator track:`, error);
            }
          }
          senders.clear();
        };
        void removeFacilitatorTracks();
      }
    },
    [broadcastFacilitatorTrack, peerManager, mixer, startLevelMonitoring, stopLevelMonitoring],
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

  const handlePlay = useCallback(async () => {
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
      await mixer.resumeAudioContext();

      // Ensure audio element is playing before broadcasting
      if (audioPlayer) {
        if (audioPlayer.paused) {
          console.log('[FacilitatorPanel] Audio element is paused, starting playback...');
          try {
            await audioPlayer.play();
            console.log('[FacilitatorPanel] Audio element is now playing');
          } catch (error) {
            console.error('[FacilitatorPanel] Failed to start audio playback:', error);
          }
        }

        // Wait 100ms to let audio data start flowing
        console.log('[FacilitatorPanel] Waiting 100ms for audio data to start flowing...');
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Broadcast facilitator track if microphone is active
      if (isMicrophoneActive) {
        const facilitatorStream = mixer.getFacilitatorStream();
        console.log('[FacilitatorPanel] Facilitator stream active:', facilitatorStream.active);
        await broadcastFacilitatorTrack(facilitatorStream);
      }

      // Broadcast background audio track
      const backgroundStream = mixer.getBackgroundStream();
      if (backgroundStream) {
        console.log('[FacilitatorPanel] Background stream active:', backgroundStream.active);
        console.log('[FacilitatorPanel] Background stream tracks:', backgroundStream.getTracks().length);

        backgroundStream.getTracks().forEach((track, index) => {
          console.log(`[FacilitatorPanel] Background track ${index}: kind=${track.kind}, enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}, contentHint=${track.contentHint}`);
        });

        console.log('[FacilitatorPanel] Broadcasting background track to peers...');
        await broadcastBackgroundTrack(backgroundStream);
      } else {
        console.warn('[FacilitatorPanel] No background stream available');
      }
    } else {
      console.warn('[FacilitatorPanel] No mixer available to broadcast');
    }

    sendControlMessage('audio:play', {
      fileName: currentFile?.name,
    });
    console.log('[FacilitatorPanel] ========== PLAY COMPLETE ==========');
  }, [broadcastFacilitatorTrack, broadcastBackgroundTrack, currentFile, isMicrophoneActive, mixer, sendControlMessage, startProgressUpdates, audioPlayer]);

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

    // Remove background audio track from all peer connections
    void detachBackgroundSenders();

    sendControlMessage('audio:stop', {});
  }, [audioPlayer, detachBackgroundSenders, sendControlMessage, stopProgressUpdates]);

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

  const handleNextTrackLoad = useCallback(
    (file: File, nextAudioElement: HTMLAudioElement) => {
      console.log('[FacilitatorPanel] Loading next track:', file.name);
      setNextTrackFile(file);

      if (mixer) {
        mixer.connectNextBackgroundAudio(nextAudioElement);
        console.log('[FacilitatorPanel] Next track connected to mixer');
      }
    },
    [mixer],
  );

  const handleCrossfade = useCallback(
    async (crossfadeDuration: number) => {
      if (!mixer || !nextTrackFile || !audioPlayer) {
        console.warn('[FacilitatorPanel] Cannot crossfade: missing mixer, next track, or audio player');
        return;
      }

      if (isCrossfading) {
        console.warn('[FacilitatorPanel] Crossfade already in progress');
        return;
      }

      try {
        setIsCrossfading(true);
        console.log('[FacilitatorPanel] Starting crossfade with duration:', crossfadeDuration);

        // Send crossfade start message to all participants
        sendControlMessage('audio:crossfade-start', {
          fromFileName: currentFile?.name || '',
          toFileName: nextTrackFile.name,
          duration: crossfadeDuration,
        });

        // Perform the crossfade
        await mixer.performCrossfade(backgroundVolume, crossfadeDuration);

        // Update state: next track becomes current
        const nextAudio = mixer.getNextBackgroundAudioElement();
        if (nextAudio) {
          setAudioPlayer(nextAudio);
          setCurrentFile(nextTrackFile);
          setAudioDuration(nextAudio.duration);
          setPlaybackPosition(0);

          // Send the next track message
          sendControlMessage('audio:next-track', {
            nextFileName: nextTrackFile.name,
            nextDuration: nextAudio.duration,
            crossfadeDuration,
          });

          // Send file loaded message for the new current track
          sendControlMessage('audio:file-loaded', {
            fileName: nextTrackFile.name,
            duration: nextAudio.duration,
          });
        }

        setNextTrackFile(null);
        console.log('[FacilitatorPanel] Crossfade complete');
      } catch (error) {
        console.error('[FacilitatorPanel] Crossfade failed:', error);
        setSessionError(
          createSessionError(error, 'crossfade'),
        );
      } finally {
        setIsCrossfading(false);
      }
    },
    [mixer, nextTrackFile, audioPlayer, isCrossfading, currentFile, backgroundVolume, sendControlMessage],
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

  // When a new control channel opens (e.g., explorer/listener joins mid-session),
  // synchronize the current audio state so they match the facilitator's playback.
  useEffect(() => {
    if (!controlChannel) {
      return;
    }

    const handleChannelOpen = () => {
      const clampedVolume = Math.min(Math.max(backgroundVolume, 0), 1);
      const durationValue = Number.isFinite(audioDuration) ? audioDuration : 0;
      const currentTime = Number.isFinite(playbackPosition) ? playbackPosition : 0;

      if (currentFile) {
        sendControlMessage('audio:file-loaded', {
          fileName: currentFile.name,
          duration: durationValue,
        });

        sendControlMessage('audio:progress', {
          currentTime,
          duration: durationValue,
        });
      }

      sendControlMessage('audio:volume', {
        volume: clampedVolume,
      });

      if (playbackState === 'playing') {
        sendControlMessage('audio:play', {
          fileName: currentFile?.name,
        });
      } else if (playbackState === 'paused') {
        sendControlMessage('audio:pause', {
          currentTime,
        });
      } else {
        sendControlMessage('audio:stop', {});
      }
    };

    controlChannel.on('channel:open', handleChannelOpen);

    return () => {
      controlChannel.off('channel:open', handleChannelOpen);
    };
  }, [
    audioDuration,
    backgroundVolume,
    controlChannel,
    currentFile,
    playbackPosition,
    playbackState,
    sendControlMessage,
  ]);

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
                  onUploadedFilesChange={setUploadedFiles}
                />
                <NextTrackControl
                  uploadedFiles={uploadedFiles}
                  currentFile={currentFile}
                  onNextTrackLoad={handleNextTrackLoad}
                  onCrossfade={handleCrossfade}
                  isPlaying={playbackState === 'playing'}
                  isCrossfading={isCrossfading}
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
