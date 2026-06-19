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

  // GET one of the three summary reports. `path` is the part after
  // /api/services/summary/ (e.g. "by-vehicle"). They all return a JSON array,
  // so one helper covers all three. Returns [] (and logs) on failure, so a
  // broken endpoint just yields an empty table instead of throwing.
  async function fetchSummary(path) {
    const res = await fetch("/api/services/summary/" + path);
    if (!res.ok) {
      console.error("Error fetching summary " + path + ":", res.statusText);
      return [];
    }
    const rows = await res.json();
    console.log("Fetched summary " + path + ":", rows.length, "rows");
    return rows;
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

      // Configure the edit button. Clicking it fills the form from THIS row's
      // service (s is captured by the closure) and switches to Edit mode.
      editBtn.type = "button";
      editBtn.className = "btn btn-sm btn-secondary";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => fillFormForEdit(s));

      // Configure the delete button. Clicking it confirms, then deletes THIS
      // row's service and refreshes the list.
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-sm btn-danger";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => removeService(s));

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

  // Switch the form into Edit mode for one service: change the heading + button
  // wording, show the Cancel button, and add the amber accent to the box so it's
  // clear you're editing (not adding). The actual editingId/field-filling is
  // done by fillFormForEdit; this is just the visual mode switch.
  function enterEditMode() {
    document.getElementById("form-heading").textContent = "Edit Service";
    document.getElementById("form-submit").textContent = "Update";
    document.getElementById("form-cancel").classList.remove("d-none");
    document.getElementById("service-form-section").classList.add("editing");
  }

  // Put the form back to Add mode (the opposite of enterEditMode). Called by
  // resetForm, so anything that resets the form returns to Add.
  function exitEditMode() {
    document.getElementById("form-heading").textContent = "Add a Service";
    document.getElementById("form-submit").textContent = "Save";
    document.getElementById("form-cancel").classList.add("d-none");
    document.getElementById("service-form-section").classList.remove("editing");
  }

  // Fill the form from an already-loaded service and switch to Edit mode. We use
  // the service object the row already has (passed in from displayServices), so
  // there's no need to re-fetch it. The vehicle field shows the nickname (the
  // form works in nicknames); readServiceForm maps it back to the _id on save.
  function fillFormForEdit(s) {
    editingId = s._id;

    document.getElementById("form-vehicle").value =
      nameById.get(s.vehicleId) ?? "";
    document.getElementById("form-date").value = s.date ?? "";
    document.getElementById("form-type").value = s.serviceType ?? "";
    document.getElementById("form-mileage").value = s.mileageAtService ?? "";
    document.getElementById("form-cost").value = s.cost ?? "";
    document.getElementById("form-interval").value =
      s.recommendedInterval ?? "";
    document.getElementById("form-rating").value = s.serviceRating ?? "";
    document.getElementById("form-shop").value = s.shopName ?? "";
    document.getElementById("form-notes").value = s.notes ?? "";

    clearFormErrors();
    enterEditMode();
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

  // Clear the form and put it back to Add mode. Called after a successful save
  // and by the Cancel button. exitEditMode undoes the Edit-mode visuals.
  function resetForm() {
    document.getElementById("service-form").reset();
    clearFormErrors();
    exitEditMode();
    editingId = null;
  }

  // Send the form data to the API. editingId decides which: null = Add (POST to
  // create), an _id = Edit (PUT to /:id to update that record). On success we
  // clear the form and refresh the list so the change shows up.
  async function saveService(body) {
    // Build the URL and method based on whether we're editing or adding.
    const url = editingId ? "/api/services/" + editingId : "/api/services";
    const method = editingId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
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
    // The save changed the data, so refresh both the list and the reports
    // (totals/counts are derived from the services).
    await refreshServices();
    await loadSummaries();
  }

  // Delete one service. Confirm first (it can't be undone), then DELETE it by
  // id and refresh the list. If we happened to be editing that same service,
  // reset the form so we're not left editing a row that no longer exists.
  async function removeService(s) {
    if (!confirm("Delete this service?")) {
      return;
    }

    const res = await fetch("/api/services/" + s._id, { method: "DELETE" });
    if (!res.ok) {
      console.error("Error deleting service:", res.statusText);
      return;
    }

    console.log("Deleted service", s._id);
    if (editingId === s._id) {
      resetForm();
    }
    // The delete changed the data, so refresh both the list and the reports.
    await refreshServices();
    await loadSummaries();
  }

  // --- summary reports ----------------------------------------------------

  // Render the "Spend by Vehicle" table. Each row is { _id, totalSpent,
  // serviceCount } where _id is the vehicle's id, so we map it to a nickname.
  function displayByVehicle(rows) {
    const tbody = document.getElementById("by-vehicle-tbody");
    tbody.innerHTML = "";
    for (let r of rows) {
      const row = document.createElement("tr");
      addCell(row, nameById.get(r._id) ?? "Unknown");
      addCell(row, r.totalSpent != null ? `$${r.totalSpent.toFixed(2)}` : "—");
      addCell(row, r.serviceCount ?? 0);
      tbody.appendChild(row);
    }
    console.log("Displayed by-vehicle with", rows.length, "rows");
  }

  // Render the "Spend by Month" table. Each row is { _id, totalSpent,
  // serviceCount } where _id is a "YYYY-MM" month string.
  function displayMonthly(rows) {
    const tbody = document.getElementById("monthly-tbody");
    tbody.innerHTML = "";
    for (let r of rows) {
      const row = document.createElement("tr");
      addCell(row, r._id ?? "—");
      addCell(row, r.totalSpent != null ? `$${r.totalSpent.toFixed(2)}` : "—");
      addCell(row, r.serviceCount ?? 0);
      tbody.appendChild(row);
    }
    console.log("Displayed monthly with", rows.length, "rows");
  }

  // Render the "Due Soon" table. Each row already has a nickname baked in, plus
  // currentMileage, dueAtMileage and milesLeft (negative = overdue). The status
  // dropdown/coloring comes in a later sub-step; this just shows the numbers.
  function displayDueSoon(rows) {
    const tbody = document.getElementById("due-soon-tbody");
    tbody.innerHTML = "";
    for (let r of rows) {
      const row = document.createElement("tr");
      addCell(row, r.nickname ?? "Unknown");
      addCell(row, r.currentMileage ?? "—");
      addCell(row, r.dueAtMileage ?? "—");
      addCell(row, r.milesLeft ?? "—");
      tbody.appendChild(row);
    }
    console.log("Displayed due-soon with", rows.length, "rows");
  }

  // Fetch all three summaries at once (they don't depend on each other, so we
  // run them in parallel with Promise.all) and render each table.
  async function loadSummaries() {
    const [byVehicle, monthly, dueSoon] = await Promise.all([
      fetchSummary("by-vehicle"),
      fetchSummary("monthly"),
      fetchSummary("due-soon"),
    ]);
    // Keep the by-vehicle rows so the sort buttons can re-order them later.
    byVehicleRows = byVehicle;
    // Start (and restart, after a CRUD reload) on the default sort: by nickname.
    sortByVehicle("name");
    displayMonthly(monthly);
    displayDueSoon(dueSoon);
  }

  // Sort the kept Spend-by-Vehicle rows and re-render. No refetch — we re-order
  // the data we already have. Three modes: "name" (alphabetical by nickname,
  // the default), "totalSpent" and "serviceCount" (both highest first). Also
  // highlights the matching button so it's clear which sort is in effect.
  // sort() mutates byVehicleRows in place, which is fine: it's our own copy.
  function sortByVehicle(mode = "name") {
    if (mode === "name") {
      // Nickname isn't on the row (by-vehicle rows only have the vehicle _id),
      // so we look it up the same way we render it.
      byVehicleRows.sort((a, b) => {
        const nameA = nameById.get(a._id) ?? "";
        const nameB = nameById.get(b._id) ?? "";
        return nameA.localeCompare(nameB);
      });
    } else {
      // Numeric keys: highest first.
      byVehicleRows.sort((a, b) => b[mode] - a[mode]);
    }
    displayByVehicle(byVehicleRows);
    highlightSortButton(mode);
    console.log("Sorted by-vehicle by", mode);
  }

  // Put the .sort-active border on the button for the current sort mode and
  // remove it from the others, so the active sort is visible.
  function highlightSortButton(mode) {
    const buttons = {
      name: "sort-by-name",
      totalSpent: "sort-by-spend",
      serviceCount: "sort-by-count",
    };
    for (let button_id in buttons) {
      const button = document.getElementById(buttons[button_id]);
      button.classList.toggle("sort-active", button_id === mode);
    }
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

    // Cancel button (only visible in Edit mode): clear the form and go back to
    // Add mode, abandoning the edit.
    document.getElementById("form-cancel").addEventListener("click", resetForm);

    // Spend-by-Vehicle sort buttons: re-order the already-fetched rows.
    document
      .getElementById("sort-by-name")
      .addEventListener("click", () => sortByVehicle("name"));
    document
      .getElementById("sort-by-spend")
      .addEventListener("click", () => sortByVehicle("totalSpent"));
    document
      .getElementById("sort-by-count")
      .addEventListener("click", () => sortByVehicle("serviceCount"));
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

  // The Spend-by-Vehicle rows, kept after fetching so the sort buttons can
  // re-order and re-render them without hitting the API again. (We sort this
  // data, not the on-screen cells, so we sort real numbers not "$1,234.56".)
  let byVehicleRows = [];

  fillVehicleDatalist(vehicles);
  await refreshServices();
  await loadSummaries();
}

MyFrontEnd();
