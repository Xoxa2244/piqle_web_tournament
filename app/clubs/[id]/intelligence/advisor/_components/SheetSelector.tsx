'use client'

import type { SheetInfo } from '../_hooks/useFileParser'

type SheetSelectorProps = {
  sheets: SheetInfo[]
  selected: number
  onSelect: (index: number) => void
}

export function SheetSelector({ sheets, selected, onSelect }: SheetSelectorProps) {
  if (sheets.length <= 1) return null

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Sheet:</span>
      <select
        value={selected}
        onChange={(e) => onSelect(Number(e.target.value))}
        className="text-sm border rounded-md px-2 py-1 bg-background"
      >
        {sheets.map((s) => (
          <option key={s.index} value={s.index}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  )
}
