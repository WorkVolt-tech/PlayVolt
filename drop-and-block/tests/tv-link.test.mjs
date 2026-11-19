import test from 'node:test';
import assert from 'node:assert/strict';
import { isTvPage, readTvLink, buildTvDisplayUrl, buildJoinUrl } from '../src/tvLink.js';

const loc = { origin:'https://preview.example', pathname:'/', search:'', hash:'' };
const code='A1B2C3';
const token='a'.repeat(64);
test('TV link holds the secret in its fragment, not its query', () => {
  const result = buildTvDisplayUrl(loc,code,token);
  const parsed = new URL(result);
  assert.equal(parsed.search,'?tv=A1B2C3');
  assert.equal(parsed.hash,'#'+token);
  assert.equal(parsed.search.includes(token),false);
  assert.deepEqual(readTvLink(parsed),{code,token});
});
test('invalid, absent, and malformed TV tokens fail closed', () => {
  assert.equal(readTvLink(new URL('https://preview.example/?tv=A1B2C3')),null);
  assert.equal(readTvLink(new URL('https://preview.example/?tv=A1B2C3#abc')),null);
  assert.equal(readTvLink(new URL('https://preview.example/?tv=XYZ999#'+token)),null);
  assert.equal(isTvPage(new URL('https://preview.example/?tv=A1B2C3')),true);
});
test('join link uses room code only, never viewer token', () => {
  const result = buildJoinUrl(new URL(buildTvDisplayUrl(loc,code,token)),code);
  assert.equal(result,'https://preview.example/?room=A1B2C3');
});
