// Forgot password: the checks that run before anything is sent.
import { test } from 'node:test'
import assert from 'node:assert/strict'

globalThis.location ??= { origin: 'https://dekabess.example', hash: '' }
const { checkNewPassword, looksLikeEmail, RESET_SENT, resetLinkTarget } = await import('../src/lib/passwordRules.js')

test('a new password needs 6+ characters, typed the same twice', () => {
  assert.match(checkNewPassword('abc', 'abc'), /at least 6/)
  assert.match(checkNewPassword('abcdef', 'abcdeg'), /don’t match/)
  assert.equal(checkNewPassword('abcdef', 'abcdef'), null)
})

test('asking for a link needs a real-looking email (checked before anything is sent)', () => {
  for (const bad of ['', 'nephew', 'a@b', '  ']) assert.equal(looksLikeEmail(bad), false, bad)
  assert.equal(looksLikeEmail(' nephew@example.com '), true)
})

test('the answer never says whether an account exists; the link comes back to this site', () => {
  assert.doesNotMatch(RESET_SENT, /no account|not found|unknown/i)
  assert.equal(resetLinkTarget(), 'https://dekabess.example/auth?reset=1')
})
