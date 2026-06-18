// routes/services.js
// All the URLs for service records live here. This is an Express "Router" —
// a mini-app that groups related routes. server.js mounts it under
// "/api/services", so the route below (GET "/") answers GET /api/services.

import express from "express";
import { ObjectId } from "mongodb";
import db from "../db/database.js";

const router = express.Router();

// Small helper: returns the "services" collection. Writing the collection
// name in one place avoids typos and repetition across the routes below.
function servicesCollection() {
  return db.getDatabase().collection("services");
}

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
    mileage: toNumberOrNull(body.mileage),
    cost: toNumberOrNull(body.cost),
    recommendedInterval: toNumberOrNull(body.recommendedInterval),
    shopName: body.shopName,
    shopRating: toNumberOrNull(body.shopRating),
    notes: body.notes,
  };
}

/*=============================================
=           General Route handlers           =
=============================================*/


// GET /api/services
// Return every service record in the "services" collection as a JSON array.
// (No filters yet — that comes in a later step.)
router.get("/", async (req, res) => {
  try {
    const services = await servicesCollection().find().toArray();
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
    // result is a status summary
    const result = await servicesCollection().insertOne(newService);
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
    const service = await servicesCollection().findOne({ _id: req.objectId });
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

    // $set replaces the listed fields on the matching document.
    const result = await servicesCollection().updateOne(
      { _id: req.objectId },
      { $set: updatedFields },
    );

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
    const result = await servicesCollection().deleteOne({ _id: req.objectId });

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
