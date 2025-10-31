'use client'

import { useParams } from 'next/navigation'
import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function ImportPage() {
  const params = useParams()
  const tournamentId = params.id as string
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  const { data: tournament, isLoading } = trpc.tournament.get.useQuery({ id: tournamentId })
  
  // Check if user has admin access
  const isAdmin = tournament?.userAccessInfo?.isOwner || tournament?.userAccessInfo?.accessLevel === 'ADMIN'
  const resetTournament = trpc.import.resetTournament.useMutation({
    onSuccess: () => {
      alert('Tournament reset! All data deleted.')
      window.location.reload()
    },
    onError: (error) => {
      alert(`Error resetting tournament: ${error.message}`)
    }
  })
  const importCSV = trpc.import.importCSV.useMutation({
    onSuccess: (data) => {
      alert(`Import completed! Created ${data.divisions} divisions and ${data.teams} teams.`)
      window.location.reload()
    },
    onError: (error) => {
      alert(`Import error: ${error.message}`)
    }
  })

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type === 'text/csv') {
      setCsvFile(file)
    } else {
      alert('Please select a CSV file')
    }
  }

  const handleImport = async () => {
    if (!csvFile) {
      alert('Please select a CSV file')
      return
    }

    setIsImporting(true)
    try {
      const csvText = await csvFile.text()
      const base64Data = Buffer.from(csvText, 'utf-8').toString('base64')
      
      importCSV.mutate({
        tournamentId,
        csvData: base64Data
      })
    } catch (error) {
      alert(`Error reading file: ${error}`)
    } finally {
      setIsImporting(false)
    }
  }

  const handleReset = () => {
    const confirmed = window.confirm(
      'WARNING! This action will delete ALL tournament data:\n\n' +
      '• All divisions\n' +
      '• All teams\n' +
      '• All players\n' +
      '• All matches\n' +
      '• All results\n\n' +
      'This action CANNOT be undone!\n\n' +
      'Are you sure you want to reset the tournament?'
    )
    
    if (confirmed) {
      const doubleConfirm = window.confirm(
        'Last chance! Do you really want to delete ALL tournament data?\n\n' +
        'Press OK only if you are absolutely sure!'
      )
      
      if (doubleConfirm) {
        resetTournament.mutate({ tournamentId })
      }
    }
  }

  const downloadTemplate = () => {
    const link = document.createElement('a')
    link.href = '/test-participants.csv'
    link.download = 'participants-template.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading tournament...</div>
      </div>
    )
  }

  if (!tournament) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Tournament not found</h1>
        <Link href="/admin" className="text-blue-600 hover:text-blue-800">
          ← Back to tournaments list
        </Link>
      </div>
    )
  }

  // Check if user has admin access
  if (!isAdmin) {
    return (
      <div className="container mx-auto py-8">
        <div className="mb-6">
          <Link
            href={`/admin/${tournamentId}`}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            ← Back to Tournament
          </Link>
        </div>
        <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
          <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Insufficient Permissions</h2>
            <p className="text-gray-600 mb-6">
              Data import is only available to tournament administrators.
              Please contact the tournament owner to request administrative access.
            </p>
            <Link
              href={`/admin/${tournamentId}`}
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Back to Tournament
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Data Import</h1>
          <p className="text-gray-600 mt-2">{tournament.title}</p>
        </div>
        <Link
          href={`/admin/${tournamentId}`}
          className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
        >
          ← Back
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Import CSV */}
        <Card>
          <CardHeader>
            <CardTitle>Import Participants from CSV</CardTitle>
            <CardDescription>
              Upload a CSV file with participant data to automatically create divisions and teams
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select CSV file
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {csvFile && (
                <p className="text-sm text-green-600 mt-1">
                  File selected: {csvFile.name}
                </p>
              )}
            </div>

            <div className="flex space-x-2">
              <Button
                onClick={handleImport}
                disabled={!csvFile || isImporting || importCSV.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isImporting || importCSV.isPending ? 'Importing...' : 'Import'}
              </Button>
              <Button
                onClick={downloadTemplate}
                variant="outline"
              >
                Download Template
              </Button>
            </div>

            <div className="text-sm text-gray-600">
              <p className="font-medium mb-2">Required columns in CSV:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>First Name, Last Name, Gender (M/F), Age</li>
                <li>DUPR ID, DUPR rating, Division, Type (1v1/2v2/4v4)</li>
                <li>Age Constraint, DUPR Constraint</li>
                <li>Pool (optional), Team</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Reset Tournament */}
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Reset Tournament</CardTitle>
            <CardDescription>
              DANGEROUS! Deletes all tournament data to allow loading new data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="font-medium text-red-800 mb-2">What will be deleted:</h4>
              <ul className="text-sm text-red-700 space-y-1">
                <li>• All divisions and their settings</li>
                <li>• All teams and players</li>
                <li>• All matches and results</li>
                <li>• All prizes and awards</li>
                <li>• All change history</li>
              </ul>
            </div>

            <div className="flex space-x-2">
              <Button
                onClick={handleReset}
                disabled={resetTournament.isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {resetTournament.isPending ? 'Resetting...' : 'Reset Tournament'}
              </Button>
            </div>

            <div className="text-sm text-gray-600">
              <p className="font-medium text-red-600 mb-1">⚠️ Warning!</p>
              <p>This action cannot be undone. Use only for complete tournament cleanup before loading new data.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Current Tournament Status */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Current Tournament Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{tournament.divisions.length}</div>
              <div className="text-sm text-gray-600">Divisions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {tournament.divisions.reduce((sum, div) => sum + div.teams.length, 0)}
              </div>
              <div className="text-sm text-gray-600">Teams</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {tournament.divisions.reduce((sum, div) => 
                  sum + div.teams.reduce((teamSum, team) => teamSum + (team.teamPlayers?.length || 0), 0), 0
                )}
              </div>
              <div className="text-sm text-gray-600">Players</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {tournament.divisions.reduce((sum, div) => sum + (div.matches?.length || 0), 0)}
              </div>
              <div className="text-sm text-gray-600">Matches</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
