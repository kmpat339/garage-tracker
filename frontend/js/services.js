// frontend/js/services.js
// Page logic for the Services page. For now (step 1) it just loads the service
// records and shows them in the table, turning each service's vehicleId into a
// friendly nickname using the vehicles list.
//
// Structured like the professor's demo: one MyFrontEnd() wrapper with nested
// fetchX()/displayX() helpers, called once at the bottom.

async function MyFrontEnd() {
  // --- fetching -----------------------------------------------------------

  // GET the service records. `query` is an optional query string (e.g.
  // "?serviceType=brakes") built from the filters. Returns [] (and logs) if the
  // request fails, so the rest of the page still runs.
  async function fetchServices(query = "") {
    const res = await fetch("/api/services" + query);
    if (!res.ok) {
      console.error("Error fetching services:", res.statusText);
      return [];
    }
    const services = await res.json();
    console.log("Fetched services:", services);
    return services;
  }

  // GET the vehicles (used to translate vehicleId -> nickname).
  async function fetchVehicles() {
    const res = await fetch("/api/vehicles");
    if (!res.ok) {
      console.error("Error fetching vehicles:", res.statusText);
      return [];
    }
    const vehicles = await res.json();
    console.log("Fetched vehicles:", vehicles);
    return vehicles;
  }

  // --- helpers ------------------------------------------------------------

  // Build a lookup: vehicle _id (string) -> nickname. Both the vehicle _id and
  // a service's vehicleId arrive from the API as hex strings, so they match.
  function buildVehicleNameMap(vehicles) {
    const map = new Map();
    for (let v of vehicles) {
      map.set(v._id, v.nickname);
    }
    console.log("Built vehicle name map with", map.size, "entries");
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
    console.log("Filled vehicle datalist with", vehicles.length, "options");
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
    console.log("Displayed services with", services.length, "entries");
  }

  // --- the add/edit form --------------------------------------------------

  // Read the form fields into an object shaped like the API expects. The vehicle
  // input holds a typed NICKNAME, so we look up its _id (the real foreign key)
  // the same way the filter does. Numbers are sent as their raw string values;
  // the backend turns "" into null and coerces the rest, so we don't here.
  function readServiceForm() {
    const typedNickname = document.getElementById("form-vehicle").value.trim();
    const match = vehicles.find((v) => v.nickname === typedNickname);

    return {
      // match?._id is undefined if the nickname didn't match; the backend
      // rejects a missing/invalid vehicleId with a 400. (Step C adds a friendly
      // front-end check before we ever get here.)
      vehicleId: match?._id,
      date: document.getElementById("form-date").value,
      serviceType: document.getElementById("form-type").value,
      mileageAtService: document.getElementById("form-mileage").value,
      cost: document.getElementById("form-cost").value,
      recommendedInterval: document.getElementById("form-interval").value,
      serviceRating: document.getElementById("form-rating").value,
      shopName: document.getElementById("form-shop").value,
      notes: document.getElementById("form-notes").value,
    };
  }

  // Show a message in the form's shared error line, and (if given) put a red
  // border on the field that caused it so the user can see which one.
  function showFormError(message, fieldId) {
    document.getElementById("form-error").textContent = message;
    if (fieldId) {
      document.getElementById(fieldId).classList.add("field-error");
    }
  }

  // Clear the error line and remove the red border from every form field.
  // Called at the start of each save attempt so old errors don't linger.
  function clearFormErrors() {
    document.getElementById("form-error").textContent = "";
    const fields = document.querySelectorAll("#service-form .field-error");
    for (let field of fields) {
      field.classList.remove("field-error");
    }
  }

  // Light front-end gate: a quick check so we DON'T send obviously-bad data to
  // the API. It only checks "is it filled in / does the vehicle exist" — the
  // backend still owns the detailed rules (whole numbers, ranges, etc.) and its
  // message is shown if the request gets that far. Returns true if OK to send.
  // `body` is the object from readServiceForm(). Stops at the first problem.
  function validateServiceForm(body) {
    // Vehicle: readServiceForm sets vehicleId to undefined when the typed
    // nickname didn't match any vehicle (including when it's left empty).
    if (!body.vehicleId) {
      showFormError("Please pick a vehicle from the list.", "form-vehicle");
      return false;
    }
    if (!body.date) {
      showFormError("Please enter a date.", "form-date");
      return false;
    }
    if (!body.serviceType) {
      showFormError("Please choose a service type.", "form-type");
      return false;
    }
    if (body.mileageAtService === "") {
      showFormError("Please enter the mileage.", "form-mileage");
      return false;
    }
    if (body.cost === "") {
      showFormError("Please enter the cost.", "form-cost");
      return false;
    }
    if (body.recommendedInterval === "") {
      showFormError("Please enter the recommended interval.", "form-interval");
      return false;
    }
    if (body.serviceRating === "") {
      showFormError("Please enter a rating (1-5).", "form-rating");
      return false;
    }
    if (!body.shopName.trim()) {
      showFormError("Please enter the shop name.", "form-shop");
      return false;
    }
    // "other" service type: notes explain what it was, so require them.
    if (body.serviceType === "other" && !body.notes.trim()) {
      showFormError(
        'For "other" service type, please describe it in notes.',
        "form-notes",
      );
      return false;
    }
    return true;
  }

  // Clear the form and put it back to Add mode. Called after a successful save.
  function resetForm() {
    document.getElementById("service-form").reset();
    clearFormErrors();
    editingId = null;
  }

  // Send the form data to the API. For now this is always a POST (create).
  // Step D makes it switch to PUT when editingId is set. On success we clear the
  // form and refresh the list so the new row shows up.
  async function saveService(body) {
    const res = await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // The backend sends a 400 with { error: "..." } for invalid data. Show
      // that message in the form's error line (this is our detailed-rules
      // layer: the front-end gate only catches empty/missing fields).
      const data = await res.json();
      showFormError(data.error ?? "Could not save the service.");
      console.error("Error saving service:", data.error ?? res.statusText);
      return;
    }

    console.log("Saved service");
    resetForm();
    await refreshServices();
  }

  // --- filters ------------------------------------------------------------

  // Read the filter fields and build a "?...=..." query string for the API.
  // Only fields with a value are included (empty = no filter on that field).
  // Returns { query, error }: error is set when the typed vehicle nickname
  // doesn't match any vehicle (empty vehicle is fine = all vehicles).
  function buildServiceQuery() {
    const params = new URLSearchParams();

    // Vehicle: the input holds a typed NICKNAME; convert it to the _id the API
    // wants. Empty = all vehicles. A non-empty, unmatched nickname is an error.
    const typedNickname = document
      .getElementById("filter-vehicle")
      .value.trim();
    if (typedNickname) {
      const match = vehicles.find((v) => v.nickname === typedNickname);
      if (!match) {
        return { query: "", error: `No vehicle named "${typedNickname}".` };
      }
      params.set("vehicleId", match._id);
    }

    const type = document.getElementById("filter-type").value;
    if (type) params.set("serviceType", type);

    const from = document.getElementById("filter-from").value;
    if (from) params.set("from", from);

    const to = document.getElementById("filter-to").value;
    if (to) params.set("to", to);

    const qs = params.toString();
    return { query: qs ? "?" + qs : "", error: "" };
  }

  // --- run ----------------------------------------------------------------

  // Re-fetch the services using the current filters and redraw the table. Call
  // again whenever the data changes (after add/edit/delete later).
  async function refreshServices() {
    // Build the query string from the filter fields.
    // if invalid nickname is entered, the error will be caught and displayed.
    const { query, error } = buildServiceQuery();
    const errorBox = document.getElementById("filter-error");

    // Bad vehicle filter: show the message and don't fetch.
    if (error) {
      errorBox.textContent = error;
      return;
    }
    errorBox.textContent = "";

    // Fetch the services with the query string.
    const services = await fetchServices(query);
    console.log("Loaded", services.length, "services");
    displayServices(services, nameById);
  }

  // Wire up the page-level listeners once, on load. (The Edit/Delete buttons on
  // each table row are wired inside displayServices instead, because those rows
  // are created dynamically and each one needs its own service.)
  function setupEventListeners() {
    // Apply button: re-run the fetch with the current filters. preventDefault
    // stops the form from reloading the page.
    document
      .getElementById("filter-form")
      .addEventListener("submit", (event) => {
        event.preventDefault();
        refreshServices();
      });

    // Add/Edit form: read the fields, run the front-end gate, and save.
    // preventDefault stops the browser from reloading the page on submit.
    document
      .getElementById("service-form")
      .addEventListener("submit", (event) => {
        event.preventDefault();
        clearFormErrors();
        const body = readServiceForm();
        // Gate failed: a message + red border are already showing; don't send.
        if (!validateServiceForm(body)) {
          return;
        }
        saveService(body);
      });
  }

  /*    ======
        Main run function for the frontend application.
      ==========
  */
  // Initial load: wire the listeners first (the form elements already exist in
  // the HTML), then get vehicles once, set up the datalist + name map, and load
  // the services.
  setupEventListeners();
  let vehicles = await fetchVehicles();
  let nameById = buildVehicleNameMap(vehicles);
  // null = Add mode (Save creates). A service _id here = Edit mode (Save updates
  // that record); set by the row Edit button, cleared by resetForm. (Used in a
  // later step; declared here with the other page-level state.)
  let editingId = null;

  fillVehicleDatalist(vehicles);
  await refreshServices();
}

MyFrontEnd();
