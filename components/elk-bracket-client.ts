// Client-side ELK bracket layout utilities
// Builds graph model for elkjs to calculate node positions

// ELK types
export interface ElkNode {
  id: string
  width: number
  height: number
  x?: number
  y?: number
  labels?: Array<{ text: string }>
  layoutOptions?: {
    [key: string]: string
  }
  children?: ElkNode[]
  ports?: Array<{
    id: string
    x?: number
    y?: number
    width: number
    height: number
  }>
}

export interface ElkEdge {
  id: string
  sources: string[]
  targets: string[]
  sourcePort?: string
  targetPort?: string
  sections?: Array<{
    startPoint: { x: number; y: number }
    endPoint: { x: number; y: number }
    bendPoints?: Array<{ x: number; y: number }>
  }>
}

export interface ElkGraph {
  id: string
  children: ElkNode[]
  edges: ElkEdge[]
  layoutOptions?: {
    [key: string]: string
  }
}

export interface BracketMatch {
  id: string
  round: number  // 0 = Play-In, 1..N
  position: number
  left: { seed: number; teamId?: string; teamName?: string; isBye?: boolean }
  right: { seed: number; teamId?: string; teamName?: string; isBye?: boolean }
  status: 'scheduled' | 'in_progress' | 'finished'
  winnerSeed?: number
  winnerTeamId?: string
  winnerTeamName?: string
  matchId?: string
  nextMatchId?: string
  nextSlot?: 'left' | 'right'
}

/**
 * Build ELK graph from bracket matches
 * 
 * Rules:
 * - Node = match (not participant)
 * - Layer = round (Play-In = 0, Round 1 = 1, Round 2 = 2, etc.)
 * - Use API data directly, don't redefine structure
 * - Connect rounds sequentially: round N → round N+1
 * - BYE not drawn as separate match
 */
