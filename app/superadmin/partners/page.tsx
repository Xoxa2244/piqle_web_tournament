'use client'

import { useState, useEffect } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Plus, 
  Edit, 
  Key, 
  Eye, 
  EyeOff, 
  Copy, 
  X,
  CheckCircle2,
  XCircle,
  Clock,
  Globe
} from 'lucide-react'
import Link from 'next/link'

const SUPERADMIN_AUTH_KEY = 'superadmin_authenticated'

export default function PartnersPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [showCreatePartner, setShowCreatePartner] = useState(false)
  const [showCreateApp, setShowCreateApp] = useState(false)
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null)
  const [newSecret, setNewSecret] = useState<string | null>(null)
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({})
  const [partnerForm, setPartnerForm] = useState({
    name: '',
    code: '',
    contactEmail: '',
    contactName: '',
  })
  const [appForm, setAppForm] = useState({
    environment: 'SANDBOX' as 'SANDBOX' | 'PRODUCTION',
    allowedIps: '',
    rateLimitRpm: 60,
    scopes: ['indyleague:write', 'indyleague:read'],
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const authStatus = localStorage.getItem(SUPERADMIN_AUTH_KEY)
      setIsAuthenticated(authStatus === 'true')
      if (authStatus !== 'true') {
        window.location.href = '/superadmin'
      }
    }
  }, [])

  const { data: partners, isLoading, refetch } = trpc.partner.list.useQuery(
    undefined,
    { enabled: isAuthenticated === true }
  )

  const createPartner = trpc.partner.create.useMutation({
    onSuccess: () => {
      setShowCreatePartner(false)
      setPartnerForm({ name: '', code: '', contactEmail: '', contactName: '' })
      refetch()
    },
  })

  const createApp = trpc.partner.createApp.useMutation({
    onSuccess: (data) => {
      setNewSecret(data.secret)
      setShowCreateApp(false)
      setAppForm({
        environment: 'SANDBOX',
        allowedIps: '',
        rateLimitRpm: 60,
        scopes: ['indyleague:write', 'indyleague:read'],
      })
      refetch()
    },
  })

  const revokeApp = trpc.partner.revokeApp.useMutation({
    onSuccess: () => {
      refetch()
    },
  })

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

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

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Partner Integrations</h1>
            <p className="text-gray-600 mt-2">Manage partner organizations and API credentials</p>
          </div>
          <div className="flex gap-4">
            <Link href="/superadmin">
              <Button variant="outline">Back to Super Admin</Button>
            </Link>
            <Button onClick={() => setShowCreatePartner(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Partner
            </Button>
          </div>
        </div>

        {/* Create Partner Modal */}
        {showCreatePartner && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle>Create Partner</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Partner Name</label>
                    <Input
                      value={partnerForm.name}
                      onChange={(e) => setPartnerForm({ ...partnerForm, name: e.target.value })}
                      placeholder="Acme Sports"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Partner Code</label>
                    <Input
                      value={partnerForm.code}
                      onChange={(e) => setPartnerForm({ ...partnerForm, code: e.target.value })}
                      placeholder="acme-sports"
                    />
                    <p className="text-xs text-gray-500 mt-1">Unique identifier (letters, numbers, _, -)</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Contact Email (optional)</label>
                    <Input
                      type="email"
                      value={partnerForm.contactEmail}
                      onChange={(e) => setPartnerForm({ ...partnerForm, contactEmail: e.target.value })}
                      placeholder="contact@acme.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Contact Name (optional)</label>
                    <Input
                      value={partnerForm.contactName}
                      onChange={(e) => setPartnerForm({ ...partnerForm, contactName: e.target.value })}
                      placeholder="John Doe"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        createPartner.mutate(partnerForm)
                      }}
                      disabled={!partnerForm.name || !partnerForm.code}
                    >
                      Create
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowCreatePartner(false)
                        setPartnerForm({ name: '', code: '', contactEmail: '', contactName: '' })
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Create App Modal */}
        {showCreateApp && selectedPartnerId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle>Create API Credentials</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Environment</label>
                    <select
                      value={appForm.environment}
                      onChange={(e) => setAppForm({ ...appForm, environment: e.target.value as 'SANDBOX' | 'PRODUCTION' })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="SANDBOX">Sandbox</option>
                      <option value="PRODUCTION">Production</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Allowed IPs (optional, one per line)</label>
                    <textarea
                      value={appForm.allowedIps}
                      onChange={(e) => setAppForm({ ...appForm, allowedIps: e.target.value })}
                      placeholder="192.168.1.1&#10;10.0.0.1"
                      className="w-full px-3 py-2 border rounded-lg"
                      rows={3}
                    />
                    <p className="text-xs text-gray-500 mt-1">Leave empty for no IP restriction</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Rate Limit (requests per minute)</label>
                    <Input
                      type="number"
                      value={appForm.rateLimitRpm}
                      onChange={(e) => setAppForm({ ...appForm, rateLimitRpm: parseInt(e.target.value) || 60 })}
                      min={1}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        createApp.mutate({
                          partnerId: selectedPartnerId,
                          environment: appForm.environment,
                          allowedIps: appForm.allowedIps.split('\n').filter(ip => ip.trim()),
                          rateLimitRpm: appForm.rateLimitRpm,
                          scopes: appForm.scopes,
                        })
                      }}
                    >
                      Create
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowCreateApp(false)
                        setSelectedPartnerId(null)
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* New Secret Display Modal */}
        {newSecret && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle>API Secret (Save this now!)</CardTitle>
                <p className="text-sm text-gray-600">This secret will only be shown once</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-gray-100 p-4 rounded-lg font-mono text-sm break-all">
                    {newSecret}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        copyToClipboard(newSecret)
                      }}
                      variant="outline"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy
                    </Button>
                    <Button
                      onClick={() => {
                        setNewSecret(null)
                      }}
                    >
                      I&apos;ve saved it
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Partners List */}
        <div className="space-y-4">
          {partners?.map((partner) => (
            <Card key={partner.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {partner.name}
                      <Badge variant={partner.status === 'ACTIVE' ? 'default' : 'secondary'}>
                        {partner.status}
                      </Badge>
                    </CardTitle>
                    <p className="text-sm text-gray-600 mt-1">Code: {partner.code}</p>
                    {partner.contactEmail && (
                      <p className="text-sm text-gray-600">Contact: {partner.contactEmail}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedPartnerId(partner.id)
                      setShowCreateApp(true)
                    }}
                  >
                    <Key className="w-4 h-4 mr-2" />
                    Create Credentials
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {partner.apps.map((app) => (
                    <div
                      key={app.id}
                      className="border rounded-lg p-4 flex justify-between items-start"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                            {app.keyId}
                          </code>
                          <Badge variant={app.environment === 'PRODUCTION' ? 'default' : 'secondary'}>
                            {app.environment}
                          </Badge>
                          <Badge variant={app.status === 'ACTIVE' ? 'default' : 'destructive'}>
                            {app.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <p>Rate Limit: {app.rateLimitRpm} req/min</p>
                          <p>Scopes: {app.scopes.join(', ')}</p>
                          {app.allowedIps.length > 0 && (
                            <p>Allowed IPs: {app.allowedIps.join(', ')}</p>
                          )}
                          {app.lastUsedAt && (
                            <p className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Last used: {new Date(app.lastUsedAt).toLocaleString()}
                            </p>
                          )}
                          <p>Created: {new Date(app.createdAt).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {app.status === 'ACTIVE' && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              if (confirm('Are you sure you want to revoke these credentials?')) {
                                revokeApp.mutate({ appId: app.id })
                              }
                            }}
                          >
                            Revoke
                          </Button>
                        )}
                        <Link href={`/superadmin/partners/${partner.id}/logs?appId=${app.id}`}>
                          <Button size="sm" variant="outline">
                            View Logs
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                  {partner.apps.length === 0 && (
                    <p className="text-sm text-gray-500">No API credentials created yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {partners?.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">
                No partners created yet
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

