declare module '@g-loot/react-tournament-brackets' {
  export * from '@g-loot/react-tournament-brackets/dist/cjs/index'
  export { default as SingleEliminationBracket } from '@g-loot/react-tournament-brackets/dist/cjs/bracket-single/single-elim-bracket'
  export { default as DoubleEliminationBracket } from '@g-loot/react-tournament-brackets/dist/cjs/bracket-double/double-elim-bracket'
  export { default as Match } from '@g-loot/react-tournament-brackets/dist/cjs/components/match'
  export { default as SVGViewer } from '@g-loot/react-tournament-brackets/dist/cjs/svg-viewer'
  export { createTheme } from '@g-loot/react-tournament-brackets/dist/cjs/themes/themes'
  export { MATCH_STATES } from '@g-loot/react-tournament-brackets/dist/cjs/core/match-states'
}

