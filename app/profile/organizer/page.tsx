'use client'

import { useMemo, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`

export default function OrganizerDashboardPage() {
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'PAID' | 'CANCELED' | 'FAILED'>('ALL')
  const [tournamentFilter, setTournamentFilter] = useState<string>('ALL')
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')

  const summaryQuery = trpc.payment.organizerSummary.useQuery()
  const tournamentsQuery = trpc.payment.organizerTournamentStats.useQuery()

  const transactionsInput = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined
    const to = toDate ? new Date(`${toDate}T23:59:59.999`).toISOString() : undefined
    return {
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      tournamentId: tournamentFilter === 'ALL' ? undefined : tournamentFilter,
      from,
      to,
      limit: 50,
      offset: 0,
    }
  }, [statusFilter, tournamentFilter, fromDate, toDate])

  const transactionsQuery = trpc.payment.organizerTransactions.useQuery(transactionsInput)

  const summary = summaryQuery.data
  const tournaments = tournamentsQuery.data?.tournaments ?? []
  const transactions = transactionsQuery.data?.items ?? []

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Organizer Dashboard</h1>
          <p className="text-sm text-gray-600">
            Financial performance and registration health across your tournaments.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Financial Summary</CardTitle>
          </CardHeader>
          <CardContent>
            {summaryQuery.isLoading ? (
              <div className="text-sm text-gray-500">Loading financial summary…</div>
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-md border border-gray-200 bg-white p-3">
                  <Label>Gross revenue</Label>
                  <div className="mt-1 text-2xl font-semibold text-gray-900">
                    {formatCurrency(summary?.totals.grossCents ?? 0)}
                  </div>
                </div>
                <div className="rounded-md border border-gray-200 bg-white p-3">
                  <Label>Net to organizer</Label>
                  <div className="mt-1 text-2xl font-semibold text-gray-900">
                    {formatCurrency(summary?.totals.netCents ?? 0)}
                  </div>
                </div>
                <div className="rounded-md border border-gray-200 bg-white p-3">
                  <Label>Platform fee</Label>
                  <div className="mt-1 text-2xl font-semibold text-gray-900">
                    {formatCurrency(summary?.totals.platformFeeCents ?? 0)}
                  </div>
                </div>
                <div className="rounded-md border border-gray-200 bg-white p-3">
                  <Label>Stripe fees (estimated)</Label>
                  <div className="mt-1 text-2xl font-semibold text-gray-900">
                    {formatCurrency(summary?.totals.stripeFeeCents ?? 0)}
                  </div>
                </div>
                <div className="rounded-md border border-gray-200 bg-white p-3">
                  <Label>Refunds / canceled</Label>
                  <div className="mt-1 text-2xl font-semibold text-gray-900">
                    {formatCurrency(summary?.totals.refundsCents ?? 0)}
                  </div>
                </div>
                <div className="rounded-md border border-gray-200 bg-white p-3">
                  <Label>Stripe balance</Label>
                  <div className="mt-1 text-sm text-gray-700">
                    {summary?.balance ? (
                      <>
                        <div>Available: {formatCurrency(summary.balance.availableCents)}</div>
                        <div>Pending: {formatCurrency(summary.balance.pendingCents)}</div>
                      </>
                    ) : (
                      <div>Not available</div>
                    )}
                  </div>
                </div>
                <div className="rounded-md border border-gray-200 bg-white p-3 md:col-span-3">
                  <Label>Payment statuses</Label>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm text-gray-700">
                    <span>Paid: {summary?.statusCounts.paid ?? 0}</span>
                    <span>Pending: {summary?.statusCounts.pending ?? 0}</span>
                    <span>Canceled: {summary?.statusCounts.canceled ?? 0}</span>
                    <span>Failed: {summary?.statusCounts.failed ?? 0}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tournament Health</CardTitle>
          </CardHeader>
          <CardContent>
            {tournamentsQuery.isLoading ? (
              <div className="text-sm text-gray-500">Loading tournaments…</div>
            ) : tournaments.length === 0 ? (
              <div className="text-sm text-gray-500">No tournaments found.</div>
            ) : (
              <div className="space-y-4">
                {tournaments.map((tournament) => (
                  <div key={tournament.id} className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-gray-900">{tournament.title}</div>
                        <div className="text-sm text-gray-500">
                          {new Date(tournament.startDate).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="text-right text-sm text-gray-700">
                        <div>
                          Filled: {tournament.totals.filledSlots}/{tournament.totals.totalSlots} (
                          {tournament.totals.fillPercent}%)
                        </div>
                        <div>Waitlist: {tournament.totals.waitlistCount}</div>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm text-gray-700">
                      <div>
                        <Label>Gross</Label>
                        <div>{formatCurrency(tournament.payments.grossCents)}</div>
                      </div>
                      <div>
                        <Label>Net</Label>
                        <div>{formatCurrency(tournament.payments.netCents)}</div>
                      </div>
                      <div>
                        <Label>Platform fee</Label>
                        <div>{formatCurrency(tournament.payments.platformFeeCents)}</div>
                      </div>
                      <div>
                        <Label>Stripe fees</Label>
                        <div>{formatCurrency(tournament.payments.stripeFeeCents)}</div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="text-sm font-medium text-gray-700 mb-2">By division</div>
                      <div className="space-y-2 text-sm text-gray-700">
                        {tournament.divisions.map((division) => (
                          <div key={division.id} className="flex flex-wrap justify-between gap-2">
                            <span>{division.name}</span>
                            <span>
                              {division.filledSlots}/{division.totalSlots} ({division.fillPercent}%){' '}
                              · Waitlist {division.waitlistCount}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <Label>Status</Label>
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as 'ALL' | 'PENDING' | 'PAID' | 'CANCELED' | 'FAILED')
                  }
                  className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="ALL">All</option>
                  <option value="PAID">Paid</option>
                  <option value="PENDING">Pending</option>
                  <option value="CANCELED">Canceled</option>
                  <option value="FAILED">Failed</option>
                </select>
              </div>
              <div>
                <Label>Tournament</Label>
                <select
                  value={tournamentFilter}
                  onChange={(e) => setTournamentFilter(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="ALL">All tournaments</option>
                  {tournaments.map((tournament) => (
                    <option key={tournament.id} value={tournament.id}>
                      {tournament.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>From</Label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div>
                <Label>To</Label>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              {transactionsQuery.isLoading ? (
                <div className="text-sm text-gray-500">Loading transactions…</div>
              ) : transactions.length === 0 ? (
                <div className="text-sm text-gray-500">No transactions found.</div>
              ) : (
                <table className="min-w-full text-sm text-gray-700">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="py-2">Date</th>
                      <th className="py-2">Tournament</th>
                      <th className="py-2">Player</th>
                      <th className="py-2">Status</th>
                      <th className="py-2 text-right">Amount</th>
                      <th className="py-2 text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((payment) => {
                      const netCents =
                        payment.entryFeeCents - payment.platformFeeCents - payment.stripeFeeCents
                      return (
                        <tr key={payment.id} className="border-t border-gray-100">
                          <td className="py-2">
                            {new Date(payment.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-2">{payment.tournamentTitle}</td>
                          <td className="py-2">
                            <div>{payment.playerName || 'Player'}</div>
                            {payment.playerEmail && (
                              <div className="text-xs text-gray-500">{payment.playerEmail}</div>
                            )}
                          </td>
                          <td className="py-2">{payment.status}</td>
                          <td className="py-2 text-right">{formatCurrency(payment.totalCents)}</td>
                          <td className="py-2 text-right">{formatCurrency(netCents)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
