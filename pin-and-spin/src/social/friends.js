// The shared PlayVolt friends list (same as Dekabess). These are Dekabess's own database
// functions, called with the player's sign-in exactly as Dekabess does; Pin & Spin doesn't
// change them. Game invites go through the pin-and-spin server instead (migration 011).
import { getSupabase } from '../game/auth.js';
import { callGame } from '../game/api.js';

async function rpc(fn, args) {
  const sb = await getSupabase();
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error('Could not reach your friends list. Try again.');
  return data;
}
export const myFriends = () => rpc('my_friends');
export const myFriendCode = () => rpc('my_friend_code');
export const respondFriend = (id, accept) => rpc('friend_respond', { p_id: id, p_accept: accept });
// Dekabess's friend_request_* functions answer with a short phrase.
export const FRIEND_REPLIES = {
  sent: [true, 'Friend request sent! They’ll see it next time they open a PlayVolt game.'],
  'now friends': [true, 'You’re now friends! 🎉'],
  'already friends': [true, 'You’re already friends.'],
  'already sent': [true, 'Request already sent. Waiting for them to accept.'],
  'no such player': [false, 'No player has that friend code.'],
  "that's you": [false, 'That’s your own friend code!'],
  'sign in first': [false, 'Sign in first.'],
};
export async function addFriendByCode(code) {
  const reply = String(await rpc('friend_request_by_code', { p_code: code }) || '');
  const [ok, message] = FRIEND_REPLIES[reply] || [false, 'Could not send the request. Try again.'];
  return { ok, message };
}
// "Online" = seen in a PlayVolt game in the last 3 minutes.
export const isOnline = (f) => Boolean(f.last_seen) && Date.now() - new Date(f.last_seen).getTime() < 3 * 60 * 1000;
export const friendLink = (code) => `${location.origin}/?friend=${encodeURIComponent(code)}`;

export const inviteFriend = (friend, code) => callGame('invite_friend', {}, { friend, code });
export const myInvites = () => callGame('my_invites', {}, {});
export const respondInvite = (id, accept) => callGame('invite_respond', {}, { id, accept });
