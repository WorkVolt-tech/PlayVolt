import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TileFace from '../components/TileFace'
import './Puzzle.css'

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
    clue: 'The pile is empty. Your opponent passed when the open ends were 2 and 5. The board is now 4 and 6.',
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
    clue: 'The pile is empty. Earlier, your opponent passed on open ends 4 and 1. Current ends: 6 and 4.',
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
    clue: 'The pile is empty. Your opponent previously passed while 3 was open. Current ends: 5 and 6.',
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
    clue: 'The pile is empty. The opponent passed once on 0/4 and later on 4/6. Current ends: 2 and 6.',
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
    clue: 'The pile is empty. Your opponent passed when 5 was open. Current ends: 3 and 6.',
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
    clue: 'The pile is empty. The open ends were 2 and 5. Your opponent passed.',
    question: 'What is the strongest conclusion?',
    options: [
      'At that moment they had no playable 2 or 5',
      'They definitely have a double',
      'They have only high tiles left',
      'They must be holding 6-6',
    ],
    best: 'At that moment they had no playable 2 or 5',
    feedback: 'Correct. With no tile left to draw, a pass means they could not match either open end. That is information about 2 and 5 — not about the rest of their hand.',
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
    clue: 'The pile is empty. An opponent passed when the ends were 1 and 4.',
    question: 'Which statement is actually supported by that pass?',
    options: [
      'They could not play a 1 or a 4 at that moment',
      'They have no doubles at all',
      'Their highest tile is a 5',
      'They are saving a 6 for later',
    ],
    best: 'They could not play a 1 or a 4 at that moment',
    feedback: 'Correct. The pass tells you about the open suits at that moment. It does not reveal the rest of their hand.',
  },
  {
    id: 'read-4',
    title: 'Read the Pattern',
    lesson: 'Repeated behavior can make a clue stronger.',
    clue: 'The pile is empty. The same opponent passed once on 4/0 and later on 4/6.',
    question: 'Which number looks like their clearest weakness?',
    options: ['0', '4', '6', 'There is no useful clue'],
    best: '4',
    feedback: 'Correct. 4 is the shared number across both passes, so it is the clearest repeated weakness.',
  },
  {
    id: 'read-5',
    title: 'Plan From the Read',
    lesson: 'The goal is not just noticing a weakness — it is using it on your next move.',
    clue: 'The pile is empty. Your opponent passed when 5 was open. The current ends are 3 and 6, and you can play either 3-5 or 6-2.',
    question: 'Which play better uses what you learned?',
    options: ['3-5', '6-2', 'Pass', 'Either move is identical'],
    best: '3-5',
    feedback: 'Correct. Playing 3-5 on the 3 OPENS 5 again, bringing the opponent’s known weakness back onto the table.',
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
}

const keyOf = tile => tile.join('-')

function readProgress(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
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

  const explanation = useMemo(() => {
    if (!result) return ''
    if (track.mode === 'memory') {
      return result.correct ? puzzle.feedback : `Not quite. Study the sequence again and try to remember the details.`
    }
    if (track.mode === 'inference') {
      return result.correct ? puzzle.feedback : 'Not quite. Focus only on what the opponent’s pass or pattern actually tells you.'
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
              <span>READ THE TABLE</span>
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
        </div>
      </section>
    </main>
  )
}