'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Minus, Layers } from 'lucide-react'

type ConstraintRange = {
  enabled: boolean
  min: string
  max: string
}

type GenderConstraintValue = 'ANY' | 'MEN' | 'WOMEN' | 'MIXED'

type DivisionForm = {
  id: string
  name: string
  poolCount: number
  teamCount: number
  playersPerTeam: 1 | 2 | 4
  constraints: {
    individualDupr: ConstraintRange
    teamDupr: ConstraintRange
    age: ConstraintRange
    gender: {
      enabled: boolean
      value: GenderConstraintValue
    }
    enforcement: 'INFO' | 'HARD'
  }
}

type StructureMode = 'WITH_DIVISIONS' | 'NO_DIVISIONS'

export type TournamentStructureInput =
  | {
      mode: 'WITH_DIVISIONS'
      divisions: Array<{
        name: string
        poolCount: number
        teamCount: number
        playersPerTeam: 1 | 2 | 4
        constraints: {
          individualDupr: { enabled: boolean; min?: number; max?: number }
          teamDupr: { enabled: boolean; min?: number; max?: number }
          age: { enabled: boolean; min?: number; max?: number }
          gender: { enabled: boolean; value?: GenderConstraintValue }
          enforcement: 'INFO' | 'HARD'
        }
      }>
    }
  | {
      mode: 'NO_DIVISIONS'
      playersPerTeam: 1 | 2 | 4
      teamCount?: number
      playerCount?: number
    }

interface StructureSetupModalProps {
  isOpen: boolean
  isSaving?: boolean
  onClose: () => void
  onSave: (structure: TournamentStructureInput) => void
}

const defaultDivision = (index: number): DivisionForm => ({
  id: `division-${Date.now()}-${index}`,
  name: `Division ${index + 1}`,
  poolCount: 1,
  teamCount: 2,
  playersPerTeam: 2,
  constraints: {
    individualDupr: { enabled: false, min: '', max: '' },
    teamDupr: { enabled: false, min: '', max: '' },
    age: { enabled: false, min: '', max: '' },
    gender: { enabled: false, value: 'ANY' },
    enforcement: 'INFO',
  },
})

