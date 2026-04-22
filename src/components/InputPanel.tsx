import type { ChangeEvent } from 'react';
import type { ParseWarning, StimExample } from '../types/stim';

interface InputPanelProps {
  sourceText: string;
  uploadedFileName: string;
  selectedExampleId: string;
  examples: StimExample[];
  warnings: ParseWarning[];
  unsupportedCount: number;
  onTextChange: (value: string) => void;
  onExampleChange: (exampleId: string) => void;
  onLoadExample: () => void;
  onParse: () => void;
  onClearStoredInput: () => void;
  onFileUpload: (file: File) => void;
}

export function InputPanel({
  sourceText,
  uploadedFileName,
  selectedExampleId,
  examples,
  warnings,
  unsupportedCount,
  onTextChange,
  onExampleChange,
  onLoadExample,
  onParse,
  onClearStoredInput,
  onFileUpload,
}: InputPanelProps) {
  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileUpload(file);
    }
    event.target.value = '';
  };

  return (
    <aside className="panel left-panel">
      <div className="panel-header">
        <h2>Stim Input</h2>
        <p>Paste raw Stim, upload a file, or start from a built-in example.</p>
      </div>

      <label className="field-label" htmlFor="example-selector">
        Built-in Example
      </label>
      <div className="row">
        <select
          id="example-selector"
          className="select-input"
          value={selectedExampleId}
          onChange={(event) => onExampleChange(event.target.value)}
        >
          {examples.map((example) => (
            <option key={example.id} value={example.id}>
              {example.name}
            </option>
          ))}
        </select>
        <button type="button" className="secondary-button" onClick={onLoadExample}>
          Load Example
        </button>
      </div>

      <div className="example-meta">
        {examples.find((example) => example.id === selectedExampleId)?.description}
      </div>

      <label className="field-label file-upload">
        <span>Upload .stim File</span>
        <input type="file" accept=".stim,text/plain" onChange={handleFileInput} />
      </label>

      <div className="row source-actions">
        <div className="source-status">
          {uploadedFileName ? `Loaded file: ${uploadedFileName}` : 'Loaded source: in-app text'}
        </div>
        <button type="button" className="secondary-button" onClick={onClearStoredInput}>
          Clear / Reset
        </button>
      </div>

      <label className="field-label" htmlFor="stim-text">
        Raw Stim Circuit
      </label>
      <textarea
        id="stim-text"
        className="stim-textarea"
        value={sourceText}
        onChange={(event) => onTextChange(event.target.value)}
        spellCheck={false}
        placeholder="Paste Stim circuit text here..."
      />

      <button type="button" className="primary-button" onClick={onParse}>
        Parse / Load Circuit
      </button>

      <section className="warnings-section">
        <div className="warnings-header">
          <h3>Warnings</h3>
          <span>{warnings.length}</span>
        </div>
        {unsupportedCount > 0 ? (
          <p className="warning-summary">
            {unsupportedCount} unsupported instruction{unsupportedCount === 1 ? '' : 's'} kept as text.
          </p>
        ) : null}
        {warnings.length === 0 ? (
          <p className="empty-state">No parse warnings.</p>
        ) : (
          <ul className="warning-list">
            {warnings.map((warning, index) => (
              <li key={`${warning.message}-${warning.lineNumber ?? index}`} className={`warning-item ${warning.severity}`}>
                <strong>{warning.lineNumber ? `Line ${warning.lineNumber}` : 'General'}</strong>
                <span>{warning.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
