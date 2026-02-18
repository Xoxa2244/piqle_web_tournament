import { createTRPCRouter, publicProcedure } from '../trpc'
import { getAllTimezones } from '@/lib/timezoneList'

export const timezoneRouter = createTRPCRouter({
  list: publicProcedure.query(() => {
    return { timezones: getAllTimezones() }
  }),
})
