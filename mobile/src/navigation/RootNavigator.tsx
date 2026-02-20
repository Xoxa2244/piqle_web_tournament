import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Text } from 'react-native'
import { colors } from '../theme/colors'
import { ChatsScreen } from '../screens/ChatsScreen'
import { AuthScreen } from '../screens/AuthScreen'
import { DivisionManagerScreen } from '../screens/DivisionManagerScreen'
import { HomeScreen } from '../screens/HomeScreen'
import { MyTournamentsScreen } from '../screens/MyTournamentsScreen'
import { RegistrationScreen } from '../screens/RegistrationScreen'
import { TournamentsScreen } from '../screens/TournamentsScreen'
import { TournamentManagerScreen } from '../screens/TournamentManagerScreen'
import { TournamentDetailsScreen } from '../screens/TournamentDetailsScreen'
import { type MainTabParamList, type RootStackParamList } from './types'

const Stack = createNativeStackNavigator<RootStackParamList>()
const Tabs = createBottomTabNavigator<MainTabParamList>()

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#D8D1C3',
          backgroundColor: '#FFFAF0',
          height: 68,
          paddingTop: 6,
          paddingBottom: 10,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: '#697066',
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
          letterSpacing: 0.2,
        },
      }}
    >
      <Tabs.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: ({ color }) => <Text style={{ color, fontWeight: '700' }}>Home</Text>,
        }}
      />
      <Tabs.Screen
        name="Tournaments"
        component={TournamentsScreen}
        options={{
          tabBarLabel: ({ color }) => <Text style={{ color, fontWeight: '700' }}>Tournaments</Text>,
        }}
      />
      <Tabs.Screen
        name="Chats"
        component={ChatsScreen}
        options={{
          tabBarLabel: ({ color }) => <Text style={{ color, fontWeight: '700' }}>Chats</Text>,
        }}
      />
      <Tabs.Screen
        name="MyTournaments"
        component={MyTournamentsScreen}
        options={{
          title: 'My Tournaments',
          tabBarLabel: ({ color }) => <Text style={{ color, fontWeight: '700' }}>Manage</Text>,
        }}
      />
    </Tabs.Navigator>
  )
}

export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: '#FFFAF0',
        },
        headerTintColor: colors.ink,
        headerTitleStyle: {
          fontWeight: '800',
        },
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="Auth" component={AuthScreen} options={{ title: 'Sign In' }} />
      <Stack.Screen
        name="TournamentDetails"
        component={TournamentDetailsScreen}
        options={{ title: 'Event Details' }}
      />
      <Stack.Screen name="Registration" component={RegistrationScreen} options={{ title: 'Register' }} />
      <Stack.Screen
        name="TournamentManager"
        component={TournamentManagerScreen}
        options={{ title: 'Tournament Manager' }}
      />
      <Stack.Screen
        name="DivisionManager"
        component={DivisionManagerScreen}
        options={{ title: 'Division Manager' }}
      />
    </Stack.Navigator>
  )
}
