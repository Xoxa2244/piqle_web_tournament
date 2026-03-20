'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { motion } from 'motion/react'
import { UsersRound, Mail, Trash2, Shield, Clock, Send, AlertTriangle } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { useBrand } from '@/components/BrandProvider'
import { useTheme } from '../_components/IQThemeProvider'

export default function TeamPage() {
  const params = useParams()
  const clubId = params.id as string
  const brand = useBrand()
  const { isDark } = useTheme()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [inviteError, setInviteError] = useState('')

  const { data: admins, isLoading: adminsLoading, refetch: refetchAdmins } = trpc.club.listAdmins.useQuery(
    { clubId },
    { enabled: brand.key === 'iqsport' }
  )

  const { data: invites, refetch: refetchInvites } = trpc.club.listPendingInvites.useQuery(
    { clubId },
    { enabled: brand.key === 'iqsport' }
  )

  const sendInvite = trpc.club.sendInvite.useMutation()
  const removeAdmin = trpc.club.removeAdmin.useMutation()

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) return
    setInviteStatus('sending')
    setInviteError('')
    try {
      await sendInvite.mutateAsync({
        clubId,
        inviteeEmail: inviteEmail.trim(),
        baseUrl: window.location.origin,
      })
      setInviteStatus('sent')
      setInviteEmail('')
      refetchInvites()
      setTimeout(() => setInviteStatus('idle'), 3000)
    } catch (err: any) {
      setInviteStatus('error')
      setInviteError(err.message || 'Failed to send invite')
    }
  }

  const handleRemoveAdmin = async (userId: string) => {
    try {
      await removeAdmin.mutateAsync({ clubId, userId })
      refetchAdmins()
    } catch (err: any) {
      alert(err.message || 'Failed to remove admin')
    }
  }

  if (brand.key !== 'iqsport') return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-3xl mx-auto space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl" style={{ fontWeight: 800, color: 'var(--heading)' }}>
          <UsersRound className="w-6 h-6 inline mr-2" />
          Team Management
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--t3)' }}>
          Manage who has admin access to your club
        </p>
      </div>

      {/* Current Admins */}
      <div className="rounded-2xl p-6" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <h3 className="text-sm uppercase tracking-wider mb-4" style={{ color: 'var(--t4)', fontWeight: 600 }}>
          <Shield className="w-4 h-4 inline mr-1.5" />
          Admins ({admins?.length || 0})
        </h3>

        {adminsLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: 'var(--subtle)' }} />
            ))}
          </div>
        ) : admins?.length ? (
          <div className="space-y-2">
            {admins.map((admin: any) => (
              <div key={admin.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--subtle)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 700 }}>
                  {(admin.user?.name || admin.user?.email || 'A').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate" style={{ fontWeight: 600, color: 'var(--heading)' }}>
                    {admin.user?.name || 'Unnamed'}
                  </div>
                  <div className="text-xs truncate" style={{ color: 'var(--t4)' }}>
                    {admin.user?.email || '—'}
                  </div>
                </div>
                <div className="text-xs px-2 py-0.5 rounded-lg" style={{ background: 'rgba(139,92,246,0.1)', color: '#A78BFA', fontWeight: 600 }}>
                  {admin.role}
                </div>
                {(admins.length > 1) && (
                  <button
                    onClick={() => handleRemoveAdmin(admin.userId)}
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: 'var(--t4)' }}
                    title="Remove admin"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--t4)' }}>No admins found</p>
        )}
      </div>

      {/* Invite Admin */}
      <div className="rounded-2xl p-6" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <h3 className="text-sm uppercase tracking-wider mb-4" style={{ color: 'var(--t4)', fontWeight: 600 }}>
          <Mail className="w-4 h-4 inline mr-1.5" />
          Invite Team Member
        </h3>

        <div className="flex gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleInvite()}
            placeholder="Enter email address..."
            className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-violet-500/30"
            style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleInvite}
            disabled={inviteStatus === 'sending' || !inviteEmail.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm text-white transition-all"
            style={{
              background: inviteStatus === 'sent' ? 'linear-gradient(135deg, #10B981, #059669)' : 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
              fontWeight: 600,
              opacity: (!inviteEmail.trim() || inviteStatus === 'sending') ? 0.5 : 1,
            }}
          >
            {inviteStatus === 'sending' ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : inviteStatus === 'sent' ? (
              <>✓ Sent</>
            ) : (
              <><Send className="w-4 h-4" /> Invite</>
            )}
          </motion.button>
        </div>

        {inviteStatus === 'error' && (
          <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: '#EF4444' }}>
            <AlertTriangle className="w-3.5 h-3.5" />
            {inviteError}
          </div>
        )}
      </div>

      {/* Pending Invites */}
      {invites && invites.length > 0 && (
        <div className="rounded-2xl p-6" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <h3 className="text-sm uppercase tracking-wider mb-4" style={{ color: 'var(--t4)', fontWeight: 600 }}>
            <Clock className="w-4 h-4 inline mr-1.5" />
            Pending Invites ({invites.length})
          </h3>

          <div className="space-y-2">
            {invites.map((invite: any) => (
              <div key={invite.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--subtle)' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245,158,11,0.1)' }}>
                  <Mail className="w-4 h-4" style={{ color: '#F59E0B' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate" style={{ color: 'var(--t1)' }}>{invite.inviteeEmail}</div>
                  <div className="text-xs" style={{ color: 'var(--t4)' }}>
                    Sent {new Date(invite.createdAt).toLocaleDateString()}
                    {invite.delivered && ' · Delivered'}
                  </div>
                </div>
                <div className="text-xs px-2 py-0.5 rounded-lg" style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B', fontWeight: 500 }}>
                  Pending
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}
