// routes/services.js
// All the URLs for service records live here. This is an Express "Router" —
// a mini-app that groups related routes. server.js mounts it under
// "/api/services", so the route below (GET "/") answers GET /api/services.
//
// These handlers do HTTP work only: read the request, call a db method, and
// shape the response (status codes + JSON). All MongoDB work lives in
// db/servicesDb.js — this file never touches a collection directly.

import express from "express";
import { ObjectId } from "mongodb";
import db from "../db/servicesDb.js";

const router = express.Router();

// Small helper: turn the id from the URL (a string) into a MongoDB ObjectId,
// which is what _id is actually stored as. Returns null if the string isn't a
// valid id (e.g. someone typed gibberish), so the route can respond 400/404.
function toObjectId(idString) {
  if (!ObjectId.isValid(idString)) {
    return null;
  }
  return new ObjectId(idString);
}

/*=============================================
=           Helper Functions           =
=============================================*/

// Middleware for the routes that take an :id in the URL.
// It runs BEFORE the route handler: it converts the id once and, if the id is
// bad, responds 400 and stops (by not calling next()). Otherwise it stashes the
// converted id on req.objectId and calls next() to continue to the route.
function requireValidId(req, res, next) {
  const id = toObjectId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Invalid id" });
  }
  req.objectId = id;
  next();
}

// num: turn a form value into a number, but treat empty/missing as null (our
// "not entered" marker). A real 0 is preserved.
function num(value) {
  if (value === "" || value === undefined || value === null) {
    return null;
  }
  return Number(value);
}

// money: same as num(), but rounded to 2 decimal places so we never store
// fractions of a cent (e.g. 49.999 -> 50). null stays null.
function money(value) {
  const n = num(value);
  return n === null ? null : Math.round(n * 100) / 100;
}

// Build a clean service document from a request body. Used by BOTH POST and
// PUT so the field shape lives in one place. This step only SHAPES the data
// (string -> number, empty -> null, round money); validateService judges it
// afterward. vehicleId becomes an ObjectId, or null if missing/invalid.
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

// The minimum a recommendedInterval is allowed to be. Real-world service
// intervals are thousands of miles; our seed data ranges 3000–10000, so we
// reject anything below this as a data-entry mistake (0 used to slip in).
const MIN_RECOMMENDED_INTERVAL = 3000;

// Validate a built service document. Returns an error message string if it's
// invalid, or null if it's fine. Shared by POST and PUT so the rules live in
// one place. (`doc` is the object from buildServiceFromBody.)
//
// Everything is required EXCEPT notes. Numbers were run through num()/money()
// in buildServiceFromBody, so a missing/empty number arrives here as null (and
// a non-numeric value as NaN); both count as "not provided".
function validateService(doc) {
  // --- required text fields ---
  // vehicleId is null when it was missing OR not a valid ObjectId.
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

  // --- required numbers ---
  // mileageAtService: required, a whole number 0 or more (0 is a valid reading).
  if (doc.mileageAtService === null || Number.isNaN(doc.mileageAtService)) {
    return "Mileage at service is required";
  }
  if (!Number.isInteger(doc.mileageAtService) || doc.mileageAtService < 0) {
    return "Mileage at service must be a whole number, 0 or more";
  }

  // cost: required, 0 or more.
  if (doc.cost === null || Number.isNaN(doc.cost)) {
    return "Cost is required";
  }
  if (doc.cost < 0) {
    return "Cost cannot be negative";
  }

  // recommendedInterval: required, a whole number at least MIN_RECOMMENDED_INTERVAL.
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

  // serviceRating: required, a whole number 1 to 5.
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

  // notes is optional EXCEPT when the service type is "other": then we require
  // a note so there's a record of what the service actually was.
  if (doc.serviceType === "other" && !doc.notes?.trim()) {
    return "Notes are required when the service type is other";
  }

  return null;
}

