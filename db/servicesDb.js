// db/servicesDb.js
// The ONLY place that talks to MongoDB for the Services feature. The routes
// never touch the database; they call the methods below (getServices,
// createService, ...) and just shape the HTTP response. (Vehicles have their
// own db/vehiclesDb.js — Nipun's feature.)
//
// It's built as a "factory": createDatabase() builds an object with the
// methods, then we export ONE shared instance.
//
// Connection style: each method opens its OWN connection with getClient()
// and closes it in a `finally` block when it's done. This keeps every
// method self-contained and easy to read for a beginner project. (A bigger
// app would open one connection at startup and reuse it; we trade a little
// efficiency for simplicity here.)

import { MongoClient } from "mongodb";

// The database name inside the MongoDB server. This isn't a secret,
// so it's fine to keep here as a default (both teammates use "garage").
const DEFAULT_DB_NAME = "garage";

/**
 * Would recommend refactoring database connection into a singleton pattern that the modules collections can use.
 * Would help improve scalability and improve backend as every CRUD operation would be handled
 * through one MongoDB client instance per client, instead of multiple instances for every client.
 */

function createServicesDb() {
  // Open a fresh connection and hand back the client (so we can close it),
  // the "services" collection, and the raw db handle (so a method can reach
  // another collection when it genuinely needs to — see getDueSoon).
  // The connection string lives in .env (never in the code); server.js
  // loads .env via `node --env-file=.env`.
  async function getClient() {
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
    const client = await MongoClient.connect(uri);
    const database = client.db(DEFAULT_DB_NAME);
    const services = database.collection("services");
    return { client, database, services };
  }

  // The object we build up and return. Methods get attached below.
  const me = {};

  // Return service records matching `filter` (an empty {} matches everything).
  // The route builds the filter from the query string and passes it in.
  me.getServices = async function (filter = {}) {
    const { client, services } = await getClient();
    try {
      return await services.find(filter).toArray();
    } finally {
      await client.close();
    }
  };

  // Return a single service by its _id, or null if not found.
  // The route validates/converts the id first, so `objectId` is a real ObjectId.
  me.getServiceById = async function (objectId) {
    const { client, services } = await getClient();
    try {
      return await services.findOne({ _id: objectId });
    } finally {
      await client.close();
    }
  };

  // Insert a new service document. Returns the result so the route can read
  // the auto-generated insertedId. MongoDB adds the unique _id automatically.
  me.createService = async function (doc) {
    const { client, services } = await getClient();
    try {
      return await services.insertOne(doc);
    } finally {
      await client.close();
    }
  };

  // Replace the listed fields on the service with this _id. Returns the result
  // so the route can check matchedCount (0 = no document had that id).
  me.updateService = async function (objectId, fields) {
    const { client, services } = await getClient();
    try {
      return await services.updateOne({ _id: objectId }, { $set: fields });
    } finally {
      await client.close();
    }
  };

  // Delete the service with this _id. Returns the result so the route can
  // check deletedCount (0 = no document had that id).
  me.deleteService = async function (objectId) {
    const { client, services } = await getClient();
    try {
      return await services.deleteOne({ _id: objectId });
    } finally {
      await client.close();
    }
  };

  // Delete ALL services belonging to a vehicle. Called by the vehicles route
  // when a vehicle is deleted, so orphaned service records don't linger in the
  // summaries. Returns the result (deletedCount = how many were removed).
  me.deleteServicesByVehicle = async function (vehicleObjectId) {
    const { client, services } = await getClient();
    try {
      return await services.deleteMany({ vehicleId: vehicleObjectId });
    } finally {
      await client.close();
    }
  };

  // Summary: total spend + number of services for EACH vehicle.
  // Unlike find() (which returns whole rows as-is), aggregate() runs the docs
  // through a pipeline of stages that can GROUP rows and do MATH across them,
  // producing brand-new summary rows that don't exist in the collection.
  me.getSummaryByVehicle = async function () {
    const { client, services } = await getClient();
    try {
      const pipeline = [
        // $group: make one bucket per vehicleId, then for each bucket compute:
        //   - totalSpent: add up every service's cost   ($sum of the cost field)
        //   - serviceCount: add 1 per service           ($sum: 1 = count the rows)
        // Note: _id here is the GROUP KEY (the vehicleId), not a document id.
        {
          $group: {
            _id: "$vehicleId",
            totalSpent: { $sum: "$cost" },
            serviceCount: { $sum: 1 },
          },
        },
        // $sort: biggest spender first (-1 = descending).
        { $sort: { totalSpent: -1 } },
      ];
      return await services.aggregate(pipeline).toArray();
    } finally {
      await client.close();
    }
  };

  // Summary: total spend + number of services for EACH month.
  // Same idea as getSummaryByVehicle, but the group key is the MONTH instead
  // of the vehicle. Our `date` is a string like "2023-09-11"; we want to group
  // by "2023-09", so we take the first 7 characters with $substrBytes:
  //   $substrBytes: ["$date", 0, 7]  ->  ("$date", start at 0, take 7 chars)
  me.getMonthlySummary = async function () {
    const { client, services } = await getClient();
    try {
      const pipeline = [
        // $group: bucket by month (first 7 chars of the date string), then for
        // each month sum the cost and count the services. Same $sum tricks.
        {
          $group: {
            _id: { $substrBytes: ["$date", 0, 7] },
            totalSpent: { $sum: "$cost" },
            serviceCount: { $sum: 1 },
          },
        },
        // $sort by the month key, oldest first (1 = ascending). Because the
        // month is "YYYY-MM" text, alphabetical order IS chronological order.
        { $sort: { _id: 1 } },
      ];
      return await services.aggregate(pipeline).toArray();
    } finally {
      await client.close();
    }
  };

  // Due-soon: for each vehicle, predict its NEXT service by mileage.
  // This needs data from BOTH collections. We keep it simple and beginner-
  // friendly: fetch all vehicles and all services with two plain find() calls,
  // then combine them in ordinary JavaScript (no aggregation pipeline).
  // Vehicles with no service history are omitted (we can't predict for them).
  // Output (one row per vehicle, most urgent first):
  //   { vehicleId, nickname, currentMileage, lastServiceMileage,
  //     recommendedInterval, dueAtMileage, milesLeft }
  // where dueAtMileage = lastServiceMileage + recommendedInterval, and
  //       milesLeft     = dueAtMileage - currentMileage  (negative = overdue).
  // We return the raw numbers; the frontend decides what counts as "overdue"
  // vs "due soon" and how to display it (that's a presentation choice).
  me.getDueSoon = async function () {
    const { client, database, services } = await getClient();
    try {
      // due-soon spans BOTH collections, so we reach the vehicles collection
      // inline here (the only services method that needs it).
      const vehicles = database.collection("vehicles");

      // Two simple reads.
      const allVehicles = await vehicles.find({}).toArray();
      const allServices = await services.find({}).toArray();

      const rows = [];
      for (const vehicle of allVehicles) {
        // This vehicle's services. vehicleId and _id are both ObjectId, so
        // compare them as strings to be safe.
        const vehicleServices = allServices.filter(
          (s) => s.vehicleId.toString() === vehicle._id.toString(),
        );

        // No history -> can't predict -> skip this vehicle.
        if (vehicleServices.length === 0) {
          continue;
        }

        // "Latest" = the service with the highest mileage. Sort a copy desc
        // and take the first.
        const latest = [...vehicleServices].sort(
          (a, b) => b.mileageAtService - a.mileageAtService,
        )[0];

        // compute the due mileage and remaining miles
        const dueAtMileage =
          latest.mileageAtService + latest.recommendedInterval;
        const milesLeft = dueAtMileage - vehicle.currentMileage;

        // Add the computed values to the row
        rows.push({
          vehicleId: vehicle._id,
          nickname: vehicle.nickname,
          currentMileage: vehicle.currentMileage,
          lastServiceMileage: latest.mileageAtService,
          recommendedInterval: latest.recommendedInterval,
          dueAtMileage,
          milesLeft,
        });
      }

      // Most urgent first (smallest/most-negative milesLeft at the top).
      rows.sort((a, b) => a.milesLeft - b.milesLeft);
      return rows;
    } finally {
      await client.close();
    }
  };

  return me;
}

// Export ONE shared instance so the whole app uses the same db object.
export default createServicesDb();
