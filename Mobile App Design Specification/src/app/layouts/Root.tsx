import { Outlet } from "react-router";
import { BottomNav } from "../components/navigation/BottomNav";
import { TopBar } from "../components/navigation/TopBar";

export function Root() {
  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-background">
      <TopBar />
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}