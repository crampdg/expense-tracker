import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css"; // optional, remove if you don’t have it

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
