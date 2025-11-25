// import { useState } from "react";
// import { motion } from "framer-motion";
import "./App.css";
import Dashboard from "./pages/Dashboard";
import { Route, Routes, BrowserRouter } from "react-router-dom";

function App() {
  // const [open, setOpen] = useState(true);

  return (
    <div className="font-mono w-full bg-black">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
