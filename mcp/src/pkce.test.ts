import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { verifyPkce } from './pkce.js'

test('verifyPkce accepts a matching S256 challenge/verifier pair', () => {
  const verifier = 'a'.repeat(64)
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  assert.equal(verifyPkce(verifier, challenge), true)
})

test('verifyPkce rejects a non-matching pair', () => {
  assert.equal(verifyPkce('a'.repeat(64), 'not-the-right-challenge'), false)
})
