// routes/vehicles.js
// URLs for vehicles. This is an Express Router mounted at "/api/vehicles" in
// server.js. Like the services router, handlers do HTTP work only and call a
// db method; all MongoDB work lives in db/vehiclesDb.js.
//
// Minimal for now: just listing vehicles (the Services page needs it for
// nicknames + dropdowns). This is Nipun's feature area — more routes later.

import express from "express";
import { ObjectId } from "mongodb";
import db from "../db/vehiclesDb.js";
import servicesDb from "../db/servicesDb.js";

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
 
// The allowed status values, straight from the seed data. Used by
// validateVehicle so a typo or a made-up status can't get stored.
const VEHICLE_STATUSES = ["Active", "In Repair", "Garaged", "Sold"];
 
// Build a clean vehicle document from a request body. Used by BOTH POST and
// PUT so the field shape lives in one place. This step only SHAPES the data
// (string -> number, empty -> null, round money, default the nickname);
// validateVehicle judges it afterward.
function buildVehicleFromBody(body) {
  const make = (body.make ?? "").trim();
  const model = (body.model ?? "").trim();
  const nickname = (body.nickname ?? "").trim();
  return {
    // A blank nickname defaults to "make model" so the list never shows a
    // nameless car; the field is optional on the form.
    nickname: nickname || `${make} ${model}`.trim(),
    make,
    model,
    year: num(body.year),
    currentMileage: num(body.currentMileage),
    purchasePrice: money(body.purchasePrice),
    status: body.status,
  };
}
 
// Validate a built vehicle document. Returns an error message string if it's
// invalid, or null if it's fine. Shared by POST and PUT so the rules live in
// one place. (`doc` is the object from buildVehicleFromBody.)
//
// Everything is required except nickname (defaulted above). Numbers were run
// through num()/money() in buildVehicleFromBody, so a missing/empty number
// arrives here as null (and a non-numeric value as NaN); both count as
// "not provided".
function validateVehicle(doc) {
  // --- required text fields ---
  if (!doc.make) {
    return "Make is required";
  }
  if (!doc.model) {
    return "Model is required";
  }
 
  // --- required numbers ---
  // year: required, a whole number in a sane range.
  if (doc.year === null || Number.isNaN(doc.year)) {
    return "Year is required";
  }
  if (!Number.isInteger(doc.year) || doc.year < 1900 || doc.year > 2100) {
    return "Year must be a whole number between 1900 and 2100";
  }
 
  // currentMileage: required, a whole number 0 or more (0 is a valid reading).
  if (doc.currentMileage === null || Number.isNaN(doc.currentMileage)) {
    return "Current mileage is required";
  }
  if (!Number.isInteger(doc.currentMileage) || doc.currentMileage < 0) {
    return "Current mileage must be a whole number, 0 or more";
  }
 
  // purchasePrice: required, 0 or more.
  if (doc.purchasePrice === null || Number.isNaN(doc.purchasePrice)) {
    return "Purchase price is required";
  }
  if (doc.purchasePrice < 0) {
    return "Purchase price cannot be negative";
  }
 
  // status: required, must be one of the allowed values.
  if (!VEHICLE_STATUSES.includes(doc.status)) {
    return `Status must be one of: ${VEHICLE_STATUSES.join(", ")}`;
  }
 
  return null;
}
 
// Build a MongoDB filter object from the query string. Starts empty (= match
// everything) and adds a condition only for each filter actually provided.
// This is request-parsing, so it lives in the route; db.getVehicles() just
// receives the finished filter.
function buildFilterFromQuery(query) {
  const filter = {};
 
  // Filter by status: /api/vehicles?status=Active
  if (query.status) {
    filter.status = query.status;
  }
 
  // Filter by make: /api/vehicles?make=Toyota
  if (query.make) {
    filter.make = query.make;
  }
 
  // Filter by year: /api/vehicles?year=2012
  // year is a number, so convert the query string with Number(). A non-numeric
  // value (Number(...) is NaN) is skipped rather than erroring.
  if (query.year) {
    const y = Number(query.year);
    if (!Number.isNaN(y)) {
      filter.year = y;
    }
  }
 
  // Free-text search: /api/vehicles?q=outback
  // Matches the text against nickname, make, OR model, case-insensitively.
  if (query.q) {
    const rx = new RegExp(query.q, "i");
    filter.$or = [{ nickname: rx }, { make: rx }, { model: rx }];
  }
 
  return filter;
}
 
/*=============================================
=           General GET/, POST/ Route handlers  =
=============================================*/
 
// GET /api/vehicles
// Return vehicles as a JSON array. Optional filters can be passed as
// query-string params (e.g. /api/vehicles?status=Active). With no filters,
// returns everything.
router.get("/", async (req, res) => {
  try {
    const filter = buildFilterFromQuery(req.query);
    const vehicles = await db.getVehicles(filter);
    console.log("GET /api/vehicles succeeded:", vehicles.length, "vehicles");
    res.json(vehicles);
  } catch (error) {
    // If something goes wrong (e.g. the database read fails), send back a
    // 500 ("server error") with a short message instead of crashing.
    console.error("GET /api/vehicles failed:", error.message);
    res.status(500).json({ error: "Failed to fetch vehicles" });
  }
});
 
