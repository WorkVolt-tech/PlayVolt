import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addFriendByUsername } from '../../src/social/friends.js';

test('adds by the shared username, trimming spaces without changing spelling', async () => {
  const result = await addFriendByUsername('  Maxo  ', async (fn, args) => {
    assert.equal(fn, 'friend_request_by_nickname');
    assert.deepEqual(args, { p_nickname: 'Maxo' });
    return 'sent';
  });
  assert.equal(result.ok, true);
});

test('empty usernames do not send a request', async () => {
  const result = await addFriendByUsername('   ', () => assert.fail('Unexpected request'));
  assert.equal(result.ok, false);
});

test('username errors and existing friendship states give clear feedback', async () => {
  for (const reply of ['no such player', "that's you"]) {
    const result = await addFriendByUsername('Maxo', async () => reply);
    assert.equal(result.ok, false);
    assert.match(result.message, /username/);
    assert.doesNotMatch(result.message, /code/);
  }
  for (const reply of ['now friends', 'already friends', 'already sent']) {
    assert.equal((await addFriendByUsername('Maxo', async () => reply)).ok, true);
  }
  assert.equal((await addFriendByUsername('Maxo', async () => 'unexpected')).ok, false);
});
