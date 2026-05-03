import Head from 'next/head';
import { useRef, useState } from 'react';
import { useTheme } from '../hooks/useTheme';
import { injectCustomThemeCss, CUSTOM_THEMES_UPDATED_EVENT } from '../hooks/useCustomThemes';
import {
  type CustomTheme,
  type VariableDefinition,
  VARIABLE_GROUPS,
  loadCustomThemesFromStorage,
  saveCustomThemesToStorage,
  readCurrentThemeVariables,
  generateCustomThemeCss,
  accentToHex,
  hexToAccentRgb,
  cssColorToHex,
  parseRgbaColor,
  rgbaColorToString,
  rgbaColorToHex,
} from '../model/customTheme';
import { CODEMIRROR_THEMES } from '../theme/themes';

interface EditingState {
  id: string | null;
  label: string;
  variables: Record<string, string>;
  codeMirrorThemeId: string;
}

function applyPreviewStyles(variables: Record<string, string>) {
  Object.entries(variables).forEach(([k, v]) => document.body.style.setProperty(k, v));
}

function clearPreviewStyles(variables: Record<string, string>) {
  Object.keys(variables).forEach((k) => document.body.style.removeProperty(k));
}

interface VariableRowProps {
  definition: VariableDefinition;
  value: string;
  onChange: (varName: string, cssValue: string) => void;
}

