import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TileFace from '../components/TileFace'
import { db } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import './Puzzle.css'
import { checkPuzzleShape, PUZZLE_COUNT } from '../lib/shapeUnlocks'

const BASICS = [
  {
    id: 'legal-1',
    title: 'Find the Legal Move',
    lesson: 'A domino can be played when one side matches an open end.',
    ends: [6, 3],
    hand: [[6, 2], [5, 1], [4, 4], [0, 2]],
    best: '6-2',
    valid: ['6-2'],
    feedback: { '6-2': 'Correct. The board has an open 6, so 6-2 can connect to it.' },
  },
  {
    id: 'legal-2',
    title: 'Two Ways In',
    lesson: 'Check both open ends before deciding that you cannot play.',
    ends: [2, 5],
    hand: [[6, 6], [2, 4], [5, 0], [3, 1]],
    best: '2-4',
    valid: ['2-4', '5-0'],
    feedback: {
      '2-4': 'Correct. 2-4 matches the left end. 5-0 was legal too.',
      '5-0': 'Correct. 5-0 matches the right end. 2-4 was legal too.',
    },
  },
  {
    id: 'double-1',
    title: 'Spot the Double',
    lesson: 'A double has the same number on both halves. It still follows the same matching rule.',
    ends: [4, 1],
    hand: [[4, 4], [6, 2], [3, 5], [0, 0]],
    best: '4-4',
    valid: ['4-4'],
    feedback: { '4-4': 'Correct. 4-4 is a double and it connects to the open 4.' },
  },
  {
    id: 'legal-3',
    title: 'Do You Have a Move?',
    lesson: 'Sometimes more than one tile is legal. Your first job is recognizing every option.',
    ends: [1, 6],
    hand: [[1, 3], [6, 5], [2, 2], [4, 0]],
    best: '1-3',
    valid: ['1-3', '6-5'],
    feedback: {
      '1-3': 'Correct. 1-3 matches the open 1. 6-5 also matches the open 6.',
      '6-5': 'Correct. 6-5 matches the open 6. 1-3 also matches the open 1.',
    },
  },
  {
    id: 'pass-1',
    title: 'No Pile Left: Pass or Play?',
    lesson: 'In Dekabess, you knock only when you cannot match either open end and there is no tile left to draw.',
    ends: [3, 4],
    hand: [[6, 6], [5, 2], [1, 0], [2, 2]],
    best: 'PASS',
    valid: ['PASS'],
    feedback: { PASS: 'Correct. None of your tiles contain a 3 or a 4, and no draw pile is available, so you must knock/pass. If nobody at the table can play, the round is blocked and lowest pips wins.' },
  },
]

const CONTROL = [
  {
    id: 'control-1',
    title: 'Keep Your Strong Number',
    lesson: 'When you hold several tiles from the same suit, try to keep that number available.',
    ends: [5, 2],
    hand: [[5, 5], [5, 4], [5, 1], [2, 6], [3, 0]],
    best: '5-5',
    valid: ['5-5', '5-4', '5-1', '2-6'],
    feedback: {
      '5-5': 'Best move. The double keeps 5 alive, and you still hold two more 5s. You are controlling that suit.',
      '5-4': 'Legal, but weaker. You keep a 5 in your hand, yet you give up some of your control instead of establishing the double.',
      '5-1': 'Legal, but weaker. You are spending one of the 5s that gives your hand its strength.',
      '2-6': 'Legal, but it abandons your strongest suit. You hold three 5s, so the 5 side is where your leverage is.',
    },
  },
  {
    id: 'control-2',
    title: 'Do Not Open Your Weak Suit',
    lesson: 'A legal move can still be dangerous if it leaves a number you cannot answer later.',
    ends: [6, 3],
    hand: [[6, 4], [6, 1], [3, 2], [4, 5], [4, 0]],
    best: '6-4',
    valid: ['6-4', '6-1', '3-2'],
    feedback: {
      '6-4': 'Best move. It turns the 6 into a 4, and you still own two more 4s. That gives you a better chance to answer the board again.',
      '6-1': 'Legal, but risky. You open a 1 and have no other 1 in your hand.',
      '3-2': 'Legal, but risky. You open a 2 and have no backup 2.',
    },
  },
  {
    id: 'control-3',
    title: 'Preserve Your Escape',
    lesson: 'Try not to spend the only tile that can rescue a difficult part of your hand.',
    ends: [4, 6],
    hand: [[4, 2], [4, 1], [6, 3], [2, 5], [2, 0]],
    best: '4-2',
    valid: ['4-2', '4-1', '6-3'],
    feedback: {
      '4-2': 'Best move. It opens 2, and you still have two tiles that can answer a 2 later. Your hand stays connected.',
      '4-1': 'Legal, but the 1 is isolated. If the table stays on 1, you have no second tile to continue with.',
      '6-3': 'Legal, but it opens 3 with no backup 3 in your hand.',
    },
  },
  {
    id: 'control-4',
    title: 'Use the Double at the Right Time',
    lesson: 'Do not dump a double automatically. Here it is strongest because it keeps a number you already control on the table.',
    ends: [3, 1],
    hand: [[3, 3], [3, 5], [3, 0], [1, 6], [5, 2]],
    best: '3-3',
    valid: ['3-3', '3-5', '3-0', '1-6'],
    feedback: {
      '3-3': 'Best move here. The double leaves 3 open while you still hold two more 3s, so this is a good moment to use it.',
      '3-5': 'Legal, but you are spending a 3 without using your strongest control piece.',
      '3-0': 'Legal, but the blank side gives you no backup path in this hand.',
      '1-6': 'Legal, but it moves away from the suit you dominate.',
    },
  },
  {
    id: 'control-5',
    title: 'Control Without Getting Stuck',
    lesson: 'Good control also means keeping your remaining tiles connected to one another.',
    ends: [2, 5],
    hand: [[2, 4], [2, 1], [5, 4], [4, 4], [4, 6]],
    best: '2-4',
    valid: ['2-4', '2-1', '5-4'],
    feedback: {
      '2-4': 'Best move. It opens 4, the number that connects three of your remaining tiles. That gives your hand several follow-up routes.',
      '2-1': 'Legal, but it leaves 1 open with no other 1 to support it.',
      '5-4': 'Good move, but 2-4 is stronger because it preserves 5-4 while still opening the 4 suit you dominate.',
    },
  },
]

const BLOCKING = [
  {
    id: 'block-1',
    title: 'Punish the Pass',
    lesson: 'A pass gives you real information. Use a different open end to bring the weak number back onto the table.',
    clue: 'No tiles are left to draw. Your opponent passed when the open ends were 2 and 5. The board is now 4 and 6.',
    ends: [4, 6],
    hand: [[6, 2], [4, 1], [6, 3], [1, 5]],
    best: '6-2',
    valid: ['6-2', '4-1', '6-3'],
    feedback: {
      '6-2': 'Best move. You play on the 6 and OPEN 2. Your opponent already showed they could not answer a 2, so you are bringing a known weakness back onto the table.',
      '4-1': 'Legal, but it opens 1 — a number you have no information about.',
      '6-3': 'Legal, but it opens 3 instead of using the weakness revealed by the earlier pass.',
    },
  },
  {
    id: 'block-2',
    title: 'Close the Door',
    lesson: 'When you know an opponent is weak in a number, steer an open end back to that number when you can.',
    clue: 'No tiles are left to draw. Earlier, your opponent passed on open ends 4 and 1. Current ends: 6 and 4.',
    ends: [6, 4],
    hand: [[6, 1], [6, 5], [4, 2], [2, 1]],
    best: '6-1',
    valid: ['6-1', '6-5', '4-2'],
    feedback: {
      '6-1': 'Best move. Playing 6-1 on the 6 opens 1 — one of the numbers the opponent already failed to answer.',
      '6-5': 'Legal, but 5 gives your opponent a fresh number with no known weakness.',
      '4-2': 'Legal, but it opens 2 and moves away from the information you already have.',
    },
  },
  {
    id: 'block-3',
    title: 'Bring the Weak Number Back',
    lesson: 'Matching a weak number removes it from that end. To pressure it, try to OPEN that number from the other end.',
    clue: 'No tiles are left to draw. Your opponent previously passed while 3 was open. Current ends: 5 and 6.',
    ends: [5, 6],
    hand: [[5, 3], [6, 2], [6, 4], [3, 1]],
    best: '5-3',
    valid: ['5-3', '6-2', '6-4'],
    feedback: {
      '5-3': 'Best move. You match the 5 and leave 3 open. That attacks the number your opponent already showed they could not play, and you still hold 3-1 as a follow-up.',
      '6-2': 'Legal, but it opens 2 and ignores the known weakness on 3.',
      '6-4': 'Legal, but it opens 4 and gives the opponent a fresh route.',
    },
  },
  {
    id: 'block-4',
    title: 'Read Two Passes',
    lesson: 'Repeated passes make a weakness especially useful when you can deliberately reopen that number.',
    clue: 'No tiles are left to draw. The opponent passed once on 0/4 and later on 4/6. Current ends: 2 and 6.',
    ends: [2, 6],
    hand: [[2, 4], [6, 5], [2, 1], [4, 5]],
    best: '2-4',
    valid: ['2-4', '6-5', '2-1'],
    feedback: {
      '2-4': 'Best move. You play on 2 and OPEN 4. Four is the number that appeared in both of the opponent’s passes, so this directly tests their clearest weakness.',
      '6-5': 'Legal, but it opens 5 — a number the pass history tells you nothing about.',
      '2-1': 'Legal, but it opens 1 instead of reopening the repeatedly missed 4.',
    },
  },
  {
    id: 'block-5',
    title: 'Block Without Trapping Yourself',
    lesson: 'The best pressure move attacks a known weakness while keeping a connection in your own hand.',
    clue: 'No tiles are left to draw. Your opponent passed when 5 was open. Current ends: 3 and 6.',
    ends: [3, 6],
    hand: [[3, 5], [6, 2], [3, 1], [5, 2], [2, 4]],
    best: '3-5',
    valid: ['3-5', '6-2', '3-1'],
    feedback: {
      '3-5': 'Best move. You play on 3 and OPEN 5, the opponent’s known weak number. You also keep 5-2 as a follow-up, so the pressure does not disconnect your own hand.',
      '6-2': 'Legal, but it opens 2 and lets the known weakness on 5 stay off the table.',
      '3-1': 'Legal, but it opens 1 and gives you no advantage from the earlier pass.',
    },
  },
]

