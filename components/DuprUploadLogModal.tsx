'use client'

import { Button } from '@/components/ui/button'
import { X, CheckCircle, XCircle, Loader2 } from 'lucide-react'

interface UploadLogEntry {
  matchId: string
  teamAName: string
  teamBName: string
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'PROCESSING'
  error?: string | null
}

interface DuprUploadLogModalProps {
  isOpen: boolean
  onClose: () => void
  logEntries: UploadLogEntry[]
  isUploading?: boolean
}

export default function DuprUploadLogModal({
  isOpen,
  onClose,
  logEntries,
  isUploading = false,
}: DuprUploadLogModalProps) {
  if (!isOpen) return null

  const getStatusIcon = (status: UploadLogEntry['status']) => {
    switch (status) {
      case 'SUCCESS':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'FAILED':
        return <XCircle className="h-5 w-5 text-red-600" />
      case 'PROCESSING':
        return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
      default:
        return <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
    }
  }

  const getStatusText = (status: UploadLogEntry['status']) => {
    switch (status) {
      case 'SUCCESS':
        return 'Uploaded'
      case 'FAILED':
        return 'Failed'
      case 'PROCESSING':
        return 'Processing...'
      default:
        return 'Pending'
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">DUPR Upload Log</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isUploading && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-700 flex items-center">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Uploading results to DUPR...
            </p>
          </div>
        )}

        <div className="overflow-y-auto flex-1">
          {logEntries.length === 0 ? (
            <p className="text-gray-600 text-center py-8">No upload log entries yet.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider border-b">
                    Match
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider border-b">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider border-b">
                    Comment
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {logEntries.map((entry) => (
                  <tr key={entry.matchId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {entry.teamAName} vs {entry.teamBName}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(entry.status)}
                        <span className={`
                          ${entry.status === 'SUCCESS' ? 'text-green-600' : ''}
                          ${entry.status === 'FAILED' ? 'text-red-600' : ''}
                          ${entry.status === 'PROCESSING' ? 'text-blue-600' : ''}
                          ${entry.status === 'PENDING' ? 'text-gray-600' : ''}
                        `}>
                          {getStatusText(entry.status)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {entry.error ? (
                        <span className="text-red-600">{entry.error}</span>
                      ) : entry.status === 'SUCCESS' ? (
                        <span className="text-green-600">Successfully uploaded</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-6 flex justify-end border-t pt-4">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}