const parseOptionalNumber = (value: string) => {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const getNumberOrDefault = (value: string, fallback: number) => {
  if (!value.trim()) return fallback
  const parsed = Number(value)
  return Number.isNaN(parsed) ? fallback : parsed
}

const RangeField = ({
  enabled,
  minValue,
  maxValue,
  min,
  max,
  step,
  onChangeMin,
  onChangeMax,
}: {
  enabled: boolean
  minValue: number
  maxValue: number
  min: number
  max: number
  step: number
  onChangeMin: (value: number) => void
  onChangeMax: (value: number) => void
}) => {
  const safeMin = clamp(minValue, min, max)
  const safeMax = clamp(maxValue, min, max)
  const range = max - min || 1
  const left = ((safeMin - min) / range) * 100
  const right = 100 - ((safeMax - min) / range) * 100

  return (
    <div className={`space-y-2 ${enabled ? '' : 'opacity-50'}`}>
      <div className="relative h-8">
        <div className="absolute inset-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-slate-200" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full bg-indigo-500"
          style={{ left: `${left}%`, right: `${right}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          disabled={!enabled}
          value={safeMin}
          onChange={(event) => onChangeMin(Math.min(Number(event.target.value), safeMax))}
          className="absolute inset-0 w-full pointer-events-none appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500 [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-indigo-500"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          disabled={!enabled}
          value={safeMax}
          onChange={(event) => onChangeMax(Math.max(Number(event.target.value), safeMin))}
          className="absolute inset-0 w-full pointer-events-none appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500 [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-indigo-500"
        />
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Min: {safeMin}</span>
        <span>Max: {safeMax}</span>
      </div>
    </div>
  )
}

const Stepper = ({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max?: number
  onChange: (value: number) => void
}) => {
  const handleStep = (delta: number) => {
    const next = value + delta
    if (next < min) return
    if (typeof max === 'number' && next > max) return
    onChange(next)
  }

  return (
    <div className="flex items-center space-x-2">
      <button
        type="button"
        onClick={() => handleStep(-1)}
        className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50"
        aria-label="Decrease"
      >
        <Minus className="w-4 h-4" />
      </button>
      <div className="w-12 text-center font-semibold">{value}</div>
      <button
        type="button"
        onClick={() => handleStep(1)}
        className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50"
        aria-label="Increase"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  )
}

export default function StructureSetupModal({
  isOpen,
  isSaving = false,
  onClose,
  onSave,
}: StructureSetupModalProps) {
  const [mode, setMode] = useState<StructureMode>('WITH_DIVISIONS')
  const [divisions, setDivisions] = useState<DivisionForm[]>([defaultDivision(0)])
  const [playersPerTeam, setPlayersPerTeam] = useState<1 | 2 | 4>(2)
  const [teamCount, setTeamCount] = useState(4)
  const [playerCount, setPlayerCount] = useState(8)

  const summary = useMemo(() => {
    if (mode === 'WITH_DIVISIONS') {
      const totalPools = divisions.reduce((sum, division) => sum + division.poolCount, 0)
      const totalTeams = divisions.reduce((sum, division) => sum + division.teamCount, 0)
      return {
        divisions: divisions.length,
        pools: totalPools,
        teams: totalTeams,
        players: undefined,
      }
    }

    return {
      divisions: 0,
      pools: 0,
      teams: playersPerTeam === 1 ? 0 : teamCount,
      players: playersPerTeam === 1 ? playerCount : undefined,
    }
  }, [mode, divisions, playersPerTeam, teamCount, playerCount])

  const isValid = useMemo(() => {
    if (mode === 'WITH_DIVISIONS') {
      return divisions.every((division) => {
        return (
          division.name.trim().length > 0 &&
          division.poolCount >= 1 &&
          division.teamCount >= 2 &&
          [1, 2, 4].includes(division.playersPerTeam)
        )
      })
    }

    if (![1, 2, 4].includes(playersPerTeam)) return false
    if (playersPerTeam === 1) return playerCount >= 1
    return teamCount >= 2
  }, [mode, divisions, playersPerTeam, playerCount, teamCount])

  const handleAddDivision = () => {
    setDivisions((prev) => [...prev, defaultDivision(prev.length)])
  }

  const handleRemoveDivision = (index: number) => {
    const division = divisions[index]
    if (!division) return

    const isDefault =
      division.name.trim() === `Division ${index + 1}` &&
      division.poolCount === 1 &&
      division.teamCount === 2 &&
      division.playersPerTeam === 2 &&
      !division.constraints.individualDupr.enabled &&
      !division.constraints.teamDupr.enabled &&
      !division.constraints.age.enabled &&
      !division.constraints.gender.enabled

    if (!isDefault) {
      const confirmRemove = window.confirm('Remove this division? All entered settings will be lost.')
      if (!confirmRemove) return
    }

    setDivisions((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleDivisionChange = (index: number, updater: (division: DivisionForm) => DivisionForm) => {
    setDivisions((prev) => prev.map((division, idx) => (idx === index ? updater(division) : division)))
  }

  const handleSave = () => {
    if (!isValid) return

    if (mode === 'WITH_DIVISIONS') {
      onSave({
        mode: 'WITH_DIVISIONS',
        divisions: divisions.map((division) => ({
          name: division.name.trim(),
          poolCount: division.poolCount,
          teamCount: division.teamCount,
          playersPerTeam: division.playersPerTeam,
          constraints: {
            individualDupr: {
              enabled: division.constraints.individualDupr.enabled,
              min: parseOptionalNumber(division.constraints.individualDupr.min),
              max: parseOptionalNumber(division.constraints.individualDupr.max),
            },
            teamDupr: {
              enabled: division.constraints.teamDupr.enabled,
              min: parseOptionalNumber(division.constraints.teamDupr.min),
              max: parseOptionalNumber(division.constraints.teamDupr.max),
            },
            age: {
              enabled: division.constraints.age.enabled,
              min: parseOptionalNumber(division.constraints.age.min),
              max: parseOptionalNumber(division.constraints.age.max),
            },
            gender: {
              enabled: division.constraints.gender.enabled,
              value: division.constraints.gender.value,
            },
            enforcement: division.constraints.enforcement,
          },
        })),
      })
      return
    }

    onSave({
      mode: 'NO_DIVISIONS',
      playersPerTeam,
      teamCount: playersPerTeam === 1 ? undefined : teamCount,
      playerCount: playersPerTeam === 1 ? playerCount : undefined,
    })
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[110] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-5xl mx-auto border border-slate-200 max-h-[min(90vh,calc(100vh-8rem))] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center mr-3">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Structure Setup</h2>
            <p className="text-sm text-slate-600">Build tournament structure before creating.</p>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setMode('WITH_DIVISIONS')}
              className={`px-4 py-2 rounded-lg border ${mode === 'WITH_DIVISIONS' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              With divisions
            </button>
            <button
              type="button"
              onClick={() => setMode('NO_DIVISIONS')}
              className={`px-4 py-2 rounded-lg border ${mode === 'NO_DIVISIONS' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              No divisions
            </button>
          </div>

          {mode === 'WITH_DIVISIONS' ? (
            <div className="space-y-6">
              {divisions.map((division, index) => (
                <div key={division.id} className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Input
                      value={division.name}
                      onChange={(event) =>
                        handleDivisionChange(index, (current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      className="max-w-xs"
                      placeholder="Division name"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveDivision(index)}
                      className="text-sm text-rose-600 hover:text-rose-700"
                      disabled={divisions.length === 1}
                    >
                      Remove division
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Pools</label>
                      <Stepper
                        value={division.poolCount}
                        min={1}
                        onChange={(value) =>
                          handleDivisionChange(index, (current) => ({
                            ...current,
                            poolCount: value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Teams in division</label>
                      <Stepper
                        value={division.teamCount}
                        min={2}
                        onChange={(value) =>
                          handleDivisionChange(index, (current) => ({
                            ...current,
                            teamCount: value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Players per team</label>
                      <div className="flex gap-2">
                        {[1, 2, 4].map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() =>
                              handleDivisionChange(index, (current) => ({
                                ...current,
                                playersPerTeam: value as 1 | 2 | 4,
                              }))
                            }
                            className={`px-3 py-2 rounded-lg border ${division.playersPerTeam === value ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-700">Individual DUPR range</p>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={division.constraints.individualDupr.enabled}
                          onChange={(event) =>
                            handleDivisionChange(index, (current) => ({
                              ...current,
                              constraints: {
                                ...current.constraints,
                                individualDupr: {
                                  ...current.constraints.individualDupr,
                                  enabled: event.target.checked,
                                },
                              },
                            }))
                          }
                        />
                        Enable
                      </label>
                    </div>
                    <RangeField
                      enabled={division.constraints.individualDupr.enabled}
                      minValue={getNumberOrDefault(division.constraints.individualDupr.min, 0)}
                      maxValue={getNumberOrDefault(division.constraints.individualDupr.max, 8)}
                      min={0}
                      max={8}
                      step={0.1}
                      onChangeMin={(value) =>
                        handleDivisionChange(index, (current) => ({
                          ...current,
                          constraints: {
                            ...current.constraints,
                            individualDupr: {
                              ...current.constraints.individualDupr,
                              min: String(value),
                            },
                          },
                        }))
                      }
                      onChangeMax={(value) =>
                        handleDivisionChange(index, (current) => ({
                          ...current,
                          constraints: {
                            ...current.constraints,
                            individualDupr: {
                              ...current.constraints.individualDupr,
                              max: String(value),
                            },
                          },
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-700">Team DUPR total</p>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={division.constraints.teamDupr.enabled}
                          onChange={(event) =>
                            handleDivisionChange(index, (current) => ({
                              ...current,
                              constraints: {
                                ...current.constraints,
                                teamDupr: {
                                  ...current.constraints.teamDupr,
                                  enabled: event.target.checked,
                                },
                              },
                            }))
                          }
                        />
                        Enable
                      </label>
                    </div>
                    <RangeField
                      enabled={division.constraints.teamDupr.enabled}
                      minValue={getNumberOrDefault(division.constraints.teamDupr.min, 0)}
                      maxValue={getNumberOrDefault(division.constraints.teamDupr.max, 16)}
                      min={0}
                      max={16}
                      step={0.1}
                      onChangeMin={(value) =>
                        handleDivisionChange(index, (current) => ({
                          ...current,
                          constraints: {
                            ...current.constraints,
                            teamDupr: {
                              ...current.constraints.teamDupr,
                              min: String(value),
                            },
                          },
                        }))
                      }
                      onChangeMax={(value) =>
                        handleDivisionChange(index, (current) => ({
                          ...current,
                          constraints: {
                            ...current.constraints,
                            teamDupr: {
                              ...current.constraints.teamDupr,
                              max: String(value),
                            },
                          },
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-700">Gender restriction</p>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={division.constraints.gender.enabled}
                          onChange={(event) =>
                            handleDivisionChange(index, (current) => ({
                              ...current,
                              constraints: {
                                ...current.constraints,
                                gender: {
                                  ...current.constraints.gender,
                                  enabled: event.target.checked,
                                },
                              },
                            }))
                          }
                        />
                        Enable
                      </label>
                    </div>
                    <select
                      value={division.constraints.gender.value}
                      onChange={(event) =>
                        handleDivisionChange(index, (current) => ({
                          ...current,
                          constraints: {
                            ...current.constraints,
                            gender: {
                              ...current.constraints.gender,
                              value: event.target.value as GenderConstraintValue,
                            },
                          },
                        }))
                      }
                      disabled={!division.constraints.gender.enabled}
                      className={`w-full border border-slate-200 rounded-lg px-3 py-2 ${division.constraints.gender.enabled ? '' : 'opacity-50'}`}
                    >
                      <option value="ANY">Any</option>
                      <option value="MEN">Men</option>
                      <option value="WOMEN">Women</option>
                      <option value="MIXED">Mixed</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-700">Age range</p>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={division.constraints.age.enabled}
                          onChange={(event) =>
                            handleDivisionChange(index, (current) => ({
                              ...current,
                              constraints: {
                                ...current.constraints,
                                age: {
                                  ...current.constraints.age,
                                  enabled: event.target.checked,
                                },
                              },
                            }))
                          }
                        />
                        Enable
                      </label>
                    </div>
                    <RangeField
                      enabled={division.constraints.age.enabled}
                      minValue={getNumberOrDefault(division.constraints.age.min, 0)}
                      maxValue={getNumberOrDefault(division.constraints.age.max, 100)}
                      min={0}
                      max={100}
                      step={1}
                      onChangeMin={(value) =>
                        handleDivisionChange(index, (current) => ({
                          ...current,
                          constraints: {
                            ...current.constraints,
                            age: {
                              ...current.constraints.age,
                              min: String(value),
                            },
                          },
                        }))
                      }
                      onChangeMax={(value) =>
                        handleDivisionChange(index, (current) => ({
                          ...current,
                          constraints: {
                            ...current.constraints,
                            age: {
                              ...current.constraints.age,
                              max: String(value),
                            },
                          },
                        }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">Constraint type</p>
                      <p className="text-xs text-slate-500">Informational vs. hard enforcement.</p>
                    </div>
                    <div className="flex gap-2">
                      {(['INFO', 'HARD'] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() =>
                            handleDivisionChange(index, (current) => ({
                              ...current,
                              constraints: {
                                ...current.constraints,
                                enforcement: value,
                              },
                            }))
                          }
                          className={`px-3 py-2 rounded-lg border ${division.constraints.enforcement === value ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                        >
                          {value === 'INFO' ? 'Informational' : 'Hard'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddDivision}
                className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700"
              >
                <Plus className="w-4 h-4" />
                Add division
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Players per team</label>
                <div className="flex gap-2">
                  {[1, 2, 4].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPlayersPerTeam(value as 1 | 2 | 4)}
                      className={`px-3 py-2 rounded-lg border ${playersPerTeam === value ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              {playersPerTeam === 1 ? (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Players in tournament</label>
                  <Stepper value={playerCount} min={1} onChange={setPlayerCount} />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Teams in tournament</label>
                  <Stepper value={teamCount} min={2} onChange={setTeamCount} />
                </div>
              )}
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-slate-700 mb-2">Summary</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-slate-600">
              <div>Divisions: {summary.divisions}</div>
              <div>Pools: {summary.pools}</div>
              <div>Teams: {summary.teams}</div>
              {summary.players !== undefined && <div>Players: {summary.players}</div>}
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-6">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!isValid || isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
