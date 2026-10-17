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
    title: 'Pass or Play?',
    lesson: 'You pass only when none of your dominoes can match either open end.',
    ends: [3, 4],
    hand: [[6, 6], [5, 2], [1, 0], [2, 2]],
    best: 'PASS',
    valid: ['PASS'],
    feedback: { PASS: 'Correct. None of your tiles contain a 3 or a 4, so you must pass.' },
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
    lesson: 'Doubles are powerful when they reinforce a number you already control.',
    ends: [3, 1],
    hand: [[3, 3], [3, 5], [3, 0], [1, 6], [5, 2]],
    best: '3-3',
    valid: ['3-3', '3-5', '3-0', '1-6'],
    feedback: {
      '3-3': 'Best move. You establish the 3 double while still holding two more 3s, making it harder for the table to get away from your suit.',
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
    lesson: 'A pass gives you information. If an opponent could not play on either open end, remember those numbers.',
    clue: 'Your opponent passed when the open ends were 2 and 5. The board is now 2 and 6.',
    ends: [2, 6],
    hand: [[2, 4], [6, 1], [6, 3], [4, 5]],
    best: '2-4',
    valid: ['2-4', '6-1', '6-3'],
    feedback: {
      '2-4': 'Best move. Your opponent already showed they likely have no 2. Keeping 2 open gives you a strong chance to make them pass again.',
      '6-1': 'Legal, but it lets the game escape from the number your opponent already failed to answer.',
      '6-3': 'Legal, but it wastes useful information. You know more about their weakness on 2 than on 3.',
    },
  },
  {
    id: 'block-2',
    title: 'Close the Door',
    lesson: 'When you know an opponent is weak in a suit, try to steer the table back to it.',
    clue: 'Earlier, your opponent passed on 4 and 1. Current ends: 6 and 4.',
    ends: [6, 4],
    hand: [[6, 1], [6, 5], [4, 2], [2, 1]],
    best: '6-1',
    valid: ['6-1', '6-5', '4-2'],
    feedback: {
      '6-1': 'Best move. It opens 1, another number the opponent already failed to answer. That keeps pressure on them.',
      '6-5': 'Legal, but 5 gives your opponent a fresh number with no known weakness.',
      '4-2': 'Legal, but it moves away from both numbers you already saw the opponent miss.',
    },
  },
  {
    id: 'block-3',
    title: 'Do Not Free Them',
    lesson: 'A blocking move is often about what you refuse to open.',
    clue: 'Your opponent passed when 3 was open. You currently control both ends: 3 and 5.',
    ends: [3, 5],
    hand: [[3, 6], [3, 1], [5, 2], [2, 6]],
    best: '3-6',
    valid: ['3-6', '3-1', '5-2'],
    feedback: {
      '3-6': 'Best move. It uses the opponent’s known weakness on 3 while opening 6, a number you can still answer with 2-6.',
      '3-1': 'Good pressure on 3, but opening 1 leaves you with no backup 1.',
      '5-2': 'Legal, but it abandons the 3 that already made your opponent pass.',
    },
  },
  {
    id: 'block-4',
    title: 'Read Two Passes',
    lesson: 'Repeated passes are even stronger clues. Use them to narrow what the opponent may be holding.',
    clue: 'The opponent passed once on 0/4 and later on 4/6. Current ends: 4 and 2.',
    ends: [4, 2],
    hand: [[4, 5], [4, 1], [2, 6], [5, 6]],
    best: '4-5',
    valid: ['4-5', '4-1', '2-6'],
    feedback: {
      '4-5': 'Best move. Two separate passes strongly suggest they are short on 4s. You also keep 5-6 as a follow-up route.',
      '4-1': 'Still a good blocking idea, but 1 is isolated in your hand.',
      '2-6': 'Legal, but it gives up the strongest clue you have: the opponent has twice failed around 4.',
    },
  },
  {
    id: 'block-5',
    title: 'Block Without Trapping Yourself',
    lesson: 'The best block pressures the opponent while still leaving you a way to continue.',
    clue: 'Your opponent passed on 5. Current ends: 5 and 3.',
    ends: [5, 3],
    hand: [[5, 2], [5, 0], [3, 6], [2, 6], [2, 4]],
    best: '5-2',
    valid: ['5-2', '5-0', '3-6'],
    feedback: {
      '5-2': 'Best move. You attack the opponent’s known weakness on 5 and open 2, a suit you still control with two more tiles.',
      '5-0': 'It keeps pressure on 5, but blank gives you no follow-up connection in this hand.',
      '3-6': 'Legal, but it lets the opponent escape the 5 suit you know they struggled with.',
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

    if (track.mode === 'memory') {
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
    setTrackId(id)
    setIndex(0)
    resetAnswer()
  }

  const resultTitle = track.mode === 'memory'
    ? (result?.correct ? '✓ Remembered' : '✕ Not quite')
    : (track.mode === 'strategy' && result?.legal
      ? (result.best ? '★★★ Best Move' : '★★ Good Move')
      : (result?.correct ? '✓ Correct' : '✕ Not a legal move'))

  return (
    <main className="puzzle-page">
      <header className="puzzle-topbar">
        <button type="button" className="puzzle-back" onClick={() => navigate('/')}>← Back</button>
        <div>
          <div className="puzzle-kicker">DOMINO TRAINING</div>
          <h1>{track.label}</h1>
        </div>
        <div className="puzzle-progress-text">{doneCount}/{puzzles.length}</div>
      </header>

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

        {puzzle.clue && (
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
        </div>
      </section>
    </main>
  )
}