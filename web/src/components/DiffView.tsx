export function DiffView({ diff }: { diff: string }) {
  const lines = (diff ?? '').split('\n')
  return (
    <div className="diff-block" role="region" aria-label="Conjunto de diferencias">
      {lines.map((line, i) => {
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
  )
}
