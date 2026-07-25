import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Upload, Bell, Settings, LogOut } from "lucide-react";
import { useStore } from "../lib/store";

export function Layout() {
  const { user, logout } = useStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top navbar */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">CR</span>
          </div>
          <h1 className="text-lg font-semibold text-gray-900">Costco Refunder</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{user?.email}</span>
          <button
            onClick={handleLogout}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            title="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex">
        {/* Sidebar (desktop) */}
        <nav className="hidden md:flex flex-col w-56 bg-white border-r border-gray-200 p-4 gap-1">
          <NavItem to="/" icon={<LayoutDashboard size={18} />} label="Dashboard" />
          <NavItem to="/upload" icon={<Upload size={18} />} label="Upload Receipt" />
          <NavItem to="/alerts" icon={<Bell size={18} />} label="Price Alerts" />
          <NavItem to="/settings" icon={<Settings size={18} />} label="Settings" />
        </nav>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* Bottom nav (mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around py-2">
        <MobileNavItem to="/" icon={<LayoutDashboard size={20} />} label="Home" />
        <MobileNavItem to="/upload" icon={<Upload size={20} />} label="Upload" />
        <MobileNavItem to="/alerts" icon={<Bell size={20} />} label="Alerts" />
        <MobileNavItem to="/settings" icon={<Settings size={20} />} label="Settings" />
      </nav>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? "bg-brand-50 text-brand-700"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

function MobileNavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex flex-col items-center gap-0.5 text-xs ${
          isActive ? "text-brand-600" : "text-gray-400"
        }`
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}
