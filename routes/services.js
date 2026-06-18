// routes/services.js
// All the URLs for service records live here. This is an Express "Router" —
// a mini-app that groups related routes. server.js mounts it under
// "/api/services", so the route below (GET "/") answers GET /api/services.
//
// These handlers do HTTP work only: read the request, call a db method, and
// shape the response (status codes + JSON). All MongoDB work lives in
// db/database.js — this file never touches a collection directly.

import express from "express";
import { ObjectId } from "mongodb";
import db from "../db/database.js";

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

// Convert a numeric form value into a number, but treat an empty/missing
// value as null (our "no value entered" signifier) instead of 0.
// A real 0 sent by the user is preserved.
function toNumberOrNull(value) {
  if (value === "" || value === undefined || value === null) {
    return null;
  }
  return Number(value);
}

// Build a clean service document from a request body. Used by BOTH POST and
// PUT so the field shape and the empty-handling live in exactly one place.
// vehicleId is the foreign key to vehicles._id, which is an ObjectId, so we
// convert the incoming string to an ObjectId here. toObjectId returns null if
// it's missing or not a valid id; the POST/PUT handlers reject that with a 400.
function buildServiceFromBody(body) {
  return {
    vehicleId: toObjectId(body.vehicleId),
    date: body.date,
    serviceType: body.serviceType,
    mileageAtService: toNumberOrNull(body.mileageAtService),
    cost: toNumberOrNull(body.cost),
    recommendedInterval: toNumberOrNull(body.recommendedInterval),
    shopName: body.shopName,
    serviceRating: toNumberOrNull(body.serviceRating),
    notes: body.notes,
  };
}

// Validate a built service document. Returns an error message string if it's
// invalid, or null if it's fine. Shared by POST and PUT so the rules live in
// one place. (`doc` is the object from buildServiceFromBody.)
function validateService(doc) {
  // The minimum a recommendedInterval is allowed to be. Real-world service
  // intervals are thousands of miles; our seed data ranges 3000–10000, so we
  // reject anything below this as a data-entry mistake (0 used to slip in).
  const MIN_RECOMMENDED_INTERVAL = 3000;

  // vehicleId is null when it was missing OR not a valid ObjectId.
  if (!doc.vehicleId) {
    return "A valid vehicleId is required";
  }
  // recommendedInterval may be null (not provided) — that's allowed — but if a
  // value WAS given, it must be a sensible positive interval.
  if (
    doc.recommendedInterval !== null &&
    doc.recommendedInterval < MIN_RECOMMENDED_INTERVAL
  ) {
    return `recommendedInterval must be at least ${MIN_RECOMMENDED_INTERVAL}`;
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
    console.log("GET /api/services/summary/due-soon:", dueSoon.length, "vehicles");
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
