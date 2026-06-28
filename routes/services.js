// routes/services.js — Express router mounted at /api/services in server.js.
// Handles HTTP only; all MongoDB work is in db/servicesDb.js.

import express from "express";
import { ObjectId } from "mongodb";
import db from "../db/servicesDb.js";

const router = express.Router();

// Turn an id string from the URL into a MongoDB ObjectId, or null if invalid.
function toObjectId(idString) {
  if (!ObjectId.isValid(idString)) {
    return null;
  }
  return new ObjectId(idString);
}

/*=============================================
=           Helper Functions           =

// Middleware for the routes that take an :id in the URL.
// It runs BEFORE the route handler: it converts the id once and, if the id is
// bad, responds 400 and stops (by not calling next()). Otherwise it stashes the
// converted id on req.objectId and calls next() to continue to the route.
/*
 * I like the use of this middleware function to initialze an ObjectId, 
 * but I believe this should be the responsibility of the module that interacts with the MongoClient.
 * If you keep it as middleware, it should be in its own separate file and imported into both services.js and vehicles.js
 * to maximize physical code reuse instead of redefining it in both files. Same goes with reused helper functions.
*/
function requireValidId(req, res, next) { 
// Converts and validates the :id param before the route handler runs.
function requireValidId(req, res, next) {
  const id = toObjectId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Invalid id" });
  }
  req.objectId = id;
  next();
}

// Coerces a form value to a number; treats empty/missing as null.
function num(value) {
  if (value === "" || value === undefined || value === null) {
    return null;
  }
  return Number(value);
}

// Same as num(), but rounds to 2 decimal places so we never store fractions of a cent.
function money(value) {
  const n = num(value);
  return n === null ? null : Math.round(n * 100) / 100;
}

// Shape a clean service document from a request body (shared by POST and PUT).
// validateService judges it afterward.
function buildServiceFromBody(body) {
  return {
    date: body.date,
    serviceType: body.serviceType,
    mileageAtService: num(body.mileageAtService),
    cost: money(body.cost),
    recommendedInterval: num(body.recommendedInterval),
    shopName: body.shopName,
    serviceRating: num(body.serviceRating),
    notes: body.notes,
    vehicleId: toObjectId(body.vehicleId),
  };
}

// Seed data ranges 3000–10000; reject anything below to catch data-entry mistakes.
const MIN_RECOMMENDED_INTERVAL = 3000;

// Returns an error string if the doc is invalid, or null if it's fine.
function validateService(doc) {
  if (!doc.vehicleId) {
    return "A valid vehicleId is required";
  }
  if (!doc.date) {
    return "Date is required";
  }
  if (!doc.serviceType) {
    return "Service type is required";
  }
  if (!doc.shopName) {
    return "Shop name is required";
  }

  if (doc.mileageAtService === null || Number.isNaN(doc.mileageAtService)) {
    return "Mileage at service is required";
  }
  if (!Number.isInteger(doc.mileageAtService) || doc.mileageAtService < 0) {
    return "Mileage at service must be a whole number, 0 or more";
  }

  if (doc.cost === null || Number.isNaN(doc.cost)) {
    return "Cost is required";
  }
  if (doc.cost < 0) {
    return "Cost cannot be negative";
  }

  if (
    doc.recommendedInterval === null ||
    Number.isNaN(doc.recommendedInterval)
  ) {
    return "Recommended interval is required";
  }
  if (
    !Number.isInteger(doc.recommendedInterval) ||
    doc.recommendedInterval < MIN_RECOMMENDED_INTERVAL
  ) {
    return `Recommended interval must be a whole number, at least ${MIN_RECOMMENDED_INTERVAL}`;
  }

  if (doc.serviceRating === null || Number.isNaN(doc.serviceRating)) {
    return "Service rating is required";
  }
  if (
    !Number.isInteger(doc.serviceRating) ||
    doc.serviceRating < 1 ||
    doc.serviceRating > 5
  ) {
    return "Service rating must be a whole number between 1 and 5";
  }

  if (doc.serviceType === "other" && !doc.notes?.trim()) {
    return "Notes are required when the service type is other";
  }

  return null;
}

