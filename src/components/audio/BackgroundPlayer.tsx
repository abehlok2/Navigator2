import { ChangeEvent, useEffect, useRef, useState } from 'react';

export type BackgroundPlayerProps = {
  onFileLoad?: (file: File, audioElement: HTMLAudioElement) => void;
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const onStopRef = useRef(onStop);
  const onFileLoadRef = useRef(onFileLoad);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const onSeekRef = useRef(onSeek);
  const onVolumeChangeRef = useRef(onVolumeChange);
  const onErrorRef = useRef(onError);
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
    onFileLoadRef.current = onFileLoad;
  }, [onFileLoad]);

  useEffect(() => {
    onPlayRef.current = onPlay;
  }, [onPlay]);

  useEffect(() => {
    onPauseRef.current = onPause;
  }, [onPause]);

  useEffect(() => {
    onSeekRef.current = onSeek;
  }, [onSeek]);

  useEffect(() => {
    onVolumeChangeRef.current = onVolumeChange;
  }, [onVolumeChange]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
      const audioDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
      setDuration(audioDuration);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      onStopRef.current?.();
    };

    const handlePlayEvent = () => {
      setIsPlaying(true);
    };

    const handlePauseEvent = () => {
      setIsPlaying(false);
    };

    const handleLoadedMetadata = () => {
      const audioDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
      setDuration(audioDuration);
      setCurrentTime(audio.currentTime || 0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlayEvent);
    audio.addEventListener('pause', handlePauseEvent);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', handleLoadedMetadata);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlayEvent);
      audio.removeEventListener('pause', handlePauseEvent);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleLoadedMetadata);

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }

      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, []);

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
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;

    try {
      await new Promise<void>((resolve, reject) => {
        const handleLoadedMetadata = () => {
          cleanup();
          resolve();
        };

        const handleError = (event: Event) => {
          cleanup();
          reject(event);
        };

        const cleanup = () => {
          audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
          audio.removeEventListener('error', handleError);
        };

        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        audio.addEventListener('error', handleError);
        audio.src = url;
      });

      audio.currentTime = 0;
      audio.volume = volume;
      setCurrentFile(file);
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      setCurrentTime(0);
      setIsPlaying(false);

      onFileLoadRef.current?.(file, audio);
    } catch (error) {
      console.error(error);
      if (onErrorRef.current) {
        onErrorRef.current(error, 'load');
      }
      URL.revokeObjectURL(url);
      objectUrlRef.current = null;
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
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    try {
      await audio.play();
      onPlayRef.current?.();
    } catch (error) {
      console.error(error);
      if (onErrorRef.current) {
        onErrorRef.current(error, 'play');
      }
    }
  };

  const handlePause = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.pause();
    onPauseRef.current?.();
  };

  const handleStop = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);
    onStopRef.current?.();
  };

  const handleSeek = (event: ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const value = Number(event.target.value);
    if (Number.isNaN(value)) {
      return;
    }

    const durationLimit = Number.isFinite(audio.duration) ? audio.duration : undefined;
    if (typeof durationLimit === 'number') {
      audio.currentTime = Math.min(Math.max(value, 0), durationLimit);
    } else {
      audio.currentTime = Math.max(value, 0);
    }
    setCurrentTime(audio.currentTime);
    onSeekRef.current?.(audio.currentTime);
  };

  const handleVolumeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const value = Number(event.target.value);
    if (Number.isNaN(value)) {
      return;
    }

    setVolume(value);
    audio.volume = Math.min(Math.max(value, 0), 1);
    onVolumeChangeRef.current?.(audio.volume);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.volume = Math.min(Math.max(volume, 0), 1);
  }, [volume]);

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
