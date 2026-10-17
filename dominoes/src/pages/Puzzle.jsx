import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TileFace from '../components/TileFace'
import './Puzzle.css'

const PUZZLES = [
  {
    id: 'legal-1',
    title: 'Find the Legal Move',
    lesson: 'A domino can be played when one side matches an open end.',
    ends: [6, 3],
    hand: [[6, 2], [5, 1], [4, 4], [0, 2]],
    best: '6-2',
    valid: ['6-2'],
    feedback: {
      '6-2': 'Correct. The board has an open 6, so 6-2 can connect to it.',
    },
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
    feedback: {
      '4-4': 'Correct. 4-4 is a double and it connects to the open 4.',
    },
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
    feedback: {
      PASS: 'Correct. None of your tiles contain a 3 or a 4, so you must pass.',
    },
  },
]

const keyOf = tile => tile.join('-')

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
  const [index, setIndex] = useState(0)
  const [choice, setChoice] = useState(null)
  const [result, setResult] = useState(null)
  const [completed, setCompleted] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dekabess_puzzle_basics') || '[]') } catch { return [] }
  })

  const puzzle = PUZZLES[index]
  const doneCount = completed.length
  const progress = Math.round((doneCount / PUZZLES.length) * 100)

  useEffect(() => {
    try { localStorage.setItem('dekabess_puzzle_basics', JSON.stringify(completed)) } catch { /* ignore */ }
  }, [completed])

  const explanation = useMemo(() => {
    if (!result) return ''
    if (result.correct) return puzzle.feedback[result.key] || 'Correct.'
    if (result.key === 'PASS') return `Not yet. You still have a legal play: ${puzzle.valid.join(' or ')}.`
    return `${result.key} cannot connect to either open end (${puzzle.ends[0]} or ${puzzle.ends[1]}).`
  }, [result, puzzle])

  function answer(key) {
    if (result) return
    setChoice(key)
    const correct = puzzle.valid.includes(key)
    setResult({ key, correct })
    if (correct) {
      setCompleted(prev => prev.includes(puzzle.id) ? prev : [...prev, puzzle.id])
    }
  }

  function next() {
    if (index < PUZZLES.length - 1) {
      setIndex(i => i + 1)
      setChoice(null)
      setResult(null)
    } else {
      setIndex(0)
      setChoice(null)
      setResult(null)
    }
  }

  function selectPuzzle(i) {
    setIndex(i)
    setChoice(null)
    setResult(null)
  }

  return (
    <main className="puzzle-page">
      <header className="puzzle-topbar">
        <button type="button" className="puzzle-back" onClick={() => navigate('/')}>← Back</button>
        <div>
          <div className="puzzle-kicker">DOMINO TRAINING</div>
          <h1>Premye Pa</h1>
        </div>
        <div className="puzzle-progress-text">{doneCount}/{PUZZLES.length}</div>
      </header>

      <section className="puzzle-progress" aria-label="Basics progress">
        <div style={{ width: `${progress}%` }} />
      </section>

      <nav className="puzzle-dots" aria-label="Choose puzzle">
        {PUZZLES.map((p, i) => (
          <button
            type="button"
            key={p.id}
            className={`puzzle-dot ${i === index ? 'active' : ''} ${completed.includes(p.id) ? 'done' : ''}`}
            onClick={() => selectPuzzle(i)}
            aria-label={`Puzzle ${i + 1}: ${p.title}`}
          >
            {completed.includes(p.id) ? '✓' : i + 1}
          </button>
        ))}
      </nav>

      <section className="puzzle-card">
        <div className="puzzle-number">PUZZLE {index + 1}</div>
        <h2>{puzzle.title}</h2>
        <p className="puzzle-lesson">{puzzle.lesson}</p>

        <div className="puzzle-board">
          <div className="puzzle-board-label">OPEN ENDS</div>
          <div className="puzzle-ends" aria-label={`Open ends ${puzzle.ends[0]} and ${puzzle.ends[1]}`}>
            <span>{puzzle.ends[0]}</span>
            <div className="puzzle-chain-line" />
            <span>{puzzle.ends[1]}</span>
          </div>
        </div>

        <div className="puzzle-question">What would you play?</div>

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

        {result && (
          <div className={`puzzle-feedback ${result.correct ? 'correct' : 'wrong'}`} aria-live="polite">
            <strong>{result.correct ? '✓ Correct' : '✕ Try again next time'}</strong>
            <p>{explanation}</p>
            <div className="puzzle-feedback-actions">
              {!result.correct && (
                <button type="button" onClick={() => { setChoice(null); setResult(null) }}>Try Again</button>
              )}
              {result.correct && (
                <button type="button" onClick={next}>{index === PUZZLES.length - 1 ? 'Restart Basics' : 'Next Puzzle →'}</button>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="puzzle-coming">
        <h3>Training path</h3>
        <div className="puzzle-path">
          <div className="unlocked"><b>1</b><span>Premye Pa</span><small>Legal moves & passing</small></div>
          <div><b>2</b><span>Kontwòl</span><small>Coming next</small></div>
          <div><b>3</b><span>Blokaj</span><small>Coming next</small></div>
          <div><b>4</b><span>Memwa</span><small>Coming next</small></div>
        </div>
      </section>
    </main>
  )
}
