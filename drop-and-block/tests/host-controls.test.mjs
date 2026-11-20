import test from 'node:test';
import assert from 'node:assert/strict';
import {isNoContest,isClosedLobby,canCloseLobby,canEndStalled,canRematch} from '../src/hostControls.js';
test('lobby can be closed only by its host',()=>{
 assert.equal(canCloseLobby({host:true,status:'lobby'}),true);
 assert.equal(canCloseLobby({host:false,status:'lobby'}),false);
 assert.equal(canCloseLobby({host:true,status:'playing'}),false);
});
test('host cannot end an active game until server verifies abandonment',()=>{
 assert.equal(canEndStalled({host:true,status:'playing',canNoContest:true}),true);
 assert.equal(canEndStalled({host:true,status:'playing',canNoContest:false}),false);
 assert.equal(canEndStalled({host:false,status:'playing',canNoContest:true}),false);
 assert.equal(canEndStalled({host:true,status:'cancelled',canNoContest:true}),false);
});
test('No Contest rematches, closed lobbies do not',()=>{
 const voided={host:true,status:'cancelled',endReason:'stalled_no_contest'};
 const closed={host:true,status:'cancelled',endReason:'closed_lobby'};
 assert.equal(isNoContest(voided),true);
 assert.equal(isClosedLobby(voided),false);
 assert.equal(isClosedLobby(closed),true);
 assert.equal(canRematch(voided),true);
 assert.equal(canRematch(closed),false);
 assert.equal(canRematch({...voided,host:false}),false);
 assert.equal(canRematch({host:true,status:'finished'}),true);
});