const MEMORY = [
  {
    id: 'memory-1',
    title: 'Count the Suit',
    lesson: 'Strong players remember which numbers have already appeared.',
    sequence: [[6,4], [4,2], [2,5], [5,1]],
    question: 'How many tiles in the sequence contained a 4?',
    options: ['1', '2', '3', '4'],
    best: '2',
    feedback: 'Correct. The 6-4 and 4-2 both contained a 4, so two 4-tiles were played.',
  },
  {
    id: 'memory-2',
    title: 'Remember the Double',
    lesson: 'Doubles are easy landmarks. Remembering them helps you track what is still unseen.',
    sequence: [[3,6], [6,6], [6,1], [1,5], [5,2]],
    question: 'Which double was played?',
    options: ['3-3', '5-5', '6-6', '2-2'],
    best: '6-6',
    feedback: 'Correct. 6-6 appeared second in the sequence.',
  },
  {
    id: 'memory-3',
    title: 'What Came Before?',
    lesson: 'Remember the order of play, not only the numbers.',
    sequence: [[1,4], [4,4], [4,6], [6,2], [2,0]],
    question: 'Which tile was played immediately before 6-2?',
    options: ['1-4', '4-4', '4-6', '2-0'],
    best: '4-6',
    feedback: 'Correct. The order was 1-4, 4-4, 4-6, 6-2, then 2-0.',
  },
  {
    id: 'memory-4',
    title: 'Track the Sixes',
    lesson: 'Counting a suit helps you judge how many of that number may still be hidden in other hands.',
    sequence: [[6,3], [3,1], [1,6], [6,5], [5,0], [0,2]],
    question: 'How many played tiles contained a 6?',
    options: ['1', '2', '3', '4'],
    best: '3',
    feedback: 'Correct. 6-3, 1-6 and 6-5 each contained a 6.',
  },
  {
    id: 'memory-5',
    title: 'Missing From the Table',
    lesson: 'Notice what has not appeared. Missing numbers can be just as useful as played numbers.',
    sequence: [[0,1], [1,3], [3,5], [5,6], [6,2]],
    question: 'Which number never appeared anywhere in the sequence?',
    options: ['2', '3', '4', '6'],
    best: '4',
    feedback: 'Correct. Every number except 4 appeared at least once.',
  },
]

const READ_PLAYER = [
  {
    id: 'read-1',
    title: 'What Did the Pass Tell You?',
    lesson: 'A pass removes possibilities from an opponent’s hand.',
    clue: 'No tiles are left to draw. The open ends were 2 and 5. Your opponent passed.',
    question: 'What is the strongest conclusion?',
    options: [
      'They hold no 2s and no 5s — and can’t get one this round',
      'They definitely have a double',
      'They have only high tiles left',
      'They must be holding 6-6',
    ],
    best: 'They hold no 2s and no 5s — and can’t get one this round',
    feedback: 'Correct. With nothing left to draw, nobody can pick up a new tile. So a pass on 2 and 5 means they hold no tile with a 2 or a 5 — and that stays true for the rest of the round. It says nothing about their other numbers.',
  },
  {
    id: 'read-2',
    title: 'Which Side Should You Attack?',
    lesson: 'Use known weaknesses instead of guessing.',
    clue: 'Your opponent passed earlier on 3. Current open ends are 3 and 6.',
    question: 'Which open end should you try to preserve?',
    options: ['3', '6', 'Either one — the pass means nothing', 'Neither — always change both'],
    best: '3',
    feedback: 'Correct. The earlier pass makes 3 the more valuable pressure point.',
  },
  {
    id: 'read-3',
    title: 'Separate Fact From Guess',
    lesson: 'Good table reading means knowing what you truly learned and what is only speculation.',
    clue: 'No tiles are left to draw. An opponent passed when the ends were 1 and 4.',
    question: 'Which statement is actually supported by that pass?',
    options: [
      'They have no 1s and no 4s for the rest of the round',
      'They have no doubles at all',
      'Their highest tile is a 5',
      'They are saving a 6 for later',
    ],
    best: 'They have no 1s and no 4s for the rest of the round',
    feedback: 'Correct. With nothing to draw, the pass proves they hold no 1s and no 4s — for the whole round. Doubles, their highest tile or their plans are only guesses.',
  },
  {
    id: 'read-4',
    title: 'Read the Pattern',
    lesson: 'Repeated behavior can make a clue stronger.',
    clue: 'No tiles are left to draw. The same opponent passed once on 4/0 and later on 4/6.',
    question: 'Which number looks like their clearest weakness?',
    options: ['0', '4', '6', 'There is no useful clue'],
    best: '4',
    feedback: 'Correct. 4 is the shared number across both passes, so it is the clearest repeated weakness.',
  },
  {
    id: 'read-5',
    title: 'Plan From the Read',
    lesson: 'The goal is not just noticing a weakness — it is using it on your next move.',
    clue: 'No tiles are left to draw. Your opponent passed when 5 was open. The current ends are 3 and 6, and you can play either 3-5 or 6-2.',
    question: 'Which play better uses what you learned?',
    options: ['3-5', '6-2', 'Pass', 'Either move is identical'],
    best: '3-5',
    feedback: 'Correct. Playing 3-5 on the 3 OPENS 5 again, bringing the opponent’s known weakness back onto the table.',
  },
]

const FINISH_HAND = [
  {
    id: 'finish-1',
    title: 'Keep the Chain Connected',
    lesson: 'Near the end, think about whether today’s move leaves a path for the tiles still in your hand.',
    clue: 'Open ends: 6 and 3. You have four tiles left. One move keeps three of your remaining tiles linked together.',
    ends: [6, 3],
    hand: [[6, 4], [6, 1], [4, 2], [2, 5]],
    best: '6-4',
    valid: ['6-4', '6-1'],
    feedback: {
      '6-4': 'Best move. It opens 4, which connects directly to 4-2, and that can lead into 2-5. Your remaining hand has a clear route.',
      '6-1': 'Legal, but it opens an isolated 1. None of your other tiles contain a 1, so your hand becomes harder to unload.',
    },
  },
  {
    id: 'finish-2',
    title: 'Do Not Strand the Double',
    lesson: 'A double can become dead weight if you remove the number it needs from the open ends.',
    clue: 'Open ends: 4 and 1. You still hold the 4-4 double.',
    ends: [4, 1],
    hand: [[4, 2], [1, 4], [4, 4], [2, 6]],
    best: '1-4',
    valid: ['4-2', '1-4', '4-4'],
    feedback: {
      '1-4': 'Best move. Playing on 1 opens 4, so your 4-4 stays immediately playable while the 4 suit remains alive.',
      '4-2': 'Legal, but it removes the 4 from that end and opens 2. The other end is still 1, so your 4-4 may become difficult to release.',
      '4-4': 'Legal, but using the double now is not as flexible as first turning the 1 end into another 4.',
    },
  },
  {
    id: 'finish-3',
    title: 'Set Up Your Last Tile',
    lesson: 'With only a few tiles left, try to leave an end that matches the tile you want to finish with.',
    clue: 'Open ends: 5 and 2. Your goal is to make 6-3 easier to unload after the rest of your hand.',
    ends: [5, 2],
    hand: [[5, 6], [2, 4], [4, 3], [6, 3]],
    best: '5-6',
    valid: ['5-6', '2-4'],
    feedback: {
      '5-6': 'Best move. It opens 6, giving your 6-3 a live connection while you still have a separate 2-4 → 4-3 route on the other side.',
      '2-4': 'Legal, but it opens 4 first and leaves the 6-3 with no immediate connection to either open end.',
    },
  },
  {
    id: 'finish-4',
    title: 'Watch Your Pips',
    lesson: 'If the table jams, Dekabess awards the blocked round to the player with the fewest pips left.',
    clue: 'No tiles are left to draw and the table looks close to blocking. You can shed either 6-5 or 2-1 right now.',
    ends: [6, 2],
    hand: [[6, 5], [2, 1], [5, 4], [1, 0]],
    best: '6-5',
    valid: ['6-5', '2-1'],
    feedback: {
      '6-5': 'Best move for a possible block. It removes 11 pips from your hand instead of only 3, lowering the total you would be stuck holding if the table jams.',
      '2-1': 'Legal, but it sheds only 3 pips. When a block looks possible, getting heavy tiles out can decide the round.',
    },
  },
  {
    id: 'finish-5',
    title: 'Spot the Dekabess Finish',
    lesson: 'A Dekabess happens when your LAST non-double tile matches both open ends at once. It counts as 2 wins toward the streak.',
    clue: 'Open ends: 6 and 3. You have two tiles left. One move keeps those same ends available so your last tile can match BOTH.',
    ends: [6, 3],
    hand: [[6, 6], [6, 3]],
    best: '6-6',
    valid: ['6-6', '6-3'],
    feedback: {
      '6-6': 'Best move. Playing 6-6 on the 6 keeps that end at 6, while the other end remains 3. That leaves 6-3 as your final tile, matching BOTH open ends for a Dekabess.',
      '6-3': 'Legal, but playing 6-3 now changes one of the ends and uses up the tile that could have been your last-tile Dekabess.',
    },
  },
]

