import { useState } from 'react';
import { ModeOption } from '../model/expression';
import { renderToWav, downloadWav } from '../utils/wav-export';
import { formatAuthorDashTitle } from '../utils/post-format';

interface ExportWavModalProps {
  expression: string;
  mode: ModeOption;
  sampleRate: number;
  username: string;
  title: string;
  onClose: () => void;
}

export function ExportWavModal({
  expression,
  mode,
  sampleRate,
  username,
  title,
  onClose,
}: ExportWavModalProps) {
  const [duration, setDuration] = useState(60);
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(3);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const handleExport = async () => {
    setError('');
    setExporting(true);

    try {
      // Use setTimeout to allow UI to update before blocking render
      await new Promise((resolve) => setTimeout(resolve, 50));

      const buffer = renderToWav({
        expression,
        mode,
        sampleRate,
        duration,
        fadeIn,
        fadeOut,
      });

      const filename = `${formatAuthorDashTitle(username, title)}.wav`.replace(/[^a-zA-Z0-9._-]/g, '_');
      downloadWav(buffer, filename);
      onClose();
    } catch (e) {
      setError((e as Error).message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal export-wav-modal">
        <h3>Export to WAV</h3>

        <label className="field">
          <span>Duration (seconds)</span>
          <input
            type="number"
            min={1}
            max={300}
            value={duration}
            onChange={(e) => setDuration(Math.max(1, Number(e.target.value) || 1))}
            className="border-bottom-accent-focus"
          />
        </label>

        <label className="field">
          <span>Fade in (seconds)</span>
          <input
            type="number"
            min={0}
            max={60}
            step={0.1}
            value={fadeIn}
            onChange={(e) => setFadeIn(Math.max(0, Number(e.target.value) || 0))}
            className="border-bottom-accent-focus"
          />
        </label>

        <label className="field">
          <span>Fade out (seconds)</span>
          <input
            type="number"
            min={0}
            max={60}
            step={0.1}
            value={fadeOut}
            onChange={(e) => setFadeOut(Math.max(0, Number(e.target.value) || 0))}
            className="border-bottom-accent-focus"
          />
        </label>

        {error && <p className="error-message">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={exporting}>
            Cancel
          </button>
          <button
            type="button"
            className="button primary"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}
