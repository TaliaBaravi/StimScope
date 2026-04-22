import type {
  Detector,
  DetectorReference,
  MeasurementEvent,
  ObservableInclude,
  ParsedCircuit,
  ParsedInstruction,
  ParseWarning,
  Qubit,
  QubitRole,
  QubitRoleInference,
  QubitStats,
  Tick,
} from '../types/stim';

const SUPPORTED_GATES = new Set([
  'QUBIT_COORDS',
  'TICK',
  'R',
  'H',
  'M',
  'MR',
  'CX',
  'CZ',
  'DETECTOR',
  'OBSERVABLE_INCLUDE',
  'X_ERROR',
  'Y_ERROR',
  'Z_ERROR',
  'DEPOLARIZE1',
  'DEPOLARIZE2',
]);

const TWO_QUBIT_GATES = new Set(['CX', 'CZ', 'DEPOLARIZE2']);
const MEASUREMENT_GATES = new Set(['M', 'MR']);
const RESET_GATES = new Set(['R', 'MR']);

function parseNumberList(rawArgs: string | undefined): number[] {
  if (!rawArgs) {
    return [];
  }

  return rawArgs
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value));
}

function parseTargets(rawTargets: string): Array<number | string> {
  if (!rawTargets.trim()) {
    return [];
  }

  return rawTargets
    .trim()
    .split(/\s+/)
    .map((token) => {
      const parsed = Number(token);
      return Number.isInteger(parsed) ? parsed : token;
    });
}

function pushWarning(
  warnings: ParseWarning[],
  message: string,
  lineNumber: number | undefined,
  severity: ParseWarning['severity'] = 'warning',
): void {
  warnings.push({ message, lineNumber, severity });
}

function buildInstruction(
  gate: string,
  args: number[],
  targets: Array<number | string>,
  rawText: string,
  lineNumber: number,
  tickIndex: number,
  handled: boolean,
): ParsedInstruction {
  const qubitTargets = targets.filter((target): target is number => typeof target === 'number');
  const targetPairs: Array<[number, number]> = [];

  if (TWO_QUBIT_GATES.has(gate)) {
    for (let i = 0; i < qubitTargets.length - 1; i += 2) {
      targetPairs.push([qubitTargets[i], qubitTargets[i + 1]]);
    }
  }

  let kind: ParsedInstruction['kind'] = 'single';
  if (gate === 'QUBIT_COORDS') {
    kind = 'coords';
  } else if (gate === 'DETECTOR') {
    kind = 'detector';
  } else if (gate === 'OBSERVABLE_INCLUDE') {
    kind = 'observable';
  } else if (gate === 'TICK') {
    kind = 'tick';
  } else if (!handled) {
    kind = 'unhandled';
  } else if (targetPairs.length > 0) {
    kind = 'two-qubit';
  }

  return {
    id: `${tickIndex}:${lineNumber}:${gate}:${rawText}`,
    gate,
    targets,
    qubitTargets,
    targetPairs,
    args,
    rawText,
    tickIndex,
    lineNumber,
    handled,
    kind,
  };
}

function finalizeTick(ticks: Tick[], instructions: ParsedInstruction[], index: number): Tick[] {
  ticks.push({
    index,
    instructions: [...instructions],
  });
  instructions.length = 0;
  return ticks;
}

function detectTickConflicts(
  ticks: Tick[],
  qubitsById: Map<number, Qubit>,
  warnings: ParseWarning[],
): void {
  for (const tick of ticks) {
    const usage = new Map<number, number>();

    for (const instruction of tick.instructions) {
      for (const qubitId of instruction.qubitTargets) {
        usage.set(qubitId, (usage.get(qubitId) ?? 0) + 1);

        if (!qubitsById.has(qubitId)) {
          pushWarning(
            warnings,
            `Tick ${tick.index} uses qubit ${qubitId}, but it has no QUBIT_COORDS entry.`,
            instruction.lineNumber,
          );
        }
      }
    }

    for (const [qubitId, count] of usage) {
      if (count > 1) {
        pushWarning(
          warnings,
          `Tick ${tick.index} touches qubit ${qubitId} in ${count} operations. This may indicate a scheduling conflict.`,
          undefined,
        );
      }
    }
  }
}

