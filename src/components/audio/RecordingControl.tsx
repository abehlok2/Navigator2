import { useCallback, useEffect, useMemo, useState } from 'react';

type RecordingControlProps = {
  onStart: () => Promise<void> | void;
  onStop: () => Promise<Blob> | Blob;
  onDownload: (blob: Blob) => void;
};

const formatDuration = (durationInSeconds: number): string => {
  const safeDuration = Number.isFinite(durationInSeconds) ? durationInSeconds : 0;
  const totalSeconds = Math.max(0, Math.floor(safeDuration));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const RecordingControl = ({ onStart, onStop, onDownload }: RecordingControlProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStart, setRecordingStart] = useState<number | null>(null);
  const [duration, setDuration] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!isRecording || recordingStart === null) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setDuration((Date.now() - recordingStart) / 1000);
    }, 250);

    return () => {
      window.clearInterval(interval);
    };
  }, [isRecording, recordingStart]);

  const statusLabel = useMemo(() => {
    if (error) {
      return 'Error';
    }
    return isRecording ? 'Recording' : recordedBlob ? 'Recorded' : 'Idle';
  }, [error, isRecording, recordedBlob]);

  const handleStart = useCallback(async () => {
    if (isRecording || isProcessing) {
      return;
    }

    setError(null);
    setIsProcessing(true);

    try {
      await onStart();
      setRecordedBlob(null);
      setRecordingStart(Date.now());
      setDuration(0);
      setIsRecording(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to start recording.';
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [isRecording, isProcessing, onStart]);

  const handleStop = useCallback(async () => {
    if (!isRecording || isProcessing) {
      return;
    }

    setIsProcessing(true);

    try {
      const result = await onStop();
      setRecordedBlob(result);
      if (recordingStart) {
        setDuration((Date.now() - recordingStart) / 1000);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to stop recording.';
      setError(message);
    } finally {
      setIsRecording(false);
      setRecordingStart(null);
      setIsProcessing(false);
    }
  }, [isRecording, isProcessing, onStop, recordingStart]);

  const handleDownload = useCallback(() => {
    if (!recordedBlob || isProcessing) {
      return;
    }

    try {
      onDownload(recordedBlob);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to download recording.';
      setError(message);
    }
  }, [isProcessing, onDownload, recordedBlob]);

  return (
    <div className="recording-control" aria-live="polite">
      <div className="recording-control__header">
        <span
          className={`recording-control__indicator${isRecording ? ' recording-control__indicator--active' : ''}`}
          aria-hidden="true"
        />
        <span className="recording-control__status">{statusLabel}</span>
        <span className="recording-control__timer" aria-label="Recording duration">
          {formatDuration(duration)}
        </span>
      </div>

      <div className="recording-control__actions">
        {isRecording ? (
          <button
            type="button"
            className="recording-control__button recording-control__button--stop"
            onClick={handleStop}
            disabled={isProcessing}
          >
            Stop Recording
          </button>
        ) : (
          <button
            type="button"
            className="recording-control__button recording-control__button--start"
            onClick={handleStart}
            disabled={isProcessing}
          >
            Start Recording
          </button>
        )}

        {recordedBlob && !isRecording ? (
          <button
            type="button"
            className="recording-control__button recording-control__button--download"
            onClick={handleDownload}
            disabled={isProcessing}
          >
            Download Recording
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="recording-control__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
};

export default RecordingControl;
