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
  
  // Round 0: Play-In (if exists)
  if (hasPlayIn && matchesByRound.has(0)) {
    const playInMatches = matchesByRound.get(0)!
    playInMatches.forEach((match, index) => {
      const nodeId = match.id || `playin-${index}`
      const leftSeed = match.left.seed > 0 ? match.left.seed : null
      const rightSeed = match.right.seed > 0 ? match.right.seed : null
      
      const elkNode: ElkNode = {
        id: nodeId,
        width: 80,
        height: 100,
        labels: [
          { text: leftSeed ? `#${leftSeed}` : '?' },
          { text: rightSeed ? `#${rightSeed}` : '?' }
        ],
        layoutOptions: {
          'elk.layered.layer': '0',
          'elk.portAlignment': 'CENTER',
        }
      }
      
      nodes.push(elkNode)
    })
  }
  
  // Round 1: Round of T (first main round)
  // CRITICAL: Round 1 contains ONLY real matches (both teams exist)
  // BYE seeds skip Round 1 and go directly to QF
  
  // Build canonical pairs for bracketSize
  const canonicalPairs = buildCanonicalPairs(bracketSize)
  
  // Track which seeds have BYE (will go directly to QF)
  const byeSeeds = new Set<number>()
  
  // Create seed map for quick lookup
  const seedMap = new Map<number, { seed: number; teamId?: string; teamName?: string }>()
  
  // Collect all teams from matches
  matches.forEach(match => {
    if (match.left.seed > 0 && match.left.teamId) {
      seedMap.set(match.left.seed, {
        seed: match.left.seed,
        teamId: match.left.teamId,
        teamName: match.left.teamName,
      })
    }
    if (match.right.seed > 0 && match.right.teamId) {
      seedMap.set(match.right.seed, {
        seed: match.right.seed,
        teamId: match.right.teamId,
        teamName: match.right.teamName,
      })
    }
  })
  
  // Calculate total qualified teams
  const totalQualified = seedMap.size
  
  // Process canonical pairs: only create Round 1 matches where BOTH teams exist
  const round1Matches: BracketMatch[] = []
  
  canonicalPairs.forEach(([seedA, seedB], index) => {
    const leftSeed = Math.min(seedA, seedB)
    const rightSeed = Math.max(seedA, seedB)
    
    const leftTeam = seedMap.get(leftSeed)
    const rightTeam = seedMap.get(rightSeed)
    
    // Check if seeds exist (seed <= totalQualified means team exists)
    const leftExists = leftSeed <= totalQualified && leftTeam !== undefined
    const rightExists = rightSeed <= totalQualified && rightTeam !== undefined
    
    // Only create Round 1 match if BOTH teams exist
    if (leftExists && rightExists) {
      // Find match from API data
      const match = matches.find(m => 
        m.round === 1 &&
        ((m.left.seed === leftSeed && m.right.seed === rightSeed) ||
         (m.left.seed === rightSeed && m.right.seed === leftSeed))
      )
      
      if (match) {
        round1Matches.push(match)
        
        const nodeId = match.id || `round1-${index}`
        
        const elkNode: ElkNode = {
          id: nodeId,
          width: 80,
          height: 100,
          labels: [
            { text: match.left.seed > 0 ? `#${match.left.seed}` : '?' },
            { text: match.right.seed > 0 ? `#${match.right.seed}` : '?' }
          ],
          layoutOptions: {
            'elk.layered.layer': '1',
            'elk.portAlignment': 'CENTER',
          }
        }
        
        nodes.push(elkNode)
        
        // Connect from Play-In if winner goes here
        if (hasPlayIn && matchesByRound.has(0)) {
          const playInMatches = matchesByRound.get(0)!
          playInMatches.forEach(playInMatch => {
            if (playInMatch.winnerTeamId && 
                (match.left.teamId === playInMatch.winnerTeamId || match.right.teamId === playInMatch.winnerTeamId)) {
              edges.push({
                id: `edge-playin-${playInMatch.id}-${nodeId}`,
                sources: [playInMatch.id],
                targets: [nodeId],
              })
            }
          })
        }
      }
    } else {
      // One or both seeds don't exist - this is a BYE situation
      // Mark the existing seed as having BYE (will go to QF)
      if (leftExists && !rightExists) {
        byeSeeds.add(leftSeed)
      } else if (rightExists && !leftExists) {
        byeSeeds.add(rightSeed)
      }
      // If both don't exist, skip this pair entirely
    }
  })
  
  // QF (Quarter-Finals) - this is where BYE seeds go
  // QF contains:
  // 1. Seeds with BYE (waiting for winner of their "neighbor" pair)
  // 2. Winners from Round 1 matches
  
  const totalRounds = Math.ceil(Math.log2(bracketSize))
  const qfRound = totalRounds > 2 ? 2 : 1 // QF is typically round 2 (or round 1 if only 2 rounds)
  
  // Group pairs for QF: each QF match comes from 2 pairs in Round 1
  const qfPairs: Array<{ pair1: [number, number]; pair2: [number, number] }> = []
  
  // Build QF pairs from canonical bracket structure
  for (let i = 0; i < canonicalPairs.length; i += 2) {
    if (i + 1 < canonicalPairs.length) {
      qfPairs.push({
        pair1: canonicalPairs[i],
        pair2: canonicalPairs[i + 1],
      })
    }
  }
  
  const qfMatches: BracketMatch[] = []
  
  qfPairs.forEach((qfPair, qfIndex) => {
    const [seedA1, seedB1] = qfPair.pair1
    const [seedA2, seedB2] = qfPair.pair2
    
    // For QF: left side comes from pair1, right side comes from pair2
    // Determine which seed from each pair goes to QF:
    // - If pair has BYE, the existing seed goes to QF
    // - If pair has both teams, winner goes to QF (or "?" if not finished)
    
    // Process pair1 (left side of QF)
    const pair1LeftExists = seedA1 <= totalQualified && seedMap.has(seedA1)
    const pair1RightExists = seedB1 <= totalQualified && seedMap.has(seedB1)
    const pair1HasBye = (pair1LeftExists && !pair1RightExists) || (!pair1LeftExists && pair1RightExists)
    const pair1BothExist = pair1LeftExists && pair1RightExists
    
    // Process pair2 (right side of QF)
    const pair2LeftExists = seedA2 <= totalQualified && seedMap.has(seedA2)
    const pair2RightExists = seedB2 <= totalQualified && seedMap.has(seedB2)
    const pair2HasBye = (pair2LeftExists && !pair2RightExists) || (!pair2LeftExists && pair2RightExists)
    const pair2BothExist = pair2LeftExists && pair2RightExists
    
    // Determine left seed for QF
    let leftSeed: number
    let leftTeam: { seed: number; teamId?: string; teamName?: string } | null = null
    let leftRound1Match: BracketMatch | null = null
    
    if (pair1HasBye) {
      // BYE situation - the existing seed goes to QF
      leftSeed = pair1LeftExists ? seedA1 : seedB1
      leftTeam = seedMap.get(leftSeed) || null
    } else if (pair1BothExist) {
      // Both exist - find Round 1 match and get winner
      leftRound1Match = round1Matches.find(m => 
        (m.left.seed === seedA1 && m.right.seed === seedB1) ||
        (m.left.seed === seedB1 && m.right.seed === seedA1)
      )
      if (leftRound1Match && leftRound1Match.winnerTeamId) {
        leftSeed = leftRound1Match.winnerSeed || seedA1
        leftTeam = {
          seed: leftSeed,
          teamId: leftRound1Match.winnerTeamId,
          teamName: leftRound1Match.winnerTeamName,
        }
      } else {
        leftSeed = Math.min(seedA1, seedB1) // Will show as "?"
      }
    } else {
      leftSeed = Math.min(seedA1, seedB1) // Will show as "?"
    }
    
    // Determine right seed for QF
    let rightSeed: number
    let rightTeam: { seed: number; teamId?: string; teamName?: string } | null = null
    let rightRound1Match: BracketMatch | null = null
    
    if (pair2HasBye) {
      // BYE situation - the existing seed goes to QF
      rightSeed = pair2LeftExists ? seedA2 : seedB2
      rightTeam = seedMap.get(rightSeed) || null
    } else if (pair2BothExist) {
      // Both exist - find Round 1 match and get winner
      rightRound1Match = round1Matches.find(m => 
        (m.left.seed === seedA2 && m.right.seed === seedB2) ||
        (m.left.seed === seedB2 && m.right.seed === seedA2)
      )
      if (rightRound1Match && rightRound1Match.winnerTeamId) {
        rightSeed = rightRound1Match.winnerSeed || seedA2
        rightTeam = {
          seed: rightSeed,
          teamId: rightRound1Match.winnerTeamId,
          teamName: rightRound1Match.winnerTeamName,
        }
      } else {
        rightSeed = Math.min(seedA2, seedB2) // Will show as "?"
      }
    } else {
      rightSeed = Math.min(seedA2, seedB2) // Will show as "?"
    }
    
    // Create QF match node
    const qfNodeId = `qf-${qfIndex}`
    
    const elkNode: ElkNode = {
      id: qfNodeId,
      width: 80,
      height: 100,
      labels: [
        { text: leftTeam ? `#${leftSeed}` : (leftRound1Match ? '?' : `#${leftSeed}`) },
        { text: rightTeam ? `#${rightSeed}` : (rightRound1Match ? '?' : `#${rightSeed}`) }
      ],
      layoutOptions: {
        'elk.layered.layer': String(qfRound),
        'elk.portAlignment': 'CENTER',
      }
    }
    
    nodes.push(elkNode)
    
    // Connect from Round 1 matches or BYE seeds
    if (leftRound1Match) {
      edges.push({
        id: `edge-round1-${leftRound1Match.id}-${qfNodeId}`,
        sources: [leftRound1Match.id],
        targets: [qfNodeId],
      })
    }
    
    if (rightRound1Match) {
      edges.push({
        id: `edge-round1-${rightRound1Match.id}-${qfNodeId}`,
        sources: [rightRound1Match.id],
        targets: [qfNodeId],
      })
    }
    
    // Note: BYE seeds don't need edges - they're already in QF
  })
  
  // Subsequent rounds (SF, Final) from QF winners
  const maxRound = Math.max(...Array.from(matchesByRound.keys()).filter(r => r > qfRound), qfRound)
  
  for (let round = qfRound + 1; round <= maxRound; round++) {
    if (matchesByRound.has(round)) {
      const roundMatches = matchesByRound.get(round)!
      roundMatches.forEach((match, index) => {
        const nodeId = match.id || `round${round}-${index}`
        
        const elkNode: ElkNode = {
          id: nodeId,
          width: 80,
          height: 100,
          labels: [
            { text: match.left.seed > 0 ? `#${match.left.seed}` : '?' },
            { text: match.right.seed > 0 ? `#${match.right.seed}` : '?' }
          ],
          layoutOptions: {
            'elk.layered.layer': String(round),
            'elk.portAlignment': 'CENTER',
          }
        }
        
        nodes.push(elkNode)
        
        // Connect from previous round
        const prevRound = round - 1
        if (prevRound === qfRound) {
          // Connect from QF matches
          const qfMatch = qfMatches[index * 2] || nodes.find(n => n.id.startsWith('qf-') && n.layoutOptions?.['elk.layered.layer'] === String(qfRound))
          if (qfMatch) {
            edges.push({
              id: `edge-qf-${qfMatch.id}-${nodeId}`,
              sources: [qfMatch.id],
              targets: [nodeId],
            })
          }
          const qfMatch2 = qfMatches[index * 2 + 1] || nodes.find(n => n.id.startsWith('qf-') && n.layoutOptions?.['elk.layered.layer'] === String(qfRound))
          if (qfMatch2) {
            edges.push({
              id: `edge-qf-${qfMatch2.id}-${nodeId}`,
              sources: [qfMatch2.id],
              targets: [nodeId],
            })
          }
        } else if (matchesByRound.has(prevRound)) {
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
      layoutOptions: {
        'elk.layered.layer': String(maxRound + 1),
        'elk.portAlignment': 'CENTER',
      }
    }
    
    nodes.push(elkNode)
    
    edges.push({
      id: `edge-final-winner`,
      sources: [finalMatch.id || `round${maxRound}-0`],
      targets: [winnerNodeId],
    })
  }
  
  // Build ELK graph with properties
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

