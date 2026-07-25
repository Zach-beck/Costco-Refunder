import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useStore } from "./lib/store";
import { Layout } from "./components/Layout";
import { Onboarding } from "./components/Onboarding";
import { LoginPage } from "./pages/Login";
import { SignupPage } from "./pages/Signup";
import { ForgotPasswordPage } from "./pages/ForgotPassword";
import { DashboardPage } from "./pages/Dashboard";
import { UploadPage } from "./pages/Upload";
import { ReceiptsPage } from "./pages/Receipts";
import { ReceiptDetailPage } from "./pages/ReceiptDetail";
import { AlertsPage } from "./pages/Alerts";
import { GuidePage } from "./pages/Guide";
import { SettingsPage } from "./pages/Settings";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useStore();
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  const { checkAuth } = useStore();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const done = localStorage.getItem("onboarding-complete");
    if (!done) {
      setShowOnboarding(true);
    }
  }, []);

  return (
    <>
      {showOnboarding && (
        <Onboarding onComplete={() => setShowOnboarding(false)} />
      )}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="receipts" element={<ReceiptsPage />} />
          <Route path="receipts/:id" element={<ReceiptDetailPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="alerts/:id/guide" element={<GuidePage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </>
  );
}
