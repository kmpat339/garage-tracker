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
function buildServiceFromBody(body) {
  return {
    vehicleId: body.vehicleId,
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

// Build a MongoDB filter object from the query string. Starts empty (= match
// everything) and adds a condition only for each filter actually provided.
// This is request-parsing, so it lives in the route; db.getServices() just
// receives the finished filter.
function buildFilterFromQuery(query) {
  const filter = {};

  // Filter by vehicle: /api/services?vehicleId=car-1
  if (query.vehicleId) {
    filter.vehicleId = query.vehicleId;
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

    // A minimal sanity check: don't insert a record with no vehicle.
    if (!newService.vehicleId) {
      return res.status(400).json({ error: "vehicleId is required" });
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
