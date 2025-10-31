import AppSidebar from "../AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

export default function AppSidebarExample() {
  const style = {
    "--sidebar-width": "16rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar
          userRole="admin"
          userName="Sarah Johnson"
          onLogout={() => console.log("Logout clicked")}
        />
      </div>
    </SidebarProvider>
  );
}