function VariableRow({ definition, value, onChange }: Readonly<VariableRowProps>) {
  const colorInputRef = useRef<HTMLInputElement>(null);

  if (definition.type === 'text') {
    return (
      <div className="te-variable-row">
        <span className="te-variable-label">{definition.label}</span>
        <div className="te-variable-controls">
          <span className="te-color-swatch" style={{ background: value }} aria-hidden="true" />
          <input
            type="text"
            className="te-text-input"
            value={value}
            onChange={(e) => onChange(definition.varName, e.target.value)}
            placeholder="e.g. rgba(0, 0, 0, 0.15)"
          />
        </div>
      </div>
    );
  }

  if (definition.type === 'rgba') {
    const parsed = parseRgbaColor(value);
    const hexValue = rgbaColorToHex(parsed);

    const handleColorChange = (newHex: string) => {
      const r = parseInt(newHex.slice(1, 3), 16);
      const g = parseInt(newHex.slice(3, 5), 16);
      const b = parseInt(newHex.slice(5, 7), 16);
      onChange(definition.varName, rgbaColorToString({ r, g, b, a: parsed.a }));
    };

    const handleAlphaChange = (newAlpha: number) => {
      onChange(definition.varName, rgbaColorToString({ ...parsed, a: newAlpha }));
    };

    return (
      <div className="te-variable-row">
        <span className="te-variable-label">{definition.label}</span>
        <div className="te-variable-controls">
          <button
            type="button"
            className="te-color-swatch te-color-swatch-button te-color-swatch-alpha"
            style={{ '--swatch-color': value } as React.CSSProperties}
            onClick={() => colorInputRef.current?.click()}
            aria-label={`Choose ${definition.label} color`}
          />
          <input
            ref={colorInputRef}
            type="color"
            value={hexValue}
            onChange={(e) => handleColorChange(e.target.value)}
            className="te-color-picker-hidden"
            aria-hidden="true"
            tabIndex={-1}
          />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={parsed.a}
            onChange={(e) => handleAlphaChange(parseFloat(e.target.value))}
            className="te-alpha-slider"
            style={{ '--alpha-slider-color': hexValue } as React.CSSProperties}
            aria-label={`${definition.label} opacity`}
          />
          <span className="te-alpha-value">{Math.round(parsed.a * 100)}%</span>
        </div>
      </div>
    );
  }

  const hexValue = definition.type === 'accent' ? accentToHex(value) : cssColorToHex(value);

  const handleColorChange = (newHex: string) => {
    onChange(definition.varName, definition.type === 'accent' ? hexToAccentRgb(newHex) : newHex);
  };

  const handleTextChange = (text: string) => {
    if (/^#[0-9a-fA-F]{6}$/.test(text)) handleColorChange(text);
  };

  return (
    <div className="te-variable-row">
      <span className="te-variable-label">{definition.label}</span>
      <div className="te-variable-controls">
        <button
          type="button"
          className="te-color-swatch te-color-swatch-button"
          style={{ background: hexValue }}
          onClick={() => colorInputRef.current?.click()}
          aria-label={`Choose ${definition.label} color`}
        />
        <input
          ref={colorInputRef}
          type="color"
          value={hexValue}
          onChange={(e) => handleColorChange(e.target.value)}
          className="te-color-picker-hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
        <input
          type="text"
          className="te-hex-input"
          value={hexValue}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="#000000"
          maxLength={7}
        />
      </div>
    </div>
  );
}

interface ThemeEditorFormProps {
  editing: EditingState;
  onLabelChange: (label: string) => void;
  onCodeMirrorThemeChange: (id: string) => void;
  onVariableChange: (varName: string, cssValue: string) => void;
  onSave: () => void;
  onExport: () => void;
  onCancel: () => void;
}

function ThemeEditorForm({
  editing,
  onLabelChange,
  onCodeMirrorThemeChange,
  onVariableChange,
  onSave,
  onExport,
  onCancel,
}: Readonly<ThemeEditorFormProps>) {
  return (
    <div className="te-editor">
      <div className="te-editor-header">
        <div className="field">
          <input
            type="text"
            className="border-bottom-accent-focus te-name-input"
            value={editing.label}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder="Theme name"
            maxLength={40}
          />
        </div>
        <div className="field">
          <select
            value={editing.codeMirrorThemeId}
            onChange={(e) => onCodeMirrorThemeChange(e.target.value)}
            aria-label="CodeMirror theme"
          >
            {CODEMIRROR_THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="te-editor-actions">
          <button type="button" className="button primary small" onClick={onSave}>
            Save
          </button>
          <button type="button" className="button secondary small" onClick={onExport}>
            Export CSS
          </button>
          <button type="button" className="button ghost small" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>

      <div className="te-groups">
        {VARIABLE_GROUPS.map((group) => (
          <div key={group.label} className="te-group">
            <h3 className="te-group-label">{group.label}</h3>
            {group.items.map((item) => (
              <VariableRow
                key={item.varName}
                definition={item}
                value={editing.variables[item.varName] ?? ''}
                onChange={onVariableChange}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="te-editor-footer">
        <button type="button" className="button primary small" onClick={onSave}>
          Save
        </button>
        <button type="button" className="button secondary small" onClick={onExport}>
          Export CSS
        </button>
        <button type="button" className="button ghost small" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function ThemeEditorPage() {
  const { theme, setTheme } = useTheme();
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>(() =>
    loadCustomThemesFromStorage(),
  );
  const [editing, setEditing] = useState<EditingState | null>(null);

  const notifyUpdate = () => window.dispatchEvent(new Event(CUSTOM_THEMES_UPDATED_EVENT));

  function startNewTheme() {
    const variables = readCurrentThemeVariables();
    applyPreviewStyles(variables);
    setEditing({
      id: null,
      label: 'My theme',
      variables,
      codeMirrorThemeId: CODEMIRROR_THEMES[0].id,
    });
  }

  function startEditTheme(t: CustomTheme) {
    applyPreviewStyles(t.variables);
    setEditing({
      id: t.id,
      label: t.label,
      variables: { ...t.variables },
      codeMirrorThemeId: t.codeMirrorThemeId ?? CODEMIRROR_THEMES[0].id,
    });
  }

  function handleLabelChange(label: string) {
    if (!editing) return;
    setEditing({ ...editing, label });
  }

  function handleCodeMirrorThemeChange(codeMirrorThemeId: string) {
    if (!editing) return;
    setEditing({ ...editing, codeMirrorThemeId });
  }

  function handleVariableChange(varName: string, cssValue: string) {
    if (!editing) return;
    const updated = { ...editing.variables, [varName]: cssValue };
    setEditing({ ...editing, variables: updated });
    document.body.style.setProperty(varName, cssValue);
  }

  function handleSave() {
    if (!editing) return;
    const id = editing.id ?? `custom-${Date.now()}`;
    const saved: CustomTheme = {
      id,
      label: editing.label,
      variables: editing.variables,
      codeMirrorThemeId: editing.codeMirrorThemeId,
    };
    const updated = editing.id
      ? customThemes.map((t) => (t.id === editing.id ? saved : t))
      : [...customThemes, saved];

    clearPreviewStyles(editing.variables);
    setCustomThemes(updated);
    saveCustomThemesToStorage(updated);
    injectCustomThemeCss(saved);
    setTheme(id);
    setEditing(null);
    notifyUpdate();
  }

  function handleExport() {
    if (!editing) return;
    const id = editing.id ?? `custom-preview`;
    const theme: CustomTheme = { id, label: editing.label, variables: editing.variables };
    downloadCss(theme);
  }

  function handleCancel() {
    if (!editing) return;
    clearPreviewStyles(editing.variables);
    setEditing(null);
  }

  function handleDeleteTheme(id: string) {
    const updated = customThemes.filter((t) => t.id !== id);
    setCustomThemes(updated);
    saveCustomThemesToStorage(updated);
    if (theme === id) setTheme('default');
    notifyUpdate();
  }

  function handleExportTheme(t: CustomTheme) {
    downloadCss(t);
  }

  function downloadCss(t: CustomTheme) {
    const css = generateCustomThemeCss(t);
    const blob = new Blob([css], { type: 'text/css' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t.label.replace(/\s+/g, '-').toLowerCase()}.css`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (editing) {
    return (
      <>
        <Head>
          <title>Theme editor — BytebeatCloud</title>
        </Head>
        <div className="te-page">
          <h2 className="te-page-title">
            {editing.id ? `Editing "${editing.label}"` : 'New theme'}
          </h2>
          <ThemeEditorForm
            editing={editing}
            onLabelChange={handleLabelChange}
            onCodeMirrorThemeChange={handleCodeMirrorThemeChange}
            onVariableChange={handleVariableChange}
            onSave={handleSave}
            onExport={handleExport}
            onCancel={handleCancel}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Theme editor — BytebeatCloud</title>
      </Head>
      <div className="te-page">
        <div className="info-panel">
          <b>⚠️ Experimental Feature</b>
          <span>
            This feature is currently experimental and may be modified or removed at any time.
            Custom themes are stored locally in your browser and may be lost if you clear your
            cache.
          </span>
        </div>

        <div className="te-page-header">
          <h2 className="te-page-title">Theme editor</h2>
          <button type="button" className="button primary small" onClick={startNewTheme}>
            + New theme
          </button>
        </div>

        {customThemes.length === 0 ? (
          <p className="secondary-text te-empty">
            No custom themes yet. Create one to get started — it will appear in the theme switcher
            in the sidebar.
          </p>
        ) : (
          <ul className="te-theme-list">
            {customThemes.map((t) => (
              <li key={t.id} className="te-theme-item">
                <div className="te-theme-swatches">
                  {(['--bg-color', '--accent-color-rgb', '--text-color'] as const).map((v) => {
                    const val = t.variables[v] ?? '';
                    const color =
                      v === '--accent-color-rgb'
                        ? `rgb(${val.trim().split(/\s+/).join(',')})`
                        : val;
                    return (
                      <span
                        key={v}
                        className="te-theme-swatch"
                        style={{ background: color }}
                        aria-hidden="true"
                      />
                    );
                  })}
                </div>
                <span className="te-theme-name">{t.label}</span>
                <div className="te-theme-actions">
                  <button
                    type="button"
                    className="button small ghost"
                    onClick={() => startEditTheme(t)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="button small ghost"
                    onClick={() => handleExportTheme(t)}
                  >
                    Export
                  </button>
                  <button
                    type="button"
                    className="button small ghost"
                    onClick={() => handleDeleteTheme(t.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
