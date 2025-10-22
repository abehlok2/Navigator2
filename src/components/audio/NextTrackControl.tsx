import { ChangeEvent, useEffect, useRef, useState } from 'react';

export type NextTrackControlProps = {
  uploadedFiles: File[];
  currentFile: File | null;
  onNextTrackLoad?: (file: File, audioElement: HTMLAudioElement) => void;
  onCrossfade?: (crossfadeDuration: number) => void;
  isPlaying: boolean;
  isCrossfading: boolean;
};

export const NextTrackControl = ({
  uploadedFiles,
  currentFile,
  onNextTrackLoad,
  onCrossfade,
  isPlaying,
  isCrossfading,
}: NextTrackControlProps) => {
  const nextAudioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const onNextTrackLoadRef = useRef(onNextTrackLoad);
  const [nextFile, setNextFile] = useState<File | null>(null);
  const [selectedNextIndex, setSelectedNextIndex] = useState<number | null>(null);
  const [crossfadeDuration, setCrossfadeDuration] = useState(3); // Default 3 seconds

  useEffect(() => {
    onNextTrackLoadRef.current = onNextTrackLoad;
  }, [onNextTrackLoad]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    nextAudioRef.current = audio;

    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      audio.pause();
      audio.src = '';
    };
  }, []);

  const loadNextFile = async (file: File) => {
    const audio = nextAudioRef.current;
    if (!audio) {
      return;
    }

    try {
      // Revoke old object URL if it exists
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }

      // Create new object URL
      const objectUrl = URL.createObjectURL(file);
      objectUrlRef.current = objectUrl;

      // Load the new file
      audio.src = objectUrl;

      await new Promise<void>((resolve, reject) => {
        const handleLoadedMetadata = () => {
          audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
          audio.removeEventListener('error', handleError);
          resolve();
        };

        const handleError = () => {
          audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
          audio.removeEventListener('error', handleError);
          reject(new Error('Failed to load audio metadata'));
        };

        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        audio.addEventListener('error', handleError);

        audio.load();
      });

      setNextFile(file);
      onNextTrackLoadRef.current?.(file, audio);
    } catch (error) {
      console.error('Failed to load next track:', error);
    }
  };

  const handleNextFileSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    const index = parseInt(event.target.value, 10);
    if (Number.isNaN(index) || index < 0 || index >= uploadedFiles.length) {
      return;
    }

    setSelectedNextIndex(index);
    const file = uploadedFiles[index];
    void loadNextFile(file);
  };

  const handleCrossfadeDurationChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(event.target.value);
    if (!Number.isNaN(value) && value >= 0.5 && value <= 15) {
      setCrossfadeDuration(value);
    }
  };

  const handleCrossfade = () => {
    if (nextFile && onCrossfade) {
      onCrossfade(crossfadeDuration);
    }
  };

  // Filter out the current file from the next track options
  const availableFiles = uploadedFiles.filter(file => file !== currentFile);

  return (
    <div className="next-track-control">
      <h3 className="next-track-control__title">Next Track Queue</h3>

      <div className="next-track-control__file-select">
        <label htmlFor="next-track-select">Select Next Track:</label>
        <select
          id="next-track-select"
          className="next-track-control__select"
          value={selectedNextIndex ?? ''}
          onChange={handleNextFileSelect}
          disabled={availableFiles.length === 0 || isCrossfading}
        >
          <option value="" disabled>
            {availableFiles.length === 0 ? 'No other tracks available' : 'Select a track...'}
          </option>
          {availableFiles.map((file, originalIndex) => {
            // Find the original index in uploadedFiles
            const index = uploadedFiles.indexOf(file);
            return (
              <option key={file.name + index} value={index}>
                {file.name}
              </option>
            );
          })}
        </select>
      </div>

      <div className="next-track-control__queued-file">
        {nextFile ? `Queued: ${nextFile.name}` : 'No next track queued'}
      </div>

      <div className="next-track-control__crossfade-settings">
        <label htmlFor="crossfade-duration">
          Crossfade Duration: {crossfadeDuration.toFixed(1)}s
        </label>
        <input
          id="crossfade-duration"
          type="range"
          min={0.5}
          max={15}
          step={0.5}
          value={crossfadeDuration}
          onChange={handleCrossfadeDurationChange}
          disabled={isCrossfading}
        />
        <div className="next-track-control__duration-labels">
          <span>0.5s</span>
          <span>15s</span>
        </div>
      </div>

      <div className="next-track-control__actions">
        <button
          type="button"
          className="next-track-control__crossfade-button"
          onClick={handleCrossfade}
          disabled={!nextFile || !isPlaying || isCrossfading}
          title={
            !nextFile
              ? 'Select a next track first'
              : !isPlaying
              ? 'Current track must be playing'
              : isCrossfading
              ? 'Crossfade in progress'
              : 'Start crossfade to next track'
          }
        >
          {isCrossfading ? 'Crossfading...' : 'Crossfade to Next Track'}
        </button>
      </div>

      {isCrossfading && (
        <div className="next-track-control__status">
          <div className="next-track-control__status-indicator">
            Crossfading in progress...
          </div>
        </div>
      )}
    </div>
  );
};
