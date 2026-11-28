import { expect, it } from 'vitest'
import { parseClaudeOAuthCredentialsJson } from './claude-oauth-credentials'

it('reads the stored access token expiry as epoch ms and ignores a null one', () => {
  const read = (expiresAt: number | null) =>
    parseClaudeOAuthCredentialsJson(
      JSON.stringify({
        claudeAiOauth: { accessToken: 'token', refreshToken: 'refresh', expiresAt }
      }),
      'credentials-file'
    ).accessTokenExpiresAt

  expect([read(1_795_000_000_000), read(null)]).toEqual([1_795_000_000_000, undefined])
})
