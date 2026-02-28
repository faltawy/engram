export type InstallStatus = "installed" | "already_installed" | "updated";

export interface InstallResult {
  status: InstallStatus;
  skillPath: string;
  mcpConfigured: boolean;
  mcpConfigPath: string | null;
}

export interface ProviderInstaller {
  name: string;
  displayName: string;
  available: boolean;
  installGlobal(skillContent: string, dryRun: boolean): Promise<InstallResult>;
  installProject(
    skillContent: string,
    projectDir: string,
    dryRun: boolean
  ): Promise<InstallResult>;
}