// Build a MongoDB filter object from the query string. Starts empty (= match
// everything) and adds a condition only for each filter actually provided.
// This is request-parsing, so it lives in the route; db.getServices() just
// receives the finished filter.
function buildFilterFromQuery(query) {
  const filter = {};

  // Filter by vehicle: /api/services?vehicleId=<vehicle's _id>
  // vehicleId is stored as an ObjectId, so convert the query string to match.
  // If it's not a valid id, we simply skip the filter (an invalid id can't
  // match anything meaningful) rather than erroring.
  if (query.vehicleId) {
    const vid = toObjectId(query.vehicleId);
    if (vid) {
      filter.vehicleId = vid;
    }
  }

  // Filter by service type: /api/services?serviceType=brakes
  if (query.serviceType) {
    filter.serviceType = query.serviceType;
  }

  // Filter by cost range: /api/services?costMin=100&costMax=500
  // cost is a number, so convert the query strings with Number(). $gte = at
  // least costMin; $lte = at most costMax. Either end is optional. A
  // non-numeric value (Number(...) is NaN) is skipped rather than erroring.
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
    // If both were non-numeric, leave no cost filter at all.
    if (Object.keys(filter.cost).length === 0) {
      delete filter.cost;
    }
  }

  // Filter by date range: /api/services?from=2026-01-01&to=2026-06-30
  // Dates are stored as "YYYY-MM-DD" strings, which compare correctly as text.
  // $gte = on or after `from`; $lte = on or before `to`. Either end is optional.
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

/*=============================================
=           General GET/, POST/ Route handlers  =
=============================================*/

// GET /api/services
// Return service records as a JSON array. Optional filters can be passed as
// query-string params (e.g. /api/services?vehicleId=car-1). With no filters,
// returns everything.
router.get("/", async (req, res) => {
  try {
    const filter = buildFilterFromQuery(req.query);
    const services = await db.getServices(filter);
    console.log("GET /api/services succeeded:", services.length, "records");
    res.json(services);
  } catch (error) {
    // If something goes wrong (e.g. the database read fails), send back a
    // 500 ("server error") with a short message instead of crashing.
    console.error("GET /api/services failed:", error.message);
    res.status(500).json({ error: "Failed to fetch services" });
  }
});

// POST /api/services
// Create a new service record. The data comes in the request body as JSON
// (express.json() in server.js already parsed it into req.body).
router.post("/", async (req, res) => {
  try {
    // Build the document from the request body (shared with PUT).
    const newService = buildServiceFromBody(req.body);

    // Validate (vehicleId + interval). Returns an error string, or null if ok.
    const error = validateService(newService);
    if (error) {
      return res.status(400).json({ error });
    }

    // Insert it. MongoDB adds a unique _id automatically.
    const result = await db.createService(newService);
    console.log("POST /api/services succeeded:", result.insertedId);

    // Respond 201 ("created") with the new record, including its new _id.
    res.status(201).json({ _id: result.insertedId, ...newService });
  } catch (error) {
    console.error("POST /api/services failed:", error.message);
    res.status(500).json({ error: "Failed to create service" });
  }
});

/*=============================================
=            Summary / Aggregation routes          =
=============================================*/

// IMPORTANT: these literal routes MUST be registered ABOVE "/:id" below.
// Express matches routes top-to-bottom by shape; "/:id" matches ANY single
// segment, so if it came first it would swallow "summary" and these would
// never run.

// GET /api/services/summary/by-vehicle
// Returns one row per vehicle: total spend + number of services.
// Takes no input (no body, no params), so this is the simplest handler here:
// just call the db method and send back the result.
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
// Returns one row per month: total spend + number of services that month.
// Same shape as by-vehicle; the db method just groups by month instead.
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
// Returns each vehicle (that has service history) with its predicted next
// service by mileage: dueAtMileage and milesLeft (negative = overdue), most
// urgent first. The frontend decides what counts as "soon" and how to display
// it. Grouped under summary/ with the other computed reports; like them it
// must stay ABOVE "/:id".
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

/*=============================================
=            GET/PUT/DELETE Single Records          =
=============================================*/

// GET /api/services/:id
// Return a single service record by its id.
// requireValidId runs first and puts the converted id on req.objectId.
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
// Update an existing service record. Same fields as POST.
// requireValidId runs first and puts the converted id on req.objectId.
router.put("/:id", requireValidId, async (req, res) => {
  try {
    // Build the document from the request body (shared with POST).
    const updatedFields = buildServiceFromBody(req.body);

    // PUT is a full replace, so the same validation as POST applies (otherwise
    // a bad vehicleId would orphan the record, or a bad interval slip in).
    const error = validateService(updatedFields);
    if (error) {
      return res.status(400).json({ error });
    }

    const result = await db.updateService(req.objectId, updatedFields);
    console.log("PUT /api/services/:id matched:", result.matchedCount);

    // matchedCount is 0 when no document had that id.
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
// Delete a service record by its id.
// requireValidId runs first and puts the converted id on req.objectId.
router.delete("/:id", requireValidId, async (req, res) => {
  try {
    const result = await db.deleteService(req.objectId);
    console.log("DELETE /api/services/:id deleted:", result.deletedCount);

    // deletedCount is 0 when no document had that id.
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
