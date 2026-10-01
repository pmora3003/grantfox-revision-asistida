import { useState } from 'react'
import type { FileStat } from '../types'

const INITIAL_LINES = 400

type Props = {
  diff: string
  fileStats?: FileStat[]
  collapsedDefault?: boolean
}

export function DiffView({ diff, fileStats = [], collapsedDefault = true }: Props) {
  const [expanded, setExpanded] = useState(!collapsedDefault)
  const [showAll, setShowAll] = useState(false)
  const lines = (diff ?? '').split('\n')
  const visible = showAll ? lines : lines.slice(0, INITIAL_LINES)
  const hasMore = lines.length > INITIAL_LINES

  return (
    <div className="diff-section">
      {fileStats.length > 0 && (
        <ul className="diff-file-list">
          {fileStats.map((f) => (
            <li key={f.path}>
              <span className="diff-file-path">{f.path}</span>
              <span className="diff-file-stats">
                <span className="diff-add-count">+{f.additions}</span>{' '}
                <span className="diff-del-count">-{f.deletions}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? 'Ocultar diff' : 'Mostrar diff coloreado'}
      </button>
      {expanded && (
        <>
          <div className="diff-block" role="region" aria-label="Conjunto de diferencias">
            {visible.map((line, i) => {
              let cls = 'diff-line'
              if (line.startsWith('+') && !line.startsWith('+++')) cls += ' diff-add'
              else if (line.startsWith('-') && !line.startsWith('---')) cls += ' diff-del'
              else if (line.startsWith('@@') || line.startsWith('diff ')) cls += ' diff-hunk'
              return (
                <div key={i} className={cls}>
                  {line || ' '}
                </div>
              )
            })}
          </div>
          {hasMore && !showAll && (
            <button type="button" className="btn btn-ghost" onClick={() => setShowAll(true)}>
              Mostrar más ({lines.length - INITIAL_LINES} líneas restantes)
            </button>
          )}
        </>
      )}
    </div>
  )
}