const TABLE_RULES = [
  {
    id: 'rules-1',
    title: 'Who Opens the First Round?',
    lesson: 'The first deal has a special opening rule.',
    clue: 'It is round 1 and the 6-6 is in a player’s hand.',
    question: 'Who must open, and with what?',
    options: [
      'The player holding 6-6 must open with 6-6',
      'Seat 0 may open with any tile',
      'The player with the fewest pips opens',
      'Anyone may open with any double',
    ],
    best: 'The player holding 6-6 must open with 6-6',
    feedback: 'Correct. On the first round, the 6-6 holder opens and must lead the 6-6.',
  },
  {
    id: 'rules-2',
    title: 'What If 6-6 Is in the Pile?',
    lesson: 'Pile games use the highest double that was actually dealt.',
    clue: 'It is the first round of a pile game. The 6-6 is face down in the pile. The highest double in any hand is 5-5.',
    question: 'Which tile opens the round?',
    options: ['5-5', '6-6 after someone draws it', 'Any tile from seat 0', 'The highest non-double'],
    best: '5-5',
    feedback: 'Correct. If 6-6 is in the pile, the highest double in a player’s hand opens, and that double is the required opening tile.',
  },
  {
    id: 'rules-3',
    title: 'Who Opens the Next Round?',
    lesson: 'After the first round, the previous round’s winner controls the next lead.',
    clue: 'The first round is over. Seat 2 won it.',
    question: 'Who starts the next round, and what may they lead?',
    options: [
      'Seat 2, with any tile in their hand',
      'Whoever has 6-6, with 6-6',
      'Seat 0, with any tile',
      'The player with the lowest pip total',
    ],
    best: 'Seat 2, with any tile in their hand',
    feedback: 'Correct. Later rounds are opened by the previous round’s winner, and they may choose any tile from their hand.',
  },
  {
    id: 'rules-4',
    title: 'Draw, Knock, or Play?',
    lesson: 'A pile changes what happens when you have no legal move.',
    clue: 'You cannot match either open end, but there are still face-down tiles in the pile.',
    question: 'What must happen next?',
    options: [
      'Draw one tile',
      'Knock immediately',
      'Skip the rest of the round',
      'Take the lowest-pip tile from another player',
    ],
    best: 'Draw one tile',
    feedback: 'Correct. In a pile game, you draw one tile at a time while you have no playable tile. You only knock after the pile is empty and you still cannot play.',
  },
  {
    id: 'rules-5',
    title: 'Who Wins a Blocked Round?',
    lesson: 'When nobody can play either end and the pile is empty, pip count decides the round.',
    clue: 'The table is blocked. Remaining pip totals are: You 11, Player 2 has 8, Player 3 has 15, Player 4 has 19.',
    question: 'Who wins the round?',
    options: ['You with 11', 'Player 2 with 8', 'Player 3 with 15', 'Player 4 with 19'],
    best: 'Player 2 with 8',
    feedback: 'Correct. A blocked round goes to the player with the fewest pips left in hand. If pip totals tie, the earlier seat wins the tie.',
  },
  {
    id: 'rules-6',
    title: 'Five Doubles',
    lesson: 'A very double-heavy opening hand can be reshuffled in non-partner games.',
    clue: 'Before the first tile is played, you hold 5 doubles in Chien Manjé Chien.',
    question: 'What option does Dekabess give you?',
    options: [
      'Call a reshuffle or choose to play on',
      'Automatically win the round',
      'Trade one double with each opponent',
      'Score a Dekabess immediately',
    ],
    best: 'Call a reshuffle or choose to play on',
    feedback: 'Correct. With 5 or more doubles, you may call a reshuffle before the first tile or keep the hand. This offer is not used in partner games.',
  },
  {
    id: 'rules-7',
    title: 'Dekabess and the Streak',
    lesson: 'A true Dekabess is a last-tile finish that matches both open ends at once.',
    clue: 'Your final tile is 6-3. The open ends are 6 and 3.',
    question: 'What does that finish count as?',
    options: [
      'A Dekabess worth 2 wins toward the streak',
      'A normal round win worth 1',
      'An automatic Vyèj no matter the streak',
      'A blocked-round win',
    ],
    best: 'A Dekabess worth 2 wins toward the streak',
    feedback: 'Correct. Because the last non-double tile matches both open ends at once, it is a Dekabess and adds 2 to the current streak.',
  },
  {
    id: 'rules-8',
    title: 'How a Vyèj Is Reached',
    lesson: 'Matches are won by building a round-winning streak.',
    clue: 'Your current streak is 3. You win the next round normally.',
    question: 'What happens?',
    options: [
      'Your streak reaches 4 and you win by Vyèj',
      'Your streak resets to 1',
      'You need one more Dekabess specifically',
      'Only the pip total matters now',
    ],
    best: 'Your streak reaches 4 and you win by Vyèj',
    feedback: 'Correct. A normal round adds 1 to your streak. Reaching 4 wins the match by Vyèj. In Asosyé, partners share the same team streak.',
  },
]

const PARTNER_PLAY = [
  {
    id: 'partner-1',
    title: 'Know Your Partner',
    lesson: 'Asosyé is played by two teams of two, with partners sitting across from each other.',
    clueLabel: 'TEAM BASICS',
    clue: 'You are sitting in seat 0.',
    question: 'Which seat is your partner?',
    options: ['Seat 1', 'Seat 2', 'Seat 3', 'There is no fixed partner seat'],
    best: 'Seat 2',
    feedback: 'Correct. In Asosyé, seats 0 and 2 are partners, while seats 1 and 3 form the other team.',
    wrong: 'In Asosyé your partner is always the player directly across from you.',
  },
  {
    id: 'partner-2',
    title: 'One Team, One Streak',
    lesson: 'Partners share the same streak toward the Vyèj.',
    clueLabel: 'TEAM SCORE',
    clue: 'Your team has a streak of 2. Your partner wins the next round normally.',
    question: 'What happens to your team streak?',
    options: ['It becomes 3', 'It stays 2', 'Your partner starts a separate streak at 1', 'It resets to 0'],
    best: 'It becomes 3',
    feedback: 'Correct. A normal round win by either partner adds 1 to the same team streak.',
    wrong: 'In Asosyé, you and your partner do not build separate streaks. The team shares one.',
  },
  {
    id: 'partner-3',
    title: 'A Partner Dekabess Counts for Both',
    lesson: 'A Dekabess won by either partner adds 2 to the shared team streak.',
    clueLabel: 'TEAM SCORE',
    clue: 'Your team streak is 2. Your partner goes out with a valid Dekabess.',
    question: 'What is the team streak now?',
    options: ['2', '3', '4 — Vyèj', 'The streak belongs only to your partner'],
    best: '4 — Vyèj',
    feedback: 'Correct. The partner’s Dekabess adds 2 to the shared streak, taking the team from 2 to 4 and winning the match by Vyèj.',
    wrong: 'A Dekabess is worth 2 toward the shared team streak, no matter which partner makes it.',
  },
  {
    id: 'partner-4',
    title: 'Read Your Partner’s Knock',
    lesson: 'A partner’s knock is useful information too: it tells you which numbers your team is missing.',
    clueLabel: 'TEAM READ',
    clue: 'In Asosyé all 28 tiles are dealt, so there is no pile. Your partner knocks when the open ends are 2 and 6.',
    question: 'What should you remember?',
    options: [
      'Your partner has no 2s and no 6s for the rest of the round',
      'Your partner has no doubles',
      'Your partner must be holding only blanks',
      'Your partner is out of the round',
    ],
    best: 'Your partner has no 2s and no 6s for the rest of the round',
    feedback: 'Correct. With no pile, nobody can ever pick up a new tile — so your partner holds no 2s and no 6s for the whole round. Plan with it: an end showing a 2 or a 6 is one your partner can never answer.',
    wrong: 'With no pile, a knock is permanent: that player holds none of those numbers for the rest of the round. It says nothing about their other tiles.',
  },
  {
    id: 'partner-5',
    title: 'Help the Partner Who Is Close',
    lesson: 'In team play, the best move is not always the one that improves your own hand most. A partner going out wins the round for your team.',
    clueLabel: 'TEAM DECISION',
    clue: 'Your partner has only 1 tile left. You have 5. The current ends are 4 and 6. From earlier play, your partner has repeatedly kept 4 alive and has never knocked on 4.',
    question: 'What is the stronger team idea?',
    options: [
      'Try to keep or reopen 4 for your partner',
      'Ignore your partner and only reduce your own pip count',
      'Always force the board away from 4',
      'Knock even if you have a legal move',
    ],
    best: 'Try to keep or reopen 4 for your partner',
    feedback: 'Correct. You cannot see your partner’s hand, but their play pattern and one remaining tile make 4 a useful team clue. Helping a partner go out wins the round for both of you.',
    wrong: 'Asosyé rewards team position. When your partner is one tile from going out, their likely playable number can matter more than improving only your own hand.',
  },
  {
    id: 'partner-6',
    title: 'Do Not Feed the Opponent',
    lesson: 'Team reading means tracking both your partner and the two opponents.',
    clueLabel: 'TEAM READ',
    clue: 'Opponent in seat 1 knocked earlier on 5. Your partner in seat 2 has shown strength on 3. You can steer the table toward either 5 or 3.',
    question: 'Which direction usually gives your team the better position?',
    options: [
      'Toward 3, supporting your partner',
      'Toward 5, because the opponent knocked on it',
      'Either is always identical',
      'You should pass instead',
    ],
    best: 'Toward 3, supporting your partner',
    feedback: 'Correct. An opponent weakness can be useful, but Asosyé also rewards keeping your partner playable. With your partner showing strength on 3, supporting that route can help your team finish the round.',
    wrong: 'In partner play, do not evaluate only the opponent. Your partner’s ability to keep playing is part of the position too.',
  },
]

const MASTERY = [
  {
    id: 'master-1',
    title: 'Pressure Without Losing Control',
    lesson: 'Strong play often combines a table read with keeping your own hand connected.',
    clue: 'No tiles are left to draw. Seat 1 previously knocked on 4. Current ends are 6 and 2.',
    ends: [6, 2],
    hand: [[6, 4], [6, 1], [2, 5], [4, 5], [4, 0]],
    best: '6-4',
    valid: ['6-4', '6-1', '2-5'],
    feedback: {
      '6-4': 'Best move. It opens 4 against a known weakness, and you still hold two more 4s. You pressure the opponent without disconnecting your own hand.',
      '6-1': 'Legal, but it opens an unsupported 1 and ignores the information from the earlier knock.',
      '2-5': 'Legal, but it opens 5 and gives up the chance to attack the known weakness on 4.',
    },
  },
  {
    id: 'master-2',
    title: 'Play for the Block',
    lesson: 'When a jam is close, pip weight can matter more than keeping the prettiest-looking chain.',
    clue: 'No tiles are left to draw and two players have already knocked during this stretch. A block looks likely.',
    ends: [6, 2],
    hand: [[6, 5], [2, 1], [5, 0], [1, 0]],
    best: '6-5',
    valid: ['6-5', '2-1'],
    feedback: {
      '6-5': 'Best move. You shed 11 pips immediately. If the table jams soon, that can be the difference between winning and losing the blocked round.',
      '2-1': 'Legal, but it removes only 3 pips. With a block close, the heavy tile is the greater liability.',
    },
  },
  {
    id: 'master-3',
    title: 'Protect the Dekabess Route',
    lesson: 'A strong endgame plan can be worth more than taking the most obvious tile now.',
    clue: 'Open ends are 6 and 3. You have three tiles left and want to preserve a possible 6-3 Dekabess finish.',
    ends: [6, 3],
    hand: [[6, 6], [3, 2], [6, 3]],
    best: '6-6',
    valid: ['6-6', '3-2', '6-3'],
    feedback: {
      '6-6': 'Best move. It keeps the 6 end at 6 and leaves the 3 end untouched, preserving 6-3 as a possible last-tile Dekabess.',
      '3-2': 'Legal, but it changes the 3 end to 2 and removes the exact two-ended setup 6-3 needs.',
      '6-3': 'Legal, but it spends the tile that could have produced the Dekabess finish.',
    },
  },
  {
    id: 'master-4',
    title: 'Team Before Self',
    lesson: 'In Asosyé, your move should sometimes favor the partner who is closest to ending the round.',
    clue: 'Asosyé. Your partner has 1 tile left and has shown strength on 4. Current ends are 6 and 2.',
    ends: [6, 2],
    hand: [[6, 4], [6, 1], [2, 5], [1, 5]],
    best: '6-4',
    valid: ['6-4', '6-1', '2-5'],
    feedback: {
      '6-4': 'Best team move. It opens 4, the number your one-tile partner has been showing strength on. If they can go out, your team wins the round.',
      '6-1': 'Legal, but it improves only your own path and does not help the partner who is one tile from finishing.',
      '2-5': 'Legal, but it steers away from the strongest clue you have about your partner’s last tile.',
    },
  },
  {
    id: 'master-5',
    title: 'Do Not Waste the Double',
    lesson: 'A double is strongest when the number it controls is useful now and still supported afterward.',
    clue: 'Current ends are 5 and 1. You control several 5s, but only one move keeps that control while preserving follow-up tiles.',
    ends: [5, 1],
    hand: [[5, 5], [5, 3], [5, 0], [1, 6], [3, 2]],
    best: '5-5',
    valid: ['5-5', '5-3', '5-0', '1-6'],
    feedback: {
      '5-5': 'Best move. It keeps 5 open while you still hold 5-3 and 5-0, so the double strengthens a number you can continue to control.',
      '5-3': 'Legal, but it spends one of your 5s and moves the end to 3 before using the double that can hold the suit in place.',
      '5-0': 'Legal, but it moves away from your strongest connected suit.',
      '1-6': 'Legal, but it abandons the 5 control entirely.',
    },
  },
  {
    id: 'master-6',
    title: 'Read the Whole Table',
    lesson: 'Master play combines opponent weakness, your own connectivity, and the danger of helping someone else.',
    clue: 'No tiles are left to draw. Seat 1 knocked on 3 earlier. Seat 3 is down to 1 tile. Current ends are 5 and 6.',
    ends: [5, 6],
    hand: [[5, 3], [5, 1], [6, 4], [3, 4], [1, 0]],
    best: '5-3',
    valid: ['5-3', '5-1', '6-4'],
    feedback: {
      '5-3': 'Best move. It opens 3 against Seat 1’s known weakness, and you still keep 3-4 as a follow-up. You use real information while keeping your hand connected.',
      '5-1': 'Legal, but it opens 1 with no table-read advantage and gives up the chance to pressure Seat 1.',
      '6-4': 'Legal and connected, but it ignores the strongest known weakness at the table while Seat 3 is close to going out.',
    },
  },
]