// POST /api/vehicles
// Create a new vehicle. The data comes in the request body as JSON
// (express.json() in server.js already parsed it into req.body).
router.post("/", async (req, res) => {
  try {
    // Build the document from the request body (shared with PUT).
    const newVehicle = buildVehicleFromBody(req.body);
 
    // Validate the fields. Returns an error string, or null if ok.
    const error = validateVehicle(newVehicle);
    if (error) {
      return res.status(400).json({ error });
    }
 
    // Insert it. MongoDB adds a unique _id automatically.
    const result = await db.createVehicle(newVehicle);
    console.log("POST /api/vehicles succeeded:", result.insertedId);
 
    // Respond 201 ("created") with the new record, including its new _id.
    res.status(201).json({ _id: result.insertedId, ...newVehicle });
  } catch (error) {
    console.error("POST /api/vehicles failed:", error.message);
    res.status(500).json({ error: "Failed to create vehicle" });
  }
});
 
/*=============================================
=            GET/PUT/PATCH/DELETE Single Records          =
=============================================*/
 
// GET /api/vehicles/:id
// Return a single vehicle by its id.
// requireValidId runs first and puts the converted id on req.objectId.
router.get("/:id", requireValidId, async (req, res) => {
  try {
    const vehicle = await db.getVehicleById(req.objectId);
    console.log("GET /api/vehicles/:id:", vehicle ? "found" : "not found");
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }
 
    res.json(vehicle);
  } catch (error) {
    console.error("GET /api/vehicles/:id failed:", error.message);
    res.status(500).json({ error: "Failed to fetch vehicle" });
  }
});
 
// PUT /api/vehicles/:id
// Update an existing vehicle. Same fields as POST.
// requireValidId runs first and puts the converted id on req.objectId.
router.put("/:id", requireValidId, async (req, res) => {
  try {
    // Build the document from the request body (shared with POST).
    const updatedFields = buildVehicleFromBody(req.body);
 
    // PUT is a full replace, so the same validation as POST applies.
    const error = validateVehicle(updatedFields);
    if (error) {
      return res.status(400).json({ error });
    }
 
    const result = await db.updateVehicle(req.objectId, updatedFields);
    console.log("PUT /api/vehicles/:id matched:", result.matchedCount);
 
    // matchedCount is 0 when no document had that id.
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Vehicle not found" });
    }
 
    res.json({ _id: req.params.id, ...updatedFields });
  } catch (error) {
    console.error("PUT /api/vehicles/:id failed:", error.message);
    res.status(500).json({ error: "Failed to update vehicle" });
  }
});
 
// PATCH /api/vehicles/:id/mileage
// Quick odometer update: change ONLY currentMileage, without sending the whole
// vehicle. Backs the mileage control on the detail view. No services-side twin.
// requireValidId runs first and puts the converted id on req.objectId.
router.patch("/:id/mileage", requireValidId, async (req, res) => {
  try {
    const mileage = num(req.body.currentMileage);
    if (
      mileage === null ||
      Number.isNaN(mileage) ||
      !Number.isInteger(mileage) ||
      mileage < 0
    ) {
      return res
        .status(400)
        .json({ error: "Current mileage must be a whole number, 0 or more" });
    }
 
    const result = await db.updateVehicleMileage(req.objectId, mileage);
    console.log("PATCH /api/vehicles/:id/mileage matched:", result.matchedCount);
 
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Vehicle not found" });
    }
 
    res.json({ _id: req.params.id, currentMileage: mileage });
  } catch (error) {
    console.error("PATCH /api/vehicles/:id/mileage failed:", error.message);
    res.status(500).json({ error: "Failed to update mileage" });
  }
});
 
// DELETE /api/vehicles/:id
// Delete a vehicle by its id.
// requireValidId runs first and puts the converted id on req.objectId.
router.delete("/:id", requireValidId, async (req, res) => {
  try {
    const result = await db.deleteVehicle(req.objectId);
    console.log("DELETE /api/vehicles/:id deleted:", result.deletedCount);

    // deletedCount is 0 when no document had that id.
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    // Remove all service records for this vehicle so they don't linger as
    // orphans in the summaries (spend-by-vehicle, due-soon, etc.).
    const servicesResult = await servicesDb.deleteServicesByVehicle(req.objectId);
    console.log("DELETE /api/vehicles/:id cascade-deleted", servicesResult.deletedCount, "services");

    res.json({ message: "Vehicle deleted" });
  } catch (error) {
    console.error("DELETE /api/vehicles/:id failed:", error.message);
    res.status(500).json({ error: "Failed to delete vehicle" });
  }
});
 
export default router;
 