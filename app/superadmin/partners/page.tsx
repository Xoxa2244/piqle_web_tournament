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
  Globe,
  Search
} from 'lucide-react'
import Link from 'next/link'

const SUPERADMIN_AUTH_KEY = 'superadmin_authenticated'

export default function PartnersPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [showCreatePartner, setShowCreatePartner] = useState(false)
  const [showEditPartner, setShowEditPartner] = useState(false)
  const [editingPartner, setEditingPartner] = useState<{
    id: string
    name: string
    code: string
    contactEmail: string | null
    contactName: string | null
    directorUserId: string | null
    director: { id: string; name: string | null; email: string } | null
  } | null>(null)
  const [showCreateApp, setShowCreateApp] = useState(false)
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null)
  const [newSecret, setNewSecret] = useState<string | null>(null)
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({})
  const [partnerForm, setPartnerForm] = useState({
    name: '',
    code: '',
    contactEmail: '',
    contactName: '',
    directorUserId: '',
  })
  const [directorSearchQuery, setDirectorSearchQuery] = useState('')
  const [selectedDirector, setSelectedDirector] = useState<{
    id: string
    email: string
    name: string | null
  } | null>(null)
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
      setPartnerForm({ name: '', code: '', contactEmail: '', contactName: '', directorUserId: '' })
      setSelectedDirector(null)
      setDirectorSearchQuery('')
      refetch()
    },
  })

  const updatePartner = trpc.partner.update.useMutation({
    onSuccess: () => {
      setShowEditPartner(false)
      setEditingPartner(null)
      setSelectedDirector(null)
      setDirectorSearchQuery('')
      refetch()
    },
  })

  // Search users for director selection
  const searchUsersQuery = trpc.tournamentAccess.searchUsers.useQuery(
    { query: directorSearchQuery },
    { enabled: directorSearchQuery.length >= 2 }
  )

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
            <Link href="/superadmin/partners/api-docs">
              <Button variant="outline">API Documentation</Button>
            </Link>
            <Button onClick={() => setShowCreatePartner(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Partner
            </Button>
          </div>
        </div>

        {/* Edit Partner Modal */}
        {showEditPartner && editingPartner && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle>Edit Partner</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Partner Name</label>
                    <Input
                      value={editingPartner.name}
                      onChange={(e) => setEditingPartner({ ...editingPartner, name: e.target.value })}
                      placeholder="Acme Sports"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Partner Code</label>
                    <Input
                      value={editingPartner.code}
                      onChange={(e) => setEditingPartner({ ...editingPartner, code: e.target.value })}
                      placeholder="acme-sports"
                    />
                    <p className="text-xs text-gray-500 mt-1">Unique identifier (letters, numbers, _, -)</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Contact Email (optional)</label>
                    <Input
                      type="email"
                      value={editingPartner.contactEmail || ''}
                      onChange={(e) => setEditingPartner({ ...editingPartner, contactEmail: e.target.value || null })}
                      placeholder="contact@acme.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Contact Name (optional)</label>
                    <Input
                      value={editingPartner.contactName || ''}
                      onChange={(e) => setEditingPartner({ ...editingPartner, contactName: e.target.value || null })}
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Tournament Director</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search by name or email..."
                        value={directorSearchQuery}
                        onChange={(e) => {
                          setDirectorSearchQuery(e.target.value)
                          if (!e.target.value) {
                            setSelectedDirector(null)
                            setEditingPartner({ ...editingPartner, directorUserId: null })
                          }
                        }}
                        className="pl-10"
                      />
                    </div>
                    {directorSearchQuery.length >= 2 && searchUsersQuery.data && (
                      <div className="mt-2 border rounded-md bg-white shadow-lg z-10 max-h-48 overflow-y-auto">
                        {searchUsersQuery.data.length === 0 ? (
                          <div className="p-4 text-sm text-gray-500">No users found</div>
                        ) : (
                          searchUsersQuery.data.map((user) => (
                            <button
                              key={user.id}
                              onClick={() => {
                                setSelectedDirector(user)
                                setEditingPartner({ ...editingPartner, directorUserId: user.id })
                                setDirectorSearchQuery(user.name || user.email)
                              }}
                              className="w-full text-left p-3 hover:bg-gray-50 flex items-center space-x-3"
                            >
                              <div>
                                <div className="font-medium">{user.name || 'No name'}</div>
                                <div className="text-sm text-gray-500">{user.email}</div>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                    {editingPartner.director && !selectedDirector && (
                      <div className="mt-2 p-2 bg-gray-100 rounded-lg text-sm">
                        Current: <strong>{editingPartner.director.name || 'No name'}</strong> ({editingPartner.director.email})
                      </div>
                    )}
                    {selectedDirector && (
                      <div className="mt-2 p-2 bg-gray-100 rounded-lg text-sm">
                        Selected: <strong>{selectedDirector.name || 'No name'}</strong> ({selectedDirector.email})
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="ml-2 h-6 px-2"
                          onClick={() => {
                            setSelectedDirector(null)
                            setEditingPartner({ ...editingPartner, directorUserId: null })
                            setDirectorSearchQuery('')
                          }}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        setEditingPartner({ ...editingPartner, directorUserId: null })
                        setSelectedDirector(null)
                        setDirectorSearchQuery('')
                      }}
                    >
                      Clear Director
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        updatePartner.mutate({
                          id: editingPartner.id,
                          name: editingPartner.name,
                          code: editingPartner.code,
                          contactEmail: editingPartner.contactEmail || null,
                          contactName: editingPartner.contactName || null,
                          directorUserId: editingPartner.directorUserId || null,
                        })
                      }}
                      disabled={!editingPartner.name || !editingPartner.code}
                    >
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowEditPartner(false)
                        setEditingPartner(null)
                        setSelectedDirector(null)
                        setDirectorSearchQuery('')
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
                  <div>
                    <label className="block text-sm font-medium mb-1">Tournament Director (optional)</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search by name or email..."
                        value={directorSearchQuery}
                        onChange={(e) => {
                          setDirectorSearchQuery(e.target.value)
                          if (!e.target.value) {
                            setSelectedDirector(null)
                            setPartnerForm({ ...partnerForm, directorUserId: '' })
                          }
                        }}
                        className="pl-10"
                      />
                    </div>
                    {directorSearchQuery.length >= 2 && searchUsersQuery.data && (
                      <div className="mt-2 border rounded-md bg-white shadow-lg z-10 max-h-48 overflow-y-auto">
                        {searchUsersQuery.data.length === 0 ? (
                          <div className="p-4 text-sm text-gray-500">No users found</div>
                        ) : (
                          searchUsersQuery.data.map((user) => (
                            <button
                              key={user.id}
                              onClick={() => {
                                setSelectedDirector(user)
                                setPartnerForm({ ...partnerForm, directorUserId: user.id })
                                setDirectorSearchQuery(user.name || user.email)
                              }}
                              className="w-full text-left p-3 hover:bg-gray-50 flex items-center space-x-3"
                            >
                              <div>
                                <div className="font-medium">{user.name || 'No name'}</div>
                                <div className="text-sm text-gray-500">{user.email}</div>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                    {selectedDirector && (
                      <div className="mt-2 p-2 bg-gray-100 rounded-lg text-sm">
                        Selected: <strong>{selectedDirector.name || 'No name'}</strong> ({selectedDirector.email})
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="ml-2 h-6 px-2"
                          onClick={() => {
                            setSelectedDirector(null)
                            setPartnerForm({ ...partnerForm, directorUserId: '' })
                            setDirectorSearchQuery('')
                          }}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        createPartner.mutate({
                          ...partnerForm,
                          directorUserId: partnerForm.directorUserId || undefined,
                        })
                      }}
                      disabled={!partnerForm.name || !partnerForm.code}
                    >
                      Create
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowCreatePartner(false)
                        setPartnerForm({ name: '', code: '', contactEmail: '', contactName: '', directorUserId: '' })
                        setSelectedDirector(null)
                        setDirectorSearchQuery('')
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
                    {partner.director && (
                      <p className="text-sm text-gray-600">
                        Director: {partner.director.name || 'No name'} ({partner.director.email})
                      </p>
                    )}
                    {!partner.director && (
                      <p className="text-sm text-yellow-600">⚠️ No director assigned</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingPartner({
                          id: partner.id,
                          name: partner.name,
                          code: partner.code,
                          contactEmail: partner.contactEmail,
                          contactName: partner.contactName,
                          directorUserId: partner.director?.id || null,
                          director: partner.director,
                        })
                        setSelectedDirector(partner.director ? {
                          id: partner.director.id,
                          email: partner.director.email,
                          name: partner.director.name,
                        } : null)
                        setDirectorSearchQuery('')
                        setShowEditPartner(true)
                      }}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
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