const REVIEW = [
  {
    id: 'review-1',
    title: 'Why Was That Move Weak?',
    lesson: 'Reviewing a move means looking at what it left behind, not only whether it was legal.',
    clueLabel: 'MOVE REVIEW',
    clue: 'Open ends were 6 and 3. Your hand was 6-4, 6-1, 4-5, 4-0. You played 6-1.',
    question: 'What was the main problem with that choice?',
    options: [
      'It opened an unsupported 1 instead of using your strong 4 connection',
      '6-1 was illegal',
      'You should always play the highest pip tile',
      'You should have knocked',
    ],
    best: 'It opened an unsupported 1 instead of using your strong 4 connection',
    feedback: 'Correct. The move was legal, but 6-4 would have opened 4 while you still held two more 4s. The review is about hand structure, not legality.',
    wrong: 'The move was legal. The weakness was what it left open and how poorly that number connected to the rest of your hand.',
  },
  {
    id: 'review-2',
    title: 'Did You Really Attack the Weak Number?',
    lesson: 'The number you match is consumed. The other half becomes the new open end.',
    clueLabel: 'MOVE REVIEW',
    clue: 'An opponent had knocked on 5 earlier. Later the open end was 5, and you played 5-2 onto it because you wanted to “keep pressure on 5.”',
    question: 'What actually happened?',
    options: [
      'You removed 5 from that end and opened 2',
      'You kept 5 open',
      'You forced an automatic block',
      'You created a Dekabess',
    ],
    best: 'You removed 5 from that end and opened 2',
    feedback: 'Correct. Matching the 5 consumes it. To pressure 5, you usually want to OPEN 5 from the other end with a tile such as 3-5.',
    wrong: 'Remember the open-end rule: the matched half connects to the chain, and the tile’s other half becomes the new open number.',
  },
  {
    id: 'review-3',
    title: 'You Knocked Too Early',
    lesson: 'In a pile game, a knock is not available while there are still tiles to draw.',
    clueLabel: 'MOVE REVIEW',
    clue: 'You could not match either open end. The pile still had 4 face-down tiles, but you knocked.',
    question: 'What should you have done?',
    options: ['Draw one tile', 'Knock anyway', 'End the round', 'Take a tile from an opponent'],
    best: 'Draw one tile',
    feedback: 'Correct. In Dekabess pile games, you draw one tile at a time while you have no legal move. Knocking comes only after the pile is empty.',
    wrong: 'The remaining pile changes the action. No legal move + tiles still in the pile means draw, not knock.',
  },
  {
    id: 'review-4',
    title: 'You Forgot Your Partner',
    lesson: 'A move can be fine for your hand and still be weak for the team.',
    clueLabel: 'TEAM REVIEW',
    clue: 'Asosyé. Your partner had 1 tile left and had repeatedly kept 3 alive. You had a legal way to open 3, but instead changed the board to 1 to improve your own hand.',
    question: 'What should you reconsider?',
    options: [
      'Helping your one-tile partner stay playable may be worth more than improving only your hand',
      'Your partner does not affect your strategy',
      'You should always chase the highest number',
      'Asosyé uses separate individual streaks',
    ],
    best: 'Helping your one-tile partner stay playable may be worth more than improving only your hand',
    feedback: 'Correct. Your partner going out wins the round for the team. When they are one tile away, supporting their likely number can be the stronger team decision.',
    wrong: 'Asosyé is evaluated as a team. Your partner’s chance to go out can matter more than a small improvement to your own hand.',
  },
  {
    id: 'review-5',
    title: 'You Kept the Heavy Tile',
    lesson: 'When a block is likely, your remaining pip total becomes part of the decision.',
    clueLabel: 'MOVE REVIEW',
    clue: 'No tiles were left to draw and several players were knocking. You could shed 6-5 or 2-1, but you played 2-1.',
    question: 'Why might that be a mistake?',
    options: [
      'You kept 11 pips in 6-5 instead of shedding them before a possible block',
      '2-1 was illegal',
      'Low tiles can never be played late',
      '6-5 automatically wins a blocked round',
    ],
    best: 'You kept 11 pips in 6-5 instead of shedding them before a possible block',
    feedback: 'Correct. A blocked round goes to the lowest remaining pip total. When a jam is close, getting a heavy tile out can be more important than saving it.',
    wrong: 'The key is not that 2-1 was illegal. The issue is the pip weight you chose to keep in your hand.',
  },
  {
    id: 'review-6',
    title: 'You Spent the Dekabess Tile Too Soon',
    lesson: 'Endgame review should check whether a valuable last-tile route was available.',
    clueLabel: 'MOVE REVIEW',
    clue: 'Open ends were 6 and 3. Your last two tiles were 6-6 and 6-3. You played 6-3 first.',
    question: 'What opportunity did you give up?',
    options: [
      'Playing 6-6 first could have left 6-3 as a last-tile Dekabess',
      '6-3 should never be played',
      '6-6 would have ended the match immediately',
      'A double can itself be a Dekabess',
    ],
    best: 'Playing 6-6 first could have left 6-3 as a last-tile Dekabess',
    feedback: 'Correct. 6-6 can keep the 6 end at 6 while the other end remains 3, preserving 6-3 as a final tile that matches both ends.',
    wrong: 'The missed idea is the order of your last two tiles. The double can preserve the ends so the non-double finishes as a Dekabess.',
  },
]

const FINAL_EXAM = [
  {
    id: 'exam-1',
    title: 'Opening Rule',
    lesson: 'Final check: apply the real opening rule without a hint.',
    clueLabel: 'FINAL EXAM',
    clue: 'Round 1. The 6-6 is in a player’s hand.',
    question: 'What must happen?',
    options: [
      'That player opens with 6-6',
      'Seat 0 opens with any tile',
      'The lowest-pip player opens',
      'Any double may open',
    ],
    best: 'That player opens with 6-6',
    feedback: 'Correct. The first round is opened by the 6-6 holder, with 6-6.',
    wrong: 'Review the first-round opening rule.',
  },
  {
    id: 'exam-2',
    title: 'Pile Decision',
    lesson: 'Know when a knock is legal.',
    clueLabel: 'FINAL EXAM',
    clue: 'You cannot match either open end. The pile still has tiles.',
    question: 'What do you do?',
    options: ['Draw one tile', 'Knock', 'End the round', 'Skip two turns'],
    best: 'Draw one tile',
    feedback: 'Correct. You draw while the pile remains and you have no legal play.',
    wrong: 'A knock only comes after the pile is empty and you still cannot play.',
  },
  {
    id: 'exam-3',
    title: 'Read the Knock',
    lesson: 'Use only what the table actually proved.',
    clueLabel: 'FINAL EXAM',
    clue: 'No tiles are left to draw. An opponent knocks while the ends are 2 and 5.',
    question: 'What do you know?',
    options: [
      'They have no 2s and no 5s for the rest of the round',
      'They have no doubles',
      'They have no 6s',
      'They have exactly three tiles left',
    ],
    best: 'They have no 2s and no 5s for the rest of the round',
    feedback: 'Correct. With nothing left to draw, that knock proves they hold no 2s and no 5s — for the whole round. It proves nothing else.',
    wrong: 'Do not infer hidden information the knock did not reveal.',
  },
  {
    id: 'exam-4',
    title: 'Pressure the Weak Number',
    lesson: 'Remember which half becomes the new open end.',
    clueLabel: 'FINAL EXAM',
    clue: 'An opponent previously knocked on 4. The current ends are 6 and 2. You can play 6-4 or 2-5.',
    question: 'Which move directly reopens the known weak number?',
    options: ['6-4', '2-5', 'Knock', 'Neither'],
    best: '6-4',
    feedback: 'Correct. Matching the 6 leaves 4 open, bringing the opponent’s known weakness back onto the table.',
    wrong: 'To pressure 4, you want 4 to become the new open half.',
  },
  {
    id: 'exam-5',
    title: 'Blocked Round',
    lesson: 'Know what decides a jammed table.',
    clueLabel: 'FINAL EXAM',
    clue: 'No tiles are left to draw and nobody can play. Pip totals are 9, 13, 7 and 16.',
    question: 'Who wins the round?',
    options: ['The player with 9', 'The player with 13', 'The player with 7', 'The player with 16'],
    best: 'The player with 7',
    feedback: 'Correct. The fewest remaining pips wins a blocked round.',
    wrong: 'Blocked rounds are decided by the lowest remaining pip total.',
  },
  {
    id: 'exam-6',
    title: 'Dekabess Finish',
    lesson: 'Recognize the exact last-tile condition.',
    clueLabel: 'FINAL EXAM',
    clue: 'Your final tile is 6-3. The open ends are 6 and 3.',
    question: 'What kind of finish is this?',
    options: ['Dekabess', 'Normal win only', 'Blocked win', 'Automatic reshuffle'],
    best: 'Dekabess',
    feedback: 'Correct. A last non-double matching both open ends at once is a Dekabess.',
    wrong: 'Check the last tile against both open ends.',
  },
  {
    id: 'exam-7',
    title: 'Vyèj Math',
    lesson: 'Track the streak correctly.',
    clueLabel: 'FINAL EXAM',
    clue: 'Your streak is 2. You win the next round with a Dekabess.',
    question: 'What is the result?',
    options: ['Streak 4 — Vyèj', 'Streak 3', 'Streak resets to 1', 'No streak change'],
    best: 'Streak 4 — Vyèj',
    feedback: 'Correct. A Dekabess adds 2 to the streak, taking 2 to 4 for the Vyèj.',
    wrong: 'A normal win adds 1; a Dekabess adds 2.',
  },
  {
    id: 'exam-8',
    title: 'Asosyé Read',
    lesson: 'Think as a team, not as two separate players.',
    clueLabel: 'FINAL EXAM',
    clue: 'Asosyé. Your partner has one tile left and has shown strength on 3. You can keep 3 alive or turn the table to 1.',
    question: 'What is usually the stronger team idea?',
    options: [
      'Keep 3 available for your partner',
      'Always switch to 1',
      'Ignore your partner’s position',
      'Knock even with a legal move',
    ],
    best: 'Keep 3 available for your partner',
    feedback: 'Correct. Helping a one-tile partner go out can win the round for your team.',
    wrong: 'In Asosyé, your partner’s ability to finish is part of your decision.',
  },
  {
    id: 'exam-9',
    title: 'Late-Game Pips',
    lesson: 'Know when pip weight becomes urgent.',
    clueLabel: 'FINAL EXAM',
    clue: 'A block looks likely. You may shed 6-5 or 2-1.',
    question: 'Which tile is usually more urgent to get out?',
    options: ['6-5', '2-1', 'They are equal', 'Neither'],
    best: '6-5',
    feedback: 'Correct. Shedding 11 pips can matter much more than shedding 3 if the table jams.',
    wrong: 'When a block is close, compare the pip weight you would be left holding.',
  },
  {
    id: 'exam-10',
    title: 'Whole-Table Decision',
    lesson: 'The final skill is combining information instead of following one rule blindly.',
    clueLabel: 'FINAL EXAM',
    clue: 'Seat 1 knocked on 4 earlier. Your hand is strongest in 4s, and you have a legal move that opens 4. Another legal move opens an unsupported 1.',
    question: 'Which idea is strongest?',
    options: [
      'Open 4: it pressures a known weakness and supports your hand',
      'Open 1 because changing numbers is always better',
      'Choose randomly because both are legal',
      'Knock instead',
    ],
    best: 'Open 4: it pressures a known weakness and supports your hand',
    feedback: 'Correct. That move combines table reading with control of your own hand — exactly what the advanced sections were building toward.',
    wrong: 'The stronger move is the one that uses both the opponent read and your own hand structure.',
  },
]

