import type {
  Detector,
  MeasurementEvent,
  ObservableInclude,
  ParsedCircuit,
  ParsedInstruction,
  SelectionState,
} from '../types/stim';

interface TickPanelProps {
  circuit: ParsedCircuit;
  selectedTickIndex: number;
  selection: SelectionState;
  colorByRole: boolean;
  onTickChange: (tickIndex: number) => void;
  onSelectInstruction: (instructionId: string, pairIndex?: number) => void;
  onSelectDetector: (detectorId: string) => void;
  onSelectObservable: (observableId: string) => void;
  onSelectQubit: (qubitId: number) => void;
}

function findInstruction(
  circuit: ParsedCircuit,
  instructionId: string,
): ParsedInstruction | undefined {
  for (const tick of circuit.ticks) {
    const match = tick.instructions.find((instruction) => instruction.id === instructionId);
    if (match) {
      return match;
    }
  }

  return undefined;
}

function findDetector(circuit: ParsedCircuit, detectorId: string): Detector | undefined {
  return circuit.detectors.find((detector) => detector.id === detectorId);
}

function findDetectorByInstructionId(
  circuit: ParsedCircuit,
  instructionId: string,
): Detector | undefined {
  return circuit.detectors.find((detector) => detector.instructionId === instructionId);
}

function findObservable(circuit: ParsedCircuit, observableId: string): ObservableInclude | undefined {
  return circuit.observables.find((observable) => observable.id === observableId);
}

function findObservableByInstructionId(
  circuit: ParsedCircuit,
  instructionId: string,
): ObservableInclude | undefined {
  return circuit.observables.find((observable) => observable.instructionId === instructionId);
}

function compareMeasurementEvents(a: MeasurementEvent, b: MeasurementEvent): number {
  return a.globalMeasurementIndex - b.globalMeasurementIndex;
}

function getDetectorLabel(circuit: ParsedCircuit, detectorId: string): string {
  const index = circuit.detectors.findIndex((detector) => detector.id === detectorId);
  return index === -1 ? detectorId : `D${index + 1}`;
}

function getObservableLabel(observable: ObservableInclude): string {
  return `L${observable.observableIndex}`;
}

function formatDetectorEventSummary(events: MeasurementEvent[]): string {
  if (events.length === 0) {
    return 'no resolved events';
  }

  return events
    .slice()
    .sort(compareMeasurementEvents)
    .map((event) => `q${event.qubitId} @ t${event.tickIndex}`)
    .join(' · ');
}

function formatMeasurementGroupSummary(events: MeasurementEvent[]): string {
  if (events.length === 0) {
    return 'no resolved measurement events';
  }

  const uniqueTicks = new Set(events.map((event) => event.tickIndex));
  const eventCountLabel = `${events.length} measurement event${events.length === 1 ? '' : 's'}`;

  if (uniqueTicks.size <= 1) {
    return eventCountLabel;
  }

  return `${eventCountLabel} · spans ${uniqueTicks.size} ticks`;
}

