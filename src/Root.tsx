import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import { GameStatePage } from "./pages/GameStatePage";
import { FlappyPage } from "./features/flappy";

export function Root() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/gamestate" element={<GameStatePage />} />
        <Route path="/flappy" element={<FlappyPage />} />
      </Routes>
    </BrowserRouter>
  );
}
