import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import { GameStatePage } from "./pages/GameStatePage";
import { OneVOnePage } from "./pages/OneVOnePage";

export function Root() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/gamestate" element={<GameStatePage />} />
        <Route path="/1v1" element={<OneVOnePage />} />
      </Routes>
    </BrowserRouter>
  );
}
