import { OrcaRuntimeWithTerminalDrivers } from '../driver/terminal-driver-resources'
import { confirmRunTerminalShellAlone, readRunTerminalClientUse } from './run-terminal-client-use'

export abstract class OrcaRuntimeWithTerminalClientUse extends OrcaRuntimeWithTerminalDrivers {
  readTerminalClientUse(ptyId: string): 'used' | 'unused' | 'unknown' {
    return readRunTerminalClientUse(this, ptyId)
  }

  confirmTerminalShellAlone(ptyId: string): Promise<boolean> {
    return confirmRunTerminalShellAlone(this.ptyController, ptyId)
  }
}
