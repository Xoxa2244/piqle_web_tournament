import { type NavigatorScreenParams } from '@react-navigation/native'
import { type TournamentFormat } from '../data/mockData'

export type TournamentPolicyFilter = 'ALL' | 'MOBILE' | 'WEB_ONLY'
export type TournamentFormatFilter = 'ALL' | TournamentFormat

export type TournamentsTabParams = {
  initialSearchQuery?: string
  initialPolicyFilter?: TournamentPolicyFilter
  initialFormatFilter?: TournamentFormatFilter
  presetKey?: string
}

export type MainTabParamList = {
  Home: undefined
  Tournaments: TournamentsTabParams | undefined
  Chats: undefined
  MyTournaments: undefined
}

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined
  Auth: undefined
  TournamentDetails: { tournamentId: string }
  Registration: { tournamentId: string }
  TournamentManager: { tournamentId: string }
  DivisionManager: { tournamentId: string; divisionId: string }
}