const MASTER_CHALLENGE = [
  {
    id: 'challenge-1',
    title: 'Three Clues, One Move',
    lesson: 'Advanced play means weighing several clues at once.',
    clue: 'No tiles are left to draw. Seat 1 previously knocked on 4. Seat 3 has only 2 tiles left. Your hand is strongest in 4s. Current ends: 6 and 2.',
    ends: [6, 2],
    hand: [[6, 4], [6, 1], [2, 5], [4, 5], [4, 0]],
    best: '6-4',
    valid: ['6-4', '6-1', '2-5'],
    feedback: {
      '6-4': 'Best move. It reopens 4 against Seat 1’s known weakness while keeping your own 4-heavy hand connected. It also avoids giving Seat 3 a fresh number with no read.',
      '6-1': 'Legal, but 1 is unsupported and ignores the strongest table information.',
      '2-5': 'Legal, but 5 gives the short-handed Seat 3 a fresh chance with no known weakness attached.',
    },
  },
  {
    id: 'challenge-2',
    title: 'Control or Shed Pips?',
    lesson: 'The best priority changes when the table is close to blocking.',
    clue: 'No tiles are left to draw. Two players have just knocked. You can keep your strong 4 suit alive or dump a very heavy tile.',
    ends: [6, 2],
    hand: [[6, 5], [2, 4], [4, 4], [4, 1], [1, 0]],
    best: '6-5',
    valid: ['6-5', '2-4'],
    feedback: {
      '6-5': 'Best move here. With a jam close, shedding 11 pips is more urgent than preserving ideal suit control.',
      '2-4': 'Legal and normally attractive because it opens your strong 4 suit, but the repeated knocks make pip weight the bigger immediate risk.',
    },
  },
  {
    id: 'challenge-3',
    title: 'Save the Winning Route',
    lesson: 'Sometimes the strongest move is the one that preserves a future two-step finish.',
    clue: 'Open ends: 6 and 3. You have three tiles left and a possible Dekabess route.',
    ends: [6, 3],
    hand: [[6, 6], [3, 2], [6, 3]],
    best: '6-6',
    valid: ['6-6', '3-2', '6-3'],
    feedback: {
      '6-6': 'Best move. It preserves the 6 and 3 ends, keeping 6-3 available as a possible last-tile Dekabess.',
      '3-2': 'Legal, but it destroys the 3 end needed for the Dekabess setup.',
      '6-3': 'Legal, but it spends the exact tile you want to save for the finish.',
    },
  },
  {
    id: 'challenge-4',
    title: 'Partner or Pressure?',
    lesson: 'In Asosyé, decide whether supporting your partner is stronger than attacking an opponent.',
    clue: 'Asosyé. Your partner has 1 tile left and has shown strength on 3. Seat 1 once knocked on 5. Current ends: 6 and 2.',
    ends: [6, 2],
    hand: [[6, 3], [6, 5], [2, 1], [3, 4]],
    best: '6-3',
    valid: ['6-3', '6-5', '2-1'],
    feedback: {
      '6-3': 'Best team move. Your partner is one tile from going out, so reopening the number they have shown strength on is the strongest immediate team play.',
      '6-5': 'Legal and it attacks an opponent weakness, but your one-tile partner is the more urgent winning opportunity.',
      '2-1': 'Legal, but it helps neither the partner read nor the opponent weakness you already know.',
    },
  },
  {
    id: 'challenge-5',
    title: 'Do Not Follow One Rule Blindly',
    lesson: 'Expert decisions depend on the position, not slogans like “always keep your strong suit.”',
    clue: 'You control several 5s, but the opponent to your left is down to 1 tile and has never knocked on 5. Another legal move opens 2, which that opponent knocked on earlier.',
    ends: [6, 4],
    hand: [[6, 5], [4, 2], [5, 5], [5, 1], [2, 0]],
    best: '4-2',
    valid: ['6-5', '4-2'],
    feedback: {
      '4-2': 'Best move. Even though 5 is your strongest suit, the opponent with one tile is the immediate danger, and 2 is the number they already failed to answer.',
      '6-5': 'Legal and good for your own hand, but it may feed the one-tile opponent a number they have never shown weakness on.',
    },
  },
  {
    id: 'challenge-6',
    title: 'Master Table Read',
    lesson: 'The hardest decisions combine memory, knocks, hand structure and endgame danger.',
    clue: 'No tiles are left to draw. Seat 1 knocked on 4 earlier. Seat 3 has one tile left. You still hold two 4s after this move. Current ends: 5 and 6.',
    ends: [5, 6],
    hand: [[5, 4], [5, 1], [6, 2], [4, 3], [4, 0]],
    best: '5-4',
    valid: ['5-4', '5-1', '6-2'],
    feedback: {
      '5-4': 'Best move. It opens 4 against a known weakness, keeps your own hand connected through 4, and avoids giving the one-tile Seat 3 an untested number.',
      '5-1': 'Legal, but it opens an unsupported 1 and throws away the useful 4 read.',
      '6-2': 'Legal, but it ignores both the known weakness and your strongest remaining connection.',
    },
  },
]

const PLAN_AHEAD = [
  {
    id: 'ahead-1',
    title: 'Think Two Moves Ahead',
    lesson: 'Do not judge only the tile you can play now. Picture what your next move is likely to be.',
    clueLabel: 'PLAN AHEAD',
    clue: 'Open ends: 6 and 2. Your hand is 6-4, 4-3, 3-1, 2-5.',
    question: 'Which opening gives you the clearest connected route for the next two moves?',
    options: [
      '6-4, then 4-3',
      '2-5, then hope a 5 stays open',
      '6-4, then 3-1 immediately',
      'Pass',
    ],
    best: '6-4, then 4-3',
    feedback: 'Correct. 6-4 opens 4, and 4-3 gives you a natural second move if 4 remains available. You are planning a connected route, not just the current play.',
    wrong: 'Trace the number that becomes open after your first move, then ask which tile in your remaining hand can answer it.',
  },
  {
    id: 'ahead-2',
    title: 'Preserve a Three-Tile Route',
    lesson: 'A good sequence keeps your remaining tiles linked instead of creating isolated numbers.',
    clueLabel: 'PLAN AHEAD',
    clue: 'Open ends: 5 and 1. Your hand is 5-4, 4-2, 2-6, 1-0.',
    question: 'Which route keeps three tiles connected?',
    options: [
      '5-4 → 4-2 → 2-6',
      '1-0 → then wait for 0 again',
      '5-4 → 2-6 immediately',
      '1-0 → 5-4',
    ],
    best: '5-4 → 4-2 → 2-6',
    feedback: 'Correct. That chain walks through 4 and then 2, keeping a clear path through three of your tiles.',
    wrong: 'Look for a sequence where the open number created by one tile is carried by the next tile.',
  },
  {
    id: 'ahead-3',
    title: 'Plan Around the Double',
    lesson: 'A double can either hold a number in place or become stranded. Sequence matters.',
    clueLabel: 'PLAN AHEAD',
    clue: 'Open ends: 4 and 1. Your hand is 1-4, 4-4, 4-2, 2-6.',
    question: 'Which sequence best keeps the 4-4 useful?',
    options: [
      '1-4 → 4-4 → 4-2',
      '4-2 → 2-6 → hope 4 returns',
      '4-4 → 2-6',
      '1-4 → 2-6',
    ],
    best: '1-4 → 4-4 → 4-2',
    feedback: 'Correct. 1-4 turns the 1 end into 4, 4-4 keeps 4 alive, and 4-2 gives you the next exit. The double is used inside a connected sequence.',
    wrong: 'Try to keep the double’s number open before and after you play it.',
  },
  {
    id: 'ahead-4',
    title: 'Build Toward the Finish',
    lesson: 'Late in the hand, plan the order that leaves your easiest final tile.',
    clueLabel: 'PLAN AHEAD',
    clue: 'Open ends: 6 and 3. Your final three tiles are 6-6, 6-3 and 3-2.',
    question: 'Which first move best preserves a possible Dekabess finish?',
    options: [
      '6-6 first',
      '6-3 first',
      '3-2 first',
      'The order never matters',
    ],
    best: '6-6 first',
    feedback: 'Correct. 6-6 can keep the 6 end at 6 while the 3 end remains available, preserving 6-3 as the valuable two-ended finishing tile.',
    wrong: 'The goal is to avoid spending or destroying the 6-and-3 setup before 6-3 becomes your last tile.',
  },
  {
    id: 'ahead-5',
    title: 'Plan With a Known Weakness',
    lesson: 'Future planning can include what another player already showed they cannot answer.',
    clueLabel: 'PLAN AHEAD',
    clue: 'Seat 1 knocked on 4 earlier. Current ends are 6 and 2. Your hand is 6-5, 5-4, 2-1, 4-0.',
    question: 'Which two-move route can bring 4 back as pressure?',
    options: [
      '6-5 → 5-4',
      '2-1 → hope 4 appears',
      '6-5 → 2-1',
      'Pass',
    ],
    best: '6-5 → 5-4',
    feedback: 'Correct. The first move opens 5; if that route remains available, 5-4 can then open 4 and reintroduce the known weakness.',
    wrong: 'Look for a sequence whose second tile leaves 4 as the new open end.',
  },
  {
    id: 'ahead-6',
    title: 'Team Sequence',
    lesson: 'In Asosyé, your multi-move plan should consider where you are trying to leave the table for your partner.',
    clueLabel: 'TEAM PLAN',
    clue: 'Asosyé. Your partner is down to 1 tile and has repeatedly shown strength on 3. Current ends: 6 and 2. Your hand is 6-5, 5-3, 2-1.',
    question: 'Which planned route best supports your partner if the table comes back to you?',
    options: [
      '6-5 → 5-3',
      '2-1 → keep chasing 1',
      '6-5 → 2-1',
      'Ignore the partner and only shed highest pips',
    ],
    best: '6-5 → 5-3',
    feedback: 'Correct. The route can eventually open 3, the number your one-tile partner has repeatedly supported. It is a team-oriented sequence, not just a personal one.',
    wrong: 'In Asosyé, plan not only how your tiles connect but also what number you hope to leave available for your partner.',
  },
]

