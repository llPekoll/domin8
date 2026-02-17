import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import { GameStatePage } from "./pages/GameStatePage";
import { OneVOnePage } from "./pages/OneVOnePage";
import { ReferralPage } from "./pages/ReferralPage";
import { FlappyPage } from "./pages/FlappyPage";
import { DebugCharPage } from "./pages/DebugCharPage";
import { LicensePage } from "./pages/LicensePage";
import { CopyrightPage } from "./pages/CopyrightPage";
import { PrivacyPage } from "./pages/PrivacyPage";

export function Root() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/gamestate" element={<GameStatePage />} />
        <Route path="/1v1" element={<OneVOnePage />} />
        <Route path="/bloody" element={<FlappyPage />} />
        <Route path="/referrals" element={<ReferralPage />} />
        <Route path="/debugchar" element={<DebugCharPage />} />
        <Route path="/license" element={<LicensePage />} />
        <Route path="/copyright" element={<CopyrightPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
      </Routes>
    </BrowserRouter>
  );
}
