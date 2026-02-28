import { claudeProvider } from "./claude.ts";
import type { ProviderInstaller } from "./types.ts";

const providers: Record<string, ProviderInstaller> = {
  claude: claudeProvider,
};

export function getProvider(name: string): ProviderInstaller | undefined {
  return providers[name];
}

export const availableProviders = Object.values(providers);
