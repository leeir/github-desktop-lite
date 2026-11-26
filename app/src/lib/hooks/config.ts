import { enableHooksByDefault, enableHooksEnvironment } from '../feature-flag'
import { getBoolean, setBoolean } from '../local-storage'

export const defaultHooksEnvEnabledValue = enableHooksByDefault()

/**
 * Whether the hooks environment is enabled, takes into account the
 * `enableHooksEnvironment` feature flag.
 */
export const getHooksEnvEnabled = () =>
  enableHooksEnvironment() &&
  getBoolean('git-hooks-env-enabled', defaultHooksEnvEnabledValue)

export const setHooksEnvEnabled = (enabled: boolean): void =>
  setBoolean('git-hooks-env-enabled', enabled)

/** The hook environment is always cached; it is no longer a setting. */
export const getCacheHooksEnv = () => true

/**
 * The shell used to load the hook environment. Only Windows offers a choice
 * upstream; on macOS the login shell is used whatever this says.
 */
export const getGitHookEnvShell = (): SupportedHooksEnvShell => 'git-bash'

export const shellFriendlyNames: Readonly<
  Record<SupportedHooksEnvShell, string>
> = {
  'git-bash': 'Git Bash',
  pwsh: 'PowerShell Core',
  powershell: 'Windows PowerShell',
  cmd: 'Command Prompt',
}

export type SupportedHooksEnvShell = 'git-bash' | 'pwsh' | 'powershell' | 'cmd'
