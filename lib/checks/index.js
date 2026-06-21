import { agentInstructions } from './agent-instructions.js';
import { testRunnability } from './test-runnability.js';
import { setupReproducibility } from './setup-reproducibility.js';
import { docsStructure } from './docs-structure.js';
import { repoHygiene } from './repo-hygiene.js';
import { ciConfig } from './ci-config.js';
import { instructionsAccuracy } from './instructions-accuracy.js';

// Weights sum to 100 for readability; the runner normalizes regardless.
export const allChecks = [
  agentInstructions,
  testRunnability,
  setupReproducibility,
  docsStructure,
  repoHygiene,
  ciConfig,
  instructionsAccuracy,
];
