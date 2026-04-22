import type {
  Detector,
  MeasurementEvent,
  ObservableInclude,
  ParsedCircuit,
  ParsedInstruction,
  SelectionState,
} from '../types/stim';

interface CircuitViewerProps {
  circuit: ParsedCircuit;
  selectedTickIndex: number;
  selection: SelectionState;
  colorByRole: boolean;
  onToggleColorByRole: () => void;
  onSelectQubit: (qubitId: number) => void;
  onSelectInstruction: (instructionId: string, pairIndex?: number) => void;
}

const SVG_WIDTH = 760;
const SVG_HEIGHT = 640;
const PADDING = 64;
const QUBIT_RADIUS = 16;

function getActiveInstructionIds(instructions: ParsedInstruction[]): Set<string> {
  return new Set(instructions.map((instruction) => instruction.id));
}

function findSelectedDetector(circuit: ParsedCircuit, selection: SelectionState): Detector | undefined {
  if (selection.type !== 'detector') {
    return undefined;
  }

  return circuit.detectors.find((detector) => detector.id === selection.detectorId);
}

function findSelectedObservable(
  circuit: ParsedCircuit,
  selection: SelectionState,
): ObservableInclude | undefined {
  if (selection.type !== 'observable') {
    return undefined;
  }

  return circuit.observables.find((observable) => observable.id === selection.observableId);
}

function getDetectorEventColor(index: number, total: number): string {
  if (total <= 1) {
    return '#245c73';
  }

  const ratio = index / Math.max(1, total - 1);
  const lightness = 82 - ratio * 38;
  return `hsl(19 70% ${lightness}%)`;
}

