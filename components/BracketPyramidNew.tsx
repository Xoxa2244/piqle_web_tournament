'use client'

import { useMemo } from 'react'
import ReactFlow, { Node, Edge, Background, Controls, MiniMap, Position } from 'reactflow'
import 'reactflow/dist/style.css'

// Import types from bracket utils
type MatchStatus = 'scheduled' | 'in_progress' | 'finished'

interface SeedSlot {
  seed: number
  teamId?: string
  teamName?: string
  isBye?: boolean
}

interface BracketMatch {
  id: string
  round: number  // 0 = Play-In, 1..N
  position: number
  left: SeedSlot
  right: SeedSlot
  status: MatchStatus
  winnerSeed?: number
  winnerTeamId?: string
  winnerTeamName?: string
  nextMatchId?: string
  nextSlot?: 'left' | 'right'
  matchId?: string
  games?: Array<{ scoreA: number; scoreB: number }>
}

interface BracketPyramidNewProps {
  matches: BracketMatch[]
  showConnectingLines?: boolean
  onMatchClick?: (matchId: string) => void
}

// Custom node component for bracket matches
function MatchNode({ data }: { data: { match: BracketMatch; onMatchClick?: (matchId: string) => void } }) {
  const { match, onMatchClick } = data
  const circleSize = 32
  const circleSpacing = 40
  
  const getSeedDisplay = (slot: SeedSlot): number | null => {
    if (slot.isBye) return null
    if (slot.seed > 0) return slot.seed
    return null
  }
  
  const leftSeed = getSeedDisplay(match.left)
  const rightSeed = getSeedDisplay(match.right)
  
  return (
    <div className="flex flex-col items-center p-2">
      {/* Left Seed Circle */}
      <div
        className={`flex items-center justify-center rounded-full border-2 transition-all cursor-pointer ${
          match.status === 'finished' && match.winnerTeamId === match.left.teamId
            ? 'bg-green-100 border-green-500'
            : match.left.isBye
            ? 'bg-white border-gray-300 opacity-50'
            : leftSeed !== null
            ? 'bg-blue-50 border-blue-300'
            : 'bg-white border-gray-300'
        }`}
        style={{
          width: `${circleSize}px`,
          height: `${circleSize}px`,
          marginBottom: `${circleSpacing}px`,
        }}
        onClick={() => onMatchClick?.(match.matchId || match.id)}
        title={match.left.teamName || (match.left.isBye ? 'BYE' : `Seed ${match.left.seed}`)}
      >
        {leftSeed !== null ? (
          <span className="text-sm font-bold text-gray-900">{leftSeed}</span>
        ) : (
          <span className="text-xs text-gray-400">?</span>
        )}
      </div>
      
      {/* Vertical line connecting circles */}
      <div 
        className="bg-gray-400"
        style={{ 
          width: '2px',
          height: '30px',
        }}
      />
      
      {/* Right Seed Circle */}
      <div
        className={`flex items-center justify-center rounded-full border-2 transition-all cursor-pointer ${
          match.status === 'finished' && match.winnerTeamId === match.right.teamId
            ? 'bg-green-100 border-green-500'
            : match.right.isBye
            ? 'bg-white border-gray-300 opacity-50'
            : rightSeed !== null
            ? 'bg-blue-50 border-blue-300'
            : 'bg-white border-gray-300'
        }`}
        style={{
          width: `${circleSize}px`,
          height: `${circleSize}px`,
        }}
        onClick={() => onMatchClick?.(match.matchId || match.id)}
        title={match.right.teamName || (match.right.isBye ? 'BYE' : `Seed ${match.right.seed}`)}
      >
        {rightSeed !== null ? (
          <span className="text-sm font-bold text-gray-900">{rightSeed}</span>
        ) : (
          <span className="text-xs text-gray-400">?</span>
        )}
      </div>
    </div>
  )
}

