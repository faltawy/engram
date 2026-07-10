import type { CognitiveConfig } from "../config/defaults.ts";

// B_i = ln(Σ t_j^{-d}) — ages are elapsed units since each access
// (seconds in wall mode, agent events in agent mode)
export function baseLevelFromAges(ages: number[], decayRate: number): number {
  if (ages.length === 0) return -Infinity;

  let sum = 0;
  for (const age of ages) {
    sum += Math.pow(Math.max(age, 0.001), -decayRate);
  }

  return Math.log(sum);
}

export function baseLevelActivation(
  accessTimestamps: number[],
  now: number,
  decayRate: number,
): number {
  return baseLevelFromAges(
    accessTimestamps.map((ts) => (now - ts) / 1000),
    decayRate,
  );
}

// S_ji = S - ln(fan_j)
export function spreadingActivationStrength(maxStrength: number, fanCount: number): number {
  if (fanCount <= 0) return 0;
  return Math.max(0, maxStrength - Math.log(fanCount));
}

// A_i = B_i + Σ(W_j · S_ji) + ε
export function totalActivation(baseLevel: number, spreadingSum: number, noise: number): number {
  return baseLevel + spreadingSum + noise;
}

export function activationNoise(stddev: number): number {
  if (stddev === 0) return 0;
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return z * stddev;
}

export function canRetrieve(activation: number, threshold: number): boolean {
  return activation > threshold;
}

// Time = F · e^{-f · A_i}
export function retrievalLatency(
  activation: number,
  latencyFactor: number,
  latencyExponent: number,
): number {
  return latencyFactor * Math.exp(-latencyExponent * activation);
}

export interface ActivationBreakdown {
  activation: number;
  baseLevel: number;
  spreading: number;
  noise: number;
  latency: number;
}

export function computeActivationFromAges(
  ages: number[],
  config: CognitiveConfig,
  options?: {
    spreadingSum?: number;
    noiseOverride?: number;
    emotionWeight?: number;
  },
): ActivationBreakdown {
  const baseLevel = baseLevelFromAges(ages, config.decayRate);

  const emotionBoost = options?.emotionWeight
    ? Math.log(1 + options.emotionWeight * config.emotionalBoostFactor)
    : 0;

  const spreading = options?.spreadingSum ?? 0;
  const noise = options?.noiseOverride ?? activationNoise(config.activationNoise);

  const activation = totalActivation(baseLevel + emotionBoost, spreading, noise);
  const latency = retrievalLatency(activation, config.latencyFactor, config.latencyExponent);

  return {
    activation,
    baseLevel: baseLevel + emotionBoost,
    spreading,
    noise,
    latency,
  };
}

export function computeActivation(
  accessTimestamps: number[],
  now: number,
  config: CognitiveConfig,
  options?: {
    spreadingSum?: number;
    noiseOverride?: number;
    emotionWeight?: number;
  },
): ActivationBreakdown {
  return computeActivationFromAges(
    accessTimestamps.map((ts) => (now - ts) / 1000),
    config,
    options,
  );
}
