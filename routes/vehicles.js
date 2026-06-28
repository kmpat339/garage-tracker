// routes/vehicles.js
// express router mounted at /api/vehicles in server.js. handlers do http only
// and call a db method — all the mongo work lives in db/vehiclesDb.js

import express from "express";
import { ObjectId } from "mongodb";
import db from "../db/vehiclesDb.js";
import servicesDb from "../db/servicesDb.js";

const router = express.Router();

// string id from the url -> ObjectId (what _id is stored as), or null if junk
function toObjectId(idString) {
  if (!ObjectId.isValid(idString)) {
    return null;
  }
  return new ObjectId(idString);
}

/*====== Helper Functions ==============*/

// runs before any :id route — converts the id once, 400s on a bad one,
// otherwise stashes it on req.objectId
/*
 * I like the use of this middleware function to initialze an ObjectId, 
 * but I believe this should be the responsibility of the module that interacts with the MongoClient.
 * If you keep it as middleware, it should be in its own separate file and imported into both services.js and vehicles.js
 * to maximize physical code reuse instead of redefining it in both files. Same goes with reused helper functions.
*/
function requireValidId(req, res, next) {
  const id = toObjectId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Invalid id" });
  }
  req.objectId = id;
  next();
}

// form value -> number; empty/missing becomes null, a real 0 stays 0
function num(value) {
  if (value === "" || value === undefined || value === null) {
    return null;
  }
  return Number(value);
}

// like num() but rounded to 2 decimals so we don't store fractions of a cent
function money(value) {
  const n = num(value);
  return n === null ? null : Math.round(n * 100) / 100;
}

// allowed statuses, straight from the seed data
const VEHICLE_STATUSES = ["Active", "In Repair", "Garaged", "Sold"];

// shape a request body into a vehicle doc (shared by POST and PUT). only shapes
// here — validateVehicle judges it after
function buildVehicleFromBody(body) {
  const make = (body.make ?? "").trim();
  const model = (body.model ?? "").trim();
  const nickname = (body.nickname ?? "").trim();
  return {
    // blank nickname falls back to "make model" so nothing shows up nameless
    nickname: nickname || `${make} ${model}`.trim(),
    make,
    model,
    year: num(body.year),
    currentMileage: num(body.currentMileage),
    purchasePrice: money(body.purchasePrice),
    status: body.status,
  };
}

// returns an error string if the doc is bad, or null if it's fine. shared by
// POST and PUT. numbers already went through num()/money(), so missing = null
// and bad = NaN
function validateVehicle(doc) {
  // text
  if (!doc.make) {
    return "Make is required";
  }
  if (!doc.model) {
    return "Model is required";
  }

  // numbers
  if (doc.year === null || Number.isNaN(doc.year)) {
    return "Year is required";
  }
  if (!Number.isInteger(doc.year) || doc.year < 1900 || doc.year > 2100) {
    return "Year must be a whole number between 1900 and 2100";
  }

  // 0 is a valid odometer reading
  if (doc.currentMileage === null || Number.isNaN(doc.currentMileage)) {
    return "Current mileage is required";
  }
  if (!Number.isInteger(doc.currentMileage) || doc.currentMileage < 0) {
    return "Current mileage must be a whole number, 0 or more";
  }

  if (doc.purchasePrice === null || Number.isNaN(doc.purchasePrice)) {
    return "Purchase price is required";
  }
  if (doc.purchasePrice < 0) {
    return "Purchase price cannot be negative";
  }

  if (!VEHICLE_STATUSES.includes(doc.status)) {
    return `Status must be one of: ${VEHICLE_STATUSES.join(", ")}`;
  }

  return null;
}

// build a mongo filter from the query string — only adds a condition for each
// filter actually passed
function buildFilterFromQuery(query) {
  const filter = {};

  if (query.status) {
    filter.status = query.status;
  }

  if (query.make) {
    filter.make = query.make;
  }

  // skip a non-numeric year rather than erroring
  if (query.year) {
    const y = Number(query.year);
    if (!Number.isNaN(y)) {
      filter.year = y;
    }
  }

  // free-text search across nickname/make/model, case-insensitive
  if (query.q) {
    const rx = new RegExp(query.q, "i");
    filter.$or = [{ nickname: rx }, { make: rx }, { model: rx }];
  }

  return filter;
}

/*=========  General GET/, POST/ Route handlers  =========================*/

// GET /api/vehicles — list, with optional ?status / ?make / ?year / ?q filters
router.get("/", async (req, res) => {
  try {
    const filter = buildFilterFromQuery(req.query);
    const vehicles = await db.getVehicles(filter);
    console.log("GET /api/vehicles succeeded:", vehicles.length, "vehicles");
    res.json(vehicles);
  } catch (error) {
    console.error("GET /api/vehicles failed:", error.message);
    res.status(500).json({ error: "Failed to fetch vehicles" });
  }
});

// POST /api/vehicles — create
router.post("/", async (req, res) => {
  try {
    const newVehicle = buildVehicleFromBody(req.body);

    const error = validateVehicle(newVehicle);
    if (error) {
      return res.status(400).json({ error });
    }

    const result = await db.createVehicle(newVehicle);
    console.log("POST /api/vehicles succeeded:", result.insertedId);

    res.status(201).json({ _id: result.insertedId, ...newVehicle });
  } catch (error) {
    console.error("POST /api/vehicles failed:", error.message);
    res.status(500).json({ error: "Failed to create vehicle" });
  }
});

/*============================     GET/PUT/PATCH/DELETE Single Records    ========================*/

// GET /api/vehicles/:id — one vehicle
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

// PUT /api/vehicles/:id — full edit (same fields + validation as POST)
router.put("/:id", requireValidId, async (req, res) => {
  try {
    const updatedFields = buildVehicleFromBody(req.body);

    const error = validateVehicle(updatedFields);
    if (error) {
      return res.status(400).json({ error });
    }

    const result = await db.updateVehicle(req.objectId, updatedFields);
    console.log("PUT /api/vehicles/:id matched:", result.matchedCount);

    // matchedCount 0 = no vehicle had that id
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    res.json({ _id: req.params.id, ...updatedFields });
  } catch (error) {
    console.error("PUT /api/vehicles/:id failed:", error.message);
    res.status(500).json({ error: "Failed to update vehicle" });
  }
});

// PATCH /api/vehicles/:id/mileage — update only the odometer, no services twin
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
    console.log(
      "PATCH /api/vehicles/:id/mileage matched:",
      result.matchedCount,
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    res.json({ _id: req.params.id, currentMileage: mileage });
  } catch (error) {
    console.error("PATCH /api/vehicles/:id/mileage failed:", error.message);
    res.status(500).json({ error: "Failed to update mileage" });
  }
});

// DELETE /api/vehicles/:id — delete the vehicle and its service records
router.delete("/:id", requireValidId, async (req, res) => {
  try {
    const result = await db.deleteVehicle(req.objectId);
    console.log("DELETE /api/vehicles/:id deleted:", result.deletedCount);

    // deletedCount 0 = no vehicle had that id
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    // also drop this vehicle's services so they don't linger as orphans in the
    // summaries (spend-by-vehicle, due-soon, etc.)
    const servicesResult = await servicesDb.deleteServicesByVehicle(
      req.objectId,
    );
    console.log(
      "DELETE /api/vehicles/:id cascade-deleted",
      servicesResult.deletedCount,
      "services",
    );

    res.json({ message: "Vehicle deleted" });
  } catch (error) {
    console.error("DELETE /api/vehicles/:id failed:", error.message);
    res.status(500).json({ error: "Failed to delete vehicle" });
  }
});

export default router;
