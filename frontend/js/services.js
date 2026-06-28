async function MyFrontEnd() {
  // GET the service records, optionally filtered by a query string.
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

  // GET one service by id, re-fetched fresh so the edit form reflects the DB.
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

  // GET one of the three summary reports (path = e.g. "by-vehicle").
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

  // Build a lookup: vehicle _id -> nickname.
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

  // Fill the shared datalist with one suggestion per vehicle nickname.
  // The user types a nickname; we map it back to the _id the API expects.
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

  /**
   * Example JSdoc
   * @param {*} services add param description here
   * @param {*} nameById 
   */
  // Fill the service table. Use ?? not || so a real 0 (e.g. mileage) still shows.
  function displayServices(services, nameById) {
    const tbody = document.getElementById("services-tbody");
    tbody.innerHTML = "";

    for (let s of services) {
      const row = document.createElement("tr");

      addCell(row, nameById.get(s.vehicleId) ?? "Unknown");
      addCell(row, s.date ?? "—");
      addCell(row, s.serviceType ?? "—");
      addCell(row, s.mileageAtService ?? "—");
      addCell(row, s.cost != null ? `$${s.cost.toFixed(2)}` : "—");
      addCell(row, s.shopName ?? "—");
      addCell(row, s.serviceRating ?? "—");

      const actions = document.createElement("td");

      // Edit button: fills the form from THIS row's service and switches to edit.
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn-sm btn-secondary";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => fillFormForEdit(s));

      // Delete button: confirms, then deletes THIS row's service.
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-sm btn-danger";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => removeService(s));

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      row.appendChild(actions);

      tbody.appendChild(row);
    }
    console.log("Displayed services with", services.length, "entries");
  }

  // Read the form fields into an API-shaped object. The vehicle field holds a
  // typed nickname, so we resolve it to the _id (undefined if it didn't match).
  function readServiceForm() {
    const typedNickname = document.getElementById("form-vehicle").value.trim();
    const match = vehicles.find((v) => v.nickname === typedNickname);

    return {
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

  // Show a green success message and outline every field after a save.
  function showFormSuccess(message) {
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

  // Show an error message, and red-outline the field that caused it (if given).
  function showFormError(message, fieldId) {
    document.getElementById("form-error").textContent = message;
    if (fieldId) {
      document.getElementById(fieldId).classList.add("field-error");
    }
  }

  // Clear the error line and remove all field outlines, before each save attempt.
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

  // Switch the form's visuals into Edit mode (heading, button, accent).
  function enterEditMode() {
    document.getElementById("form-heading").textContent = "Edit Service";
    document.getElementById("form-submit").textContent = "Update";
    document.getElementById("form-cancel").classList.remove("d-none");
    document.getElementById("service-form-section").classList.add("editing");
  }

  // Switch the form's visuals back to Add mode (opposite of enterEditMode).
  function exitEditMode() {
    document.getElementById("form-heading").textContent = "Add a Service";
    document.getElementById("form-submit").textContent = "Save";
    document.getElementById("form-cancel").classList.add("d-none");
    document.getElementById("service-form-section").classList.remove("editing");
  }

  // Open a service for editing: re-fetch it fresh (fall back to the row) and
  // fill the form, showing the vehicle as its nickname.
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

  // Front-end gate: check presence/vehicle match only. The backend owns the
  // detailed rules and its message is shown if the request gets that far.
  function validateServiceForm(body) {
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
    // "other" type: require notes so there's a record of what the service was.
    if (body.serviceType === "other" && !body.notes.trim()) {
      showFormError(
        'For "other" service type, please describe it in notes.',
        "form-notes",
      );
      return false;
    }
    return true;
  }

  // Clear the form and return to Add mode. Used after a save and by Cancel.
  function resetForm() {
    document.getElementById("service-form").reset();
    clearFormStatus();
    exitEditMode();
    editingId = null;
    console.log("Form reset successfully.");
  }

  // Send the form to the API: editingId null = POST (add), else PUT (update).
  // On success, clear the form and refresh the list + reports.
  async function saveService(body) {
    const url = editingId ? "/api/services/" + editingId : "/api/services";
    const method = editingId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // Backend sends a 400 with { error } for invalid data; show that message.
      const data = await res.json();
      showFormError(data.error ?? "Could not save the service.");
      console.error("Error saving service:", data.error ?? res.statusText);
      return;
    }

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
    await refreshServices();
    await loadSummaries();
  }

  // Delete one service (after confirming), then refresh the list + reports.
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
    // If we were editing this service, reset so we're not editing a ghost row.
    if (editingId === s._id) {
      resetForm();
    }
    await refreshServices();
    await loadSummaries();
  }

  // Render the "Spend by Vehicle" table. Each row's _id is the vehicle's id.
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

  // Turn a "YYYY-MM" key into a label like "January 2025".
  function monthLabel(key) {
    const [year, month] = key.split("-");
    const name = MONTH_NAMES[Number(month) - 1];
    return name ? `${name} ${year}` : key;
  }

  // Render the "Spend by Month" table. Each row's _id is a "YYYY-MM" string.
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

  // Fill the year dropdown with the distinct years in the monthly rows (newest first).
  function fillYearDropdown(rows) {
    const years = new Set();
    for (let r of rows) {
      years.add(r._id.slice(0, 4));
    }
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

  // Show only the selected year's months.
  function displayMonthlyForYear() {
    const year = document.getElementById("monthly-year").value;
    if (!year) {
      displayMonthly(monthlyRows);
      return;
    }
    const forYear = monthlyRows.filter((r) => r._id.startsWith(year));
    displayMonthly(forYear);
  }

  // Render the "Due Soon" table, coloring the Miles Left cell by status.
  function displayDueSoon(rows) {
    const tbody = document.getElementById("due-soon-tbody");
    tbody.innerHTML = "";
    for (let r of rows) {
      const row = document.createElement("tr");
      addCell(row, r.nickname ?? "Unknown");
      addCell(row, r.currentMileage ?? "—");
      addCell(row, r.dueAtMileage ?? "—");

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

  // Decide a vehicle's status from milesLeft. The 1000-mile "soon" threshold
  // is a presentation choice, so it lives here on the frontend.
  function dueStatus(milesLeft) {
    if (milesLeft < 0) {
      return "overdue";
    }
    if (milesLeft <= 1000) {
      return "due-soon";
    }
    return "ok";
  }

  // Show the Due-Soon rows matching the status dropdown, then sorted by milesLeft.
  function displayDueSoonForStatus() {
    const choice = document.getElementById("due-status").value;
    // slice() copies the array so the sort doesn't reorder dueSoonRows itself.
    let rows =
      choice === "all"
        ? dueSoonRows.slice()
        : dueSoonRows.filter((r) => dueStatus(r.milesLeft) === choice);

    if (dueSortDir === "asc" || dueSortDir === "desc") {
      rows.sort((a, b) => {
        return dueSortDir === "asc"
          ? a.milesLeft - b.milesLeft
          : b.milesLeft - a.milesLeft;
      });
    }

    displayDueSoon(rows);
  }

  // Toggle the Miles Left sort direction, update the arrow, and re-render.
  function sortDueSoon() {
    dueSortDir = dueSortDir === "asc" ? "desc" : "asc";
    document.getElementById("miles-sort-arrow").textContent =
      dueSortDir === "asc" ? "▲" : "▼";
    displayDueSoonForStatus();
  }

  // Fetch all three summaries in parallel and render each table.
  async function loadSummaries() {
    const [byVehicle, monthly, dueSoon] = await Promise.all([
      fetchSummary("by-vehicle"),
      fetchSummary("monthly"),
      fetchSummary("due-soon"),
    ]); //Nice use of Promise.all()!
    // Keep the by-vehicle rows so the sort buttons can re-order them later.
    ]);

    byVehicleRows = byVehicle;
    sortByVehicle("name");

    monthlyRows = monthly;
    fillYearDropdown(monthlyRows);
    displayMonthlyForYear();

    dueSoonRows = dueSoon;
    document.getElementById("miles-sort-arrow").textContent =
      dueSortDir === "asc" ? "▲" : "▼";
    displayDueSoonForStatus();

    console.log("Summaries loaded and displayed successfully.");
  }

  // Sort the kept Spend-by-Vehicle rows and re-render (no refetch).
  // "name" = alphabetical by nickname; otherwise by the numeric key, highest first.
  function sortByVehicle(mode = "name") {
    if (mode === "name") {
      byVehicleRows.sort((a, b) => {
        const nameA = nameById.get(a._id) ?? "";
        const nameB = nameById.get(b._id) ?? "";
        return nameA.localeCompare(nameB);
      });
    } else {
      byVehicleRows.sort((a, b) => b[mode] - a[mode]);
    }
    displayByVehicle(byVehicleRows);
    highlightSortButton(mode);
    console.log("Sorted by-vehicle by", mode);
  }

  // Outline the active sort button and clear the others.
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

  // How each clickable column sorts. field = property to read; type = how to
  // compare. "vehicle" has no field — its text is the nickname looked up by id.
  const SERVICE_SORTS = {
    vehicle: { type: "text" },
    date: { field: "date", type: "text" },
    type: { field: "serviceType", type: "text" },
    mileage: { field: "mileageAtService", type: "number" },
    cost: { field: "cost", type: "number" },
    shop: { field: "shopName", type: "text" },
    rating: { field: "serviceRating", type: "number" },
  };

  // Read the value a row contributes to a sort key (vehicle = its nickname).
  function serviceSortValue(row, key) {
    if (key === "vehicle") {
      return nameById.get(row.vehicleId);
    }
    return row[SERVICE_SORTS[key].field];
  }

  // Sort the kept service rows by a column and redraw. Same column again flips
  // direction; a new column starts ascending. Missing values sink to the end.
  function sortServices(key) {
    const config = SERVICE_SORTS[key];
    if (!config) {
      return;
    }

    if (serviceSortKey === key) {
      serviceSortDir = serviceSortDir === "asc" ? "desc" : "asc"; //Suggestion: why not use a boolean here?
    } else {
      serviceSortKey = key;
      serviceSortDir = "asc";
    }

    serviceRows.sort((a, b) => {
      const valueA = serviceSortValue(a, key);
      const valueB = serviceSortValue(b, key);

      if (valueA == null) return 1;
      if (valueB == null) return -1;

      const comparison =
        config.type === "text" ? valueA.localeCompare(valueB) : valueA - valueB;

      return serviceSortDir === "asc" ? comparison : -comparison;
    });

    displayServices(serviceRows, nameById);
    updateSortArrows();
    console.log("Sorted services by", key, serviceSortDir);
  }

  // Show the ▲/▼ arrow on the active sort column and clear the others.
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

  // Build a "?...=..." query string for the API from the filter fields.
  // Returns { query, error }; error is set when the typed vehicle didn't match.
  function buildServiceQuery() {
    const params = new URLSearchParams();

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

  // Re-fetch the services with the current filters and redraw the table.
  async function refreshServices() {
    const { query, error } = buildServiceQuery();
    const errorBox = document.getElementById("filter-error");

    // Bad vehicle filter: show the message and don't fetch.
    if (error) {
      errorBox.textContent = error;
      return;
    }
    errorBox.textContent = "";

    serviceRows = await fetchServices(query);
    console.log("Loaded", serviceRows.length, "services");
    // A fresh fetch resets to the API order, so clear any active sort.
    serviceSortKey = null;
    updateSortArrows();
    displayServices(serviceRows, nameById);

    console.log("Services refreshed and displayed successfully.");
  }

  // Wire up the page-level listeners once on load. (Row Edit/Delete buttons are
  // wired in displayServices, since those rows are created dynamically.)
  function setupEventListeners() {
    document
      .getElementById("filter-form")
      .addEventListener("submit", (event) => {
        event.preventDefault();
        refreshServices();
      });

    document
      .getElementById("service-form")
      .addEventListener("submit", (event) => {
        event.preventDefault();
        clearFormStatus();
        const body = readServiceForm();
        if (!validateServiceForm(body)) {
          return;
        }
        saveService(body);
      });

    document.getElementById("form-cancel").addEventListener("click", resetForm);

    document
      .getElementById("sort-by-name")
      .addEventListener("click", () => sortByVehicle("name"));
    document
      .getElementById("sort-by-spend")
      .addEventListener("click", () => sortByVehicle("totalSpent"));
    document
      .getElementById("sort-by-count")
      .addEventListener("click", () => sortByVehicle("serviceCount"));

    document
      .getElementById("monthly-year")
      .addEventListener("change", displayMonthlyForYear);

    document
      .getElementById("due-status")
      .addEventListener("change", displayDueSoonForStatus);

    document
      .getElementById("sort-miles-left")
      .addEventListener("click", sortDueSoon);

    const sortableHeaders = document.querySelectorAll("th.sortable");
    for (let th of sortableHeaders) {
      th.addEventListener("click", () => sortServices(th.dataset.sort));
    }
  }

  // Initial load: wire listeners, fetch vehicles, then load services + summaries.
  setupEventListeners();
  let vehicles = await fetchVehicles();
  let nameById = buildVehicleNameMap(vehicles);
  // null = Add mode; a service _id = Edit mode. Set by row Edit, cleared by resetForm.
  let editingId = null;
  // Kept rows so sorts/filters can re-render without re-fetching from the API.
  let byVehicleRows = [];
  let serviceRows = [];
  let serviceSortKey = null;
  let serviceSortDir = "desc";
  let monthlyRows = [];
  let dueSoonRows = [];
  // Default asc: the API already returns rows most-urgent-first, so ▲ is correct.
  let dueSortDir = "asc";

  fillVehicleDatalist(vehicles);
  await refreshServices();
  await loadSummaries();
}

MyFrontEnd();
