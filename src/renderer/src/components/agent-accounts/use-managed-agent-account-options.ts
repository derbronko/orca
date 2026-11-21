import { useEffect, useState } from 'react'
import type { ManagedAgentAccountOptions } from './agent-account-preference-fields'

const EMPTY_OPTIONS: ManagedAgentAccountOptions = { claude: [], codex: [] }

export function useManagedAgentAccountOptions(enabled: boolean): {
  options: ManagedAgentAccountOptions
  loading: boolean
  error: string | null
} {
  const [options, setOptions] = useState(EMPTY_OPTIONS)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    if (!enabled) {
      setOptions(EMPTY_OPTIONS)
      setLoading(false)
      setError(null)
      return () => {
        current = false
      }
    }
    setLoading(true)
    setError(null)
    void Promise.allSettled([
      window.api.claudeAccounts.list(),
      window.api.codexAccounts.list()
    ]).then(([claude, codex]) => {
      if (!current) {
        return
      }
      const next: ManagedAgentAccountOptions = { claude: [], codex: [] }
      const errors: string[] = []
      if (claude.status === 'fulfilled') {
        next.claude = claude.value.accounts
          .filter(
            (account) =>
              !account.needsSignIn &&
              !account.runsOnSystemDefault &&
              account.managedAuthRuntime !== 'wsl'
          )
          .map((account) => ({ id: account.id, label: account.email || account.id }))
      } else {
        errors.push(claude.reason instanceof Error ? claude.reason.message : String(claude.reason))
      }
      if (codex.status === 'fulfilled') {
        next.codex = codex.value.accounts
          .filter((account) => account.managedHomeRuntime !== 'wsl')
          .map((account) => ({ id: account.id, label: account.email || account.id }))
      } else {
        errors.push(codex.reason instanceof Error ? codex.reason.message : String(codex.reason))
      }
      setOptions(next)
      setError(errors.length ? errors.join(' ') : null)
      setLoading(false)
    })
    return () => {
      current = false
    }
  }, [enabled])

  return {
    options: enabled ? options : EMPTY_OPTIONS,
    loading: enabled && loading,
    error: enabled ? error : null
  }
}