function createEmptyQubitStats(): QubitStats {
  return {
    measurementCount: 0,
    midCircuitMeasurementCount: 0,
    finalMeasurementCount: 0,
    resetCount: 0,
    measurementTicks: [],
    resetTicks: [],
  };
}

function inferQubitRole(stats: QubitStats): QubitRoleInference {
  let role: QubitRole = 'unknown';
  let reason = 'The measurement and reset pattern is mixed, so this qubit stays unclassified.';

  if (stats.midCircuitMeasurementCount >= 1 && stats.measurementCount >= 2) {
    role = 'ancilla';
    reason = 'Measured multiple times including mid-circuit, which is typical of an ancilla or measurement qubit.';
  } else if (stats.resetCount >= 2) {
    role = 'ancilla';
    reason = 'Reset multiple times during the circuit, which is typical of an ancilla or measurement qubit.';
  } else if (stats.measurementCount === 0) {
    role = 'data';
    reason = 'Never measured, so it is conservatively treated as data-like.';
  } else if (stats.midCircuitMeasurementCount === 0 && stats.finalMeasurementCount >= 1) {
    role = 'data';
    reason = 'Measured only in the final measurement stage, which is typical of a data qubit readout.';
  }

  return {
    role,
    reason,
    confidenceLabel: 'heuristic',
  };
}

function applyQubitRoleInference(qubitsById: Map<number, Qubit>, ticks: Tick[]): void {
  const statsById = new Map<number, QubitStats>();
  for (const qubitId of qubitsById.keys()) {
    statsById.set(qubitId, createEmptyQubitStats());
  }

  let finalMeasurementTick = -1;
  for (const tick of ticks) {
    if (tick.instructions.some((instruction) => MEASUREMENT_GATES.has(instruction.gate))) {
      finalMeasurementTick = tick.index;
    }
  }

  for (const tick of ticks) {
    for (const instruction of tick.instructions) {
      for (const qubitId of instruction.qubitTargets) {
        const stats = statsById.get(qubitId);
        if (!stats) {
          continue;
        }

        if (MEASUREMENT_GATES.has(instruction.gate)) {
          stats.measurementCount += 1;
          if (!stats.measurementTicks.includes(tick.index)) {
            stats.measurementTicks.push(tick.index);
          }

          if (tick.index === finalMeasurementTick) {
            stats.finalMeasurementCount += 1;
          } else {
            stats.midCircuitMeasurementCount += 1;
          }
        }

        if (RESET_GATES.has(instruction.gate)) {
          stats.resetCount += 1;
          if (!stats.resetTicks.includes(tick.index)) {
            stats.resetTicks.push(tick.index);
          }
        }
      }
    }
  }

  for (const qubit of qubitsById.values()) {
    qubit.stats = statsById.get(qubit.id) ?? createEmptyQubitStats();
    qubit.roleInference = inferQubitRole(qubit.stats);
  }
}

function buildMeasurementEvents(
  ticks: Tick[],
  warnings: ParseWarning[],
): MeasurementEvent[] {
  const measurementTicks = ticks
    .filter((tick) => tick.instructions.some((instruction) => MEASUREMENT_GATES.has(instruction.gate)))
    .map((tick) => tick.index);
  const roundIndexByTick = new Map(measurementTicks.map((tickIndex, index) => [tickIndex, index]));

  const events: MeasurementEvent[] = [];
  let sequenceIndex = 0;

  for (const tick of ticks) {
    for (const instruction of tick.instructions) {
      if (!MEASUREMENT_GATES.has(instruction.gate)) {
        continue;
      }

      for (const [measurementOrderWithinInstruction, qubitId] of instruction.qubitTargets.entries()) {
        events.push({
          id: `meas:${sequenceIndex}:${instruction.id}:${qubitId}`,
          globalMeasurementIndex: sequenceIndex,
          measurementOrderWithinInstruction,
          qubitId,
          tickIndex: instruction.tickIndex,
          roundIndex: roundIndexByTick.get(instruction.tickIndex),
          lineNumber: instruction.lineNumber,
          instructionId: instruction.id,
          gate: instruction.gate,
        });
        sequenceIndex += 1;
      }
    }
  }

  if (events.length === 0) {
    pushWarning(warnings, 'No measurement events were found, so detector references cannot resolve to qubits.', undefined, 'info');
  }

  return events;
}

