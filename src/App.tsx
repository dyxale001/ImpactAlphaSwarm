import { Routes, Route } from "react-router-dom";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import VerifyEmail from "@/pages/VerifyEmail";
import AppLayout from "@/components/AppLayout";
import DashboardPage from "@/pages/DashboardPage";
import ResearchPage from "@/pages/ResearchPage";
import WatchlistPage from "@/pages/WatchlistPage";
import PortfolioPage from "@/pages/PortfolioPage";
import OnboardingPage from "@/pages/OnboardingPage";
import AssetDetailPage from "@/pages/AssetDetailPage";
import NotFound from "@/pages/NotFound";
import { PaperTradingProvider } from "@/store/paperTrading";

export default function App() {
  return (
    <PaperTradingProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/verify-email" element={<VerifyEmail />} />

        <Route
          path="/"
          element={
            <AppLayout>
              <DashboardPage />
            </AppLayout>
          }
        />

        <Route
          path="/asset/:ticker"
          element={
            <AppLayout>
              <AssetDetailPage />
            </AppLayout>
          }
        />

        <Route
          path="/onboarding"
          element={
            <AppLayout>
              <OnboardingPage />
            </AppLayout>
          }
        />

        <Route
          path="/research"
          element={
            <AppLayout>
              <ResearchPage />
            </AppLayout>
          }
        />

        <Route
          path="/compare"
          element={
            <AppLayout>
              <WatchlistPage />
            </AppLayout>
          }
        />

        <Route
          path="/portfolio"
          element={
            <AppLayout>
              <PortfolioPage />
            </AppLayout>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </PaperTradingProvider>
  );
}