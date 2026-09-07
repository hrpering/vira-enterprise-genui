import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";

const root = document.querySelector("#root");
if (!(root instanceof HTMLElement)) throw new Error("Vira web root is missing");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
