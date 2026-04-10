import { createTRPCRouter } from '../trpc'
import { tournamentRouter } from './tournament'
import { divisionRouter } from './division'
import { teamRouter } from './team'
import { teamPlayerRouter } from './teamPlayer'
import { playerRouter } from './player'
import { matchRouter } from './match'
import { standingsRouter } from './standings'
import { divisionStageRouter } from './divisionStage'
import { importRouter } from './import'
import { publicRouter } from './public'
import { tournamentAccessRouter } from './tournamentAccess'
import { superadminRouter } from './superadmin'
import { userRouter } from './user'
import { ratingRouter } from './rating'
import { matchDayRouter } from './matchDay'
import { indyMatchupRouter } from './indyMatchup'
import { indyStandingsRouter } from './indyStandings'
import { indyCourtRouter } from './indyCourt'
import { partnerRouter } from './partner'
import { commentRouter } from './comment'
import { registrationRouter } from './registration'
import { waitlistRouter } from './waitlist'
import { tournamentInvitationRouter } from './tournamentInvitation'
import { paymentRouter } from './payment'
import { clubRouter } from './club'
import { clubChatRouter } from './clubChat'
import { ladderRouter } from './ladder'
import { clubTemplateRouter } from './clubTemplate'
import { notificationRouter } from './notification'
import { tournamentChatRouter } from './tournamentChat'
import { timezoneRouter } from './timezone'
import { intelligenceRouter } from './intelligence'
import { connectorsRouter } from './connectors'

export const appRouter = createTRPCRouter({
  tournament: tournamentRouter,
  division: divisionRouter,
  team: teamRouter,
  teamPlayer: teamPlayerRouter,
  player: playerRouter,
  match: matchRouter,
  standings: standingsRouter,
  divisionStage: divisionStageRouter,
  import: importRouter,
  public: publicRouter,
  tournamentAccess: tournamentAccessRouter,
  superadmin: superadminRouter,
  user: userRouter,
  rating: ratingRouter,
  matchDay: matchDayRouter,
  indyMatchup: indyMatchupRouter,
  indyStandings: indyStandingsRouter,
  indyCourt: indyCourtRouter,
  partner: partnerRouter,
  comment: commentRouter,
  registration: registrationRouter,
  waitlist: waitlistRouter,
  tournamentInvitation: tournamentInvitationRouter,
  payment: paymentRouter,
  club: clubRouter,
  clubChat: clubChatRouter,
  clubTemplate: clubTemplateRouter,
  ladder: ladderRouter,
  notification: notificationRouter,
  tournamentChat: tournamentChatRouter,
  timezone: timezoneRouter,
  intelligence: intelligenceRouter,
  connectors: connectorsRouter,
})

export type AppRouter = typeof appRouter