const TRACKS = {
  basics: {
    label: 'Premye Pa',
    subtitle: 'Legal moves & passing',
    storage: 'dekabess_puzzle_basics',
    puzzles: BASICS,
    mode: 'basic',
  },
  control: {
    label: 'Kontwòl',
    subtitle: 'Choose the strongest move',
    storage: 'dekabess_puzzle_control',
    puzzles: CONTROL,
    mode: 'strategy',
  },
  blocking: {
    label: 'Blokaj',
    subtitle: 'Read passes & trap opponents',
    storage: 'dekabess_puzzle_blocking',
    puzzles: BLOCKING,
    mode: 'strategy',
  },
  memory: {
    label: 'Memwa',
    subtitle: 'Remember what has been played',
    storage: 'dekabess_puzzle_memory',
    puzzles: MEMORY,
    mode: 'memory',
  },
  read: {
    label: 'Li Jwè a',
    subtitle: 'Read opponents from passes and patterns',
    storage: 'dekabess_puzzle_read',
    puzzles: READ_PLAYER,
    mode: 'inference',
  },
  finish: {
    label: 'Fini Men an',
    subtitle: 'Plan the end of your hand',
    storage: 'dekabess_puzzle_finish',
    puzzles: FINISH_HAND,
    mode: 'strategy',
  },
  rules: {
    label: 'Règ Tab la',
    subtitle: 'Opening, piles, blocks & Vyèj',
    storage: 'dekabess_puzzle_rules',
    puzzles: TABLE_RULES,
    mode: 'inference',
  },
  partner: {
    label: 'Asosyé',
    subtitle: 'Read and play for your partner',
    storage: 'dekabess_puzzle_partner',
    puzzles: PARTNER_PLAY,
    mode: 'inference',
  },
  mastery: {
    label: 'Mèt Tab la',
    subtitle: 'Combine everything you learned',
    storage: 'dekabess_puzzle_mastery',
    puzzles: MASTERY,
    mode: 'strategy',
  },
  review: {
    label: 'Revizyon',
    subtitle: 'Learn from moves after the hand',
    storage: 'dekabess_puzzle_review',
    puzzles: REVIEW,
    mode: 'inference',
  },
  exam: {
    label: 'Egzamen Final',
    subtitle: 'Prove your full-table knowledge',
    storage: 'dekabess_puzzle_exam',
    puzzles: FINAL_EXAM,
    mode: 'inference',
  },
  challenge: {
    label: 'Defi Mèt',
    subtitle: 'Advanced mixed table decisions',
    storage: 'dekabess_puzzle_challenge',
    puzzles: MASTER_CHALLENGE,
    mode: 'strategy',
  },
  ahead: {
    label: 'Plan Davans',
    subtitle: 'Think two and three moves ahead',
    storage: 'dekabess_puzzle_ahead',
    puzzles: PLAN_AHEAD,
    mode: 'inference',
  },
}

const keyOf = tile => tile.join('-')

function readProgress(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}

