export type PromptOptimizationProfileName = 'smoke' | 'pilot' | 'full';

export interface PromptOptimizationProfile {
  name: PromptOptimizationProfileName;
  rounds: number;
  baselineRuns: number;
  heldInCount: number;
  heldOutCount: number;
  costCeilingUsd: number;
}

const PROMPT_OPTIMIZATION_PROFILES: Record<PromptOptimizationProfileName, PromptOptimizationProfile> = {
  smoke: {
    name: 'smoke',
    rounds: 1,
    baselineRuns: 1,
    heldInCount: 2,
    heldOutCount: 1,
    costCeilingUsd: 0.5,
  },
  pilot: {
    name: 'pilot',
    rounds: 3,
    baselineRuns: 1,
    heldInCount: 12,
    heldOutCount: 4,
    costCeilingUsd: 2,
  },
  full: {
    name: 'full',
    rounds: 10,
    baselineRuns: 3,
    heldInCount: 60,
    heldOutCount: 20,
    costCeilingUsd: 30,
  },
};

export function resolvePromptOptimizationProfile(
  rawProfile: string | undefined,
): PromptOptimizationProfile {
  const name = rawProfile === undefined || rawProfile.trim() === ''
    ? 'pilot'
    : rawProfile.trim().toLowerCase();
  if (name !== 'smoke' && name !== 'pilot' && name !== 'full') {
    throw new Error(`MAKA_PROMPT_PROFILE must be one of smoke, pilot, full, got ${JSON.stringify(rawProfile)}`);
  }
  return PROMPT_OPTIMIZATION_PROFILES[name];
}
