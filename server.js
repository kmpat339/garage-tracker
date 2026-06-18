// server.js
// This is the entry point of the app. It starts the Express web server,
// serves the frontend files, and connects to MongoDB before listening.

import express from "express";
import { initDatabase } from "./db/database.js";

const app = express();
const PORT = 3000;

// Let Express understand JSON request bodies (e.g. when the form sends data).
app.use(express.json());

// Serve everything in the public/ folder to the browser.
// Visiting http://localhost:3000/services.html will load public/services.html.
app.use(express.static("public"));

// A tiny test route so we can confirm the server is alive.
// Visit http://localhost:3000/api/test to check.
app.get("/api/test", (req, res) => {
  res.json({ status: "ok" });
});

// Connect to the database FIRST, and only start listening once it succeeds.
// This way, by the time any request comes in, the database is ready.
// If the connection fails (e.g. the Mongo container isn't running), we
// print a friendly message and exit instead of crashing with a stack trace.
async function startApp() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start the app:", error.message);
  }
}

startApp();
