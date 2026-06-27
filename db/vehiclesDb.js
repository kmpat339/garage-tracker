// db/vehiclesDb.js - DATA LAYER
// The only place that talks to MongoDB for vehicles. Same factory + per-call
// connection style as servicesDb.js, but self-contained -> its own getClient
// Full CRUD: list (with optional filter), get one, create, update, a quick mileage-only update, and delete
// The routes call these and never touch a collection directly.

import { MongoClient } from "mongodb";

// Both teammates share the garage database.
const DEFAULT_DB_NAME = "garage";

/**
 * Would recommend refactoring database connection into a singleton pattern that the modules collections can use.
 * Would help improve scalability and improve backend as every CRUD operation would be handled
 * through one MongoDB client instance per client, instead of multiple instances for every client.
 */

function createVehiclesDb() {
  // Open a fresh connection; the caller closes the client when done.
  // Connection string comes from .env via --env-file.
  async function getClient() {
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
    const client = await MongoClient.connect(uri);
    const vehicles = client.db(DEFAULT_DB_NAME).collection("vehicles");
    return { client, vehicles };
  }

  const me = {};

  // Vehicles matching `filter`. Default {} matches everything, so a no-arg call
  // ex. the Services page filling its dropdowns) still returns all of them
  me.getVehicles = async function (filter = {}) {
    const { client, vehicles } = await getClient();
    try {
      return await vehicles.find(filter).sort({ make: 1, model: 1 }).toArray();
    } finally {
      await client.close();
    }
  };

  // One vehicle by _id, or null the route already converted the id to ObjectId
  me.getVehicleById = async function (objectId) {
    const { client, vehicles } = await getClient();
    try {
      return await vehicles.findOne({ _id: objectId });
    } finally {
      await client.close();
    }
  };

  // Insert a vehicle; returns the result -> route reads insertedId
  me.createVehicle = async function (doc) {
    const { client, vehicles } = await getClient();
    try {
      return await vehicles.insertOne(doc);
    } finally {
      await client.close();
    }
  };

  // Update fields on one vehicle; returns the result (route checks matchedCount
  me.updateVehicle = async function (objectId, fields) {
    const { client, vehicles } = await getClient();
    try {
      return await vehicles.updateOne({ _id: objectId }, { $set: fields });
    } finally {
      await client.close();
    }
  };

  // Set only currentMileage — backs the quick mileage control on the detail view.
  me.updateVehicleMileage = async function (objectId, mileage) {
    const { client, vehicles } = await getClient();
    try {
      return await vehicles.updateOne(
        { _id: objectId },
        { $set: { currentMileage: mileage } },
      );
    } finally {
      await client.close();
    }
  };

  // Delete one vehicle; returns the result (route checks deletedCount)
  me.deleteVehicle = async function (objectId) {
    const { client, vehicles } = await getClient();
    try {
      return await vehicles.deleteOne({ _id: objectId });
    } finally {
      await client.close();
    }
  };

  return me;
}

// one shared instance, same as the services db
export default createVehiclesDb();
