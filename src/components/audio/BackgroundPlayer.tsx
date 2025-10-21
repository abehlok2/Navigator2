import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { AudioPlayer } from '../../features/audio/player';

export type BackgroundPlayerProps = {
  onFileLoad?: (file: File) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onSeek?: (seconds: number) => void;
  onVolumeChange?: (level: number) => void;
  onError?: (error: unknown, context: 'load' | 'play') => void;
};

const formatTime = (value: number): string => {
  if (!Number.isFinite(value) || value < 0) {
    return '00:00';
  }

  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

export const BackgroundPlayer = ({
  onFileLoad,
  onPlay,
  onPause,
  onStop,
  onSeek,
  onVolumeChange,
  onError,
}: BackgroundPlayerProps) => {
  const playerRef = useRef<AudioPlayer | null>(null);
  const onStopRef = useRef(onStop);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    onStopRef.current = onStop;
  }, [onStop]);

  useEffect(() => {
    const player = new AudioPlayer();
    playerRef.current = player;

    const handleTimeUpdate = () => {
      setCurrentTime(player.getCurrentTime());
      setDuration(player.getDuration());
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      onStopRef.current?.();
    };

    player.on('timeupdate', handleTimeUpdate);
    player.on('ended', handleEnded);

    return () => {
      player.off('timeupdate', handleTimeUpdate);
      player.off('ended', handleEnded);
      player.destroy();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) {
      return;
    }
    player.setVolume(volume);
  }, [volume]);

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await loadFile(file);

    setUploadedFiles((files) => {
      const existingIndex = files.findIndex(
        (existing) =>
          existing.name === file.name &&
          existing.size === file.size &&
          existing.lastModified === file.lastModified,
      );

      if (existingIndex >= 0) {
        setSelectedIndex(existingIndex);
        return files;
      }

      const nextFiles = [...files, file];
      setSelectedIndex(nextFiles.length - 1);
      return nextFiles;
    });

    event.target.value = '';
  };

  const loadFile = async (file: File) => {
    const player = playerRef.current;
    if (!player) {
      return;
    }

    try {
      await player.loadFile(file);
      setCurrentFile(file);
      setDuration(player.getDuration());
      setCurrentTime(0);
      setIsPlaying(false);
      player.setVolume(volume);
      onFileLoad?.(file);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      if (onError) {
        onError(error, 'load');
      }
    }
  };

  const handleFileSelect = async (event: ChangeEvent<HTMLSelectElement>) => {
    const index = Number(event.target.value);
    if (Number.isNaN(index) || index < 0 || index >= uploadedFiles.length) {
      setSelectedIndex(null);
      return;
    }

    const file = uploadedFiles[index];
    setSelectedIndex(index);
    await loadFile(file);
  };

  const handlePlay = async () => {
    const player = playerRef.current;
    if (!player) {
      return;
    }

    try {
      await player.play();
      setIsPlaying(true);
      onPlay?.();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      if (onError) {
        onError(error, 'play');
      }
    }
  };

  const handlePause = () => {
    const player = playerRef.current;
    if (!player) {
      return;
    }

    player.pause();
    setIsPlaying(false);
    onPause?.();
  };

  const handleStop = () => {
    const player = playerRef.current;
    if (!player) {
      return;
    }

    player.stop();
    setIsPlaying(false);
    setCurrentTime(0);
    onStop?.();
  };

  const handleSeek = (event: ChangeEvent<HTMLInputElement>) => {
    const player = playerRef.current;
    if (!player) {
      return;
    }

    const value = Number(event.target.value);
    if (Number.isNaN(value)) {
      return;
    }

    player.seek(value);
    setCurrentTime(value);
    onSeek?.(value);
  };

  const handleVolumeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const player = playerRef.current;
    if (!player) {
      return;
    }

    const value = Number(event.target.value);
    if (Number.isNaN(value)) {
      return;
    }

    setVolume(value);
    player.setVolume(value);
    onVolumeChange?.(value);
  };

  return (
    <div className="background-player">
      <div className="background-player__file-controls">
        <label className="background-player__upload">
          Upload Audio
          <input type="file" accept="audio/*" onChange={handleFileUpload} />
        </label>

        <select
          className="background-player__file-select"
          value={selectedIndex ?? ''}
          onChange={handleFileSelect}
          disabled={uploadedFiles.length === 0}
        >
          <option value="" disabled>
            Select a file
          </option>
          {uploadedFiles.map((file, index) => (
            <option key={file.name + index} value={index}>
              {file.name}
            </option>
          ))}
        </select>
      </div>

      <div className="background-player__current-file">
        {currentFile ? `Loaded: ${currentFile.name}` : 'No file loaded'}
      </div>

      <div className="background-player__controls">
        <button type="button" onClick={handlePlay} disabled={!currentFile || isPlaying}>
          Play
        </button>
        <button type="button" onClick={handlePause} disabled={!currentFile || !isPlaying}>
          Pause
        </button>
        <button type="button" onClick={handleStop} disabled={!currentFile}>
          Stop
        </button>
      </div>

      <div className="background-player__progress">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={duration > 0 ? Math.min(currentTime, duration) : 0}
          onChange={handleSeek}
          disabled={!currentFile || duration <= 0}
        />
        <div className="background-player__time-display">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>

      <div className="background-player__volume">
        <label htmlFor="background-player-volume">Volume</label>
        <input
          id="background-player-volume"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={handleVolumeChange}
        />
      </div>
    </div>
  );
};
