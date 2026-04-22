import type { StimExample } from '../types/stim';
import toyExample from '../examples/toy.stim?raw';
import surfacePatchExample from '../examples/surface-patch.stim?raw';
import cxScheduleExample from '../examples/cx-schedule.stim?raw';

export const STIM_EXAMPLES: StimExample[] = [
  {
    id: 'toy',
    name: 'Tiny Toy Circuit',
    description: 'A compact three-qubit example with coordinates, ticks, and a measurement.',
    text: toyExample,
  },
  {
    id: 'surface-patch',
    name: 'Surface Patch Slice',
    description: 'A small surface-code-like scheduling fragment without repeat expansion.',
    text: surfacePatchExample,
  },
  {
    id: 'cx-schedule',
    name: 'CX Scheduling Demo',
    description: 'A gate-heavy example that makes two-qubit timing patterns easy to inspect.',
    text: cxScheduleExample,
  },
];
