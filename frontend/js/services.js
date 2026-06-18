// frontend/js/services.js
// Page logic for the Services page. For now (step 1) it just loads the service
// records and shows them in the table, turning each service's vehicleId into a
// friendly nickname using the vehicles list.
//
// Structured like the professor's demo: one MyFrontEnd() wrapper with nested
// fetchX()/displayX() helpers, called once at the bottom.

async function MyFrontEnd() {
  // --- fetching -----------------------------------------------------------

  // GET the service records. Returns [] (and logs) if the request fails, so
  // the rest of the page still runs.
  async function fetchServices() {
    const res = await fetch("/api/services");
    if (!res.ok) {
      console.error("Error fetching services:", res.statusText);
      return [];
    }
    return await res.json();
  }

  // GET the vehicles (used to translate vehicleId -> nickname).
  async function fetchVehicles() {
    const res = await fetch("/api/vehicles");
    if (!res.ok) {
      console.error("Error fetching vehicles:", res.statusText);
      return [];
    }
    return await res.json();
  }

  // --- helpers ------------------------------------------------------------

  // Build a lookup: vehicle _id (string) -> nickname. Both the vehicle _id and
  // a service's vehicleId arrive from the API as hex strings, so they match.
  function buildVehicleNameMap(vehicles) {
    const map = new Map();
    for (let v of vehicles) {
      map.set(v._id, v.nickname);
    }
    return map;
  }

  // Add one <td> with the given text to a row.
  function addCell(row, text) {
    const td = document.createElement("td");
    td.textContent = text;
    row.appendChild(td);
  }

  // Fill the shared <datalist> with one suggestion per vehicle nickname. Both
  // vehicle inputs (filter + form) use this list to autocomplete. The user
  // types/picks a NICKNAME; later we map it back to the _id the API expects by
  // looking it up in the `vehicles` array (vehicles.find by nickname).
  function fillVehicleDatalist(vehicles) {
    const datalist = document.getElementById("vehicle-options");
    datalist.innerHTML = "";
    for (let v of vehicles) {
      const option = document.createElement("option");
      option.value = v.nickname;
      datalist.appendChild(option);
    }
  }

  // --- rendering ----------------------------------------------------------

  // Fill the service table. nameById maps vehicleId -> nickname.
  // We use ?? (not ||) for "missing" so a real 0 (e.g. mileage 0) still shows.
  function displayServices(services, nameById) {
    const tbody = document.getElementById("services-tbody");
    tbody.innerHTML = "";

    for (let s of services) {
      const row = document.createElement("tr");

      // Add the service data to the row.
      addCell(row, nameById.get(s.vehicleId) ?? "Unknown");
      addCell(row, s.date ?? "—");
      addCell(row, s.serviceType ?? "—");
      addCell(row, s.mileageAtService ?? "—");
      addCell(row, s.cost != null ? `$${s.cost.toFixed(2)}` : "—");
      addCell(row, s.shopName ?? "—");
      addCell(row, s.serviceRating ?? "—");

      // Actions: Edit + Delete buttons. Rendered now, wired up in a later step.
      const actions = document.createElement("td");
      const editBtn = document.createElement("button");

      // Configure the edit button.
      editBtn.type = "button";
      editBtn.className = "btn btn-sm btn-secondary";
      editBtn.textContent = "Edit";

      // Configure the delete button.
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-sm btn-danger";
      deleteBtn.textContent = "Delete";

      // Add the buttons to the actions cell.
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      row.appendChild(actions);

      // Add the row to the table.
      tbody.appendChild(row);
    }
  }

  // --- run ----------------------------------------------------------------


  // Re-fetch just the services and redraw the table. Call this again whenever
  // the data changes (after add/edit/delete later) to refresh the list.
  async function refreshServices() {
    const services = await fetchServices();
    console.log("Loaded", services.length, "services");
    displayServices(services, nameById);
  }

  // Initial load: get vehicles once, set up the datalist + name map, then
  // load the services.
  let vehicles = await fetchVehicles();
  let nameById = buildVehicleNameMap(vehicles);
  fillVehicleDatalist(vehicles);
  await refreshServices();
}

MyFrontEnd();
