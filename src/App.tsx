import { useEffect, useMemo, useState } from 'react';
import { CircuitViewer } from './components/CircuitViewer';
import { InputPanel } from './components/InputPanel';
import { TickPanel } from './components/TickPanel';
import { STIM_EXAMPLES } from './lib/exampleCircuits';
import { parseStimCircuit } from './lib/stimParser';
import type { ParsedCircuit, SelectionState } from './types/stim';

const STORAGE_TEXT_KEY = 'stim-viewer:source-text';
const STORAGE_FILE_NAME_KEY = 'stim-viewer:file-name';

function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsText(file);
  });
}

function getStoredStimState(): { text: string; fileName: string } | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const text = window.localStorage.getItem(STORAGE_TEXT_KEY);
  if (!text) {
    return null;
  }

  return {
    text,
    fileName: window.localStorage.getItem(STORAGE_FILE_NAME_KEY) ?? '',
  };
}

export default function App() {
  const storedStimState = getStoredStimState();
  const initialSourceText = storedStimState?.text ?? STIM_EXAMPLES[0].text;
  const [selectedExampleId, setSelectedExampleId] = useState(STIM_EXAMPLES[0].id);
  const [sourceText, setSourceText] = useState(initialSourceText);
  const [uploadedFileName, setUploadedFileName] = useState(storedStimState?.fileName ?? '');
  // The parsed circuit is the single source of truth shared by the input panel,
  // SVG viewer, and tick inspector so later analysis layers can plug into one model.
  const [parsedCircuit, setParsedCircuit] = useState<ParsedCircuit>(() =>
    parseStimCircuit(initialSourceText),
  );
  const [selectedTickIndex, setSelectedTickIndex] = useState(0);
  const [selection, setSelection] = useState<SelectionState>({ type: 'none' });
  const [colorByRole, setColorByRole] = useState(false);

  const tickCount = parsedCircuit.ticks.length;

  useEffect(() => {
    if (selectedTickIndex > Math.max(0, tickCount - 1)) {
      setSelectedTickIndex(Math.max(0, tickCount - 1));
    }
  }, [selectedTickIndex, tickCount]);

  useEffect(() => {
    if (selection.type === 'instruction') {
      const currentTick = parsedCircuit.ticks[selectedTickIndex];
      const existsInTick = currentTick?.instructions.some(
        (instruction) => instruction.id === selection.instructionId,
      );

      if (!existsInTick) {
        setSelection({ type: 'none' });
      }
    }

    if (selection.type === 'detector') {
      const exists = parsedCircuit.detectors.some((detector) => detector.id === selection.detectorId);
      if (!exists) {
        setSelection({ type: 'none' });
      }
    }

    if (selection.type === 'observable') {
      const exists = parsedCircuit.observables.some((observable) => observable.id === selection.observableId);
      if (!exists) {
        setSelection({ type: 'none' });
      }
    }
  }, [parsedCircuit, selectedTickIndex, selection]);

  useEffect(() => {
    const maxTickIndex = Math.max(0, parsedCircuit.ticks.length - 1);

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setSelectedTickIndex((current) => Math.min(maxTickIndex, current + 1));
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setSelectedTickIndex((current) => Math.max(0, current - 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [parsedCircuit.ticks.length]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (sourceText.trim()) {
      window.localStorage.setItem(STORAGE_TEXT_KEY, sourceText);
      window.localStorage.setItem(STORAGE_FILE_NAME_KEY, uploadedFileName);
      return;
    }

    window.localStorage.removeItem(STORAGE_TEXT_KEY);
    window.localStorage.removeItem(STORAGE_FILE_NAME_KEY);
  }, [sourceText, uploadedFileName]);

  const selectedTick = parsedCircuit.ticks[selectedTickIndex];
  const roleCounts = useMemo(
    () =>
      parsedCircuit.qubits.reduce(
        (counts, qubit) => {
          counts[qubit.roleInference.role] += 1;
          return counts;
        },
        { data: 0, ancilla: 0, unknown: 0 },
      ),
    [parsedCircuit.qubits],
  );
  const missingCoordsWarning = useMemo(
    () =>
      parsedCircuit.warnings.find((warning) =>
        warning.message.includes('No QUBIT_COORDS instructions were found'),
      ),
    [parsedCircuit.warnings],
  );

  const handleParse = () => {
    const nextCircuit = parseStimCircuit(sourceText);
    setParsedCircuit(nextCircuit);
    setSelectedTickIndex(0);
    setSelection({ type: 'none' });
  };

  const handleLoadExample = () => {
    const example = STIM_EXAMPLES.find((entry) => entry.id === selectedExampleId);
    if (!example) {
      return;
    }

    setSourceText(example.text);
    setUploadedFileName('');
    const nextCircuit = parseStimCircuit(example.text);
    setParsedCircuit(nextCircuit);
    setSelectedTickIndex(0);
    setSelection({ type: 'none' });
  };

  const handleFileUpload = async (file: File) => {
    const text = await readTextFile(file);
    setSourceText(text);
    setUploadedFileName(file.name);
    const nextCircuit = parseStimCircuit(text);
    setParsedCircuit(nextCircuit);
    setSelectedTickIndex(0);
    setSelection({ type: 'none' });
  };

  const handleClearStoredInput = () => {
    setUploadedFileName('');
    setSourceText('');
    setParsedCircuit(parseStimCircuit(''));
    setSelectedTickIndex(0);
    setSelection({ type: 'none' });
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Quantum Error-Correction Circuit Viewer</p>
          <h1>Stim Inspection Workspace</h1>
        </div>
        <div className="header-stats">
          <span>{parsedCircuit.qubits.length} qubits</span>
          <span>{parsedCircuit.ticks.length} ticks</span>
          <span>{parsedCircuit.measurementEvents.length} measurement events</span>
          <span>{parsedCircuit.detectors.length} detectors</span>
          <span>{parsedCircuit.observables.length} observables</span>
          <span>{selectedTick?.instructions.length ?? 0} ops in view</span>
          <span>{roleCounts.data} data-like</span>
          <span>{roleCounts.ancilla} ancilla-like</span>
          <span>{roleCounts.unknown} unknown</span>
        </div>
      </header>

      {missingCoordsWarning ? (
        <div className="top-warning">
          {missingCoordsWarning.message}
        </div>
      ) : null}

      <main className="app-grid">
        <InputPanel
          sourceText={sourceText}
          uploadedFileName={uploadedFileName}
          selectedExampleId={selectedExampleId}
          examples={STIM_EXAMPLES}
          warnings={parsedCircuit.warnings}
          unsupportedCount={parsedCircuit.unsupportedInstructions.length}
          onTextChange={(value) => setSourceText(value)}
          onExampleChange={setSelectedExampleId}
          onLoadExample={handleLoadExample}
          onParse={handleParse}
          onClearStoredInput={handleClearStoredInput}
          onFileUpload={(file) => {
            void handleFileUpload(file);
          }}
        />

        <CircuitViewer
          circuit={parsedCircuit}
          selectedTickIndex={selectedTickIndex}
          selection={selection}
          colorByRole={colorByRole}
          onToggleColorByRole={() => setColorByRole((value) => !value)}
          onSelectQubit={(qubitId) => setSelection({ type: 'qubit', qubitId })}
          onSelectInstruction={(instructionId, pairIndex) =>
            setSelection({ type: 'instruction', instructionId, pairIndex })
          }
        />

        <TickPanel
          circuit={parsedCircuit}
          selectedTickIndex={selectedTickIndex}
          selection={selection}
          colorByRole={colorByRole}
          onTickChange={setSelectedTickIndex}
          onSelectInstruction={(instructionId, pairIndex) =>
            setSelection({ type: 'instruction', instructionId, pairIndex })
          }
          onSelectDetector={(detectorId) => setSelection({ type: 'detector', detectorId })}
          onSelectObservable={(observableId) => setSelection({ type: 'observable', observableId })}
          onSelectQubit={(qubitId) => setSelection({ type: 'qubit', qubitId })}
        />
      </main>
    </div>
  );
}