// ── Progress that follows the account ──
// Signed in, progress is also kept in the puzzle_progress table, so a player
// continues on any device. Opening the page merges the account's progress with
// this device's: every puzzle done on either counts, and you land on whichever
// of the two places is further along. Signed out, it stays on this device.
const TRACK_ORDER = () => Object.keys(TRACKS)
function mergeCompleted(a = {}, b = {}) {
  const out = {}
  for (const id of Object.keys(TRACKS)) {
    const seen = new Set()
    out[id] = [...(a[id] || []), ...(b[id] || [])].filter(x => {
      const k = JSON.stringify(x)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }
  return out
}
function furtherOf(p, q) {          // p, q = { track, index }; returns the one further along
  const order = TRACK_ORDER()
  const rank = x => (TRACKS[x?.track] ? order.indexOf(x.track) : -1) * 100000 + (Number(x?.index) || 0)
  return rank(q) > rank(p) ? q : p
}

function Domino({ tile, onClick, disabled = false, selected = false }) {
  return (
    <button
      type="button"
      className={`puzzle-domino${selected ? ' selected' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={`Domino ${tile[0]}-${tile[1]}`}
    >
      <TileFace a={tile[0]} b={tile[1]} vertical={false} />
    </button>
  )
}

export default function Puzzle() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const accountReady = useRef(null)   // the user id whose account progress has been merged in
  const [saveTick, setSaveTick] = useState(0)
  const basicsDone = readProgress(TRACKS.basics.storage).length >= BASICS.length
  const [trackId, setTrackId] = useState(() => {
    try {
      const saved = localStorage.getItem('dekabess_puzzle_active_track')
      return saved && TRACKS[saved] ? saved : (basicsDone ? 'control' : 'basics')
    } catch {
      return basicsDone ? 'control' : 'basics'
    }
  })
  const [index, setIndex] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('dekabess_puzzle_active_index') || 0)
      return Number.isInteger(saved) && saved >= 0 ? saved : 0
    } catch {
      return 0
    }
  })
  const [choice, setChoice] = useState(null)
  const [result, setResult] = useState(null)
  const [memoryHidden, setMemoryHidden] = useState(false)
  const [completedByTrack, setCompletedByTrack] = useState(() => ({
    basics: readProgress(TRACKS.basics.storage),
    control: readProgress(TRACKS.control.storage),
    blocking: readProgress(TRACKS.blocking.storage),
    memory: readProgress(TRACKS.memory.storage),
    read: readProgress(TRACKS.read.storage),
    finish: readProgress(TRACKS.finish.storage),
    rules: readProgress(TRACKS.rules.storage),
    partner: readProgress(TRACKS.partner.storage),
    mastery: readProgress(TRACKS.mastery.storage),
    review: readProgress(TRACKS.review.storage),
    exam: readProgress(TRACKS.exam.storage),
    challenge: readProgress(TRACKS.challenge.storage),
    ahead: readProgress(TRACKS.ahead.storage),
  }))

  const track = TRACKS[trackId]
  const puzzles = track.puzzles
  const safeIndex = Math.min(index, Math.max(0, puzzles.length - 1))
  const puzzle = puzzles[safeIndex]
  const completed = completedByTrack[trackId] || []
  const doneCount = completed.length
  const progress = Math.round((doneCount / puzzles.length) * 100)
  const controlUnlocked = (completedByTrack.basics || []).length >= BASICS.length
  const blockingUnlocked = controlUnlocked && (completedByTrack.control || []).length >= CONTROL.length
  const memoryUnlocked = blockingUnlocked && (completedByTrack.blocking || []).length >= BLOCKING.length
  const readUnlocked = memoryUnlocked && (completedByTrack.memory || []).length >= MEMORY.length
  const finishUnlocked = readUnlocked && (completedByTrack.read || []).length >= READ_PLAYER.length
  const rulesUnlocked = finishUnlocked && (completedByTrack.finish || []).length >= FINISH_HAND.length
  const partnerUnlocked = rulesUnlocked && (completedByTrack.rules || []).length >= TABLE_RULES.length
  const masteryUnlocked = partnerUnlocked && (completedByTrack.partner || []).length >= PARTNER_PLAY.length
  const reviewUnlocked = masteryUnlocked && (completedByTrack.mastery || []).length >= MASTERY.length
  const examUnlocked = reviewUnlocked && (completedByTrack.review || []).length >= REVIEW.length
  const challengeUnlocked = examUnlocked && (completedByTrack.exam || []).length >= FINAL_EXAM.length
  const aheadUnlocked = challengeUnlocked && (completedByTrack.challenge || []).length >= MASTER_CHALLENGE.length

  useEffect(() => {
    Object.entries(TRACKS).forEach(([id, info]) => {
      try { localStorage.setItem(info.storage, JSON.stringify(completedByTrack[id] || [])) } catch { /* ignore */ }
    })
  }, [completedByTrack])

  useEffect(() => {
    try {
      localStorage.setItem('dekabess_puzzle_active_track', trackId)
      localStorage.setItem('dekabess_puzzle_active_index', String(safeIndex))
    } catch { /* ignore */ }
  }, [trackId, safeIndex])

  useEffect(() => {
    if (index !== safeIndex) setIndex(safeIndex)
  }, [index, safeIndex])

  // Signed in: bring in the account's progress once, merged with this device's.
  useEffect(() => {
    const uid = user?.id
    if (!uid) { accountReady.current = null; return }
    let gone = false
    ;(async () => {
      const { data, error } = await db.from('puzzle_progress')
        .select('completed, active_track, active_index').eq('user_id', uid).maybeSingle()
      if (gone || error) return            // no table yet or offline: keep this device's progress
      setCompletedByTrack(prev => mergeCompleted(prev, data?.completed || {}))
      if (data?.active_track && TRACKS[data.active_track]) {
        const here = { track: trackId, index: safeIndex }
        const there = { track: data.active_track, index: data.active_index }
        const pick = furtherOf(here, there)
        if (pick !== here) { setTrackId(pick.track); setIndex(Number(pick.index) || 0) }
      }
      accountReady.current = uid            // from now on, changes are saved to the account
      setSaveTick(t => t + 1)               // and save the merged result right away
    })()
    return () => { gone = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // Save to the account as the player goes (a moment after the last change).
  useEffect(() => {
    const uid = user?.id
    if (!uid || accountReady.current !== uid) return
    const t = setTimeout(() => {
      db.from('puzzle_progress').upsert({
        user_id: uid,
        completed: completedByTrack,
        active_track: trackId,
        active_index: safeIndex,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' }).then(({ error }) => {
        if (error) { console.warn('puzzle progress not saved to the account', error.message); return }
        // all 30 done: the Kapsil tile (the server checks the saved progress)
        const done = Object.values(completedByTrack || {}).reduce((n, list) => n + (Array.isArray(list) ? list.length : 0), 0)
        if (done >= PUZZLE_COUNT) checkPuzzleShape()
      })
    }, 600)
    return () => clearTimeout(t)
  }, [user?.id, completedByTrack, trackId, safeIndex, saveTick])

  const explanation = useMemo(() => {
    if (!result) return ''
    if (track.mode === 'memory') {
      return result.correct ? puzzle.feedback : `Not quite. Study the sequence again and try to remember the details.`
    }
    if (track.mode === 'inference') {
      return result.correct ? puzzle.feedback : (puzzle.wrong || 'Not quite. Re-read the table clue and use only what the situation actually tells you.')
    }
    if (track.mode === 'strategy') {
      if (!result.legal) {
        if (result.key === 'PASS') return `You still have legal moves: ${puzzle.valid.join(', ')}.`
        return `${result.key} cannot connect to either open end (${puzzle.ends[0]} or ${puzzle.ends[1]}).`
      }
      return puzzle.feedback[result.key] || 'That move is legal.'
    }

    if (result.correct) return puzzle.feedback[result.key] || 'Correct.'
    if (result.key === 'PASS') return `Not yet. You still have a legal play: ${puzzle.valid.join(' or ')}.`
    return `${result.key} cannot connect to either open end (${puzzle.ends[0]} or ${puzzle.ends[1]}).`
  }, [result, puzzle, track.mode])

  function answer(key) {
    if (result) return
    setChoice(key)

    if (track.mode === 'memory' || track.mode === 'inference') {
      const correct = key === puzzle.best
      setResult({ key, correct, legal: true, best: correct, stars: correct ? 3 : 0 })
      if (correct) {
        setCompletedByTrack(prev => {
          const list = prev[trackId] || []
          if (list.includes(puzzle.id)) return prev
          return { ...prev, [trackId]: [...list, puzzle.id] }
        })
      }
      return
    }

    const legal = puzzle.valid.includes(key)
    const best = key === puzzle.best
    const correct = legal
    const stars = !legal ? 0 : (best ? 3 : 2)

    setResult({ key, correct, legal, best, stars })

    if (correct) {
      setCompletedByTrack(prev => {
        const list = prev[trackId] || []
        if (list.includes(puzzle.id)) return prev
        return { ...prev, [trackId]: [...list, puzzle.id] }
      })
    }
  }

  function resetAnswer() {
    setChoice(null)
    setResult(null)
    setMemoryHidden(false)
  }

  function next() {
    if (safeIndex < puzzles.length - 1) {
      setIndex(safeIndex + 1)
      resetAnswer()
    } else {
      setIndex(0)
      resetAnswer()
    }
  }

  function selectPuzzle(i) {
    setIndex(i)
    resetAnswer()
  }

  function chooseTrack(id) {
    if (id === 'control' && !controlUnlocked) return
    if (id === 'blocking' && !blockingUnlocked) return
    if (id === 'memory' && !memoryUnlocked) return
    if (id === 'read' && !readUnlocked) return
    if (id === 'finish' && !finishUnlocked) return
    if (id === 'rules' && !rulesUnlocked) return
    if (id === 'partner' && !partnerUnlocked) return
    if (id === 'mastery' && !masteryUnlocked) return
    if (id === 'review' && !reviewUnlocked) return
    if (id === 'exam' && !examUnlocked) return
    if (id === 'challenge' && !challengeUnlocked) return
    if (id === 'ahead' && !aheadUnlocked) return
    setTrackId(id)
    setIndex(0)
    resetAnswer()
  }

  const resultTitle = track.mode === 'memory'
    ? (result?.correct ? '✓ Remembered' : '✕ Not quite')
    : (track.mode === 'inference'
      ? (result?.correct ? '✓ Good Read' : '✕ Not quite')
      : (track.mode === 'strategy' && result?.legal
        ? (result.best ? '★★★ Best Move' : '★★ Good Move')
        : (result?.correct ? '✓ Correct' : '✕ Not a legal move')))

  return (
    <main className="puzzle-page ui-page">
      <header className="puzzle-topbar">
        <button type="button" className="puzzle-back ui-back" onClick={() => navigate('/')}>← Back</button>
        <div>
          <div className="puzzle-kicker">DOMINO TRAINING</div>
          <h1>{track.label}</h1>
        </div>
        <div className="puzzle-progress-text">{doneCount}/{puzzles.length}</div>
      </header>

      <section className="puzzle-intro ui-intro">
        <div className="puzzle-intro-icon" aria-hidden="true">🧠</div>
        <div className="puzzle-intro-copy">
          <div className="puzzle-intro-kicker">LEARN BY PLAYING</div>
          <h2>Train the decisions real domino players make</h2>
          <p>Start with legal moves, then build control, blocking, memory and table-reading skills. The lessons follow Dekabess rules: draw instead of knocking while a pile remains, blocked rounds go to lowest pips, and pressure comes from what number you LEAVE open — not the number you just matched.</p>
          <div className="puzzle-intro-steps">
            <span><b>1</b> Study the situation</span>
            <span><b>2</b> Make your choice</span>
            <span><b>3</b> Learn why</span>
          </div>
        </div>
      </section>

      <section className="puzzle-track-switch" aria-label="Training section">
        <button type="button" className={trackId === 'basics' ? 'active' : ''} onClick={() => chooseTrack('basics')}>
          <span>1</span> Premye Pa
        </button>
        <button
          type="button"
          className={trackId === 'control' ? 'active' : ''}
          onClick={() => chooseTrack('control')}
          disabled={!controlUnlocked}
          title={controlUnlocked ? 'Choose the strongest move' : 'Complete Premye Pa first'}
        >
          <span>2</span> {controlUnlocked ? 'Kontwòl' : '🔒 Kontwòl'}
        </button>
        <button
          type="button"
          className={trackId === 'blocking' ? 'active' : ''}
          onClick={() => chooseTrack('blocking')}
          disabled={!blockingUnlocked}
          title={blockingUnlocked ? 'Read passes and trap opponents' : 'Complete Kontwòl first'}
        >
          <span>3</span> {blockingUnlocked ? 'Blokaj' : '🔒 Blokaj'}
        </button>
        <button
          type="button"
          className={trackId === 'memory' ? 'active' : ''}
          onClick={() => chooseTrack('memory')}
          disabled={!memoryUnlocked}
          title={memoryUnlocked ? 'Remember what has been played' : 'Complete Blokaj first'}
        >
          <span>4</span> {memoryUnlocked ? 'Memwa' : '🔒 Memwa'}
        </button>
        <button
          type="button"
          className={trackId === 'read' ? 'active' : ''}
          onClick={() => chooseTrack('read')}
          disabled={!readUnlocked}
          title={readUnlocked ? 'Read opponents from passes and patterns' : 'Complete Memwa first'}
        >
          <span>5</span> {readUnlocked ? 'Li Jwè a' : '🔒 Li Jwè a'}
        </button>
        <button
          type="button"
          className={trackId === 'finish' ? 'active' : ''}
          onClick={() => chooseTrack('finish')}
          disabled={!finishUnlocked}
          title={finishUnlocked ? 'Plan the end of your hand' : 'Complete Li Jwè a first'}
        >
          <span>6</span> {finishUnlocked ? 'Fini Men an' : '🔒 Fini Men an'}
        </button>
        <button
          type="button"
          className={trackId === 'rules' ? 'active' : ''}
          onClick={() => chooseTrack('rules')}
          disabled={!rulesUnlocked}
          title={rulesUnlocked ? 'Learn Dekabess table rules' : 'Complete Fini Men an first'}
        >
          <span>7</span> {rulesUnlocked ? 'Règ Tab la' : '🔒 Règ Tab la'}
        </button>
        <button
          type="button"
          className={trackId === 'partner' ? 'active' : ''}
          onClick={() => chooseTrack('partner')}
          disabled={!partnerUnlocked}
          title={partnerUnlocked ? 'Learn Asosyé partner play' : 'Complete Règ Tab la first'}
        >
          <span>8</span> {partnerUnlocked ? 'Asosyé' : '🔒 Asosyé'}
        </button>
        <button
          type="button"
          className={trackId === 'mastery' ? 'active' : ''}
          onClick={() => chooseTrack('mastery')}
          disabled={!masteryUnlocked}
          title={masteryUnlocked ? 'Combine all advanced skills' : 'Complete Asosyé first'}
        >
          <span>9</span> {masteryUnlocked ? 'Mèt Tab la' : '🔒 Mèt Tab la'}
        </button>
        <button
          type="button"
          className={trackId === 'review' ? 'active' : ''}
          onClick={() => chooseTrack('review')}
          disabled={!reviewUnlocked}
          title={reviewUnlocked ? 'Review decisions and learn from mistakes' : 'Complete Mèt Tab la first'}
        >
          <span>10</span> {reviewUnlocked ? 'Revizyon' : '🔒 Revizyon'}
        </button>
        <button
          type="button"
          className={trackId === 'exam' ? 'active' : ''}
          onClick={() => chooseTrack('exam')}
          disabled={!examUnlocked}
          title={examUnlocked ? 'Take the final Dekabess exam' : 'Complete Revizyon first'}
        >
          <span>11</span> {examUnlocked ? 'Egzamen Final' : '🔒 Egzamen Final'}
        </button>
        <button
          type="button"
          className={trackId === 'challenge' ? 'active' : ''}
          onClick={() => chooseTrack('challenge')}
          disabled={!challengeUnlocked}
          title={challengeUnlocked ? 'Take advanced mixed table challenges' : 'Complete Egzamen Final first'}
        >
          <span>12</span> {challengeUnlocked ? 'Defi Mèt' : '🔒 Defi Mèt'}
        </button>
        <button
          type="button"
          className={trackId === 'ahead' ? 'active' : ''}
          onClick={() => chooseTrack('ahead')}
          disabled={!aheadUnlocked}
          title={aheadUnlocked ? 'Think multiple moves ahead' : 'Complete Defi Mèt first'}
        >
          <span>13</span> {aheadUnlocked ? 'Plan Davans' : '🔒 Plan Davans'}
        </button>
      </section>

      <section className="puzzle-progress" aria-label={`${track.label} progress`}>
        <div style={{ width: `${progress}%` }} />
      </section>

      <nav className="puzzle-dots" aria-label="Choose puzzle">
        {puzzles.map((p, i) => (
          <button
            type="button"
            key={p.id}
            className={`puzzle-dot ${i === safeIndex ? 'active' : ''} ${completed.includes(p.id) ? 'done' : ''}`}
            onClick={() => selectPuzzle(i)}
            aria-label={`Puzzle ${i + 1}: ${p.title}`}
          >
            {completed.includes(p.id) ? '✓' : i + 1}
          </button>
        ))}
      </nav>

      <section className="puzzle-card">
        <div className="puzzle-number">PUZZLE {safeIndex + 1} · {track.label.toUpperCase()}</div>
        <h2>{puzzle.title}</h2>
        <p className="puzzle-lesson">{puzzle.lesson}</p>

        {track.mode === 'strategy' && (
          <div className="puzzle-tip">
            More than one answer may be legal. Your goal is to find the <strong>strongest</strong> move.
          </div>
        )}

        {puzzle.clue && track.mode !== 'inference' && (
          <div className="puzzle-clue">
            <span>TABLE READ</span>
            {puzzle.clue}
          </div>
        )}

        {track.mode === 'memory' ? (
          <>
            <div className="puzzle-memory-board">
              <div className="puzzle-board-label">PLAYED TILES</div>
              {!memoryHidden ? (
                <div className="puzzle-memory-sequence">
                  {puzzle.sequence.map((tile, i) => (
                    <div className="puzzle-memory-tile" key={`${keyOf(tile)}-${i}`}>
                      <TileFace a={tile[0]} b={tile[1]} vertical={false} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="puzzle-memory-hidden">Tiles hidden — answer from memory.</div>
              )}
              {!result && (
                <button type="button" className="puzzle-memory-toggle" onClick={() => setMemoryHidden(v => !v)}>
                  {memoryHidden ? 'Show Tiles Again' : 'Hide Tiles & Answer'}
                </button>
              )}
            </div>

            {memoryHidden && (
              <>
                <div className="puzzle-question">{puzzle.question}</div>
                <div className="puzzle-memory-options">
                  {puzzle.options.map(option => (
                    <button
                      type="button"
                      key={option}
                      onClick={() => answer(option)}
                      disabled={!!result}
                      className={choice === option ? 'selected' : ''}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        ) : track.mode === 'inference' ? (
          <>
            <div className="puzzle-read-card">
              <span>{puzzle.clueLabel || 'READ THE TABLE'}</span>
              {puzzle.clue}
            </div>
            <div className="puzzle-question">{puzzle.question}</div>
            <div className="puzzle-read-options">
              {puzzle.options.map(option => (
                <button
                  type="button"
                  key={option}
                  onClick={() => answer(option)}
                  disabled={!!result}
                  className={choice === option ? 'selected' : ''}
                >
                  {option}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="puzzle-board">
              <div className="puzzle-board-label">OPEN ENDS</div>
              <div className="puzzle-ends" aria-label={`Open ends ${puzzle.ends[0]} and ${puzzle.ends[1]}`}>
                <span>{puzzle.ends[0]}</span>
                <div className="puzzle-chain-line" />
                <span>{puzzle.ends[1]}</span>
              </div>
            </div>

            <div className="puzzle-question">
              {trackId === 'blocking'
                ? 'Which move puts the most pressure on your opponent?'
                : trackId === 'finish'
                  ? 'Which move gives you the strongest endgame plan?'
                  : trackId === 'mastery' || trackId === 'challenge'
                    ? 'Which move is strongest for the whole position?'
                    : (track.mode === 'strategy' ? 'Which move gives you the best control?' : 'What would you play?')}
            </div>

            <div className="puzzle-hand">
              {puzzle.hand.map(tile => {
                const key = keyOf(tile)
                return <Domino key={key} tile={tile} onClick={() => answer(key)} disabled={!!result} selected={choice === key} />
              })}
            </div>

            <button
              type="button"
              className={`puzzle-pass ${choice === 'PASS' ? 'selected' : ''}`}
              onClick={() => answer('PASS')}
              disabled={!!result}
            >
              PASS
            </button>
          </>
        )}

        {result && (
          <div className={`puzzle-feedback ${result.correct ? (result.best ? 'best' : 'correct') : 'wrong'}`} aria-live="polite">
            <strong>{resultTitle}</strong>
            <p>{explanation}</p>
            {track.mode === 'strategy' && result.legal && !result.best && (
              <p className="puzzle-best-hint">Best answer: <strong>{puzzle.best}</strong>. Try the puzzle again if you want the 3-star solution.</p>
            )}
            <div className="puzzle-feedback-actions">
              {!result.correct && (
                <button type="button" onClick={resetAnswer}>Try Again</button>
              )}
              {result.correct && !result.best && track.mode === 'strategy' && (
                <button type="button" onClick={resetAnswer}>Try for ★★★</button>
              )}
              {result.correct && (
                <button type="button" onClick={next}>{safeIndex === puzzles.length - 1 ? `Restart ${track.label}` : 'Next Puzzle →'}</button>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="puzzle-coming">
        <h3>Training path</h3>
        <div className="puzzle-path">
          <button type="button" className="unlocked" onClick={() => chooseTrack('basics')}>
            <b>1</b><span>Premye Pa</span><small>Legal moves & passing</small>
          </button>
          <button type="button" className={controlUnlocked ? 'unlocked' : ''} onClick={() => chooseTrack('control')} disabled={!controlUnlocked}>
            <b>2</b><span>{controlUnlocked ? 'Kontwòl' : '🔒 Kontwòl'}</span><small>{controlUnlocked ? 'Choosing the strongest move' : 'Finish Premye Pa first'}</small>
          </button>
          <button type="button" className={blockingUnlocked ? 'unlocked' : ''} onClick={() => chooseTrack('blocking')} disabled={!blockingUnlocked}>
            <b>3</b><span>{blockingUnlocked ? 'Blokaj' : '🔒 Blokaj'}</span><small>{blockingUnlocked ? 'Read passes & trap opponents' : 'Finish Kontwòl first'}</small>
          </button>
          <button type="button" className={memoryUnlocked ? 'unlocked' : ''} onClick={() => chooseTrack('memory')} disabled={!memoryUnlocked}>
            <b>4</b><span>{memoryUnlocked ? 'Memwa' : '🔒 Memwa'}</span><small>{memoryUnlocked ? 'Remember played tiles' : 'Finish Blokaj first'}</small>
          </button>
          <button type="button" className={readUnlocked ? 'unlocked' : ''} onClick={() => chooseTrack('read')} disabled={!readUnlocked}>
            <b>5</b><span>{readUnlocked ? 'Li Jwè a' : '🔒 Li Jwè a'}</span><small>{readUnlocked ? 'Read opponents from clues' : 'Finish Memwa first'}</small>
          </button>
          <button type="button" className={finishUnlocked ? 'unlocked' : ''} onClick={() => chooseTrack('finish')} disabled={!finishUnlocked}>
            <b>6</b><span>{finishUnlocked ? 'Fini Men an' : '🔒 Fini Men an'}</span><small>{finishUnlocked ? 'Plan the end of your hand' : 'Finish Li Jwè a first'}</small>
          </button>
          <button type="button" className={rulesUnlocked ? 'unlocked' : ''} onClick={() => chooseTrack('rules')} disabled={!rulesUnlocked}>
            <b>7</b><span>{rulesUnlocked ? 'Règ Tab la' : '🔒 Règ Tab la'}</span><small>{rulesUnlocked ? 'Opening, piles, blocks & Vyèj' : 'Finish Fini Men an first'}</small>
          </button>
          <button type="button" className={partnerUnlocked ? 'unlocked' : ''} onClick={() => chooseTrack('partner')} disabled={!partnerUnlocked}>
            <b>8</b><span>{partnerUnlocked ? 'Asosyé' : '🔒 Asosyé'}</span><small>{partnerUnlocked ? 'Read and play for your partner' : 'Finish Règ Tab la first'}</small>
          </button>
          <button type="button" className={masteryUnlocked ? 'unlocked' : ''} onClick={() => chooseTrack('mastery')} disabled={!masteryUnlocked}>
            <b>9</b><span>{masteryUnlocked ? 'Mèt Tab la' : '🔒 Mèt Tab la'}</span><small>{masteryUnlocked ? 'Combine everything you learned' : 'Finish Asosyé first'}</small>
          </button>
          <button type="button" className={reviewUnlocked ? 'unlocked' : ''} onClick={() => chooseTrack('review')} disabled={!reviewUnlocked}>
            <b>10</b><span>{reviewUnlocked ? 'Revizyon' : '🔒 Revizyon'}</span><small>{reviewUnlocked ? 'Learn from moves after the hand' : 'Finish Mèt Tab la first'}</small>
          </button>
          <button type="button" className={examUnlocked ? 'unlocked' : ''} onClick={() => chooseTrack('exam')} disabled={!examUnlocked}>
            <b>11</b><span>{examUnlocked ? 'Egzamen Final' : '🔒 Egzamen Final'}</span><small>{examUnlocked ? 'Prove your full-table knowledge' : 'Finish Revizyon first'}</small>
          </button>
          <button type="button" className={challengeUnlocked ? 'unlocked' : ''} onClick={() => chooseTrack('challenge')} disabled={!challengeUnlocked}>
            <b>12</b><span>{challengeUnlocked ? 'Defi Mèt' : '🔒 Defi Mèt'}</span><small>{challengeUnlocked ? 'Advanced mixed table decisions' : 'Finish Egzamen Final first'}</small>
          </button>
          <button type="button" className={aheadUnlocked ? 'unlocked' : ''} onClick={() => chooseTrack('ahead')} disabled={!aheadUnlocked}>
            <b>13</b><span>{aheadUnlocked ? 'Plan Davans' : '🔒 Plan Davans'}</span><small>{aheadUnlocked ? 'Think two and three moves ahead' : 'Finish Defi Mèt first'}</small>
          </button>
        </div>
      </section>
    </main>
  )
}