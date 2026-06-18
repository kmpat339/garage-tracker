// db/database.js
// This module is the ONLY place that talks directly to MongoDB.
// The routes never touch the database; they call the methods below
// (getServices, createService, ...) and just shape the HTTP response.
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

function createDatabase() {
  // Open a fresh connection and hand back the client (so we can close it)
  // and the "services" collection (so the method can read/write it).
  // The connection string lives in .env (never in the code); server.js
  // loads .env via `node --env-file=.env`.
  async function getClient() {
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
    const client = await MongoClient.connect(uri);
    const services = client.db(DEFAULT_DB_NAME).collection("services");
    return { client, services };
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

  return me;
}

// Export ONE shared instance so the whole app uses the same db object.
export default createDatabase();
