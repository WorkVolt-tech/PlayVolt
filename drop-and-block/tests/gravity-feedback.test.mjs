import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyGravityShift,SHIFT_EVERY} from '../src/arcadeModes.js';
import {lastMoveCell,winningCells} from '../src/boardFeedback.js';

test('Gravity Shift moves every four drops and compacts rows before falling',()=>{
  assert.equal(SHIFT_EVERY,4);
  const width=7,height=6,board=Array(width*height).fill(0);
  board[5*width+2]=1;
  board[5*width+4]=2;
  board[4*width+2]=1;
  board[4*width+4]=2;
  const left=applyGravityShift(board,width,height,'left');
  assert.deepEqual(left.slice(5*width),[1,2,0,0,0,0,0]);
  assert.deepEqual(left.slice(4*width,5*width),[1,2,0,0,0,0,0]);
  const right=applyGravityShift(board,width,height,'right');
  assert.deepEqual(right.slice(5*width),[0,0,0,0,0,1,2]);
  assert.deepEqual(right.slice(4*width,5*width),[0,0,0,0,0,1,2]);
});

test('Online Gravity Shift highlights the winning player even if someone else triggered the shift',()=>{
 const width=7,height=6,board=Array(width*height).fill(0);
 board[5*width+1]=1;
 board[5*width+2]=1;
 board[5*width+3]=1;
 board[5*width+4]=1;
 const shiftedMove={seat:2,column:6,row:5,kind:'drop',shifted:true,shiftDirection:'left'};
 assert.deepEqual(winningCells(board,width,height,1,'gravity',shiftedMove,4),[36,37,38,39]);
 assert.equal(lastMoveCell(board,width,height,shiftedMove),null);
});

test('Normal chip highlighting is unchanged when Gravity Shift did not activate',()=>{
 const width=7,height=6,board=Array(width*height).fill(0);
 const move={seat:1,column:3,row:5,kind:'drop',shifted:false};
 board[5*width+3]=1;
 assert.equal(lastMoveCell(board,width,height,move),38);
 assert.deepEqual(winningCells(board,width,height,1,'gravity',move,4),[]);
});

test('Replay detects a shifted win from recorded event metadata',()=>{
 const width=7,height=6,board=Array(width*height).fill(0);
 for(let x=1;x<=4;x++)board[5*width+x]=1;
 const replayMove={seat:2,column:6,row:5,kind:'drop',event:'🌪 GRAVITY SHIFT LEFT! Player 1 wins after the shift!'};
 assert.deepEqual(winningCells(board,width,height,1,'gravity',replayMove,4),[36,37,38,39]);
 assert.equal(lastMoveCell(board,width,height,replayMove),null);
});
