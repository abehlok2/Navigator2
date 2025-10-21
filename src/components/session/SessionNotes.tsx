import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react';

import { Button, Card } from '../ui';

export interface SessionNote {
  roomId: string;
  content: string;
  timestamp: number;
}

export interface SessionNotesProps {
  roomId: string;
  className?: string;
  autoSaveInterval?: number;
}

type SaveSource = 'auto' | 'manual';

type ExportFormat = 'txt' | 'md';

const sectionStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
};

const contentWrapperStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

const controlsStyles: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.75rem',
  alignItems: 'center',
};

const textareaStyles: CSSProperties = {
  width: '100%',
  minHeight: '12rem',
  padding: '1rem',
  borderRadius: '0.75rem',
  border: '1px solid var(--surface-border, #2f2f2f)',
  backgroundColor: 'var(--surface-raised, #1c1c1f)',
  color: 'var(--text-primary, #ffffff)',
  fontSize: '1rem',
  lineHeight: 1.5,
  fontFamily: 'inherit',
  resize: 'vertical',
  boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.35)',
};

const statusStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  fontSize: '0.9rem',
  color: 'var(--text-secondary, #b0b0b5)',
};

const statusHighlightStyles: CSSProperties = {
  fontWeight: 600,
  color: 'var(--text-primary, #ffffff)',
};

const unsavedIndicatorStyles: CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--accent-warning, #ffb347)',
  fontWeight: 600,
};

const formatTimestamp = (timestamp: number): string =>
  new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

export const SessionNotes = ({
  roomId,
  className,
  autoSaveInterval = 5000,
}: SessionNotesProps) => {
  const [content, setContent] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState('Start capturing session notes.');
  const [isDirty, setIsDirty] = useState(false);

  const storageKey = useMemo(() => `session-notes-${roomId}`, [roomId]);

  const contentRef = useRef(content);
  const isDirtyRef = useRef(isDirty);
  const storageKeyRef = useRef(storageKey);
  const isPageUnloadingRef = useRef(false);
  const previousStorageKeyRef = useRef<string | null>(null);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    storageKeyRef.current = storageKey;
  }, [storageKey]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      isPageUnloadingRef.current = true;
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
    };
  }, []);

  const loadNotes = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const rawValue = window.localStorage.getItem(storageKey);

    if (!rawValue) {
      setContent('');
      setLastSavedAt(null);
      setIsDirty(false);
      setStatusMessage('Start capturing session notes.');
      return;
    }

    try {
      const parsedValue = JSON.parse(rawValue) as SessionNote;

      setContent(parsedValue.content ?? '');
      setLastSavedAt(parsedValue.timestamp ?? null);
      setIsDirty(false);
      setStatusMessage(
        parsedValue.timestamp
          ? `Restored notes saved on ${formatTimestamp(parsedValue.timestamp)}.`
          : 'Start capturing session notes.',
      );
    } catch (error) {
      console.error('Unable to read stored session notes:', error);
      setContent('');
      setLastSavedAt(null);
      setIsDirty(false);
      setStatusMessage('Stored notes were corrupted and have been cleared.');
      window.localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  const saveNotes = useCallback(
    (source: SaveSource = 'manual') => {
      if (typeof window === 'undefined') {
        return;
      }

      const contentToPersist = contentRef.current;
      const timestamp = Date.now();
      const note: SessionNote = {
        roomId,
        content: contentToPersist,
        timestamp,
      };

      window.localStorage.setItem(storageKey, JSON.stringify(note));
      setLastSavedAt(timestamp);
      setIsDirty(false);
      setStatusMessage(
        source === 'auto'
          ? `Auto-saved at ${formatTimestamp(timestamp)}.`
          : `Notes saved at ${formatTimestamp(timestamp)}.`,
      );
    },
    [roomId, storageKey],
  );

  useEffect(() => {
    if (previousStorageKeyRef.current && previousStorageKeyRef.current !== storageKey) {
      if (typeof window !== 'undefined' && !isPageUnloadingRef.current) {
        window.localStorage.removeItem(previousStorageKeyRef.current);
      }
    }

    previousStorageKeyRef.current = storageKey;
    loadNotes();
  }, [loadNotes, storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (!isDirtyRef.current) {
        return;
      }

      saveNotes('auto');
    }, autoSaveInterval);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [autoSaveInterval, saveNotes]);

  useEffect(() => {
    return () => {
      if (typeof window === 'undefined') {
        return;
      }

      if (!isPageUnloadingRef.current && storageKeyRef.current) {
        window.localStorage.removeItem(storageKeyRef.current);
      }
    };
  }, []);

  const handleContentChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setContent(event.target.value);
    setIsDirty(true);
    setStatusMessage('Unsaved changes.');
  }, []);

  const handleManualSave = useCallback(() => {
    saveNotes('manual');
  }, [saveNotes]);

  const handleClearNotes = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const confirmed = window.confirm('Clear all notes for this session? This cannot be undone.');

    if (!confirmed) {
      return;
    }

    window.localStorage.removeItem(storageKey);
    setContent('');
    setLastSavedAt(null);
    setIsDirty(false);
    setStatusMessage('Notes cleared. Start capturing session notes.');
  }, [storageKey]);

  const handleExport = useCallback(
    (format: ExportFormat) => {
      if (typeof window === 'undefined') {
        return;
      }

      const timestamp = lastSavedAt ?? Date.now();
      const readableTimestamp = formatTimestamp(timestamp);
      const isoTimestamp = new Date(timestamp)
        .toISOString()
        .replace(/[:]/g, '-')
        .replace(/[.].*/, '');
      const header =
        format === 'md'
          ? `# Session Notes\n\n- Room: ${roomId}\n- Exported: ${readableTimestamp}\n\n`
          : `Session Notes\nRoom: ${roomId}\nExported: ${readableTimestamp}\n\n`;
      const body = contentRef.current || '';
      const fileContents = `${header}${body}`;
      const blob = new Blob([fileContents], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `session-notes-${roomId}-${isoTimestamp}.${format}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    },
    [lastSavedAt, roomId],
  );

  const characterCount = content.length;
  const hasSavedNotes = lastSavedAt !== null;

  return (
    <section className={className} style={sectionStyles} aria-label="Session notes">
      <Card title="Session Notes">
        <div style={contentWrapperStyles}>
          <textarea
            style={textareaStyles}
            value={content}
            onChange={handleContentChange}
            placeholder="Capture key talking points, action items, and follow-ups here..."
            aria-label="Session notes text area"
          />

          <div style={statusStyles}>
            <span>
              Last saved:{' '}
              <span style={statusHighlightStyles}>
                {hasSavedNotes && lastSavedAt !== null
                  ? formatTimestamp(lastSavedAt)
                  : 'Not saved yet'}
              </span>
            </span>
            <span>Characters: {characterCount}</span>
            {isDirty ? <span style={unsavedIndicatorStyles}>Unsaved changes</span> : null}
            <span>{statusMessage}</span>
          </div>

          <div style={controlsStyles}>
            <Button onClick={handleManualSave} disabled={!isDirty} ariaLabel="Save session notes">
              Save Notes
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleExport('txt')}
              ariaLabel="Export notes as text file"
              disabled={!content}
            >
              Export (.txt)
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleExport('md')}
              ariaLabel="Export notes as markdown file"
              disabled={!content}
            >
              Export (.md)
            </Button>
            <Button variant="danger" onClick={handleClearNotes} ariaLabel="Clear session notes">
              Clear Notes
            </Button>
          </div>
        </div>
      </Card>
    </section>
  );
};

SessionNotes.displayName = 'SessionNotes';