// Winner node component
function WinnerNode({ data }: { data: { winner?: { seed: number; teamName: string } } }) {
  const { winner } = data
  const circleSize = 32
  
  return (
    <div className="flex flex-col items-center p-2">
      <div
        className={`flex items-center justify-center rounded-full border-2 ${
          winner ? 'bg-yellow-100 border-yellow-500' : 'bg-white border-gray-300 opacity-50'
        }`}
        style={{
          width: `${circleSize}px`,
          height: `${circleSize}px`,
        }}
        title={winner ? winner.teamName : 'Winner not determined yet'}
      >
        {winner ? (
          <span className="text-sm font-bold text-gray-900">{winner.seed}</span>
        ) : (
          <span className="text-xs text-gray-400">?</span>
        )}
      </div>
    </div>
  )
}

const nodeTypes = {
  match: MatchNode,
  winner: WinnerNode,
}

export default function BracketPyramidNew({ 
  matches, 
  showConnectingLines = true, 
  onMatchClick 
}: BracketPyramidNewProps) {
  // Group matches by round
  const rounds = useMemo(() => {
    const roundsMap = new Map<number, BracketMatch[]>()
    const maxRound = matches.length > 0 ? Math.max(...matches.map(m => m.round)) : 0
    
    for (let round = 0; round <= maxRound; round++) {
      const roundMatches = matches
        .filter(m => m.round === round)
        .sort((a, b) => a.position - b.position)
      if (roundMatches.length > 0) {
        roundsMap.set(round, roundMatches)
      }
    }
    
    return roundsMap
  }, [matches])
  
  // Build nodes and edges for React Flow
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = []
    const edges: Edge[] = []
    
    const maxRound = matches.length > 0 ? Math.max(...matches.map(m => m.round)) : 0
    const roundSpacing = 250 // Horizontal spacing between rounds
    const matchSpacing = 100 // Vertical spacing between matches
    const nodeHeight = 120 // Height of each match node (circleSize * 2 + circleSpacing + matchBoxHeight)
    
    // Calculate max height for centering
    const maxMatches = Math.max(...Array.from(rounds.values()).map(matches => matches.length))
    const maxHeight = (maxMatches - 1) * matchSpacing + nodeHeight
    
    // Calculate positions for each round
    rounds.forEach((roundMatches, round) => {
      const roundX = round * roundSpacing + 150
      const matchCount = roundMatches.length
      const roundHeight = (matchCount - 1) * matchSpacing + nodeHeight
      const startY = (maxHeight - roundHeight) / 2 + 50 // Center vertically
      
      roundMatches.forEach((match, matchIdx) => {
        const y = startY + matchIdx * matchSpacing
        
        nodes.push({
          id: match.id,
          type: 'match',
          position: { x: roundX, y },
          data: { match, onMatchClick },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        })
      })
    })
    
    // Build edges between rounds
    if (showConnectingLines) {
      rounds.forEach((roundMatches, round) => {
        if (round === maxRound) {
          // Connect final to winner
          const finalMatch = roundMatches[0]
          if (finalMatch) {
            const winnerId = 'winner'
            const winnerX = (maxRound + 1) * roundSpacing + 100
            
            // Add winner node if not exists
            if (!nodes.find(n => n.id === winnerId)) {
              const finalWinner = finalMatch.status === 'finished' || finalMatch.winnerTeamId ? {
                seed: finalMatch.winnerSeed || finalMatch.left.seed || finalMatch.right.seed || 0,
                teamName: finalMatch.winnerTeamName || finalMatch.left.teamName || finalMatch.right.teamName || '?'
              } : undefined
              
              // Position winner at the same height as final match
              const finalMatchNode = nodes.find(n => n.id === finalMatch.id)
              const winnerY = finalMatchNode ? finalMatchNode.position.y + 60 : 100 // Center of match node
              
              nodes.push({
                id: winnerId,
                type: 'winner',
                position: { x: winnerX, y: winnerY },
                data: { winner: finalWinner },
                sourcePosition: Position.Right,
                targetPosition: Position.Left,
              })
            }
            
            edges.push({
              id: `${finalMatch.id}-winner`,
              source: finalMatch.id,
              target: winnerId,
              type: 'smoothstep',
              style: { stroke: '#9ca3af', strokeWidth: 2 },
            })
          }
        } else {
          // Connect pairs of matches to next round
          const nextRound = rounds.get(round + 1)
          if (nextRound) {
            roundMatches.forEach((match, matchIdx) => {
              // For Round 0 (Play-In), connect directly to target match in Round 1
              if (round === 0) {
                const playInWinner = match.winnerTeamId || match.left.teamId || match.right.teamId
                const targetMatch = nextRound.find(m => 
                  m.left.teamId === playInWinner || m.right.teamId === playInWinner
                )
                if (targetMatch) {
                  edges.push({
                    id: `${match.id}-${targetMatch.id}`,
                    source: match.id,
                    target: targetMatch.id,
                    type: 'smoothstep',
                    style: { stroke: '#9ca3af', strokeWidth: 2 },
                  })
                }
              } else {
                // For other rounds, connect pairs to next round
                if (matchIdx % 2 === 0 && matchIdx + 1 < roundMatches.length) {
                  const match2 = roundMatches[matchIdx + 1]
                  const nextMatchIdx = Math.floor(matchIdx / 2)
                  const nextMatch = nextRound[nextMatchIdx]
                  
                  if (nextMatch) {
                    // Connect both matches to next match
                    edges.push({
                      id: `${match.id}-${nextMatch.id}`,
                      source: match.id,
                      target: nextMatch.id,
                      type: 'smoothstep',
                      style: { stroke: '#9ca3af', strokeWidth: 2 },
                    })
                    edges.push({
                      id: `${match2.id}-${nextMatch.id}`,
                      source: match2.id,
                      target: nextMatch.id,
                      type: 'smoothstep',
                      style: { stroke: '#9ca3af', strokeWidth: 2 },
                    })
                  }
                }
              }
            })
          }
        }
      })
    }
    
    return { nodes, edges }
  }, [matches, rounds, showConnectingLines, onMatchClick])
  
  // Build legend
  const legend = useMemo(() => {
    const seedMap = new Map<number, string>()
    
    matches.forEach(match => {
      if (match.left.seed > 0 && !match.left.isBye) {
        if (match.left.teamName) {
          seedMap.set(match.left.seed, match.left.teamName)
        } else if (!seedMap.has(match.left.seed)) {
          seedMap.set(match.left.seed, '?')
        }
      }
      
      if (match.right.seed > 0 && !match.right.isBye) {
        if (match.right.teamName) {
          seedMap.set(match.right.seed, match.right.teamName)
        } else if (!seedMap.has(match.right.seed)) {
          seedMap.set(match.right.seed, '?')
        }
      }
      
      if (match.status === 'finished' && match.winnerSeed) {
        if (match.winnerTeamName) {
          seedMap.set(match.winnerSeed, match.winnerTeamName)
        } else if (!seedMap.has(match.winnerSeed)) {
          seedMap.set(match.winnerSeed, '?')
        }
      }
    })
    
    return Array.from(seedMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([seed, name]) => ({ seed, name }))
  }, [matches])
  
  if (matches.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Bracket not started yet</p>
        <p className="text-sm text-gray-400">Matches will appear here once bracket begins</p>
      </div>
    )
  }
  
  return (
    <div className="w-full h-[600px]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={true}
        zoomOnScroll={true}
        preventScrolling={false}
      >
        <Background />
        <Controls />
      </ReactFlow>
      
      {/* Legend */}
      {legend.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Legend</h4>
          <div className="inline-block bg-white/80 backdrop-blur-sm border border-gray-200 rounded-lg p-4 shadow-sm">
            <table className="w-auto">
              <tbody>
                {legend.map(({ seed, name }) => (
                  <tr key={seed} className="border-b border-gray-100 last:border-b-0">
                    <td className="text-sm font-medium text-gray-700 text-right pr-4 py-1">
                      #{seed}
                    </td>
                    <td className="text-sm text-gray-600 py-1">
                      {name}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