function parseRecReferences(targets: Array<number | string>): DetectorReference[] {
  return targets
    .filter((target): target is string => typeof target === 'string')
    .map((target) => {
      const match = target.match(/^rec\[(-?\d+)\]$/);
      return {
        rawTarget: target,
        recOffset: match ? Number(match[1]) : Number.NaN,
      };
    });
}

function resolveRecReferences(
  references: DetectorReference[],
  measurementsSeen: MeasurementEvent[],
  lineNumber: number,
  warnings: ParseWarning[],
  ownerName: string,
): MeasurementEvent[] {
  const events: MeasurementEvent[] = [];

  for (const reference of references) {
    if (!Number.isInteger(reference.recOffset) || reference.recOffset >= 0) {
      pushWarning(
        warnings,
        `${ownerName} target "${reference.rawTarget}" is not a supported rec[-k] reference.`,
        lineNumber,
      );
      continue;
    }

    const event = measurementsSeen[measurementsSeen.length + reference.recOffset];
    if (!event) {
      pushWarning(
        warnings,
        `${ownerName} reference "${reference.rawTarget}" could not be resolved to an earlier measurement event.`,
        lineNumber,
      );
      continue;
    }

    reference.measurementEventId = event.id;
    events.push(event);
  }

  return events;
}

function buildResolvedMeasurementGroups(
  ticks: Tick[],
  warnings: ParseWarning[],
): {
  detectors: Detector[];
  observables: ObservableInclude[];
  measurementEvents: MeasurementEvent[];
} {
  const measurementEvents = buildMeasurementEvents(ticks, warnings);
  const measurementsSeen: MeasurementEvent[] = [];
  const detectors: Detector[] = [];
  const observables: ObservableInclude[] = [];
  let measurementCursor = 0;

  for (const tick of ticks) {
    for (const instruction of tick.instructions) {
      if (MEASUREMENT_GATES.has(instruction.gate)) {
        for (let index = 0; index < instruction.qubitTargets.length; index += 1) {
          const event = measurementEvents[measurementCursor];
          if (event) {
            measurementsSeen.push(event);
          }
          measurementCursor += 1;
        }
        continue;
      }

      if (instruction.gate !== 'DETECTOR' && instruction.gate !== 'OBSERVABLE_INCLUDE') {
        continue;
      }

      const references = parseRecReferences(instruction.targets);
      const events = resolveRecReferences(
        references,
        measurementsSeen,
        instruction.lineNumber,
        warnings,
        instruction.gate,
      );

      if (instruction.gate === 'DETECTOR') {
        detectors.push({
          id: `det:${instruction.tickIndex}:${instruction.lineNumber}`,
          lineNumber: instruction.lineNumber,
          coordinates: instruction.args,
          instructionId: instruction.id,
          references,
          events: [...events].sort((a, b) => a.globalMeasurementIndex - b.globalMeasurementIndex),
        });
      } else {
        observables.push({
          id: `obs:${instruction.tickIndex}:${instruction.lineNumber}`,
          observableIndex: instruction.args[0] ?? observables.length,
          tickIndex: instruction.tickIndex,
          lineNumber: instruction.lineNumber,
          instructionId: instruction.id,
          references,
          events: [...events].sort((a, b) => a.globalMeasurementIndex - b.globalMeasurementIndex),
        });
      }
    }
  }

  return { detectors, observables, measurementEvents };
}

