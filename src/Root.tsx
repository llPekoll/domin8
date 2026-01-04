import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import { GameStatePage } from "./pages/GameStatePage";
import { OneVOnePage } from "./pages/OneVOnePage";
import { ReferralPage } from "./pages/ReferralPage";
import { useDeepLinks } from "./hooks/useDeepLinks";
import { useAppLifecycle } from "./hooks/useAppLifecycle";

function NativeHandlers() {
  useDeepLinks((url) => {
    console.log("[App] Deep link received:", url);
  });
  useAppLifecycle();
  return null;
}

export function Root() {
  return (
    <BrowserRouter>
      <NativeHandlers />
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/gamestate" element={<GameStatePage />} />
        <Route path="/1v1" element={<OneVOnePage />} />
        <Route path="/referrals" element={<ReferralPage />} />
      </Routes>
    </BrowserRouter>
  );
}
