import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LicenseOption, LICENSE_OPTIONS } from '../model/postEditor';

interface PublishPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  onTitleChange: (title: string) => void;
  description: string;
  onDescriptionChange: (description: string) => void;
  license: LicenseOption;
  onLicenseChange: (license: LicenseOption) => void;
  onPublish: () => void;
  isPublishing: boolean;
  canPublish: boolean;
  saveError?: string;
}

export function PublishPanel({
  isOpen,
  onClose,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  license,
  onLicenseChange,
  onPublish,
  isPublishing,
  canPublish,
  saveError,
}: PublishPanelProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient || !isOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="publish-panel-backdrop"
        onClick={onClose}
      />
      
      {/* Slide-in panel */}
      <div className="publish-panel">
        <div className="publish-panel-content">
          {/* Header */}
          <div className="publish-panel-header">
            <h2 className="publish-panel-title">
              Publish Post
            </h2>
            <button
              onClick={onClose}
              className="publish-panel-close"
              aria-label="Close panel"
            >
              ×
            </button>
          </div>

          {/* Form fields */}
          <div className="publish-panel-form">
            {/* Title field */}
            <label className="field">
              <span style={{ fontSize: '12px', color: 'var(--secondary-text-color)', marginBottom: '4px', display: 'block' }}>
                Title
              </span>
              <input
                type="text"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="Enter a title for your post"
                className="border-bottom-accent-focus"
              />
            </label>

            {/* Description field */}
            <label className="field">
              <span style={{ fontSize: '12px', color: 'var(--secondary-text-color)', marginBottom: '4px', display: 'block' }}>
                Description
              </span>
              <textarea
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                placeholder="Describe your bytebeat creation"
                rows={4}
                className="border-bottom-accent-focus"
              />
            </label>

            {/* License field */}
            <label className="field">
              <span style={{ fontSize: '12px', color: 'var(--secondary-text-color)', marginBottom: '4px', display: 'block' }}>
                License
              </span>
              <select
                value={license}
                onChange={(e) => onLicenseChange(e.target.value as LicenseOption)}
              >
                {LICENSE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Actions */}
          <div className="publish-panel-actions">
            <button
              onClick={onClose}
              className="button secondary"
              style={{ flex: 1 }}
            >
              Cancel
            </button>
            <button
              onClick={onPublish}
              disabled={!canPublish || isPublishing}
              className="button primary"
              style={{ flex: 1 }}
            >
              {isPublishing ? 'Publishing…' : 'Publish'}
            </button>
          </div>

          {/* Error message */}
          {saveError && (
            <div className="error-message">
              {saveError}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
