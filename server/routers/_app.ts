import { createTRPCRouter } from '../trpc'
import { tournamentRouter } from './tournament'
import { divisionRouter } from './division'
import { teamRouter } from './team'
import { playerRouter } from './player'
import { matchRouter } from './match'
import { importRouter } from './import'
import { publicRouter } from './public'

export const appRouter = createTRPCRouter({
  tournament: tournamentRouter,
  division: divisionRouter,
  team: teamRouter,
  player: playerRouter,
  match: matchRouter,
  import: importRouter,
  public: publicRouter,
})

export type AppRouter = typeof appRouter
