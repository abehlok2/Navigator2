import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import { BackgroundPlayer, MicrophoneControl, RecordingControl } from '../audio';
import { ParticipantList } from './ParticipantList';
import { SessionHeader } from './SessionHeader';
import { Card } from '../ui';
import { useSessionStore } from '../../state/session';
import { getAudioLevel, stopMicrophoneStream } from '../../features/audio';
import { SessionRecorder } from '../../features/audio/recorder';

export type FacilitatorPlaybackState = 'playing' | 'paused' | 'stopped';

const panelStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
};

const controlsWrapperStyles: CSSProperties = {
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

export const FacilitatorPanel = () => {
  const roomId = useSessionStore((state) => state.roomId);
  const participants = useSessionStore((state) => state.participants);
  const connectionStatus = useSessionStore((state) => state.connectionStatus);

  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [playbackState, setPlaybackState] = useState<FacilitatorPlaybackState>('stopped');
  const [microphoneStream, setMicrophoneStream] = useState<MediaStream | null>(null);
  const [isMicrophoneActive, setIsMicrophoneActive] = useState(false);
  const [audioLevels, setAudioLevels] = useState<{ microphone: number }>({ microphone: 0 });
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [backgroundVolume, setBackgroundVolume] = useState(1);

  const recorderRef = useRef<SessionRecorder | null>(null);
  const levelAnimationRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const sessionOverview = useMemo(
    () => ({
      roomId: roomId ?? '—',
      participantCount: participants.length,
      connectionStatus,
    }),
    [connectionStatus, participants.length, roomId],
  );

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
      } else {
        const currentStream = streamRef.current;
        if (currentStream) {
          stopMicrophoneStream(currentStream);
        }
        streamRef.current = null;
        setMicrophoneStream(null);
        stopLevelMonitoring();
      }
    },
    [startLevelMonitoring, stopLevelMonitoring],
  );

  const handleRecordingStart = useCallback(async () => {
    const stream = streamRef.current ?? microphoneStream;

    if (!stream) {
      throw new Error('Activate the microphone before starting a recording.');
    }

    if (!recorderRef.current) {
      recorderRef.current = new SessionRecorder();
    }

    const recorder = recorderRef.current;

    if (recorder.isRecording()) {
      throw new Error('Recording is already in progress.');
    }

    await recorder.start(stream);
    setRecordingBlob(null);
  }, [microphoneStream]);

  const handleRecordingStop = useCallback(async () => {
    const recorder = recorderRef.current;

    if (!recorder || !recorder.isRecording()) {
      throw new Error('No recording is currently in progress.');
    }

    const blob = await recorder.stop();
    setRecordingBlob(blob);
    return blob;
  }, []);

  const handleRecordingDownload = useCallback((blob: Blob) => {
    if (!recorderRef.current) {
      recorderRef.current = new SessionRecorder();
    }

    try {
      recorderRef.current.downloadRecording(blob);
    } catch (error) {
      console.error('Unable to download recording:', error);
    }
  }, []);

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
    };

    activeStream.getTracks().forEach((track) => {
      track.addEventListener('ended', handleTrackEnded);
    });

    return () => {
      activeStream.getTracks().forEach((track) => {
        track.removeEventListener('ended', handleTrackEnded);
      });
    };
  }, [microphoneStream, stopLevelMonitoring]);

  useEffect(() => {
    return () => {
      stopLevelMonitoring();

      const currentStream = streamRef.current;
      if (currentStream) {
        stopMicrophoneStream(currentStream);
      }
      streamRef.current = null;

      const recorder = recorderRef.current;
      if (recorder && recorder.isRecording()) {
        recorder.stop().catch(() => {
          /* ignore cleanup errors */
        });
      }
    };
  }, [stopLevelMonitoring]);

  return (
    <section style={panelStyles} aria-label="Facilitator controls">
      <SessionHeader {...sessionOverview} />

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
                onFileLoad={(file) => {
                  setCurrentFile(file);
                  setPlaybackState('stopped');
                  setPlaybackPosition(0);
                }}
                onPlay={() => {
                  setPlaybackState('playing');
                }}
                onPause={() => {
                  setPlaybackState('paused');
                }}
                onStop={() => {
                  setPlaybackState('stopped');
                  setPlaybackPosition(0);
                }}
                onSeek={(seconds) => {
                  setPlaybackPosition(seconds);
                }}
                onVolumeChange={(level) => {
                  setBackgroundVolume(level);
                }}
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
            />
          </div>

          <div style={sectionStyles}>
            <h3 style={sectionHeadingStyles}>Recording</h3>
            <p style={sectionStatusStyles}>
              {recordingBlob
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
            />
          </div>
        </div>
      </Card>

      <ParticipantList />
    </section>
  );
};

FacilitatorPanel.displayName = 'FacilitatorPanel';

export default FacilitatorPanel;
