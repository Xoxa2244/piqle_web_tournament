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
// import { paymentRouter } from './payment' // TODO: Uncomment when Payment model is added
import { dashboardRouter } from './dashboard'

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
  // payment: paymentRouter, // TODO: Uncomment when Payment model is added
  dashboard: dashboardRouter,
})

export type AppRouter = typeof appRouter