// Build a MongoDB filter from the query string, adding a condition only for
// each filter actually provided (empty {} matches everything).
function buildFilterFromQuery(query) {
  const filter = {};

  // Vehicle: stored as an ObjectId, so convert; skip silently if invalid.
  if (query.vehicleId) {
    const vid = toObjectId(query.vehicleId);
    if (vid) {
      filter.vehicleId = vid;
    }
  }

  if (query.serviceType) {
    filter.serviceType = query.serviceType;
  }

  // Cost range: $gte / $lte, either end optional, non-numeric ends skipped.
  if (query.costMin || query.costMax) {
    filter.cost = {};
    const min = Number(query.costMin);
    const max = Number(query.costMax);
    if (query.costMin && !Number.isNaN(min)) {
      filter.cost.$gte = min;
    }
    if (query.costMax && !Number.isNaN(max)) {
      filter.cost.$lte = max;
    }
    if (Object.keys(filter.cost).length === 0) {
      delete filter.cost;
    }
  }

  // Dates are "YYYY-MM-DD" strings, so string comparison is chronological.
  if (query.from || query.to) {
    filter.date = {};
    if (query.from) {
      filter.date.$gte = query.from;
    }
    if (query.to) {
      filter.date.$lte = query.to;
    }
  }

  return filter;
}

// GET /api/services
router.get("/", async (req, res) => {
  try {
    const filter = buildFilterFromQuery(req.query);
    const services = await db.getServices(filter);
    console.log("GET /api/services succeeded:", services.length, "records");
    res.json(services);
  } catch (error) {
    console.error("GET /api/services failed:", error.message);
    res.status(500).json({ error: "Failed to fetch services" });
  }
});

// POST /api/services
router.post("/", async (req, res) => {
  try {
    const newService = buildServiceFromBody(req.body);

    const error = validateService(newService);
    if (error) {
      return res.status(400).json({ error });
    }

    const result = await db.createService(newService);
    console.log("POST /api/services succeeded:", result.insertedId);

    res.status(201).json({ _id: result.insertedId, ...newService });
  } catch (error) {
    console.error("POST /api/services failed:", error.message);
    res.status(500).json({ error: "Failed to create service" });
  }
});

// IMPORTANT: summary routes must be registered ABOVE "/:id" — Express matches
// top-to-bottom and "/:id" would swallow the literal "summary" segment first.

// GET /api/services/summary/by-vehicle
router.get("/summary/by-vehicle", async (req, res) => {
  try {
    const summary = await db.getSummaryByVehicle();
    console.log(
      "GET /api/services/summary/by-vehicle:",
      summary.length,
      "vehicles",
    );
    res.json(summary);
  } catch (error) {
    console.error(
      "GET /api/services/summary/by-vehicle failed:",
      error.message,
    );
    res.status(500).json({ error: "Failed to build summary" });
  }
});

// GET /api/services/summary/monthly
router.get("/summary/monthly", async (req, res) => {
  try {
    const summary = await db.getMonthlySummary();
    console.log("GET /api/services/summary/monthly:", summary.length, "months");
    res.json(summary);
  } catch (error) {
    console.error("GET /api/services/summary/monthly failed:", error.message);
    res.status(500).json({ error: "Failed to build summary" });
  }
});

// GET /api/services/summary/due-soon
router.get("/summary/due-soon", async (req, res) => {
  try {
    const dueSoon = await db.getDueSoon();
    console.log(
      "GET /api/services/summary/due-soon:",
      dueSoon.length,
      "vehicles",
    );
    res.json(dueSoon);
  } catch (error) {
    console.error("GET /api/services/summary/due-soon failed:", error.message);
    res.status(500).json({ error: "Failed to build due-soon list" });
  }
});

// GET /api/services/:id
router.get("/:id", requireValidId, async (req, res) => {
  try {
    const service = await db.getServiceById(req.objectId);
    console.log("GET /api/services/:id:", service ? "found" : "not found");
    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    res.json(service);
  } catch (error) {
    console.error("GET /api/services/:id failed:", error.message);
    res.status(500).json({ error: "Failed to fetch service" });
  }
});

// PUT /api/services/:id
router.put("/:id", requireValidId, async (req, res) => {
  try {
    const updatedFields = buildServiceFromBody(req.body);

    const error = validateService(updatedFields);
    if (error) {
      return res.status(400).json({ error });
    }

    const result = await db.updateService(req.objectId, updatedFields);
    console.log("PUT /api/services/:id matched:", result.matchedCount);

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Service not found" });
    }

    res.json({ _id: req.params.id, ...updatedFields });
  } catch (error) {
    console.error("PUT /api/services/:id failed:", error.message);
    res.status(500).json({ error: "Failed to update service" });
  }
});

// DELETE /api/services/:id
router.delete("/:id", requireValidId, async (req, res) => {
  try {
    const result = await db.deleteService(req.objectId);
    console.log("DELETE /api/services/:id deleted:", result.deletedCount);

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Service not found" });
    }

    res.json({ message: "Service deleted" });
  } catch (error) {
    console.error("DELETE /api/services/:id failed:", error.message);
    res.status(500).json({ error: "Failed to delete service" });
  }
});

export default router;