export function buildElkBracketGraph(
  matches: BracketMatch[],
  totalTeams: number,
  bracketSize: number
): ElkGraph {
  // Group matches by round
  const matchesByRound = new Map<number, BracketMatch[]>()
  matches.forEach(match => {
    const round = match.round
    if (!matchesByRound.has(round)) {
      matchesByRound.set(round, [])
    }
    matchesByRound.get(round)!.push(match)
  })
  
  // Sort matches within each round by position
  matchesByRound.forEach((roundMatches, round) => {
    roundMatches.sort((a, b) => a.position - b.position)
  })
  
  // Build nodes for each round from API data
  const nodes: ElkNode[] = []
  const edges: ElkEdge[] = []
  
  // Get all rounds sorted
  const rounds = Array.from(matchesByRound.keys()).sort((a, b) => a - b)
  const maxRound = rounds.length > 0 ? Math.max(...rounds) : 0
  
  // Create nodes for each round
  rounds.forEach(round => {
    const roundMatches = matchesByRound.get(round)!
    
    roundMatches.forEach((match) => {
      const nodeId = match.id || `round${round}-${match.position}`
      
      // Determine labels based on match data
      const leftLabel = match.left.seed > 0 ? `#${match.left.seed}` : '?'
      const rightLabel = match.right.seed > 0 ? `#${match.right.seed}` : '?'
      
      const elkNode: ElkNode = {
        id: nodeId,
        width: 80,
        height: 100,
        labels: [
          { text: leftLabel },
          { text: rightLabel }
        ],
        layoutOptions: {
          'elk.layered.layer': String(round),
          'elk.portAlignment': 'CENTER',
        }
      }
      
      nodes.push(elkNode)
    })
  })
  
  // Create edges: connect rounds sequentially
  // Round N → Round N+1
  for (let round = 0; round < maxRound; round++) {
    const currentRoundMatches = matchesByRound.get(round) || []
    const nextRoundMatches = matchesByRound.get(round + 1) || []
    
    if (currentRoundMatches.length === 0 || nextRoundMatches.length === 0) {
      continue
    }
    
    // Connect matches: each match in next round comes from 2 matches in current round
    nextRoundMatches.forEach((nextMatch, nextIndex) => {
      const nextNodeId = nextMatch.id || `round${round + 1}-${nextMatch.position}`
      
      // Find source matches: previous round matches that connect to this match
      // Use nextMatchId/nextSlot if available, otherwise use position-based pairing
      const sourceMatches: BracketMatch[] = []
      
      if (nextMatch.nextMatchId) {
        // Match has explicit connection info
        // This is handled by nextMatchId, but we need to find the source matches
        // For now, use position-based pairing
        const prevMatch1 = currentRoundMatches[nextIndex * 2]
        const prevMatch2 = currentRoundMatches[nextIndex * 2 + 1]
        if (prevMatch1) sourceMatches.push(prevMatch1)
        if (prevMatch2) sourceMatches.push(prevMatch2)
      } else {
        // Position-based pairing: each match in next round comes from 2 matches in current round
        const prevMatch1 = currentRoundMatches[nextIndex * 2]
        const prevMatch2 = currentRoundMatches[nextIndex * 2 + 1]
        if (prevMatch1) sourceMatches.push(prevMatch1)
        if (prevMatch2) sourceMatches.push(prevMatch2)
      }
      
      // Create edges from source matches to next match
      sourceMatches.forEach((sourceMatch) => {
        const sourceNodeId = sourceMatch.id || `round${round}-${sourceMatch.position}`
        
        edges.push({
          id: `edge-${sourceNodeId}-${nextNodeId}`,
          sources: [sourceNodeId],
          targets: [nextNodeId],
        })
      })
    })
  }
  
  // Winner node (if final exists)
  if (maxRound > 0) {
    const finalRoundMatches = matchesByRound.get(maxRound) || []
    if (finalRoundMatches.length > 0) {
      const finalMatch = finalRoundMatches[0]
      const finalNodeId = finalMatch.id || `round${maxRound}-0`
      
      // Find final match node
      const finalMatchNode = nodes.find(n => n.id === finalNodeId)
      
      if (finalMatchNode) {
        const winnerNodeId = 'winner'
        
        const elkNode: ElkNode = {
          id: winnerNodeId,
          width: 60,
          height: 60,
          labels: [
            { text: finalMatch.winnerSeed ? `#${finalMatch.winnerSeed}` : '?' }
          ],
          layoutOptions: {
            'elk.layered.layer': String(maxRound + 1),
            'elk.portAlignment': 'CENTER',
          }
        }
        
        nodes.push(elkNode)
        
        edges.push({
          id: `edge-final-winner`,
          sources: [finalNodeId],
          targets: [winnerNodeId],
        })
      }
    }
  }
  
  // Build ELK graph
  const graph: ElkGraph = {
    id: 'bracket',
    children: nodes,
    edges: edges,
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.layered.considerModelOrder': 'NODES_AND_EDGES',
      'elk.spacing.nodeNode': '32',
      'elk.layered.spacing.nodeNodeBetweenLayers': '140',
      'elk.layered.crossingMinimization.semiInteractive': 'true',
      'elk.layered.nodePlacement.favorStraightEdges': 'true',
      'elk.edgeRouting': 'ORTHOGONAL',
    }
  }
  
  return graph
}

/**
 * Build canonical bracket pairs for a given bracket size
 * This is used for determining the correct pairing order
 */
function buildCanonicalPairs(bracketSize: number): Array<[number, number]> {
  if (bracketSize <= 1) return []
  
  // For bracket size 2^N, generate canonical pairs
  const pairs: Array<[number, number]> = []
  
  // Recursive function to generate pairs
  function generatePairs(seeds: number[]): Array<[number, number]> {
    if (seeds.length <= 1) return []
    if (seeds.length === 2) return [[seeds[0], seeds[1]]]
    
    const mid = seeds.length / 2
    const top = seeds.slice(0, mid)
    const bottom = seeds.slice(mid)
    
    const topPairs = generatePairs(top)
    const bottomPairs = generatePairs(bottom)
    
    const result: Array<[number, number]> = []
    
    // Interleave pairs: first from top, then from bottom
    for (let i = 0; i < topPairs.length; i++) {
      result.push(topPairs[i])
      if (i < bottomPairs.length) {
        result.push(bottomPairs[i])
      }
    }
    
    return result
  }
  
  // Generate seeds 1..bracketSize
  const seeds = Array.from({ length: bracketSize }, (_, i) => i + 1)
  return generatePairs(seeds)
}
