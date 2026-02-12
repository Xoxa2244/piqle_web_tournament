'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { formatUsDateTimeShort } from '@/lib/dateFormat'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import Link from 'next/link'

const SUPERADMIN_AUTH_KEY = 'superadmin_authenticated'

export default function PartnerLogsPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const partnerId = params.partnerId as string
  const appId = searchParams.get('appId')
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [offset, setOffset] = useState(0)
  const limit = 50

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const authStatus = localStorage.getItem(SUPERADMIN_AUTH_KEY)
      setIsAuthenticated(authStatus === 'true')
      if (authStatus !== 'true') {
        window.location.href = '/superadmin'
      }
    }
  }, [])

  const { data, isLoading, refetch } = trpc.partner.getRequestLogs.useQuery(
    {
      partnerId: appId ? undefined : partnerId,
      partnerAppId: appId || undefined,
      limit,
      offset,
    },
    { enabled: isAuthenticated === true }
  )

  if (isAuthenticated === null || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  if (isAuthenticated === false) {
    return null
  }

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'bg-green-100 text-green-800'
    if (status >= 400 && status < 500) return 'bg-yellow-100 text-yellow-800'
    if (status >= 500) return 'bg-red-100 text-red-800'
    return 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">API Request Logs</h1>
            <p className="text-gray-600 mt-2">View API request history</p>
          </div>
          <div className="flex gap-4">
            <Link href="/superadmin/partners">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Partners
              </Button>
            </Link>
            <Button onClick={() => refetch()} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              Logs {data && `(${data.total} total)`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data?.logs.map((log: any) => (
                <div
                  key={log.id}
                  className="border rounded-lg p-4 space-y-2"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={getStatusColor(log.statusCode)}>
                          {log.statusCode}
                        </Badge>
                        <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                          {log.method} {log.endpoint}
                        </code>
                        <span className="text-sm text-gray-500">
                          {log.duration}ms
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <p>
                          {formatUsDateTimeShort(log.createdAt)}
                        </p>
                        {log.partner && (
                          <p>
                            Partner: {log.partner.name} ({log.partner.code})
                          </p>
                        )}
                        {log.partnerApp && (
                          <p>
                            App: {log.partnerApp.keyId} ({log.partnerApp.environment})
                          </p>
                        )}
                        {log.idempotencyKey && (
                          <p className="font-mono text-xs">
                            Idempotency: {log.idempotencyKey}
                          </p>
                        )}
                        {log.correlationId && (
                          <p className="font-mono text-xs">
                            Correlation: {log.correlationId}
                          </p>
                        )}
                        {log.ipAddress && (
                          <p>IP: {log.ipAddress}</p>
                        )}
                        {log.errorMessage && (
                          <p className="text-red-600">Error: {log.errorMessage}</p>
                        )}
                      </div>
                    </div>
                  </div>
                  {log.requestBody && (
                    <details className="mt-2">
                      <summary className="text-sm cursor-pointer text-gray-600">
                        Request Body
                      </summary>
                      <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-40">
                        {JSON.stringify(log.requestBody, null, 2)}
                      </pre>
                    </details>
                  )}
                  {log.responseBody && (
                    <details className="mt-2">
                      <summary className="text-sm cursor-pointer text-gray-600">
                        Response Body
                      </summary>
                      <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-40">
                        {JSON.stringify(log.responseBody, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
              {data?.logs.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  No logs found
                </div>
              )}
            </div>

            {/* Pagination */}
            {data && data.total > limit && (
              <div className="flex justify-between items-center mt-6">
                <Button
                  variant="outline"
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                >
                  Previous
                </Button>
                <span className="text-sm text-gray-600">
                  Showing {offset + 1}-{Math.min(offset + limit, data.total)} of {data.total}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setOffset(offset + limit)}
                  disabled={!data.hasMore}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

