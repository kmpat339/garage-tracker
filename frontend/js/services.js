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

  // GET a single service by its id. Used when opening a record to edit, so the
  // form is filled from the freshest copy in the DB (not a possibly-stale row
  // from the last list load). Returns the service, or null on failure.
  async function fetchServiceById(id) {
    const res = await fetch("/api/services/" + id);
    if (!res.ok) {
      console.error("Error fetching service " + id + ":", res.statusText);
      return null;
    }
    const service = await res.json();
    console.log("Fetched service", id);
    return service;
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

  function showFormSuccess(message) {
    // change form error color to green
    document.getElementById("form-error").classList.remove("text-danger");
    document.getElementById("form-error").classList.add("text-success");
    document.getElementById("form-error").textContent = message;

    document.getElementById("form-vehicle").classList.add("field-success");
    document.getElementById("form-date").classList.add("field-success");
    document.getElementById("form-type").classList.add("field-success");
    document.getElementById("form-mileage").classList.add("field-success");
    document.getElementById("form-cost").classList.add("field-success");
    document.getElementById("form-interval").classList.add("field-success");
    document.getElementById("form-rating").classList.add("field-success");
    document.getElementById("form-shop").classList.add("field-success");
    document.getElementById("form-notes").classList.add("field-success");

    console.log("Form success highlighting applied successfully.");
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
  function clearFormStatus() {
    document.getElementById("form-error").textContent = "";
    document.getElementById("form-error").classList.remove("text-success");
    document.getElementById("form-error").classList.add("text-danger");
    const fields = document.querySelectorAll("#service-form .field-error");
    for (let field of fields) {
      field.classList.remove("field-error");
    }
    const successFields = document.querySelectorAll(
      "#service-form .field-success",
    );
    for (let field of successFields) {
      field.classList.remove("field-success");
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

  // Open a service for editing. We re-fetch the record fresh by id (so the form
  // reflects what's actually in the DB right now), and fall back to the row we
  // already have if that fetch fails so Edit still works offline/erroring.
  // `row` is the service object from the list. The vehicle field shows the
  // nickname (the form works in nicknames); readServiceForm maps it back on save.
  async function fillFormForEdit(row) {
    const s = (await fetchServiceById(row._id)) ?? row;
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

    clearFormStatus();
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
    clearFormStatus();
    exitEditMode();
    editingId = null;
    console.log("Form reset successfully.");
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

    // vehicle nickname
    const vehicleNickname = nameById.get(body.vehicleId) ?? "Unknown";

    console.log(
      method === "POST" ? "Added service" : "Updated service",
      "for",
      vehicleNickname,
    );

    showFormSuccess(
      method === "POST"
        ? `Service added successfully for ${vehicleNickname}.`
        : `Service updated successfully for ${vehicleNickname}.`,
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));
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
    const vehicleNickname = nameById.get(s.vehicleId) ?? "Unknown";
    console.log(
      "Deleted service with ObjectId",
      s._id,
      "for vehicle",
      vehicleNickname,
    );
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

  // Turn a "YYYY-MM" key into a friendly label like "January 2025". The month
  // part (after the dash) is "01".."12"; we use it to index the month names
  // (minus 1, since the array starts at 0). Falls back to the raw key if the
  // format is unexpected.
  const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  function monthLabel(key) {
    const [year, month] = key.split("-");
    const name = MONTH_NAMES[Number(month) - 1];
    return name ? `${name} ${year}` : key;
  }

  // Render the "Spend by Month" table. Each row is { _id, totalSpent,
  // serviceCount } where _id is a "YYYY-MM" month string, shown as a name.
  function displayMonthly(rows) {
    const tbody = document.getElementById("monthly-tbody");
    tbody.innerHTML = "";
    for (let r of rows) {
      const row = document.createElement("tr");
      addCell(row, r._id ? monthLabel(r._id) : "—");
      addCell(row, r.totalSpent != null ? `$${r.totalSpent.toFixed(2)}` : "—");
      addCell(row, r.serviceCount ?? 0);
      tbody.appendChild(row);
    }
    console.log("Displayed monthly with", rows.length, "rows");
  }

  // Fill the year dropdown from the monthly rows: one <option> per distinct
  // year found in the "YYYY-MM" keys (the first 4 characters), newest first.
  function fillYearDropdown(rows) {
    // Collect the distinct years. A Set drops duplicates automatically.
    const years = new Set();
    for (let r of rows) {
      years.add(r._id.slice(0, 4));
    }
    // Sort newest first (descending). [...years] turns the Set into an array.
    const sortedYears = [...years].sort((a, b) => b.localeCompare(a));

    const select = document.getElementById("monthly-year");
    select.innerHTML = "";
    for (let year of sortedYears) {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = year;
      select.appendChild(option);
    }
    console.log("Filled year dropdown with", sortedYears.length, "years");
  }

  // Show only the chosen year's months (those that actually have data; we don't
  // pad to 12). Reads the selected year and filters the kept monthly rows.
  function displayMonthlyForYear() {
    const year = document.getElementById("monthly-year").value;
    if (!year) {
      displayMonthly(monthlyRows);
      return;
    }
    const forYear = monthlyRows.filter((r) => r._id.startsWith(year));
    displayMonthly(forYear);
  }

  // Render the "Due Soon" table. Each row already has a nickname baked in, plus
  // currentMileage, dueAtMileage and milesLeft (negative = overdue). The status
  // (overdue / due soon / ok) is decided on the frontend from milesLeft.
  function displayDueSoon(rows) {
    const tbody = document.getElementById("due-soon-tbody");
    tbody.innerHTML = "";
    for (let r of rows) {
      const row = document.createElement("tr");
      addCell(row, r.nickname ?? "Unknown");
      addCell(row, r.currentMileage ?? "—");
      addCell(row, r.dueAtMileage ?? "—");

      // Miles Left, colored by status (overdue red / due-soon orange / ok green).
      const milesCell = document.createElement("td");
      milesCell.textContent = r.milesLeft ?? "—";
      if (r.milesLeft != null) {
        milesCell.classList.add("status-" + dueStatus(r.milesLeft));
      }
      row.appendChild(milesCell);

      tbody.appendChild(row);
    }
    console.log("Displayed due-soon with", rows.length, "rows");
  }

  // Decide a vehicle's status from milesLeft (miles until the next service is
  // due; negative = already overdue). The 1000-mile "soon" threshold lives here
  // on the frontend, since it's a presentation choice. Returns a string that
  // matches the dropdown option values: "overdue" / "due-soon" / "ok".
  function dueStatus(milesLeft) {
    if (milesLeft < 0) {
      return "overdue";
    }
    if (milesLeft <= 1000) {
      return "due-soon";
    }
    return "ok";
  }

  // Show the Due-Soon rows matching the status dropdown, then (if a Miles Left
  // sort is active) sorted by milesLeft. "all" shows everything; otherwise we
  // keep only rows whose computed status matches. Filters/sorts the kept rows
  // (no refetch). We copy the list with slice() before sorting so we don't
  // reorder the kept dueSoonRows itself.
  function displayDueSoonForStatus() {
    const choice = document.getElementById("due-status").value;
    let rows =
      choice === "all"
        ? dueSoonRows.slice()
        : dueSoonRows.filter((r) => dueStatus(r.milesLeft) === choice);

    if (dueSortDir === "asc" || dueSortDir === "desc") {
      rows.sort((a, b) => {
        // milesLeft is always a number here, so a plain subtraction works.
        return dueSortDir === "asc"
          ? a.milesLeft - b.milesLeft
          : b.milesLeft - a.milesLeft;
      });
    }

    displayDueSoon(rows);
  }

  // Toggle the Miles Left sort (ascending first = most overdue on top, then
  // descending) and re-render. Updates the arrow on the button.
  function sortDueSoon() {
    dueSortDir = dueSortDir === "asc" ? "desc" : "asc";
    document.getElementById("miles-sort-arrow").textContent =
      dueSortDir === "asc" ? "▲" : "▼";
    displayDueSoonForStatus();
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

    // Keep the monthly rows, (re)build the year dropdown from them, then show
    // the selected year. The dropdown defaults to its first option (newest
    // year) after filling, so this shows that year's months.
    monthlyRows = monthly;
    fillYearDropdown(monthlyRows);
    displayMonthlyForYear();

    // Keep the due-soon rows and show them filtered by the status dropdown
    // (defaults to "All"). Show the arrow for the default sort direction.
    dueSoonRows = dueSoon;
    document.getElementById("miles-sort-arrow").textContent =
      dueSortDir === "asc" ? "▲" : "▼";
    displayDueSoonForStatus();

    console.log("Summaries loaded and displayed successfully.");
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

  // --- sorting the service list -------------------------------------------

  // How each clickable column sorts. `field` is the property on the service to
  // read; `type` says how to compare it ("text" or "number"). "vehicle" has no
  // field — its text is the nickname, looked up by id (handled below). Dates
  // are "YYYY-MM-DD" strings, so they compare correctly as text.
  const SERVICE_SORTS = {
    vehicle: { type: "text" },
    date: { field: "date", type: "text" },
    type: { field: "serviceType", type: "text" },
    mileage: { field: "mileageAtService", type: "number" },
    cost: { field: "cost", type: "number" },
    shop: { field: "shopName", type: "text" },
    rating: { field: "serviceRating", type: "number" },
  };

  // Read the value a row contributes to a given sort key. Vehicle is special:
  // its sortable text is the nickname (looked up from the id), since the row
  // only stores the vehicleId. Everything else reads its configured field.
  function serviceSortValue(row, key) {
    if (key === "vehicle") {
      return nameById.get(row.vehicleId);
    }
    return row[SERVICE_SORTS[key].field];
  }

  // Sort the kept service rows by a column and redraw. Clicking a column sorts
  // it ascending (A->Z / low->high / oldest); clicking the SAME column again
  // flips to descending. Clicking a different column starts fresh at ascending.
  // No refetch — we re-order the rows we already have. `key` is the header's
  // data-sort value (e.g. "vehicle", "cost"). Missing values sink to the end.
  function sortServices(key) {
    const config = SERVICE_SORTS[key];
    if (!config) {
      return;
    }

    // Same column again -> flip direction; new column -> start ascending.
    if (serviceSortKey === key) {
      serviceSortDir = serviceSortDir === "asc" ? "desc" : "asc";
    } else {
      serviceSortKey = key;
      serviceSortDir = "asc";
    }

    serviceRows.sort((a, b) => {
      const valueA = serviceSortValue(a, key);
      const valueB = serviceSortValue(b, key);

      // Missing values always sink to the bottom, whichever direction we're in.
      if (valueA == null) return 1;
      if (valueB == null) return -1;

      // Compare per the column's type: text with localeCompare, numbers with
      // subtraction. This gives ascending order.
      const comparison =
        config.type === "text" ? valueA.localeCompare(valueB) : valueA - valueB;

      // Negate for descending.
      return serviceSortDir === "asc" ? comparison : -comparison;
    });

    displayServices(serviceRows, nameById);
    updateSortArrows();
    console.log("Sorted services by", key, serviceSortDir);
  }

  // Show a ▼ (desc) or ▲ (asc) arrow in the active sort column's header, and
  // clear the arrows on the others. With no active sort (serviceSortKey null),
  // all arrows are blank.
  function updateSortArrows() {
    const headers = document.querySelectorAll("th.sortable");
    for (let th of headers) {
      const arrow = th.querySelector(".sort-arrow");
      if (th.dataset.sort === serviceSortKey) {
        arrow.textContent = serviceSortDir === "asc" ? "▲" : "▼";
      } else {
        arrow.textContent = "";
      }
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

    // Cost range: either end is optional. Send whatever is filled in.
    const costMin = document.getElementById("filter-cost-min").value;
    if (costMin) params.set("costMin", costMin);

    const costMax = document.getElementById("filter-cost-max").value;
    if (costMax) params.set("costMax", costMax);

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

    // Fetch the services with the query string and keep them so the column
    // headers can sort them without another request, then show them.
    serviceRows = await fetchServices(query);
    console.log("Loaded", serviceRows.length, "services");
    // A fresh fetch resets to the default (API) order, so clear any active
    // sort and its arrow.
    serviceSortKey = null;
    updateSortArrows();
    // Redraw the table with the new data.
    displayServices(serviceRows, nameById);

    console.log("Services refreshed and displayed successfully.");
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
        clearFormStatus();
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

    // Spend-by-Month year dropdown: show the chosen year's months on change.
    document
      .getElementById("monthly-year")
      .addEventListener("change", displayMonthlyForYear);

    // Due-Soon status dropdown: filter the rows by status on change.
    document
      .getElementById("due-status")
      .addEventListener("change", displayDueSoonForStatus);

    // Due-Soon Miles Left sort button: toggle ascending/descending.
    document
      .getElementById("sort-miles-left")
      .addEventListener("click", sortDueSoon);

    // Service-list sortable headers: one handler reads each header's data-sort
    // key and sorts the kept rows by that column.
    const sortableHeaders = document.querySelectorAll("th.sortable");
    for (let th of sortableHeaders) {
      th.addEventListener("click", () => sortServices(th.dataset.sort));
    }
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

  // The service-list rows, kept after fetching so the column headers can
  // re-order them without another request.
  let serviceRows = [];

  // Which column the SERVICE-RECORDS table is sorted by and the direction.
  // null = no sort (the order from the API). A refetch resets these to null.
  let serviceSortKey = null;
  let serviceSortDir = "desc";

  // The Spend-by-Month rows, kept so the year dropdown can show just one year's
  // months without another request.
  let monthlyRows = [];

  // The Due-Soon rows, kept so the status dropdown can filter them without
  // another request.
  let dueSoonRows = [];

  // Miles Left sort direction for Due-Soon. Defaults to "asc" because the API
  // already returns rows most-urgent-first (milesLeft ascending), so the table
  // starts genuinely ascending and the ▲ arrow reflects that. Clicking toggles.
  let dueSortDir = "asc";

  fillVehicleDatalist(vehicles);
  await refreshServices();
  await loadSummaries();
}

MyFrontEnd();
