// db/servicesDb.js — the only place that talks to MongoDB for the Services feature.
// Routes call these methods; they never touch a collection directly.

import { MongoClient } from "mongodb";

const DEFAULT_DB_NAME = "garage";

/**
 * Would recommend refactoring database connection into a singleton pattern that the modules collections can use.
 * Would help improve scalability and improve backend as every CRUD operation would be handled
 * through one MongoDB client instance per client, instead of multiple instances for every client.
 */

function createServicesDb() {
  // Each method opens and closes its own connection. A real app would share
  // one connection at startup; we trade a little efficiency for simplicity.
  async function getClient() {
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
    const client = await MongoClient.connect(uri);
    const database = client.db(DEFAULT_DB_NAME);
    const services = database.collection("services");
    return { client, database, services };
  }

  const me = {};

  // Return service records matching `filter` (empty {} matches everything).
  me.getServices = async function (filter = {}) {
    const { client, services } = await getClient();
    try {
      return await services.find(filter).toArray();
    } finally {
      await client.close();
    }
  };

  // Return a single service by its _id, or null if not found.
  me.getServiceById = async function (objectId) {
    const { client, services } = await getClient();
    try {
      return await services.findOne({ _id: objectId });
    } finally {
      await client.close();
    }
  };

  // Insert a new service; returns the result so the route can read insertedId.
  me.createService = async function (doc) {
    const { client, services } = await getClient();
    try {
      return await services.insertOne(doc);
    } finally {
      await client.close();
    }
  };

  // Replace the listed fields on the service with this _id; returns the result
  // so the route can check matchedCount.
  me.updateService = async function (objectId, fields) {
    const { client, services } = await getClient();
    try {
      return await services.updateOne({ _id: objectId }, { $set: fields });
    } finally {
      await client.close();
    }
  };

  // Delete the service with this _id; returns the result (deletedCount).
  me.deleteService = async function (objectId) {
    const { client, services } = await getClient();
    try {
      return await services.deleteOne({ _id: objectId });
    } finally {
      await client.close();
    }
  };

  // Called when a vehicle is deleted to remove its orphaned service records.
  me.deleteServicesByVehicle = async function (vehicleObjectId) {
    const { client, services } = await getClient();
    try {
      return await services.deleteMany({ vehicleId: vehicleObjectId });
    } finally {
      await client.close();
    }
  };

  // Summary: total spend + number of services for each vehicle.
  me.getSummaryByVehicle = async function () {
    const { client, services } = await getClient();
    try {
      const pipeline = [
        // $group: one bucket per vehicleId; $sum of cost = total spend, $sum: 1 = row count.
        {
          $group: {
            _id: "$vehicleId",
            totalSpent: { $sum: "$cost" },
            serviceCount: { $sum: 1 },
          },
        },
        { $sort: { totalSpent: -1 } },
      ];
      return await services.aggregate(pipeline).toArray();
    } finally {
      await client.close();
    }
  };

  // Summary: total spend + number of services for each month. Groups by the
  // first 7 chars of the date ("YYYY-MM") via $substrBytes (slice a string field).
  me.getMonthlySummary = async function () {
    const { client, services } = await getClient();
    try {
      const pipeline = [
        {
          $group: {
            _id: { $substrBytes: ["$date", 0, 7] },
            totalSpent: { $sum: "$cost" },
            serviceCount: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ];
      return await services.aggregate(pipeline).toArray();
    } finally {
      await client.close();
    }
  };

  // Due-soon: for each vehicle, predict its next service by mileage. Spans both
  // collections; uses plain JS instead of a pipeline for readability. Vehicles
  // with no service history are omitted. Output per vehicle: { vehicleId,
  // nickname, currentMileage, lastServiceMileage, recommendedInterval,
  // dueAtMileage, milesLeft }.
  me.getDueSoon = async function () {
    const { client, database, services } = await getClient();
    try {
      const vehicles = database.collection("vehicles");

      const allVehicles = await vehicles.find({}).toArray();
      const allServices = await services.find({}).toArray();

      const rows = [];
      for (const vehicle of allVehicles) {
        // Compare as strings to safely match ObjectId values across collections.
        const vehicleServices = allServices.filter(
          (s) => s.vehicleId.toString() === vehicle._id.toString(),
        );

        if (vehicleServices.length === 0) {
          continue;
        }

        // "Latest" = highest mileage reading.
        const latest = [...vehicleServices].sort(
          (a, b) => b.mileageAtService - a.mileageAtService,
        )[0];

        const dueAtMileage =
          latest.mileageAtService + latest.recommendedInterval;
        const milesLeft = dueAtMileage - vehicle.currentMileage;

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

      // Most urgent first (smallest / most-negative milesLeft at the top).
      rows.sort((a, b) => a.milesLeft - b.milesLeft);
      return rows;
    } finally {
      await client.close();
    }
  };

  return me;
}

export default createServicesDb();
/*
 * If you want to make this a valid singleton pattern,
 * would explicitly enforce that the object you are returning 
 * doesn't already exist and if it does, return that instance. 
*/
