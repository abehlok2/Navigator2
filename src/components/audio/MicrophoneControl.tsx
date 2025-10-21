import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getAudioLevel,
  getMicrophoneDevices,
  getMicrophoneStream,
  stopMicrophoneStream,
} from '../../features/audio/microphone';

interface MicrophoneControlProps {
  onToggle: (active: boolean, stream?: MediaStream) => void;
  isActive: boolean;
  level?: number;
}

export function MicrophoneControl({ onToggle, isActive, level }: MicrophoneControlProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>();
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [internalLevel, setInternalLevel] = useState(0);
  const animationFrameRef = useRef<number>();
  const currentDeviceIdRef = useRef<string | undefined>();

  const displayLevel = useMemo(() => {
    const value = level ?? internalLevel;
    return Math.max(0, Math.min(100, Math.round(value)));
  }, [internalLevel, level]);

  const stopLevelUpdates = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }
    setInternalLevel(0);
  }, []);

  const startLevelUpdates = useCallback(
    (activeStream: MediaStream) => {
      const update = () => {
        const measuredLevel = getAudioLevel(activeStream);
        setInternalLevel((prev) => Math.round(prev * 0.6 + measuredLevel * 0.4));
        animationFrameRef.current = requestAnimationFrame(update);
      };

      update();
    },
    []
  );

  const cleanupStream = useCallback(
    (notify = true) => {
      if (stream) {
        stopLevelUpdates();
        stopMicrophoneStream(stream);
        setStream(null);
        currentDeviceIdRef.current = undefined;
        if (notify) {
          onToggle(false);
        }
      }
    },
    [onToggle, stopLevelUpdates, stream]
  );

  const startStream = useCallback(
    async (deviceId?: string) => {
      try {
        if (stream) {
          cleanupStream(false);
        }

        const newStream = await getMicrophoneStream(deviceId);
        setStream(newStream);
        currentDeviceIdRef.current = deviceId;
        startLevelUpdates(newStream);
        onToggle(true, newStream);
      } catch (error) {
        console.error('Unable to access microphone:', error);
        cleanupStream();
      }
    },
    [cleanupStream, onToggle, startLevelUpdates, stream]
  );

  const refreshDevices = useCallback(async () => {
    try {
      const availableDevices = await getMicrophoneDevices();
      setDevices(availableDevices);
      setSelectedDeviceId((current) => {
        if (current && availableDevices.some((device) => device.deviceId === current)) {
          return current;
        }
        return availableDevices[0]?.deviceId;
      });
    } catch (error) {
      console.error('Unable to enumerate microphone devices:', error);
    }
  }, []);

  const handleToggle = useCallback(() => {
    if (isActive) {
      cleanupStream();
    } else {
      startStream(selectedDeviceId);
    }
  }, [cleanupStream, isActive, selectedDeviceId, startStream]);

  const handleDeviceChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const deviceId = event.target.value;
    setSelectedDeviceId(deviceId);
  }, []);

  useEffect(() => {
    refreshDevices();

    const mediaDevices = navigator.mediaDevices;
    const deviceChangeListener = () => {
      refreshDevices();
    };

    mediaDevices?.addEventListener('devicechange', deviceChangeListener);

    return () => {
      mediaDevices?.removeEventListener('devicechange', deviceChangeListener);
    };
  }, [refreshDevices]);

  useEffect(() => {
    if (isActive) {
      if (!stream) {
        startStream(selectedDeviceId ?? currentDeviceIdRef.current);
      } else if (currentDeviceIdRef.current !== selectedDeviceId) {
        startStream(selectedDeviceId);
      }
    } else if (stream) {
      cleanupStream(false);
    }
  }, [cleanupStream, isActive, selectedDeviceId, startStream, stream]);

  useEffect(() => cleanupStream, [cleanupStream]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
        borderRadius: '12px',
        border: '1px solid var(--border, #3a3a3a)',
        background: 'var(--bg-secondary, #2a2a2a)',
        color: 'var(--text-primary, #ffffff)',
        maxWidth: '320px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={handleToggle}
          type="button"
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            background: isActive ? 'var(--danger, #ff4a4a)' : 'var(--accent, #4a9eff)',
            color: '#ffffff',
            fontWeight: 600,
          }}
        >
          {isActive ? 'Turn Off' : 'Turn On'}
        </button>
        <span
          aria-live="polite"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.875rem',
          }}
        >
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: isActive ? 'var(--success, #4aff4a)' : 'var(--border, #555)',
              boxShadow: isActive ? '0 0 6px rgba(74, 255, 74, 0.7)' : 'none',
            }}
          />
          {isActive ? 'On' : 'Off'}
        </span>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.9rem' }}>
        <span style={{ color: 'var(--text-secondary, #a0a0a0)' }}>Microphone</span>
        <select
          value={selectedDeviceId ?? ''}
          onChange={handleDeviceChange}
          disabled={!devices.length}
          style={{
            padding: '8px',
            borderRadius: '6px',
            border: '1px solid var(--border, #3a3a3a)',
            background: 'var(--bg-primary, #1a1a1a)',
            color: 'var(--text-primary, #ffffff)',
          }}
        >
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Microphone ${device.deviceId}`}
            </option>
          ))}
          {!devices.length && <option value="">No microphones available</option>}
        </select>
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ color: 'var(--text-secondary, #a0a0a0)', fontSize: '0.9rem' }}>Input Level</span>
        <div
          style={{
            position: 'relative',
            height: '12px',
            borderRadius: '6px',
            background: 'var(--bg-primary, #1a1a1a)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: `${displayLevel}%`,
              background: 'linear-gradient(90deg, #4aff4a 0%, #ffd54a 50%, #ff4a4a 100%)',
              transition: 'width 0.1s ease-out',
            }}
          />
        </div>
      </div>
    </div>
  );
}
