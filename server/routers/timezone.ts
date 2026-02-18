import { createTRPCRouter, publicProcedure } from '../trpc'
import { getTimezoneOptions } from '@/lib/timezoneList'

export const timezoneRouter = createTRPCRouter({
  list: publicProcedure.query(() => {
    return { timezones: getTimezoneOptions() }
  }),
})
