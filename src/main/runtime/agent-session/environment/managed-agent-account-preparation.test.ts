import { describe, expect, it } from 'vitest'
import { prepareManagedAgentAccount } from './managed-agent-account-preparation'

describe('managed session account resolution', () => {
  const services = {
    claude: {
      resolveManagedAccountHome: async (id: string) => {
        if (id !== 'claude-a') {
          throw new Error('Account no longer exists')
        }
        return 'C:/accounts/claude-a'
      },
      prepareManagedAccountForLaunch: async () => {
        throw new Error('Read must not prepare')
      }
    },
    codex: {
      resolveManagedAccountHome: (id: string) => {
        if (id !== 'codex-a') {
          throw new Error('Account no longer exists')
        }
        return 'C:/accounts/codex-a'
      },
      prepareForCodexLaunchAsync: async () => {
        throw new Error('Read must not prepare')
      }
    },
    prepareCodexLaunch: async () => {
      throw new Error('Read must not prepare')
    }
  }

  it('keeps provider account identities separate in read-only home resolution', async () => {
    expect(
      await prepareManagedAgentAccount(
        {
          account: { provider: 'claude', accountId: 'claude-a' },
          target: { hostId: 'local', runtime: 'host' },
          launchDirectory: 'C:/project',
          purpose: 'read'
        },
        services
      )
    ).toEqual({
      account: { provider: 'claude', accountId: 'claude-a' },
      home: 'C:/accounts/claude-a',
      env: { CLAUDE_CONFIG_DIR: 'C:/accounts/claude-a' }
    })
    expect(
      await prepareManagedAgentAccount(
        {
          account: { provider: 'codex', accountId: 'codex-a' },
          target: { hostId: 'local', runtime: 'host' },
          launchDirectory: 'C:/project',
          purpose: 'read'
        },
        services
      )
    ).toEqual({
      account: { provider: 'codex', accountId: 'codex-a' },
      home: 'C:/accounts/codex-a',
      env: { CODEX_HOME: 'C:/accounts/codex-a' }
    })
  })

  it('refuses missing accounts instead of returning an inherited account', async () => {
    await expect(
      prepareManagedAgentAccount(
        {
          account: { provider: 'codex', accountId: 'removed' },
          target: { hostId: 'local', runtime: 'host' },
          launchDirectory: 'C:/project',
          purpose: 'read'
        },
        services
      )
    ).rejects.toThrow('Account no longer exists')
  })

  it('refuses unsupported execution targets rather than reading local credentials for them', async () => {
    await expect(
      prepareManagedAgentAccount(
        {
          account: { provider: 'codex', accountId: 'codex-a' },
          target: { hostId: 'runtime:other', runtime: 'host' },
          launchDirectory: 'C:/project',
          purpose: 'read'
        },
        services
      )
    ).rejects.toThrow('not supported')
    await expect(
      prepareManagedAgentAccount(
        {
          account: { provider: 'claude', accountId: 'claude-a' },
          target: { hostId: 'local', runtime: 'wsl', wslDistro: 'Ubuntu' },
          launchDirectory: '/project',
          purpose: 'read'
        },
        services
      )
    ).rejects.toThrow('not supported')
  })
})