export function CircuitViewer({
  circuit,
  selectedTickIndex,
  selection,
  colorByRole,
  onToggleColorByRole,
  onSelectQubit,
  onSelectInstruction,
}: CircuitViewerProps) {
  const tick = circuit.ticks[selectedTickIndex];
  const qubits = circuit.qubits;

  if (qubits.length === 0) {
    return (
      <section className="panel viewer-panel empty-viewer">
        <div className="panel-header">
          <h2>Lattice View</h2>
          <p>Add QUBIT_COORDS to place qubits spatially.</p>
        </div>
      </section>
    );
  }

  const xValues = qubits.map((qubit) => qubit.x);
  const yValues = qubits.map((qubit) => qubit.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const xRange = Math.max(1, maxX - minX);
  const yRange = Math.max(1, maxY - minY);

  const positionMap = new Map(
    qubits.map((qubit) => [
      qubit.id,
      {
        x: PADDING + ((qubit.x - minX) / xRange) * (SVG_WIDTH - PADDING * 2),
        y: PADDING + ((qubit.y - minY) / yRange) * (SVG_HEIGHT - PADDING * 2),
      },
    ]),
  );

  const activeQubits = new Set<number>(tick?.instructions.flatMap((instruction) => instruction.qubitTargets) ?? []);
  const activeInstructionIds = getActiveInstructionIds(tick?.instructions ?? []);
  const twoQubitInstructions = tick?.instructions.filter((instruction) => instruction.targetPairs.length > 0) ?? [];
  const singleQubitInstructions =
    tick?.instructions.filter(
      (instruction) =>
        instruction.targetPairs.length === 0 &&
        instruction.qubitTargets.length > 0 &&
        instruction.handled,
    ) ?? [];
  const selectedDetector = findSelectedDetector(circuit, selection);
  const selectedObservable = findSelectedObservable(circuit, selection);
  const detectorEventsByQubit = new Map<number, MeasurementEvent[]>();
  const observableEventsByQubit = new Map<number, MeasurementEvent[]>();

  if (selectedDetector) {
    for (const event of selectedDetector.events) {
      const entries = detectorEventsByQubit.get(event.qubitId) ?? [];
      entries.push(event);
      detectorEventsByQubit.set(event.qubitId, entries);
    }
  }

  if (selectedObservable) {
    for (const event of selectedObservable.events) {
      const entries = observableEventsByQubit.get(event.qubitId) ?? [];
      entries.push(event);
      observableEventsByQubit.set(event.qubitId, entries);
    }
  }

  return (
    <section className="panel viewer-panel">
      <div className="panel-header">
        <div className="viewer-header-row">
          <div>
            <h2>Lattice View</h2>
            <p>Tick {selectedTickIndex} with spatial qubit layout from QUBIT_COORDS.</p>
          </div>
          <label className="role-toggle">
            <input type="checkbox" checked={colorByRole} onChange={onToggleColorByRole} />
            <span>Color by inferred role</span>
          </label>
        </div>
        <div className="role-legend">
          <span className="legend-item"><i className="legend-swatch data" />Data-like</span>
          <span className="legend-item"><i className="legend-swatch ancilla" />Ancilla-like</span>
          <span className="legend-item"><i className="legend-swatch unknown" />Unknown</span>
        </div>
        {selectedDetector ? (
          <div className="detector-banner">
            {`Selected detector with ${selectedDetector.events.length} resolved measurement events.`}
          </div>
        ) : selectedObservable ? (
          <div className="detector-banner observable-banner">
            {`Selected observable L${selectedObservable.observableIndex} with ${selectedObservable.events.length} resolved measurement events.`}
          </div>
        ) : null}
      </div>

      {selectedObservable ? (
        <svg width="0" height="0" aria-hidden="true" focusable="false">
          <defs>
            <filter id="observable-glow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        </svg>
      ) : null}

      <svg className="circuit-svg" viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} role="img" aria-label="Stim circuit lattice">
        <defs>
          <marker
            id="cx-arrow"
            markerWidth="10"
            markerHeight="10"
            refX="7"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L8,3 z" fill="#245c73" />
          </marker>
        </defs>

        {twoQubitInstructions.flatMap((instruction) =>
          instruction.targetPairs.map(([sourceQubit, targetQubit], pairIndex) => {
            const source = positionMap.get(sourceQubit);
            const target = positionMap.get(targetQubit);
            if (!source || !target) {
              return null;
            }

            const isSelected =
              selection.type === 'instruction' &&
              selection.instructionId === instruction.id &&
              selection.pairIndex === pairIndex;

            const midpointX = (source.x + target.x) / 2;
            const midpointY = (source.y + target.y) / 2;
            const markerEnd = instruction.gate === 'CX' ? 'url(#cx-arrow)' : undefined;

            return (
              <g
                key={`${instruction.id}-${pairIndex}`}
                className="gate-pair"
                onClick={() => onSelectInstruction(instruction.id, pairIndex)}
              >
                <line
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  className={isSelected ? 'pair-line selected' : 'pair-line'}
                  markerEnd={markerEnd}
                />
                <rect
                  x={midpointX - 18}
                  y={midpointY - 13}
                  width={36}
                  height={26}
                  rx={8}
                  className={isSelected ? 'pair-badge selected' : 'pair-badge'}
                />
                <text x={midpointX} y={midpointY + 5} textAnchor="middle" className="pair-label">
                  {instruction.gate}
                </text>
              </g>
            );
          }),
        )}

        {qubits.map((qubit) => {
          const position = positionMap.get(qubit.id);
          if (!position) {
            return null;
          }

          const isSelected = selection.type === 'qubit' && selection.qubitId === qubit.id;
          const isActive = activeQubits.has(qubit.id);
          const detectorEvents = detectorEventsByQubit.get(qubit.id) ?? [];
          const observableEvents = observableEventsByQubit.get(qubit.id) ?? [];
          const inSelectedDetector = detectorEvents.length > 0;
          const inSelectedObservable = observableEvents.length > 0;

          const qubitLabels = singleQubitInstructions
            .filter((instruction) => instruction.qubitTargets.includes(qubit.id))
            .slice(0, 4);

          return (
            <g key={qubit.id} className="qubit-node" onClick={() => onSelectQubit(qubit.id)}>
              <circle
                cx={position.x}
                cy={position.y}
                r={QUBIT_RADIUS}
                className={[
                  'qubit-circle',
                  colorByRole ? `role-${qubit.roleInference.role}` : '',
                  isActive ? 'active' : '',
                  isSelected ? 'selected' : '',
                  inSelectedDetector ? 'detector-highlight' : '',
                  inSelectedObservable ? 'observable-highlight' : '',
                  activeInstructionIds.size === 0 ? 'idle' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              />
              <text x={position.x} y={position.y + 4} textAnchor="middle" className="qubit-id">
                {qubit.id}
              </text>
              {qubitLabels.map((instruction, index) => (
                <g key={`${instruction.id}-${qubit.id}`} className="qubit-badge-group">
                  <rect
                    x={position.x + 18}
                    y={position.y - 30 - index * 22}
                    width={44}
                    height={18}
                    rx={9}
                    className="qubit-badge"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectInstruction(instruction.id);
                    }}
                  />
                  <text
                    x={position.x + 40}
                    y={position.y - 18 - index * 22}
                    textAnchor="middle"
                    className="qubit-badge-label"
                  >
                    {instruction.gate}
                  </text>
                </g>
              ))}
              <text x={position.x} y={position.y + 34} textAnchor="middle" className="coord-label">
                ({qubit.x}, {qubit.y})
              </text>
              <text x={position.x} y={position.y + 50} textAnchor="middle" className="role-label">
                {qubit.roleInference.role}
              </text>
              {detectorEvents.map((event, index) => {
                const fill = getDetectorEventColor(index, detectorEvents.length);
                const label = `q${event.qubitId} @ t${event.tickIndex}`;

                return (
                  <g key={event.id}>
                    <rect
                      x={position.x - 66}
                      y={position.y - 34 - index * 20}
                      width={64}
                      height={16}
                      rx={8}
                      className="detector-event-badge"
                      style={{ fill }}
                    />
                    <text
                      x={position.x - 34}
                      y={position.y - 22 - index * 20}
                      textAnchor="middle"
                      className="detector-event-label"
                    >
                      {label}
                    </text>
                  </g>
                );
              })}
              {observableEvents.map((event, index) => (
                <g key={event.id}>
                  <rect
                    x={position.x + 18}
                    y={position.y + 40 + index * 20}
                    width={64}
                    height={16}
                    rx={8}
                    className="observable-event-badge"
                    filter="url(#observable-glow)"
                  />
                  <text
                    x={position.x + 50}
                    y={position.y + 52 + index * 20}
                    textAnchor="middle"
                    className="observable-event-label"
                  >
                    {`q${event.qubitId} @ t${event.tickIndex}`}
                  </text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </section>
  );
}
