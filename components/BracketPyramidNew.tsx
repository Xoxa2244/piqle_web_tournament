'use client'

import { useMemo, useEffect, useState } from 'react'
import ELK from 'elkjs/lib/elk.bundled.js'
import { buildElkBracketGraph, type BracketMatch as ElkBracketMatch } from './elk-bracket-client'

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
  totalTeams?: number
  bracketSize?: number
}

interface BracketRound {
  round: number
  roundName: string
  matches: BracketMatch[]
}

export default function BracketPyramidNew({ 
  matches, 
  showConnectingLines = true, 
  onMatchClick,
  totalTeams,
  bracketSize
}: BracketPyramidNewProps) {
  // Calculate totalTeams and bracketSize if not provided
  const calculatedTotalTeams = totalTeams || matches.reduce((max, m) => {
    return Math.max(max, m.left.seed || 0, m.right.seed || 0)
  }, 0)
  
  const calculatedBracketSize = bracketSize || (() => {
    const n = calculatedTotalTeams
    if (n <= 1) return 1
    return Math.pow(2, Math.ceil(Math.log2(n)))
  })()
  
  // Initialize ELK
  const [elk] = useState(() => new ELK())
  
  // Build ELK graph and calculate layout
  const [layoutedGraph, setLayoutedGraph] = useState<any>(null)
  
  useEffect(() => {
    if (matches.length === 0) {
      setLayoutedGraph(null)
      return
    }
    
    // Build ELK graph
    const graph = buildElkBracketGraph(matches, calculatedTotalTeams, calculatedBracketSize)
    
    // Calculate layout - ELK expects the graph structure directly
    elk.layout(graph as any)
      .then((layouted: any) => {
        setLayoutedGraph(layouted)
      })
      .catch((error) => {
        console.error('[BracketPyramidNew] ELK layout error:', error)
        setLayoutedGraph(null)
      })
  }, [matches, calculatedTotalTeams, calculatedBracketSize, elk])
  // Group matches by round
  const rounds: BracketRound[] = useMemo(() => {
    const roundsMap = new Map<number, BracketMatch[]>()
    const maxRound = matches.length > 0 ? Math.max(...matches.map(m => m.round)) : 0
    
    for (let round = 0; round <= maxRound; round++) {
      const roundMatches = matches
        .filter(m => m.round === round)
        .sort((a, b) => a.position - b.position)
      if (roundMatches.length > 0) {
        let roundName = ''
        if (round === 0) {
          roundName = 'Play-In'
        } else if (round === maxRound) {
          roundName = 'Final'
        } else {
          const roundsFromEnd = maxRound - round
          if (roundsFromEnd === 1) {
            roundName = 'Semi-Finals'
          } else if (roundsFromEnd === 2) {
            roundName = 'Quarter-Finals'
          } else {
            roundName = `Round ${round}`
          }
        }
        roundsMap.set(round, roundMatches)
      }
    }
    
    return Array.from(roundsMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([round, matches]) => ({
        round,
        roundName: round === 0 ? 'Play-In' : 
                   round === maxRound ? 'Final' :
                   maxRound - round === 1 ? 'Semi-Finals' :
                   maxRound - round === 2 ? 'Quarter-Finals' :
                   `Round ${round}`,
        matches
      }))
  }, [matches])
  
  // Build legend: seed number -> team name mapping
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
  
  // Get seed display for a slot
  const getSeedDisplay = (slot: SeedSlot): number | null => {
    if (slot.isBye) return null
    if (slot.seed > 0) return slot.seed
    return null
  }
  
  if (matches.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Bracket not started yet</p>
        <p className="text-sm text-gray-400">Matches will appear here once bracket begins</p>
      </div>
    )
  }
  
  // If layout is not ready, show loading
  if (!layoutedGraph) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-500">Calculating bracket layout...</p>
      </div>
    )
  }
  
  // Extract node positions from ELK layout
  const nodeMap = new Map<string, { x: number; y: number; width: number; height: number }>()
  const extractNodes = (nodes: any[]) => {
    nodes.forEach((node: any) => {
      if (node.x !== undefined && node.y !== undefined) {
        nodeMap.set(node.id, {
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
        })
      }
      if (node.children) {
        extractNodes(node.children)
      }
    })
  }
  extractNodes(layoutedGraph.children || [])
  
  // Extract edge paths from ELK layout
  const edgeMap = new Map<string, any>()
  if (layoutedGraph.edges) {
    layoutedGraph.edges.forEach((edge: any) => {
      edgeMap.set(edge.id, edge)
    })
  }
  
  // Match dimensions
  const circleSize = 36
  const matchHeight = 80 // Height of a match (circle + line + circle)
  
  // Calculate SVG dimensions from ELK layout
  const svgWidth = layoutedGraph.width || 1200
  const svgHeight = layoutedGraph.height || 800
  const svgPadding = 50
  
  return (
    <div className="w-full">
      <div className="overflow-auto">
        <svg
          width={svgWidth + svgPadding * 2}
          height={svgHeight + svgPadding * 2}
          className="border border-gray-200 rounded-lg bg-white"
        >
          {/* Render edges (connecting lines) */}
          {showConnectingLines && layoutedGraph.edges && layoutedGraph.edges.map((edge: any) => {
            // ELK may provide sections or we need to build path from source/target nodes
            if (edge.sections && edge.sections.length > 0) {
              // Build path from edge sections
              const pathData = edge.sections.map((section: any, idx: number) => {
                if (idx === 0) {
                  return `M ${section.startPoint.x + svgPadding} ${section.startPoint.y + svgPadding}`
                }
                return `L ${section.endPoint.x + svgPadding} ${section.endPoint.y + svgPadding}`
              }).join(' ')
              
              return (
                <path
                  key={edge.id}
                  d={pathData}
                  stroke="#9ca3af"
                  strokeWidth="2"
                  fill="none"
                  markerEnd="url(#arrowhead)"
                />
              )
            } else if (edge.sources && edge.sources.length > 0 && edge.targets && edge.targets.length > 0) {
              // Build path from source to target nodes
              const sourceNode = nodeMap.get(edge.sources[0])
              const targetNode = nodeMap.get(edge.targets[0])
              
              if (sourceNode && targetNode) {
                const sourceX = sourceNode.x + sourceNode.width / 2
                const sourceY = sourceNode.y + sourceNode.height / 2
                const targetX = targetNode.x + targetNode.width / 2
                const targetY = targetNode.y + targetNode.height / 2
                
                return (
                  <line
                    key={edge.id}
                    x1={sourceX + svgPadding}
                    y1={sourceY + svgPadding}
                    x2={targetX + svgPadding}
                    y2={targetY + svgPadding}
                    stroke="#9ca3af"
                    strokeWidth="2"
                    markerEnd="url(#arrowhead)"
                  />
                )
              }
            }
            
            return null
          })}
          
          {/* Arrow marker for edges */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="#9ca3af" />
            </marker>
          </defs>
          
          {/* Render nodes (matches) */}
          {rounds.map((round) => {
            return round.matches.map((match) => {
              const nodePos = nodeMap.get(match.id)
              if (!nodePos) return null
              
              const leftSeed = getSeedDisplay(match.left)
              const rightSeed = getSeedDisplay(match.right)
              
              // Calculate positions for circles within match node
              const matchCenterX = nodePos.x + nodePos.width / 2
              const matchCenterY = nodePos.y + nodePos.height / 2
              const topCircleY = matchCenterY - matchHeight / 2 + circleSize / 2
              const bottomCircleY = matchCenterY + matchHeight / 2 - circleSize / 2
              
              return (
                <g key={match.id}>
                  {/* Top circle (left slot) */}
                  <circle
                    cx={matchCenterX + svgPadding}
                    cy={topCircleY + svgPadding}
                    r={circleSize / 2}
                    className={`cursor-pointer transition-all ${
                      match.status === 'finished' && match.winnerTeamId === match.left.teamId
                        ? 'fill-green-100 stroke-green-500'
                        : match.left.isBye
                        ? 'fill-white stroke-gray-300 opacity-50'
                        : leftSeed !== null
                        ? 'fill-blue-50 stroke-blue-300'
                        : 'fill-white stroke-gray-300'
                    }`}
                    strokeWidth="2"
                    onClick={() => onMatchClick?.(match.matchId || match.id)}
                  />
                  <text
                    x={matchCenterX + svgPadding}
                    y={topCircleY + svgPadding}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="text-sm font-bold text-gray-900 pointer-events-none"
                  >
                    {leftSeed !== null ? leftSeed : '?'}
                  </text>
                  
                  {/* Vertical line connecting circles */}
                  <line
                    x1={matchCenterX + svgPadding}
                    y1={topCircleY + circleSize / 2 + svgPadding}
                    x2={matchCenterX + svgPadding}
                    y2={bottomCircleY - circleSize / 2 + svgPadding}
                    stroke="#9ca3af"
                    strokeWidth="2"
                  />
                  
                  {/* Bottom circle (right slot) */}
                  <circle
                    cx={matchCenterX + svgPadding}
                    cy={bottomCircleY + svgPadding}
                    r={circleSize / 2}
                    className={`cursor-pointer transition-all ${
                      match.status === 'finished' && match.winnerTeamId === match.right.teamId
                        ? 'fill-green-100 stroke-green-500'
                        : match.right.isBye
                        ? 'fill-white stroke-gray-300 opacity-50'
                        : rightSeed !== null
                        ? 'fill-blue-50 stroke-blue-300'
                        : 'fill-white stroke-gray-300'
                    }`}
                    strokeWidth="2"
                    onClick={() => onMatchClick?.(match.matchId || match.id)}
                  />
                  <text
                    x={matchCenterX + svgPadding}
                    y={bottomCircleY + svgPadding}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="text-sm font-bold text-gray-900 pointer-events-none"
                  >
                    {rightSeed !== null ? rightSeed : '?'}
                  </text>
                </g>
              )
            })
          })}
          
          {/* Render Winner node */}
          {(() => {
            const winnerNode = nodeMap.get('winner')
            if (!winnerNode) return null
            
            const finalRound = rounds.find(r => r.roundName === 'Final')
            const finalMatch = finalRound?.matches[0]
            const finalWinner = finalMatch && (finalMatch.status === 'finished' || finalMatch.winnerTeamId) ? {
              seed: finalMatch.winnerSeed || finalMatch.left.seed || finalMatch.right.seed || 0,
              teamName: finalMatch.winnerTeamName || finalMatch.left.teamName || finalMatch.right.teamName || '?'
            } : null
            
            return (
              <g>
                <circle
                  cx={winnerNode.x + winnerNode.width / 2 + svgPadding}
                  cy={winnerNode.y + winnerNode.height / 2 + svgPadding}
                  r={circleSize / 2}
                  className={`${finalWinner ? 'fill-yellow-100 stroke-yellow-500' : 'fill-white stroke-gray-300 opacity-50'}`}
                  strokeWidth="2"
                />
                <text
                  x={winnerNode.x + winnerNode.width / 2 + svgPadding}
                  y={winnerNode.y + winnerNode.height / 2 + svgPadding}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-sm font-bold text-gray-900"
                >
                  {finalWinner ? finalWinner.seed : '?'}
                </text>
              </g>
            )
          })()}
          
          {/* Round labels */}
          {rounds.map((round) => {
            const firstMatch = round.matches[0]
            if (!firstMatch) return null
            
            const nodePos = nodeMap.get(firstMatch.id)
            if (!nodePos) return null
            
            return (
              <text
                key={`label-${round.round}`}
                x={nodePos.x + svgPadding}
                y={20}
                className="text-sm font-semibold text-gray-900"
              >
                {round.roundName}
              </text>
            )
          })}
        </svg>
      </div>
      
      {/* Legend - transparent table format */}
      {legend.length > 0 && (
        <div className="mt-8 pt-4 border-t border-gray-200">
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
