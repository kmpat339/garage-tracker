# garage-tracker
Garage-tracker is a full-stack web application for tracking vehicle maintenance.

## API (Services)

All endpoints are mounted under `/api/services` and return JSON.

**Records**

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/services` | List all service records. |
| `POST` | `/api/services` | Create a service record. |
| `GET` | `/api/services/:id` | Get one record by id. |
| `PUT` | `/api/services/:id` | Replace a record by id. |
| `DELETE` | `/api/services/:id` | Delete a record by id. |

**Filters** (query params on `GET /api/services`, combinable)

- `?vehicleId=<id>` — only that vehicle's services
- `?serviceType=<type>` — only that service type
- `?from=YYYY-MM-DD&to=YYYY-MM-DD` — only services in that date range (either end optional)

**Reports** (computed views, grouped under `summary/`)

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/services/summary/by-vehicle` | Total spend and service count per vehicle. |
| `GET` | `/api/services/summary/monthly` | Total spend and service count per month. |
| `GET` | `/api/services/summary/due-soon` | Each vehicle's predicted next service by mileage (`milesLeft`, negative = overdue), most urgent first. |

## Use of AI (Data Generation)

The seed data for the two collections was created in two steps:

**1. Mockaroo.** I used [Mockaroo](https://www.mockaroo.com/) to generate the raw records as JSON:

- **Vehicles** (`data/vehicles-mockaroo.json`, 300 rows): `make` (Car Make), `model` (Car Model),
  `year`, `currentMileage`, `purchasePrice`, and `status` (a custom list of
  Active / In Repair / Garaged / Sold). No `id` field was added, so MongoDB generates each `_id`.
- **Services** (`data/services-mockaroo.json`, 700 rows): `date` (formatted `YYYY-MM-DD`),
  `serviceType` (custom list), `mileageAtService`, `cost` (2 decimals), `recommendedInterval`,
  `shopName`, `serviceRating` (1–5), and `notes`. The services were generated **without** a
  `vehicleId`, since the link is added in the next step.

**2. Claude.** I then used Claude (Anthropic) to write a Node script (`data/loadServices.js`) that
prepares a test database from those two files. I directed it to:

- Insert the 300 vehicles, then read back their MongoDB `_id`s.
- Give each vehicle a **random 0–5 services**, so some vehicles have no service history.
- Link each service to a vehicle by storing that vehicle's `_id` as the service's `vehicleId`
  (the foreign key). `vehicleId` is stored as a native MongoDB `ObjectId` (the same type as
  `vehicles._id`), so the two collections join directly without any type conversion.
- Clamp each service's `mileageAtService` so it never exceeds the vehicle's `currentMileage`.
- Stop once 700 services are assigned, giving exactly 1000 total documents across both collections.
- Add a unique nickname to each vehicle.

### Representative prompt

```
I have two mockaroo json files, one for vehicles and one for services. write me a node script
that loads them into mongo. insert the vehicles first so they each get an _id, then give each
vehicle a random 0 to 5 services and link them by putting the vehicle's _id as the service's
vehicleId. also make sure a service's mileageAtService isn't higher than the vehicle's
currentMileage. keep going till 700 services are added so both collections add up to 1000 total,
and print how many services each car got.
```

This script is a development convenience for populating a test database; in normal use the database
is filled through the application's frontend.
