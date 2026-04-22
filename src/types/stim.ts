export type WarningSeverity = 'info' | 'warning';

export interface ParseWarning {
  message: string;
  lineNumber?: number;
  severity: WarningSeverity;
}

export interface Qubit {
  id: number;
  x: number;
  y: number;
  coordText: string;
  lineNumber: number;
  stats: QubitStats;
  roleInference: QubitRoleInference;
}

export type QubitRole = 'data' | 'ancilla' | 'unknown';

export interface QubitStats {
  measurementCount: number;
  midCircuitMeasurementCount: number;
  finalMeasurementCount: number;
  resetCount: number;
  measurementTicks: number[];
  resetTicks: number[];
}

export interface QubitRoleInference {
  role: QubitRole;
  reason: string;
  confidenceLabel: 'heuristic';
}

export type InstructionKind =
  | 'single'
  | 'two-qubit'
  | 'coords'
  | 'tick'
  | 'detector'
  | 'observable'
  | 'unhandled';

export interface ParsedInstruction {
  id: string;
  gate: string;
  targets: Array<number | string>;
  qubitTargets: number[];
  targetPairs: Array<[number, number]>;
  args: number[];
  rawText: string;
  tickIndex: number;
  lineNumber: number;
  handled: boolean;
  kind: InstructionKind;
}

export interface MeasurementEvent {
  id: string;
  globalMeasurementIndex: number;
  measurementOrderWithinInstruction: number;
  qubitId: number;
  tickIndex: number;
  roundIndex?: number;
  lineNumber: number;
  instructionId: string;
  gate: string;
}

export interface DetectorReference {
  rawTarget: string;
  recOffset: number;
  measurementEventId?: string;
}

export interface Detector {
  id: string;
  lineNumber: number;
  coordinates: number[];
  instructionId: string;
  references: DetectorReference[];
  events: MeasurementEvent[];
}

export interface ObservableInclude {
  id: string;
  observableIndex: number;
  tickIndex: number;
  lineNumber: number;
  instructionId: string;
  references: DetectorReference[];
  events: MeasurementEvent[];
}

export interface Tick {
  index: number;
  instructions: ParsedInstruction[];
}

export interface ParsedCircuit {
  rawText: string;
  qubits: Qubit[];
  ticks: Tick[];
  warnings: ParseWarning[];
  unsupportedInstructions: ParsedInstruction[];
  measurementEvents: MeasurementEvent[];
  detectors: Detector[];
  observables: ObservableInclude[];
}

export type SelectionState =
  | { type: 'none' }
  | { type: 'qubit'; qubitId: number }
  | { type: 'instruction'; instructionId: string; pairIndex?: number }
  | { type: 'detector'; detectorId: string }
  | { type: 'observable'; observableId: string };

export interface StimExample {
  id: string;
  name: string;
  description: string;
  text: string;
}
