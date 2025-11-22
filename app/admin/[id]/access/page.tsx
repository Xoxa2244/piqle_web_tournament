'use client'

import { useParams } from 'next/navigation'
import { useState, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Search, UserPlus, Edit, Trash2, Check, X, Clock, UserCheck, UserX } from 'lucide-react'

export default function AccessManagementPage() {
  const params = useParams()
  const tournamentId = params.id as string

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState<{
    id: string
    email: string
    name: string | null
    image: string | null
  } | null>(null)
  const [accessLevel, setAccessLevel] = useState<'ADMIN' | 'SCORE_ONLY'>('SCORE_ONLY')
  const [divisionMode, setDivisionMode] = useState<'all' | 'selected'>('all')
  const [selectedDivisionIds, setSelectedDivisionIds] = useState<string[]>([])
  const [editingAccessId, setEditingAccessId] = useState<string | null>(null)
  
  // State for approving requests
  const [approvingRequestId, setApprovingRequestId] = useState<string | null>(null)
  const [requestAccessLevel, setRequestAccessLevel] = useState<'ADMIN' | 'SCORE_ONLY'>('SCORE_ONLY')
  const [requestDivisionMode, setRequestDivisionMode] = useState<'all' | 'selected'>('all')
  const [requestSelectedDivisionIds, setRequestSelectedDivisionIds] = useState<string[]>([])

  // Get tournament divisions
  const { data: tournament } = trpc.tournament.get.useQuery({ id: tournamentId })
  
  // Check if user is owner (only owners can manage access)
  const isOwner = tournament?.userAccessInfo?.isOwner
  
  // Search users
  const searchUsersQuery = trpc.tournamentAccess.searchUsers.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length >= 2 }
  )

  // List all accesses
  const { data: accesses, refetch: refetchAccesses } = trpc.tournamentAccess.list.useQuery({
    tournamentId,
  })

  // List access requests
  const { data: accessRequests, refetch: refetchRequests } = trpc.tournamentAccess.listRequests.useQuery({
    tournamentId,
  })

  // Approve request mutation
  const approveRequestMutation = trpc.tournamentAccess.approveRequest.useMutation({
    onSuccess: () => {
      refetchRequests()
      refetchAccesses()
      setApprovingRequestId(null)
      setRequestAccessLevel('SCORE_ONLY')
      setRequestDivisionMode('all')
      setRequestSelectedDivisionIds([])
    },
  })

  // Reject request mutation
  const rejectRequestMutation = trpc.tournamentAccess.rejectRequest.useMutation({
    onSuccess: () => {
      refetchRequests()
    },
  })

  // Grant access mutation
  const grantAccessMutation = trpc.tournamentAccess.grant.useMutation({
    onSuccess: () => {
      refetchAccesses()
      setSelectedUser(null)
      setSearchQuery('')
      setDivisionMode('all')
      setSelectedDivisionIds([])
    },
  })

  // Update access mutation
  const updateAccessMutation = trpc.tournamentAccess.update.useMutation({
    onSuccess: () => {
      refetchAccesses()
      setEditingAccessId(null)
    },
  })

  // Revoke access mutation
  const revokeAccessMutation = trpc.tournamentAccess.revoke.useMutation({
    onSuccess: () => {
      refetchAccesses()
    },
  })

  // Revoke all access mutation
  const revokeAllAccessMutation = trpc.tournamentAccess.revokeAll.useMutation({
    onSuccess: () => {
      refetchAccesses()
    },
  })

  const handleGrantAccess = () => {
    if (!selectedUser) return

    grantAccessMutation.mutate({
      tournamentId,
      userId: selectedUser.id,
      accessLevel,
      divisionIds: divisionMode === 'all' ? null : selectedDivisionIds,
    })
  }

  const handleToggleDivision = (divisionId: string) => {
    setSelectedDivisionIds((prev) =>
      prev.includes(divisionId)
        ? prev.filter((id) => id !== divisionId)
        : [...prev, divisionId]
    )
  }

  const handleUpdateAccess = (accessId: string) => {
    updateAccessMutation.mutate({
      accessId,
      accessLevel: accessLevel,
      divisionIds: divisionMode === 'all' ? null : selectedDivisionIds,
    })
  }

  const handleRevokeAccess = (accessId: string, skipConfirm = false) => {
    if (skipConfirm || confirm('Are you sure you want to revoke this access?')) {
      revokeAccessMutation.mutate({ accessId })
    }
  }

  const startEditing = (access: any) => {
    setEditingAccessId(access.id)
    setAccessLevel(access.accessLevel)
    // If division is null, it means all divisions
    if (access.divisionId === null) {
      setDivisionMode('all')
      setSelectedDivisionIds([])
    } else {
      // Find all accesses for this user/tournament combo to get all their divisions
      const userAccesses = accesses?.filter((a) => a.userId === access.userId) || []
      if (userAccesses.length > 1) {
        setDivisionMode('selected')
        setSelectedDivisionIds(userAccesses.map((a) => a.divisionId).filter(Boolean) as string[])
      } else {
        setDivisionMode('selected')
        setSelectedDivisionIds(access.divisionId ? [access.divisionId] : [])
      }
    }
  }

  const cancelEditing = () => {
    setEditingAccessId(null)
    setAccessLevel('SCORE_ONLY')
    setDivisionMode('all')
    setSelectedDivisionIds([])
  }

  const handleToggleRequestDivision = (divisionId: string) => {
    setRequestSelectedDivisionIds((prev) =>
      prev.includes(divisionId)
        ? prev.filter((id) => id !== divisionId)
        : [...prev, divisionId]
    )
  }

  const handleApproveRequest = () => {
    if (!approvingRequestId) return
    
    approveRequestMutation.mutate({
      requestId: approvingRequestId,
      accessLevel: requestAccessLevel,
      divisionIds: requestDivisionMode === 'all' ? null : requestSelectedDivisionIds,
    })
  }

  const handleRejectRequest = (requestId: string) => {
    if (confirm('Are you sure you want to reject this access request?')) {
      rejectRequestMutation.mutate({ requestId })
    }
  }

  const startApprovingRequest = (requestId: string) => {
    setApprovingRequestId(requestId)
    setRequestAccessLevel('SCORE_ONLY')
    setRequestDivisionMode('all')
    setRequestSelectedDivisionIds([])
  }

  const cancelApprovingRequest = () => {
    setApprovingRequestId(null)
    setRequestAccessLevel('SCORE_ONLY')
    setRequestDivisionMode('all')
    setRequestSelectedDivisionIds([])
  }

  const divisions = tournament?.divisions || []

  // Filter out divisions that are part of a merged division
  // Only show merged divisions and standalone divisions (not those that were merged)
  const visibleDivisions = useMemo(() => {
    if (!divisions || divisions.length === 0) return []
    
    const divisionsArray = divisions as any[]
    const mergedDivisions = divisionsArray.filter((d: any) => d.isMerged && d.mergedFromDivisionIds)
    
    return divisionsArray.filter((div: any) => {
      // Always show merged divisions
      if (div.isMerged) return true
      
      // Hide divisions that are part of a merged division
      const isPartOfMerged = mergedDivisions.some((merged: any) => {
        const mergedFromIds = Array.isArray(merged.mergedFromDivisionIds) 
          ? merged.mergedFromDivisionIds 
          : []
        return mergedFromIds.includes(div.id)
      })
      
      return !isPartOfMerged
    })
  }, [divisions])

  // Group accesses by user
  type AccessItem = NonNullable<typeof accesses>[0]
  type GroupedAccess = {
    user: { id: string; email: string; name: string | null; image: string | null }
    accesses: AccessItem[]
    accessLevel: 'ADMIN' | 'SCORE_ONLY'
  }
  
  const groupedAccesses = accesses?.reduce((acc, access) => {
    const userId = access.userId
    if (!acc[userId]) {
      acc[userId] = {
        user: access.user,
        accesses: [],
        accessLevel: access.accessLevel, // Assume same access level for all (should be enforced)
      }
    }
    acc[userId].accesses.push(access)
    return acc
  }, {} as Record<string, GroupedAccess>) || {}

  const groupedAccessesArray = Object.values(groupedAccesses)

  // Check if user is owner - only owners can manage access
  if (!isOwner) {
    return (
      <div className="container mx-auto py-8">
        <div className="mb-6">
          <Link
            href={`/admin/${tournamentId}`}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Tournament
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
              Access management is only available to the tournament owner.
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
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <Link
          href={`/admin/${tournamentId}`}
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Tournament
        </Link>
        <h1 className="text-3xl font-bold">Access Management</h1>
        <p className="text-gray-600 mt-2">Manage who can access this tournament and their permissions</p>
      </div>

      {/* Grant Access Section */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center">
            <UserPlus className="mr-2 h-5 w-5" />
            Grant Access
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* User Search */}
          <div>
            <Label htmlFor="user-search">Search User</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="user-search"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            {searchQuery.length >= 2 && searchUsersQuery.data && (
              <div className="mt-2 border rounded-md bg-white shadow-lg z-10">
                {searchUsersQuery.data.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500">No users found</div>
                ) : (
                  searchUsersQuery.data.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => {
                        setSelectedUser(user)
                        setSearchQuery('')
                      }}
                      className="w-full text-left p-3 hover:bg-gray-50 flex items-center space-x-3"
                    >
                      {user.image && (
                        <Image
                          src={user.image}
                          alt={user.name || 'User avatar'}
                          width={32}
                          height={32}
                          className="w-8 h-8 rounded-full object-cover"
                          unoptimized
                        />
                      )}
                      <div>
                        <div className="font-medium">{user.name || 'No name'}</div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Selected User */}
          {selectedUser && (
            <div className="p-4 bg-gray-50 rounded-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {selectedUser.image && (
                    <Image
                      src={selectedUser.image}
                      alt={selectedUser.name || 'User avatar'}
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded-full object-cover"
                      unoptimized
                    />
                  )}
                  <div>
                    <div className="font-medium">{selectedUser.name || 'No name'}</div>
                    <div className="text-sm text-gray-500">{selectedUser.email}</div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedUser(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Access Level */}
              <div className="mt-4">
                <Label>Access Level</Label>
                <div className="mt-2 space-y-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="accessLevel"
                      value="SCORE_ONLY"
                      checked={accessLevel === 'SCORE_ONLY'}
                      onChange={(e) => setAccessLevel(e.target.value as 'ADMIN' | 'SCORE_ONLY')}
                      className="w-4 h-4"
                    />
                    <span>Score Entry Only</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="accessLevel"
                      value="ADMIN"
                      checked={accessLevel === 'ADMIN'}
                      onChange={(e) => setAccessLevel(e.target.value as 'ADMIN' | 'SCORE_ONLY')}
                      className="w-4 h-4"
                    />
                    <span>Administrative (Full Tournament Director Access)</span>
                  </label>
                </div>
              </div>

              {/* Division Selection */}
              <div className="mt-4">
                <Label>Divisions</Label>
                <div className="mt-2 space-y-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="divisionMode"
                      value="all"
                      checked={divisionMode === 'all'}
                      onChange={(e) => {
                        setDivisionMode('all')
                        setSelectedDivisionIds([])
                      }}
                      className="w-4 h-4"
                    />
                    <span>All Divisions</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="divisionMode"
                      value="selected"
                      checked={divisionMode === 'selected'}
                      onChange={(e) => setDivisionMode('selected')}
                      className="w-4 h-4"
                    />
                    <span>Selected Divisions</span>
                  </label>
                </div>

                {divisionMode === 'selected' && (
                  <div className="mt-2 max-h-64 overflow-y-auto border rounded-md p-4">
                    <div className="grid grid-cols-5 gap-2">
                      {visibleDivisions.map((division: any) => (
                        <label
                          key={division.id}
                          className="flex items-center space-x-2 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedDivisionIds.includes(division.id)}
                            onChange={() => handleToggleDivision(division.id)}
                            className="w-4 h-4"
                          />
                          <span className="text-sm">{division.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Grant Button */}
              <Button
                onClick={handleGrantAccess}
                disabled={grantAccessMutation.isLoading || (divisionMode === 'selected' && selectedDivisionIds.length === 0)}
                className="mt-4 w-full"
              >
                {grantAccessMutation.isLoading ? 'Granting...' : 'Grant Access'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Access Requests */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Clock className="mr-2 h-5 w-5" />
            Access Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          {accessRequests && accessRequests.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No pending access requests
            </div>
          ) : (
            <div className="space-y-4">
              {accessRequests?.map((request) => {
                const isApproving = approvingRequestId === request.id
                
                return (
                  <div
                    key={request.id}
                    className="border rounded-md p-4 flex items-center justify-between"
                  >
                    {isApproving ? (
                      <div className="flex-1 space-y-4">
                        {/* Approve Mode */}
                        <div className="flex items-center space-x-3">
                          {request.user.image && (
                            <Image
                              src={request.user.image}
                              alt={request.user.name || 'User avatar'}
                              width={40}
                              height={40}
                              className="w-10 h-10 rounded-full object-cover"
                              unoptimized
                            />
                          )}
                          <div>
                            <div className="font-medium">
                              {request.user.name || 'No name'}
                            </div>
                            <div className="text-sm text-gray-500">{request.user.email}</div>
                          </div>
                        </div>

                        {request.message && (
                          <div className="p-3 bg-gray-50 rounded-md">
                            <div className="text-xs text-gray-500 mb-1">Message:</div>
                            <div className="text-sm text-gray-700">{request.message}</div>
                          </div>
                        )}

                        <div>
                          <Label>Access Level</Label>
                          <div className="mt-2 space-y-2">
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`request-accessLevel-${request.id}`}
                                value="SCORE_ONLY"
                                checked={requestAccessLevel === 'SCORE_ONLY'}
                                onChange={(e) =>
                                  setRequestAccessLevel(e.target.value as 'ADMIN' | 'SCORE_ONLY')
                                }
                                className="w-4 h-4"
                              />
                              <span>Score Entry Only</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`request-accessLevel-${request.id}`}
                                value="ADMIN"
                                checked={requestAccessLevel === 'ADMIN'}
                                onChange={(e) =>
                                  setRequestAccessLevel(e.target.value as 'ADMIN' | 'SCORE_ONLY')
                                }
                                className="w-4 h-4"
                              />
                              <span>Administrative</span>
                            </label>
                          </div>
                        </div>

                        <div>
                          <Label>Divisions</Label>
                          <div className="mt-2 space-y-2">
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`request-divisionMode-${request.id}`}
                                value="all"
                                checked={requestDivisionMode === 'all'}
                                onChange={(e) => {
                                  setRequestDivisionMode('all')
                                  setRequestSelectedDivisionIds([])
                                }}
                                className="w-4 h-4"
                              />
                              <span>All Divisions</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`request-divisionMode-${request.id}`}
                                value="selected"
                                checked={requestDivisionMode === 'selected'}
                                onChange={(e) => setRequestDivisionMode('selected')}
                                className="w-4 h-4"
                              />
                              <span>Selected Divisions</span>
                            </label>
                          </div>

                          {requestDivisionMode === 'selected' && (
                            <div className="mt-2 max-h-64 overflow-y-auto border rounded-md p-4">
                              <div className="grid grid-cols-5 gap-2">
                                {visibleDivisions.map((division: any) => (
                                  <label
                                    key={division.id}
                                    className="flex items-center space-x-2 cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={requestSelectedDivisionIds.includes(division.id)}
                                      onChange={() => handleToggleRequestDivision(division.id)}
                                      className="w-4 h-4"
                                    />
                                    <span className="text-sm">{division.name}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex space-x-2">
                          <Button
                            onClick={handleApproveRequest}
                            disabled={approveRequestMutation.isLoading || (requestDivisionMode === 'selected' && requestSelectedDivisionIds.length === 0)}
                            size="sm"
                          >
                            <UserCheck className="mr-2 h-4 w-4" />
                            Approve
                          </Button>
                          <Button
                            onClick={cancelApprovingRequest}
                            variant="outline"
                            size="sm"
                          >
                            <X className="mr-2 h-4 w-4" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* View Mode */}
                        <div className="flex items-center space-x-3 flex-1">
                          {request.user.image && (
                            <Image
                              src={request.user.image}
                              alt={request.user.name || 'User avatar'}
                              width={40}
                              height={40}
                              className="w-10 h-10 rounded-full object-cover"
                              unoptimized
                            />
                          )}
                          <div className="flex-1">
                            <div className="font-medium">
                              {request.user.name || 'No name'}
                            </div>
                            <div className="text-sm text-gray-500">{request.user.email}</div>
                            {request.message && (
                              <div className="text-xs text-gray-600 mt-2 italic">
                                &quot;{request.message}&quot;
                              </div>
                            )}
                            <div className="text-xs text-gray-400 mt-1">
                              Requested {new Date(request.createdAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <Button
                            onClick={() => startApprovingRequest(request.id)}
                            variant="outline"
                            size="sm"
                          >
                            <UserCheck className="mr-2 h-4 w-4" />
                            Approve
                          </Button>
                          <Button
                            onClick={() => handleRejectRequest(request.id)}
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                          >
                            <UserX className="mr-2 h-4 w-4" />
                            Reject
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Current Accesses */}
      <Card>
        <CardHeader>
          <CardTitle>Current Access</CardTitle>
        </CardHeader>
        <CardContent>
          {groupedAccessesArray.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No access granted yet
            </div>
          ) : (
            <div className="space-y-4">
              {groupedAccessesArray.map((groupedAccess) => {
                const userAccessIds = groupedAccess.accesses.map(a => a.id)
                const isEditing = userAccessIds.includes(editingAccessId || '')
                const allDivisions = groupedAccess.accesses.map(a => a.division).filter(Boolean)
                const hasAllDivisions = groupedAccess.accesses.some(a => a.divisionId === null)
                
                return (
                  <div
                    key={groupedAccess.user.id}
                    className="border rounded-md p-4 flex items-center justify-between"
                  >
                    {isEditing ? (
                      <div className="flex-1 space-y-4">
                        {/* Edit Mode */}
                        <div className="flex items-center space-x-3">
                          {groupedAccess.user.image && (
                            <Image
                              src={groupedAccess.user.image}
                              alt={groupedAccess.user.name || 'User avatar'}
                              width={40}
                              height={40}
                              className="w-10 h-10 rounded-full object-cover"
                              unoptimized
                            />
                          )}
                          <div>
                            <div className="font-medium">
                              {groupedAccess.user.name || 'No name'}
                            </div>
                            <div className="text-sm text-gray-500">{groupedAccess.user.email}</div>
                          </div>
                        </div>

                        <div>
                          <Label>Access Level</Label>
                          <div className="mt-2 space-y-2">
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`edit-accessLevel-${groupedAccess.user.id}`}
                                value="SCORE_ONLY"
                                checked={accessLevel === 'SCORE_ONLY'}
                                onChange={(e) =>
                                  setAccessLevel(e.target.value as 'ADMIN' | 'SCORE_ONLY')
                                }
                                className="w-4 h-4"
                              />
                              <span>Score Entry Only</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`edit-accessLevel-${groupedAccess.user.id}`}
                                value="ADMIN"
                                checked={accessLevel === 'ADMIN'}
                                onChange={(e) =>
                                  setAccessLevel(e.target.value as 'ADMIN' | 'SCORE_ONLY')
                                }
                                className="w-4 h-4"
                              />
                              <span>Administrative</span>
                            </label>
                          </div>
                        </div>

                        <div>
                          <Label>Divisions</Label>
                          <div className="mt-2 space-y-2">
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`edit-divisionMode-${groupedAccess.user.id}`}
                                value="all"
                                checked={divisionMode === 'all'}
                                onChange={(e) => {
                                  setDivisionMode('all')
                                  setSelectedDivisionIds([])
                                }}
                                className="w-4 h-4"
                              />
                              <span>All Divisions</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`edit-divisionMode-${groupedAccess.user.id}`}
                                value="selected"
                                checked={divisionMode === 'selected'}
                                onChange={(e) => setDivisionMode('selected')}
                                className="w-4 h-4"
                              />
                              <span>Selected Divisions</span>
                            </label>
                          </div>

                          {divisionMode === 'selected' && (
                            <div className="mt-2 max-h-64 overflow-y-auto border rounded-md p-4">
                              <div className="grid grid-cols-5 gap-2">
                                {visibleDivisions.map((division: any) => (
                                  <label
                                    key={division.id}
                                    className="flex items-center space-x-2 cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedDivisionIds.includes(division.id)}
                                      onChange={() => handleToggleDivision(division.id)}
                                      className="w-4 h-4"
                                    />
                                    <span className="text-sm">{division.name}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex space-x-2">
                          <Button
                            onClick={() => {
                              // Update all accesses for this user
                              userAccessIds.forEach(accessId => {
                                handleUpdateAccess(accessId)
                              })
                            }}
                            disabled={updateAccessMutation.isLoading || (divisionMode === 'selected' && selectedDivisionIds.length === 0)}
                            size="sm"
                          >
                            <Check className="mr-2 h-4 w-4" />
                            Save
                          </Button>
                          <Button
                            onClick={cancelEditing}
                            variant="outline"
                            size="sm"
                          >
                            <X className="mr-2 h-4 w-4" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                    <>
                      {/* View Mode */}
                      <div className="flex items-center space-x-3 flex-1">
                        {groupedAccess.user.image && (
                          <Image
                            src={groupedAccess.user.image}
                            alt={groupedAccess.user.name || 'User avatar'}
                            width={40}
                            height={40}
                            className="w-10 h-10 rounded-full object-cover"
                            unoptimized
                          />
                        )}
                        <div className="flex-1">
                          <div className="font-medium">
                            {groupedAccess.user.name || 'No name'}
                          </div>
                          <div className="text-sm text-gray-500">{groupedAccess.user.email}</div>
                          <div className="text-sm mt-2">
                            <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs mr-2">
                              {groupedAccess.accessLevel === 'ADMIN' ? 'Administrative' : 'Score Only'}
                            </span>
                          </div>
                          <div className="mt-2">
                            {hasAllDivisions ? (
                              <span className="text-sm text-gray-600">All Divisions</span>
                            ) : (
                              <div>
                                <div className="text-xs text-gray-500 mb-1">Divisions ({allDivisions.length}):</div>
                                <div className="max-h-32 overflow-y-auto border rounded-md p-2 bg-gray-50">
                                  <div className="flex flex-wrap gap-1">
                                    {allDivisions.map((division) => (
                                      <span
                                        key={division!.id}
                                        className="inline-block px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-700"
                                      >
                                        {division!.name}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          onClick={() => {
                            // Start editing with first access (they all have same user/tournament)
                            startEditing(groupedAccess.accesses[0])
                          }}
                          variant="outline"
                          size="sm"
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          onClick={() => {
                            if (confirm('Are you sure you want to revoke all access for this user?')) {
                              // Revoke all accesses for this user in one operation
                              revokeAllAccessMutation.mutate({
                                userId: groupedAccess.user.id,
                                tournamentId,
                              })
                            }
                          }}
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          disabled={revokeAllAccessMutation.isLoading}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {revokeAllAccessMutation.isLoading ? 'Revoking...' : 'Revoke'}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