export function parseStimCircuit(rawText: string): ParsedCircuit {
  const warnings: ParseWarning[] = [];
  const qubitsById = new Map<number, Qubit>();
  const ticks: Tick[] = [];
  const unsupportedInstructions: ParsedInstruction[] = [];
  const currentTickInstructions: ParsedInstruction[] = [];

  // Stage 1 keeps a lightweight, loss-tolerant pass over raw Stim so unsupported
  // lines still remain inspectable in the UI instead of aborting the whole parse.
  let currentTickIndex = 0;

  const lines = rawText.replace(/\r\n/g, '\n').split('\n');

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const originalText = line;
    const withoutComment = line.replace(/#.*/, '').trim();

    if (!withoutComment) {
      return;
    }

    if (withoutComment === 'TICK') {
      finalizeTick(ticks, currentTickInstructions, currentTickIndex);
      currentTickIndex += 1;
      return;
    }

    if (withoutComment === '{' || withoutComment === '}') {
      const instruction = buildInstruction(
        withoutComment,
        [],
        [],
        originalText,
        lineNumber,
        currentTickIndex,
        false,
      );
      currentTickInstructions.push(instruction);
      unsupportedInstructions.push(instruction);
      pushWarning(warnings, `Unsupported block token "${withoutComment}" was preserved as text only.`, lineNumber);
      return;
    }

    const match = withoutComment.match(/^([A-Z_][A-Z0-9_]*)(?:\(([^)]*)\))?(?:\s+(.*))?$/);

    if (!match) {
      const instruction = buildInstruction(
        'UNPARSED',
        [],
        [],
        originalText,
        lineNumber,
        currentTickIndex,
        false,
      );
      currentTickInstructions.push(instruction);
      unsupportedInstructions.push(instruction);
      pushWarning(warnings, 'Could not parse this line. It was preserved as an unhandled instruction.', lineNumber);
      return;
    }

    const [, gate, rawArgs, rawTargets = ''] = match;
    const args = parseNumberList(rawArgs);
    const targets = parseTargets(rawTargets);
    const handled = SUPPORTED_GATES.has(gate);
    const instruction = buildInstruction(
      gate,
      args,
      targets,
      originalText,
      lineNumber,
      currentTickIndex,
      handled,
    );

    if (!handled) {
      unsupportedInstructions.push(instruction);
      pushWarning(
        warnings,
        `Instruction "${gate}" is not supported yet. It will still appear in the tick list.`,
        lineNumber,
      );
    }

    if (gate === 'REPEAT') {
      pushWarning(
        warnings,
        'REPEAT blocks are not expanded in stage 1. The block header is preserved, and nested lines are shown once.',
        lineNumber,
      );
    }

    if (gate === 'QUBIT_COORDS') {
      const qubitId = instruction.qubitTargets[0];
      if (qubitId === undefined) {
        pushWarning(warnings, 'QUBIT_COORDS is missing its qubit target.', lineNumber);
      } else if (args.length < 2) {
        pushWarning(warnings, 'QUBIT_COORDS must include at least x and y coordinates.', lineNumber);
      } else {
        qubitsById.set(qubitId, {
          id: qubitId,
          x: args[0],
          y: args[1],
          coordText: rawArgs ?? '',
          lineNumber,
          stats: createEmptyQubitStats(),
          roleInference: {
            role: 'unknown',
            reason: 'No heuristic role has been computed yet.',
            confidenceLabel: 'heuristic',
          },
        });
      }
    } else {
      // Spatial metadata is stored on qubits; all other lines become tick-scoped instructions.
      if (gate === 'CX' || gate === 'CZ' || gate === 'DEPOLARIZE2') {
        if (instruction.qubitTargets.length % 2 !== 0) {
          pushWarning(
            warnings,
            `${gate} expects an even number of qubit targets, but line ${lineNumber} has ${instruction.qubitTargets.length}.`,
            lineNumber,
          );
        }
      }

      currentTickInstructions.push(instruction);
    }
  });

  finalizeTick(ticks, currentTickInstructions, currentTickIndex);

  if (qubitsById.size === 0) {
    pushWarning(
      warnings,
      'No QUBIT_COORDS instructions were found. The circuit can be listed, but it cannot be placed spatially.',
      undefined,
    );
  }

  detectTickConflicts(ticks, qubitsById, warnings);
  applyQubitRoleInference(qubitsById, ticks);
  const { detectors, observables, measurementEvents } = buildResolvedMeasurementGroups(ticks, warnings);

  return {
    rawText,
    qubits: [...qubitsById.values()].sort((a, b) => a.id - b.id),
    ticks,
    warnings,
    unsupportedInstructions,
    measurementEvents,
    detectors,
    observables,
  };
}
