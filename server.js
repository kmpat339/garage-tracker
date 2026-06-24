// server.js
// This is the entry point of the app. It starts the Express web server and
// serves the frontend files. The database connects on its own inside each
// db method (see db/servicesDb.js, db/vehiclesDb.js), so there's nothing to
// connect here.

import express from "express";
import servicesRouter from "./routes/services.js";
import vehiclesRouter from "./routes/vehicles.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Let Express understand JSON request bodies (e.g. when the form sends data).
app.use(express.json());

// Serve everything in the frontend/ folder to the browser.
// Visiting http://localhost:3000/services.html will load frontend/services.html.
app.use(express.static("frontend"));

// A tiny test route so we can confirm the server is alive.
// Visit http://localhost:3000/api/test to check.
app.get("/api/test", (req, res) => {
  res.json({ status: "ok" });
});

// Mount the services routes. Every route inside routes/services.js is now
// reachable under /api/services (e.g. its GET "/" answers GET /api/services).
app.use("/api/services", servicesRouter);

// Mount the vehicles routes under /api/vehicles (e.g. GET /api/vehicles).
app.use("/api/vehicles", vehiclesRouter);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
