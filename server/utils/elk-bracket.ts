// ELK.js bracket layout utilities
// Builds graph model for elkjs to calculate node positions

import type { BracketMatch } from './bracket'

export interface ElkNode {
  id: string
  width: number
  height: number
  x?: number
  y?: number
  labels?: Array<{ text: string }>
  properties?: {
    [key: string]: any
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
  properties?: {
    [key: string]: any
  }
}

export interface BracketNode {
  id: string
  roundIndex: number
  slotIndex: number
  leftSeed: number | null
  rightSeed: number | null
  leftTeamId?: string
  rightTeamId?: string
  leftTeamName?: string
  rightTeamName?: string
  winnerSeed?: number
  winnerTeamId?: string
  winnerTeamName?: string
  status: 'scheduled' | 'in_progress' | 'finished'
  isBye?: boolean
}

/**
 * Build ELK graph from bracket matches
 * 
 * Rules:
 * - Node = match (not participant)
 * - Layer = round (Play-In = 0, Round of T = 1, QF = 2, SF = 3, Final = 4, Winner = 5)
 * - BYE not drawn as separate match
 * - Order within layer follows canonical bracket pattern
 */
export function buildElkBracketGraph(
  matches: BracketMatch[],
  totalTeams: number,
  bracketSize: number
): ElkGraph {
  // Calculate rounds
  const playInCount = totalTeams > bracketSize ? 2 * (totalTeams - bracketSize) : 0
  const hasPlayIn = playInCount > 0
  
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
  
  // Build nodes for each round
  const nodes: ElkNode[] = []
  const edges: ElkEdge[] = []
  const nodeMap = new Map<string, BracketNode>()
  
  // Round 0: Play-In (if exists)
  if (hasPlayIn && matchesByRound.has(0)) {
    const playInMatches = matchesByRound.get(0)!
    playInMatches.forEach((match, index) => {
      const nodeId = `playin-${index}`
      const leftSeed = match.left.seed > 0 ? match.left.seed : null
      const rightSeed = match.right.seed > 0 ? match.right.seed : null
      
      const bracketNode: BracketNode = {
        id: nodeId,
        roundIndex: 0,
        slotIndex: index,
        leftSeed,
        rightSeed,
        leftTeamId: match.left.teamId,
        rightTeamId: match.right.teamId,
        leftTeamName: match.left.teamName,
        rightTeamName: match.right.teamName,
        winnerSeed: match.winnerSeed,
        winnerTeamId: match.winnerTeamId,
        winnerTeamName: match.winnerTeamName,
        status: match.status,
      }
      
      nodeMap.set(nodeId, bracketNode)
      
      const elkNode: ElkNode = {
        id: nodeId,
        width: 80,
        height: 100,
        labels: [
          { text: leftSeed ? `#${leftSeed}` : '?' },
          { text: rightSeed ? `#${rightSeed}` : '?' }
        ],
        properties: {
          'elk.layered.layer': 0,
          'elk.portAlignment': 'CENTER',
        }
      }
      
      nodes.push(elkNode)
    })
  }
  
  // Round 1: Round of T (first main round)
  // Build canonical pairs for bracketSize
  const canonicalPairs = buildCanonicalPairs(bracketSize)
  
  if (matchesByRound.has(1)) {
    const round1Matches = matchesByRound.get(1)!
    const round1MatchMap = new Map<string, BracketMatch>()
    
    // Map Round 1 matches by their seed pair
    round1Matches.forEach(match => {
      const key = `${Math.min(match.left.seed, match.right.seed)}-${Math.max(match.left.seed, match.right.seed)}`
      round1MatchMap.set(key, match)
    })
    
    // Process canonical pairs
    canonicalPairs.forEach(([seedA, seedB], index) => {
      const leftSeed = Math.min(seedA, seedB)
      const rightSeed = Math.max(seedA, seedB)
      const key = `${leftSeed}-${rightSeed}`
      const match = round1MatchMap.get(key)
      
      const nodeId = `round1-${index}`
      
      if (match) {
        // Both teams exist - real match
        const bracketNode: BracketNode = {
          id: nodeId,
          roundIndex: 1,
          slotIndex: index,
          leftSeed: match.left.seed,
          rightSeed: match.right.seed,
          leftTeamId: match.left.teamId,
          rightTeamId: match.right.teamId,
          leftTeamName: match.left.teamName,
          rightTeamName: match.right.teamName,
          winnerSeed: match.winnerSeed,
          winnerTeamId: match.winnerTeamId,
          winnerTeamName: match.winnerTeamName,
          status: match.status,
        }
        
        nodeMap.set(nodeId, bracketNode)
        
        const elkNode: ElkNode = {
          id: nodeId,
          width: 80,
          height: 100,
          labels: [
            { text: match.left.seed > 0 ? `#${match.left.seed}` : '?' },
            { text: match.right.seed > 0 ? `#${match.right.seed}` : '?' }
          ],
          properties: {
            'elk.layered.layer': 1,
            'elk.portAlignment': 'CENTER',
          }
        }
        
        nodes.push(elkNode)
        
        // Connect from Play-In if winner goes here
        if (hasPlayIn) {
          // Find Play-In match whose winner goes to this slot
          const playInMatches = matchesByRound.get(0)!
          playInMatches.forEach(playInMatch => {
            if (playInMatch.winnerTeamId && 
                (match.left.teamId === playInMatch.winnerTeamId || match.right.teamId === playInMatch.winnerTeamId)) {
              edges.push({
                id: `edge-playin-${playInMatch.id}-${nodeId}`,
                sources: [`playin-${playInMatch.position}`],
                targets: [nodeId],
              })
            }
          })
        }
      } else {
        // BYE situation - one seed exists, goes directly to next round
        // Don't create node here, it will be in QF
      }
    })
  }
  
  // Subsequent rounds (QF, SF, Final)
  const maxRound = Math.max(...Array.from(matchesByRound.keys()).filter(r => r > 0))
  
  for (let round = 2; round <= maxRound; round++) {
    if (matchesByRound.has(round)) {
      const roundMatches = matchesByRound.get(round)!
      roundMatches.forEach((match, index) => {
        const nodeId = `round${round}-${index}`
        
        const bracketNode: BracketNode = {
          id: nodeId,
          roundIndex: round,
          slotIndex: index,
          leftSeed: match.left.seed > 0 ? match.left.seed : null,
          rightSeed: match.right.seed > 0 ? match.right.seed : null,
          leftTeamId: match.left.teamId,
          rightTeamId: match.right.teamId,
          leftTeamName: match.left.teamName,
          rightTeamName: match.right.teamName,
          winnerSeed: match.winnerSeed,
          winnerTeamId: match.winnerTeamId,
          winnerTeamName: match.winnerTeamName,
          status: match.status,
        }
        
        nodeMap.set(nodeId, bracketNode)
        
        const elkNode: ElkNode = {
          id: nodeId,
          width: 80,
          height: 100,
          labels: [
            { text: match.left.seed > 0 ? `#${match.left.seed}` : '?' },
            { text: match.right.seed > 0 ? `#${match.right.seed}` : '?' }
          ],
          properties: {
            'elk.layered.layer': round,
            'elk.portAlignment': 'CENTER',
          }
        }
        
        nodes.push(elkNode)
        
        // Connect from previous round
        const prevRound = round - 1
        if (matchesByRound.has(prevRound)) {
          const prevMatches = matchesByRound.get(prevRound)!
          // Each match in current round comes from 2 matches in previous round
          const prevMatch1 = prevMatches[index * 2]
          const prevMatch2 = prevMatches[index * 2 + 1]
          
          if (prevMatch1) {
            edges.push({
              id: `edge-${prevMatch1.id}-${nodeId}`,
              sources: [prevMatch1.id],
              targets: [nodeId],
            })
          }
          if (prevMatch2) {
            edges.push({
              id: `edge-${prevMatch2.id}-${nodeId}`,
              sources: [prevMatch2.id],
              targets: [nodeId],
            })
          }
        }
      })
    }
  }
  
  // Winner node (if final exists)
  const finalRound = matchesByRound.get(maxRound)
  if (finalRound && finalRound.length > 0) {
    const finalMatch = finalRound[0]
    const winnerNodeId = 'winner'
    
    const elkNode: ElkNode = {
      id: winnerNodeId,
      width: 60,
      height: 60,
      labels: [
        { text: finalMatch.winnerSeed ? `#${finalMatch.winnerSeed}` : '?' }
      ],
      properties: {
        'elk.layered.layer': maxRound + 1,
        'elk.portAlignment': 'CENTER',
      }
    }
    
    nodes.push(elkNode)
    
    edges.push({
      id: `edge-final-winner`,
      sources: [`round${maxRound}-0`],
      targets: [winnerNodeId],
    })
  }
  
  // Build ELK graph with properties
  const graph: ElkGraph = {
    id: 'bracket',
    children: nodes,
    edges: edges,
    properties: {
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
 * Build canonical bracket pairs for given bracket size
 */
function buildCanonicalPairs(bracketSize: number): [number, number][] {
  if (bracketSize <= 1) return []
  if (bracketSize === 2) return [[1, 2]]
  
  // Round up to nearest power of 2
  const bracketPower = nextPow2(bracketSize)
  
  // Recursively expand bracket order
  function expand(arr: number[]): number[] {
    if (arr.length * 2 === bracketPower) return arr
    const next: number[] = []
    const s = arr.length * 2
    for (const a of arr) {
      next.push(a, s + 1 - a)
    }
    return expand(next)
  }
  
  const list = expand([1])
  const mirrored = list.map(x => bracketPower + 1 - x)
  const slots = list.flatMap((x, i) => [x, mirrored[i]])
  
  // Build pairs
  const pairs: [number, number][] = []
  for (let i = 0; i < slots.length; i += 2) {
    const seedA = slots[i]
    const seedB = slots[i + 1]
    if (seedA <= bracketSize || seedB <= bracketSize) {
      pairs.push([seedA, seedB])
    }
  }
  
  return pairs
}

function nextPow2(n: number): number {
  if (n <= 0) return 1
  if (n === 1) return 1
  return 1 << Math.ceil(Math.log2(n))
}

