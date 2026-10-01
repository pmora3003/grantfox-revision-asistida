import type { NivelAceptacion } from '../types'
import { levelLabel } from '../labels'

export function LevelBadge({ level }: { level: NivelAceptacion }) {
  return <span className={`level-badge level-${level}`}>{levelLabel(level)}</span>
}
