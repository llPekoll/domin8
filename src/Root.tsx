import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import { GameStatePage } from "./pages/GameStatePage";
import { OneVOnePage } from "./pages/OneVOnePage";
import { ReferralPage } from "./pages/ReferralPage";
import { FlappyPage } from "./pages/FlappyPage";
import { ChopPage } from "./pages/ChopPage";
import { DebugCharPage } from "./pages/DebugCharPage";

export function Root() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/gamestate" element={<GameStatePage />} />
        <Route path="/1v1" element={<OneVOnePage />} />
        <Route path="/bloody" element={<FlappyPage />} />
        <Route path="/chop" element={<ChopPage />} />
        <Route path="/referrals" element={<ReferralPage />} />
        <Route path="/debugchar" element={<DebugCharPage />} />
      </Routes>
    </BrowserRouter>
  );
}
