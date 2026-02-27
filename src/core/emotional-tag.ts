import { Emotion } from "./memory.ts";

const EMOTION_WEIGHTS: Record<Emotion, number> = {
  anxiety: 0.8,
  frustration: 0.6,
  surprise: 0.7,
  joy: 0.5,
  satisfaction: 0.4,
  curiosity: 0.3,
  neutral: 0.0,
};

export function defaultEmotionWeight(emotion: Emotion): number {
  return EMOTION_WEIGHTS[emotion] ?? 0.0;
}

export function isValidEmotion(s: string): s is Emotion {
  return (Object.values(Emotion) as string[]).includes(s);
}