export function TickPanel({
  circuit,
  selectedTickIndex,
  selection,
  colorByRole,
  onTickChange,
  onSelectInstruction,
  onSelectDetector,
  onSelectObservable,
  onSelectQubit,
}: TickPanelProps) {
  const tick = circuit.ticks[selectedTickIndex];
  const maxTickIndex = Math.max(0, circuit.ticks.length - 1);
  const selectedInstruction =
    selection.type === 'instruction' ? findInstruction(circuit, selection.instructionId) : undefined;
  const selectedQubit =
    selection.type === 'qubit' ? circuit.qubits.find((qubit) => qubit.id === selection.qubitId) : undefined;
  const selectedDetector =
    selection.type === 'detector' ? findDetector(circuit, selection.detectorId) : undefined;
  const selectedObservable =
    selection.type === 'observable' ? findObservable(circuit, selection.observableId) : undefined;
  const selectedDetectorEvents = [...(selectedDetector?.events ?? [])].sort(compareMeasurementEvents);
  const selectedObservableEvents = [...(selectedObservable?.events ?? [])].sort(compareMeasurementEvents);

  return (
    <aside className="panel right-panel">
      <div className="panel-header">
        <h2>Tick Inspector</h2>
        <p>
          Navigate time layers and inspect the current operations. Role coloring is {colorByRole ? 'on' : 'off'}.
        </p>
      </div>

      <div className="tick-controls">
        <button
          type="button"
          className="secondary-button"
          onClick={() => onTickChange(Math.max(0, selectedTickIndex - 1))}
          disabled={selectedTickIndex === 0}
        >
          Previous
        </button>
        <div className="tick-counter">
          Tick <strong>{selectedTickIndex}</strong> / {maxTickIndex}
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => onTickChange(Math.min(maxTickIndex, selectedTickIndex + 1))}
          disabled={selectedTickIndex === maxTickIndex}
        >
          Next
        </button>
      </div>

      <input
        type="range"
        min={0}
        max={maxTickIndex}
        value={selectedTickIndex}
        onChange={(event) => onTickChange(Number(event.target.value))}
        disabled={maxTickIndex === 0}
      />

      <section className="operations-section">
        <div className="warnings-header">
          <h3>Operations In Tick</h3>
          <span>{tick?.instructions.length ?? 0}</span>
        </div>
        {!tick || tick.instructions.length === 0 ? (
          <p className="empty-state">No operations in this tick.</p>
        ) : (
          <ul className="operation-list">
            {tick.instructions.map((instruction) => {
              const linkedDetector =
                instruction.gate === 'DETECTOR'
                  ? findDetectorByInstructionId(circuit, instruction.id)
                  : undefined;
              const linkedObservable =
                instruction.gate === 'OBSERVABLE_INCLUDE'
                  ? findObservableByInstructionId(circuit, instruction.id)
                  : undefined;

              if (linkedDetector) {
                return (
                  <li key={instruction.id}>
                    <button
                      type="button"
                      className={[
                        'operation-item',
                        'detector-item',
                        selection.type === 'detector' && selection.detectorId === linkedDetector.id
                          ? 'selected'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => onSelectDetector(linkedDetector.id)}
                    >
                      <span className="operation-gate">{getDetectorLabel(circuit, linkedDetector.id)}</span>
                      <span className="operation-targets">
                        {formatDetectorEventSummary(linkedDetector.events)}
                      </span>
                      <span className="operation-line">line {instruction.lineNumber}</span>
                    </button>
                  </li>
                );
              }

              if (linkedObservable) {
                return (
                  <li key={instruction.id}>
                    <button
                      type="button"
                      className={[
                        'operation-item',
                        'observable-item',
                        selection.type === 'observable' && selection.observableId === linkedObservable.id
                          ? 'selected'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => onSelectObservable(linkedObservable.id)}
                    >
                      <span className="operation-gate">{getObservableLabel(linkedObservable)}</span>
                      <span className="operation-targets">
                        {formatDetectorEventSummary(linkedObservable.events)}
                      </span>
                      <span className="operation-line">line {instruction.lineNumber}</span>
                    </button>
                  </li>
                );
              }

              return (
                <li key={instruction.id}>
                  <button
                    type="button"
                    className={[
                      'operation-item',
                      selection.type === 'instruction' && selection.instructionId === instruction.id
                        ? 'selected'
                        : '',
                      instruction.handled ? '' : 'unhandled',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => onSelectInstruction(instruction.id)}
                  >
                    <span className="operation-gate">{instruction.gate}</span>
                    <span className="operation-targets">{instruction.targets.join(' ') || 'no targets'}</span>
                    <span className="operation-line">line {instruction.lineNumber}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="operations-section detector-section">
        <div className="warnings-header">
          <h3>Detectors / Observables</h3>
          <span>{circuit.detectors.length + circuit.observables.length}</span>
        </div>
        {circuit.detectors.length === 0 && circuit.observables.length === 0 ? (
          <p className="empty-state">No DETECTOR or OBSERVABLE_INCLUDE instructions were parsed.</p>
        ) : (
          <ul className="operation-list">
            {circuit.detectors.map((detector) => (
              <li key={detector.id}>
                <button
                  type="button"
                  className={[
                    'operation-item',
                    'detector-item',
                    selection.type === 'detector' && selection.detectorId === detector.id ? 'selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onSelectDetector(detector.id)}
                >
                  <span className="operation-gate">{getDetectorLabel(circuit, detector.id)}</span>
                  <span className="operation-targets">
                    {formatMeasurementGroupSummary(detector.events)}
                  </span>
                  <span className="operation-line">line {detector.lineNumber}</span>
                </button>
              </li>
            ))}
            {circuit.observables.map((observable) => (
              <li key={observable.id}>
                <button
                  type="button"
                  className={[
                    'operation-item',
                    'observable-item',
                    selection.type === 'observable' && selection.observableId === observable.id ? 'selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onSelectObservable(observable.id)}
                >
                  <span className="operation-gate">{getObservableLabel(observable)}</span>
                  <span className="operation-targets">
                    {observable.events.length} events · tick {observable.tickIndex}
                  </span>
                  <span className="operation-line">line {observable.lineNumber}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="details-section">
        <div className="warnings-header">
          <h3>Selection Details</h3>
        </div>
        {selectedQubit ? (
          <div className="detail-card">
            <div className="detail-title">Qubit {selectedQubit.id}</div>
            <div className="detail-line">Coordinates: ({selectedQubit.x}, {selectedQubit.y})</div>
            <div className="detail-line">Declared on line {selectedQubit.lineNumber}</div>
            <div className="detail-line">
              Inferred role: <span className={`role-pill ${selectedQubit.roleInference.role}`}>{selectedQubit.roleInference.role}</span>
            </div>
            <div className="detail-line">Measurements: {selectedQubit.stats.measurementCount}</div>
            <div className="detail-line">Mid-circuit measurements: {selectedQubit.stats.midCircuitMeasurementCount}</div>
            <div className="detail-line">Final-stage measurements: {selectedQubit.stats.finalMeasurementCount}</div>
            <div className="detail-line">Resets: {selectedQubit.stats.resetCount}</div>
            <div className="detail-line">Heuristic note: {selectedQubit.roleInference.reason}</div>
            <button type="button" className="link-button" onClick={() => onSelectQubit(selectedQubit.id)}>
              Keep qubit highlighted
            </button>
          </div>
        ) : null}

        {selectedInstruction ? (
          <div className="detail-card">
            <div className="detail-title">{selectedInstruction.gate}</div>
            <div className="detail-line">Tick: {selectedInstruction.tickIndex}</div>
            <div className="detail-line">Line: {selectedInstruction.lineNumber}</div>
            <div className="detail-line">Targets: {selectedInstruction.targets.join(' ') || 'none'}</div>
            {selectedInstruction.args.length > 0 ? (
              <div className="detail-line">Args: {selectedInstruction.args.join(', ')}</div>
            ) : null}
            <pre className="detail-raw">{selectedInstruction.rawText}</pre>
          </div>
        ) : null}

        {selectedDetector ? (
          <div className="detail-card">
            <div className="detail-title">Detector {getDetectorLabel(circuit, selectedDetector.id)}</div>
            <div className="detail-line">Line: {selectedDetector.lineNumber}</div>
            <div className="detail-line">
              Coordinates: {selectedDetector.coordinates.length > 0 ? selectedDetector.coordinates.join(', ') : 'none'}
            </div>
            <div className="detail-line">Events: {selectedDetector.events.length}</div>
            <div className="detail-line">Original rec targets: {selectedDetector.references.map((reference) => reference.rawTarget).join(' ') || 'none'}</div>
            <div className="detail-subtitle">Measurement Events</div>
            {selectedDetectorEvents.length === 0 ? (
              <p className="empty-state">No measurement events resolved for this detector.</p>
            ) : (
              <ul className="detector-event-list">
                {selectedDetectorEvents.map((event) => (
                  <li key={event.id} className="detector-event-item">
                    <button type="button" className="link-button detector-link" onClick={() => onSelectQubit(event.qubitId)}>
                      q{event.qubitId} @ t{event.tickIndex}
                    </button>
                    <span>m#{event.globalMeasurementIndex}</span>
                    <span>slot {event.measurementOrderWithinInstruction}</span>
                    <span>line {event.lineNumber}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {selectedObservable ? (
          <div className="detail-card observable-card">
            <div className="detail-title">Observable {getObservableLabel(selectedObservable)}</div>
            <div className="detail-line">Tick: {selectedObservable.tickIndex}</div>
            <div className="detail-line">Line: {selectedObservable.lineNumber}</div>
            <div className="detail-line">Events: {selectedObservable.events.length}</div>
            <div className="detail-line">
              Original rec targets: {selectedObservable.references.map((reference) => reference.rawTarget).join(' ') || 'none'}
            </div>
            <div className="detail-subtitle">Resolved Measurement Events</div>
            {selectedObservableEvents.length === 0 ? (
              <p className="empty-state">No measurement events resolved for this observable.</p>
            ) : (
              <ul className="detector-event-list">
                {selectedObservableEvents.map((event) => (
                  <li key={event.id} className="detector-event-item observable-event-item">
                    <button type="button" className="link-button detector-link" onClick={() => onSelectQubit(event.qubitId)}>
                      q{event.qubitId} @ t{event.tickIndex}
                    </button>
                    <span>m#{event.globalMeasurementIndex}</span>
                    <span>slot {event.measurementOrderWithinInstruction}</span>
                    <span>line {event.lineNumber}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {!selectedInstruction && !selectedQubit && !selectedDetector && !selectedObservable ? (
          <p className="empty-state">Click a qubit or operation to inspect it.</p>
        ) : null}
      </section>
    </aside>
  );
}
