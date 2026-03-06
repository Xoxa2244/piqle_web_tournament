import { createBrowserRouter } from "react-router";
import { Root } from "./layouts/Root";
import { HomePage } from "./pages/HomePage";
import { TournamentsPage } from "./pages/TournamentsPage";
import { TournamentDetailPage } from "./pages/TournamentDetailPage";
import { ClubsPage } from "./pages/ClubsPage";
import { ClubDetailPage } from "./pages/ClubDetailPage";
import { ChatsPage } from "./pages/ChatsPage";
import { ChatDetailPage } from "./pages/ChatDetailPage";
import { AIAssistantPage } from "./pages/AIAssistantPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ProfileEditPage } from "./pages/ProfileEditPage";
import { SettingsPage } from "./pages/SettingsPage";
import { MyEventsPage } from "./pages/MyEventsPage";
import { SearchPage } from "./pages/SearchPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { OrganizerDashboard } from "./pages/organizer/OrganizerDashboard";
import { TournamentAdminPage } from "./pages/admin/TournamentAdminPage";
import { DivisionsPage } from "./pages/admin/DivisionsPage";
import { ScoreboardPage } from "./pages/ScoreboardPage";
import { RegistrationPage } from "./pages/RegistrationPage";
import { PaymentPage } from "./pages/PaymentPage";
import { IndyLeaguePage } from "./pages/admin/IndyLeaguePage";
import { LadderPage } from "./pages/admin/LadderPage";
import { SuperadminPage } from "./pages/superadmin/SuperadminPage";
import { AuthPage } from "./pages/AuthPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export const router = createBrowserRouter([
  {
    path: "/auth",
    Component: AuthPage,
  },
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: HomePage },
      { path: "search", Component: SearchPage },
      { path: "notifications", Component: NotificationsPage },
      { path: "tournaments", Component: TournamentsPage },
      { path: "tournaments/:id", Component: TournamentDetailPage },
      { path: "tournaments/:id/scoreboard", Component: ScoreboardPage },
      { path: "tournaments/:id/register", Component: RegistrationPage },
      { path: "tournaments/:id/payment", Component: PaymentPage },
      { path: "clubs", Component: ClubsPage },
      { path: "clubs/:id", Component: ClubDetailPage },
      { path: "chats", Component: ChatsPage },
      { path: "chats/ai-assistant", Component: AIAssistantPage },
      { path: "chats/:id", Component: ChatDetailPage },
      { path: "profile", Component: ProfilePage },
      { path: "profile/events", Component: MyEventsPage },
      { path: "profile/edit", Component: ProfileEditPage },
      { path: "profile/settings", Component: SettingsPage },
      { path: "profile/:id", Component: ProfilePage },
      { path: "organizer", Component: OrganizerDashboard },
      { path: "admin/tournaments/:id", Component: TournamentAdminPage },
      { path: "admin/tournaments/:id/divisions", Component: DivisionsPage },
      { path: "admin/tournaments/:id/indy", Component: IndyLeaguePage },
      { path: "admin/tournaments/:id/ladder", Component: LadderPage },
      { path: "superadmin", Component: SuperadminPage },
      { path: "*", Component: NotFoundPage },
    ],
  },
]);