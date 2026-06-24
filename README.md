# Garage Tracker

A full-stack web application for tracking vehicle maintenance, built with Node.js, Express, MongoDB (native driver), and vanilla JavaScript (ES6) with a Bootstrap-styled, client-side-rendered frontend.

**Live Demo:** [https://garage-tracker.onrender.com/](https://garage-tracker.onrender.com/)

**Demo Video:** TBD

---

## About

Garage Tracker is built for CS5610 Web Development at Northeastern University. It's for anyone who owns one or more vehicles and wants their maintenance history in one place instead of a glovebox full of receipts. Users add the vehicles they own and log each service performed on them; the app then shows useful summaries — total maintenance spend per vehicle, monthly spending, and which services are coming due based on mileage. It uses two linked MongoDB collections (Vehicles and Services), each with full CRUD, exposed through a REST API and rendered entirely in the browser.

---

## Pages

- **Home** (`index.html`): Landing page with an overview of the app and links to both feature pages.
- **Vehicles ("Your Garage")** (`vehicles.html`): Add, browse, search, and filter vehicles by status, make, and year; open a detail view with all of a car's info, a quick mileage-update control, and edit/delete.
- **Services (Maintenance History & Costs)** (`services.html`): Log services with a shop rating, filter history by vehicle/type/cost range/date range, edit/delete records, and view computed summary reports.

---

## Key Features

**Vehicles**
- Full CRUD — add, view, edit, and delete vehicles
- Filter by status, make, year, or free-text search (nickname/make/model)
- Detail panel with quick odometer update (PATCH endpoint — no full edit required)
- Cascade delete — removing a vehicle also removes all its service records

**Services**
- Full CRUD — log, edit, and delete maintenance records linked to a vehicle
- Filters: vehicle, service type, cost range, date range (combinable)
- Sortable table columns (vehicle, date, type, mileage, cost, shop, rating)
- "Other" service type requires a notes entry
- Green success highlight on form fields after a successful save

**Summary Reports**
- Spend by Vehicle — total cost and service count per vehicle, sortable
- Spend by Month — monthly totals with a year dropdown
- Due Soon — predicted next service by mileage; color-coded overdue / due-soon / ok; filterable by status and sortable by miles left

---

## Tech Stack

- **Node.js + Express** — REST API and static file server (ES modules)
- **MongoDB (native Node.js driver)** — two collections (`vehicles`, `services`), no Mongoose
- **Vanilla JavaScript (ES6)** — client-side rendering with the Fetch API
- **HTML5 + CSS3 + Bootstrap 5** — semantic markup, per-page stylesheets
- **ESLint + Prettier** — code quality and formatting

---

## Install & Run

This app runs locally against a MongoDB instance. We use MongoDB in Docker.

1. **Clone and install**
   ```bash
   git clone https://github.com/kmpat339/garage-tracker.git
   cd garage-tracker
   npm install
   ```

2. **Start MongoDB** (Docker, exposing the default port):
   ```bash
   docker run -d --name garage-mongo -p 27017:27017 mongo
   ```

3. **Set the connection string.** Create a `.env` file in the project root:
   ```
   MONGODB_URI=mongodb://localhost:27017
   ```

4. **Seed the database** with sample vehicles and services:
   ```bash
   node --env-file=.env data/loadVehicles.js
   node --env-file=.env data/loadServices.js
   ```

5. **Start the server:**
   ```bash
   npm run dev      # watches for file changes (recommended during development)
   # or
   npm start        # one-shot start (requires .env file in project root)
   ```

6. Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## Screenshots

### Home

![Home page]

*INSERT IMAGE*

### Vehicles ("Your Garage")

![Vehicles page]

*INSERT IMAGE*

### Services (Maintenance History & Costs)

![Services page]

*INSERT IMAGE*

---

## Project Structure

```
garage-tracker/
├── server.js                 # Express entry point; serves frontend + mounts routes
├── db/
│   ├── vehiclesDb.js         # All MongoDB access for the Vehicles collection
│   └── servicesDb.js         # All MongoDB access for the Services collection
├── routes/
│   ├── vehicles.js           # /api/vehicles routes (CRUD + filtering + mileage patch)
│   └── services.js           # /api/services routes (CRUD + filters + summaries)
├── frontend/
│   ├── index.html            # Homepage
│   ├── vehicles.html         # Vehicles page
│   ├── services.html         # Services page
│   ├── css/
│   │   ├── vehicles.css
│   │   └── services.css
│   └── js/
│       ├── vehicles.js
│       └── services.js
├── data/
│   ├── vehicles-mockaroo.json
│   ├── services-mockaroo.json
│   ├── loadVehicles.js       # Seed script for vehicles
│   └── loadServices.js       # Seed script for services (links to vehicle _ids)
├── README.md
├── LICENSE                   # MIT
├── package.json
└── eslint.config.js
```

---

## API

All endpoints return JSON.

### Vehicles — `/api/vehicles`

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/vehicles` | List all vehicles (optional filters). |
| `POST` | `/api/vehicles` | Create a vehicle. |
| `GET` | `/api/vehicles/:id` | Get one vehicle by id. |
| `PUT` | `/api/vehicles/:id` | Update a vehicle by id. |
| `PATCH` | `/api/vehicles/:id/mileage` | Update only the current mileage. |
| `DELETE` | `/api/vehicles/:id` | Delete a vehicle (and all its services) by id. |

**Filters** (query params on `GET /api/vehicles`, combinable)

- `?status=<status>` — Active / In Repair / Garaged / Sold
- `?make=<make>` — only that make
- `?year=<year>` — only that year
- `?q=<text>` — search nickname, make, and model (case-insensitive)

### Services — `/api/services`

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/services` | List all service records (optional filters). |
| `POST` | `/api/services` | Create a service record. |
| `GET` | `/api/services/:id` | Get one record by id. |
| `PUT` | `/api/services/:id` | Replace a record by id. |
| `DELETE` | `/api/services/:id` | Delete a record by id. |

**Filters** (query params on `GET /api/services`, combinable)

- `?vehicleId=<id>` — only that vehicle's services
- `?serviceType=<type>` — only that service type
- `?costMin=<n>&costMax=<n>` — cost range (either end optional)
- `?from=YYYY-MM-DD&to=YYYY-MM-DD` — date range (either end optional)

**Summary Reports**

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/services/summary/by-vehicle` | Total spend and service count per vehicle. |
| `GET` | `/api/services/summary/monthly` | Total spend and service count per month. |
| `GET` | `/api/services/summary/due-soon` | Each vehicle's predicted next service by mileage (`milesLeft`, negative = overdue), most urgent first. |

---

## Authors

**Nipun Jayakumar** — Garage Management feature (Vehicles)
[GitHub](https://github.com/nipunjay10)

**Khush Patel** — Maintenance History & Costs feature (Services)
[GitHub](https://github.com/kmpat339)

---

## Academic Reference

**Course:** CS5610 Web Development
**Institution:** Northeastern University
**Term:** Summer 2026
**Instructor:** TBD

---

## Project Submission

This repository is a course project submission for CS5610 Web Development at Northeastern University. It demonstrates a full-stack CRUD application using Node.js, Express, and MongoDB with a client-side-rendered vanilla JavaScript frontend.

---

## Use of GenAI Tools

This section discloses where generative AI was used in this project.

1. **Seed data generation.** Sample data for both collections was generated with [Mockaroo](https://www.mockaroo.com/). Claude was used to help write the `data/loadServices.js` and `data/loadVehicles.js` scripts that load the JSON files into MongoDB.

2. **Vehicles feature — scaffolding and debugging.** Claude was used as a coding aid to scaffold the Vehicles files to match the existing Services pattern (`db/vehiclesDb.js`, `routes/vehicles.js`, `frontend/vehicles.*`) and to help debug along the way. All decisions, validation rules, API design, and final code were reviewed and understood by the team.

3. **Build guidance.** Claude was used throughout the project to talk through Express/MongoDB concepts and review approach. All implementation choices were made and verified by the team.

---

## Contributing

This is a course project submission. External contributions are not accepted.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
