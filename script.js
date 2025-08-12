class Benchmarkify {
  constructor() {
    this.form = document.getElementById("credentialsForm");
    this.benchmarkSection = document.getElementById("benchmarkSection");
    this.progressFill = document.getElementById("progressFill");
    this.status = document.getElementById("status");
    this.resultsBody = document.getElementById("resultsBody");
    this.summary = document.getElementById("summary");
    this.summaryStats = document.getElementById("summaryStats");
    this.rateLimitInfo = document.getElementById("rateLimitInfo");
    this.graphqlPayloads = document.getElementById("graphqlPayloads");

    // Rate limit elements
    this.currentUsage = document.getElementById("currentUsage");
    this.remainingCalls = document.getElementById("remainingCalls");
    this.totalCost = document.getElementById("totalCost");
    this.maxProductsPerSecond = document.getElementById("maxProductsPerSecond");

    // GraphQL query elements
    this.createQuery = document.getElementById("createQuery");
    this.updateQuery = document.getElementById("updateQuery");
    this.deleteQuery = document.getElementById("deleteQuery");
    this.queryQuery = document.getElementById("queryQuery");

    this.bindEvents();
    this.initializeGraphQLQueries();
  }

  bindEvents() {
    this.form.addEventListener("submit", (e) => this.handleSubmit(e));

    // Tab switching for GraphQL queries
    const tabBtns = document.querySelectorAll(".tab-btn");
    tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => this.switchTab(btn.dataset.tab));
    });

    // Test button events
    document.getElementById("testConnection").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("🔍 Test Connection button clicked");
      this.testGraphQLConnection();
    });
    document.getElementById("testSchema").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("🔍 Test Schema button clicked");
      this.testSchemaInfo();
    });
    document
      .getElementById("testProductCreate")
      .addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("🔍 Test Product Create button clicked");
        this.testProductCreation();
      });

    // Operation checkbox events
    this.bindOperationCheckboxes();

    // Audit log download events
    this.bindAuditLogEvents();
  }

  bindOperationCheckboxes() {
    const createCheckbox = document.getElementById("enableCreate");
    const updateCheckbox = document.getElementById("enableUpdate");
    const deleteCheckbox = document.getElementById("enableDelete");

    const createCountInput = document.getElementById("createCount");
    const updateCountInput = document.getElementById("updateCount");
    const deleteCountInput = document.getElementById("deleteCount");

    // Handle create checkbox
    createCheckbox.addEventListener("change", () => {
      createCountInput.disabled = !createCheckbox.checked;
      if (!createCheckbox.checked) {
        createCountInput.value = "";
      } else if (!createCountInput.value) {
        createCountInput.value = "100";
      }
      this.updateOperationLabels();
    });

    // Handle update checkbox
    updateCheckbox.addEventListener("change", () => {
      updateCountInput.disabled = !updateCheckbox.checked;
      if (!updateCheckbox.checked) {
        updateCountInput.value = "";
      } else if (!updateCountInput.value) {
        updateCountInput.value = "100";
      }
      this.updateOperationLabels();
      this.updateOperationsSummary();
    });

    // Handle delete checkbox
    deleteCheckbox.addEventListener("change", () => {
      deleteCountInput.disabled = !deleteCheckbox.checked;
      if (!deleteCheckbox.checked) {
        deleteCountInput.value = "";
      } else if (!deleteCountInput.value) {
        deleteCountInput.value = "100";
      }
      this.updateOperationLabels();
    });

    // Initialize disabled state
    createCountInput.disabled = !createCheckbox.checked;
    updateCountInput.disabled = !updateCheckbox.checked;
    deleteCountInput.disabled = !deleteCheckbox.checked;

    // Add input event listeners for count inputs
    createCountInput.addEventListener("input", () =>
      this.updateOperationsSummary()
    );
    updateCountInput.addEventListener("input", () =>
      this.updateOperationsSummary()
    );
    deleteCountInput.addEventListener("input", () =>
      this.updateOperationsSummary()
    );

    // Update visual state
    this.updateOperationLabels();
    this.updateOperationsSummary();
  }

  bindAuditLogEvents() {
    document
      .getElementById("downloadJsonLog")
      .addEventListener("click", () => this.downloadAuditLog("json"));
    document
      .getElementById("downloadTxtLog")
      .addEventListener("click", () => this.downloadAuditLog("txt"));
    document
      .getElementById("viewAuditSummary")
      .addEventListener("click", () => this.viewAuditSummary());
  }

  updateOperationLabels() {
    const createCheckbox = document.getElementById("enableCreate");
    const updateCheckbox = document.getElementById("enableUpdate");
    const deleteCheckbox = document.getElementById("enableDelete");

    const createLabel = createCheckbox.parentElement.querySelector("span");
    const updateLabel = updateCheckbox.parentElement.querySelector("span");
    const deleteLabel = deleteCheckbox.parentElement.querySelector("span");

    // Update create label and styling
    if (createCheckbox.checked) {
      createLabel.textContent = "✅ Create Products";
      createLabel.style.color = "#059669";
      createCheckbox.parentElement.classList.remove("disabled");
    } else {
      createLabel.textContent = "⏸️ Create Products (Disabled)";
      createLabel.style.color = "#6b7280";
      createCheckbox.parentElement.classList.add("disabled");
    }

    // Update update label and styling
    if (updateCheckbox.checked) {
      updateLabel.textContent = "✅ Update Products";
      updateLabel.style.color = "#dc2626";
      updateCheckbox.parentElement.classList.remove("disabled");
    } else {
      updateLabel.textContent = "⏸️ Update Products (Disabled)";
      updateLabel.style.color = "#6b7280";
      updateCheckbox.parentElement.classList.add("disabled");
    }

    // Update delete label and styling
    if (deleteCheckbox.checked) {
      deleteLabel.textContent = "✅ Delete Products";
      deleteLabel.style.color = "#7c3aed";
      deleteCheckbox.parentElement.classList.remove("disabled");
    } else {
      deleteLabel.textContent = "⏸️ Delete Products (Disabled)";
      deleteLabel.style.color = "#6b7280";
      deleteCheckbox.parentElement.classList.add("disabled");
    }
  }

  updateOperationsSummary() {
    const createCheckbox = document.getElementById("enableCreate");
    const updateCheckbox = document.getElementById("enableUpdate");
    const deleteCheckbox = document.getElementById("enableDelete");

    const createCount = document.getElementById("createCount").value;
    const updateCount = document.getElementById("updateCount").value;
    const deleteCount = document.getElementById("deleteCount").value;

    const batchSize = document.getElementById("batchSize").value;
    const delayBetweenBatches = document.getElementById(
      "delayBetweenBatches"
    ).value;

    const operationsSummary = document.getElementById("operationsSummary");
    const operationsList = document.getElementById("operationsList");

    let operations = [];

    if (createCheckbox.checked && createCount) {
      operations.push(`✅ Create ${createCount} products`);
    }

    if (updateCheckbox.checked && updateCount) {
      operations.push(`✅ Update ${updateCount} products`);
    }

    if (deleteCheckbox.checked && deleteCount) {
      operations.push(`✅ Delete ${deleteCount} products`);
    }

    if (operations.length > 0) {
      operations.push(
        `⚡ Batch Size: ${batchSize} | Delay: ${delayBetweenBatches}ms`
      );
      operationsList.innerHTML = operations.join("<br>");
      operationsSummary.style.display = "block";
    } else {
      operationsSummary.style.display = "none";
    }
  }

  switchTab(tabName) {
    // Remove active class from all tabs and content
    document
      .querySelectorAll(".tab-btn")
      .forEach((btn) => btn.classList.remove("active"));
    document
      .querySelectorAll(".tab-content")
      .forEach((content) => content.classList.remove("active"));

    // Add active class to clicked tab and corresponding content
    document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");
    document.getElementById(`${tabName}-tab`).classList.add("active");
  }

  initializeGraphQLQueries() {
    // Set the GraphQL queries in the frontend
    this.createQuery.textContent = `mutation productCreate($input: ProductInput!) {
  productCreate(input: $input) {
    product {
      id
      title
      handle
      createdAt
    }
    userErrors {
      field
      message
    }
  }
}`;

    this.updateQuery.textContent = `mutation productUpdate($input: ProductInput!) {
  productUpdate(input: $input) {
    product {
      id
      title
      updatedAt
    }
    userErrors {
      field
      message
    }
  }
}`;

    this.deleteQuery.textContent = `mutation productDelete($input: ProductDeleteInput!) {
  productDelete(input: $input) {
    deletedProductId
    userErrors {
      field
      message
    }
  }
}`;

    this.queryQuery.textContent = `query getProducts($first: Int!) {
  products(first: $first) {
    edges {
      node {
        id
        title
        handle
        createdAt
      }
    }
  }
}`;
  }

  async handleSubmit(e) {
    console.log("🔍 Form submitted - starting main benchmark");
    console.log("🔍 Event target:", e.target);
    console.log("🔍 Event type:", e.type);
    console.log("🔍 Event currentTarget:", e.currentTarget);
    e.preventDefault();

    const formData = new FormData(this.form);
    const storeUrl = formData.get("storeUrl");
    const accessToken = formData.get("accessToken");

    if (!storeUrl || !accessToken) {
      alert("Please fill in all fields");
      return;
    }

    // Get operation selection
    const enableCreate = document.getElementById("enableCreate").checked;
    const enableUpdate = document.getElementById("enableUpdate").checked;
    const enableDelete = document.getElementById("enableDelete").checked;

    // Check if at least one operation is selected
    if (!enableCreate && !enableUpdate && !enableDelete) {
      alert("Please select at least one operation to benchmark");
      return;
    }

    // Get benchmark configuration
    const createCount = enableCreate
      ? parseInt(document.getElementById("createCount").value) || 100
      : 0;
    const updateCount = enableUpdate
      ? parseInt(document.getElementById("updateCount").value) || 100
      : 0;
    const deleteCount = enableDelete
      ? parseInt(document.getElementById("deleteCount").value) || 100
      : 0;

    // Get performance configuration
    const batchSize =
      parseInt(document.getElementById("batchSize").value) || 10;
    const delayBetweenBatches =
      parseInt(document.getElementById("delayBetweenBatches").value) || 100;

    // Validate configuration for enabled operations
    if (enableCreate && (createCount < 1 || createCount > 10000)) {
      alert("Please enter a valid number of products to create (1-10,000)");
      return;
    }
    if (enableUpdate && (updateCount < 1 || updateCount > 10000)) {
      alert("Please enter a valid number of products to update (1-10,000)");
      return;
    }
    if (enableDelete && (deleteCount < 1 || deleteCount > 10000)) {
      alert("Please enter a valid number of products to delete (1-10,000)");
      return;
    }

    // Additional validation: if update/delete are enabled, ensure create is also enabled or there are existing products
    if ((enableUpdate || enableDelete) && !enableCreate) {
      alert(
        "⚠️ Warning: Update and Delete operations require existing products. Consider enabling Create operation first, or ensure you have existing benchmark products in your store."
      );
    }

    // Show benchmark section
    this.benchmarkSection.style.display = "block";
    this.form.style.display = "none";

    // Start benchmarking with configuration
    await this.startBenchmark(storeUrl, accessToken, {
      createCount,
      updateCount,
      deleteCount,
      batchSize,
      delayBetweenBatches,
    });
  }

  async startBenchmark(storeUrl, accessToken, config) {
    console.log("🔍 startBenchmark called with config:", config);

    try {
      this.updateStatus("Starting GraphQL benchmark...");
      this.updateProgress(0);

      // Initialize results table based on selected operations
      this.initializeResultsTable(config);

      let progress = 0;
      const totalOperations = [
        config.createCount > 0,
        config.updateCount > 0,
        config.deleteCount > 0,
      ].filter(Boolean).length;
      const progressPerOperation =
        totalOperations > 0 ? 100 / totalOperations : 100;

      // Start product creation benchmark if enabled
      if (config.createCount > 0) {
        await this.benchmarkProductCreation(
          storeUrl,
          accessToken,
          config.createCount,
          config
        );
        progress += progressPerOperation;
        this.updateProgress(progress);
      }

      // Start product update benchmark if enabled
      if (config.updateCount > 0) {
        await this.benchmarkProductUpdates(
          storeUrl,
          accessToken,
          config.updateCount,
          config
        );
        progress += progressPerOperation;
        this.updateProgress(progress);
      }

      // Start product deletion benchmark if enabled
      if (config.deleteCount > 0) {
        await this.benchmarkProductDeletion(
          storeUrl,
          accessToken,
          config.deleteCount,
          config
        );
        progress += progressPerOperation;
        this.updateProgress(progress);
      }

      this.updateProgress(100);
      this.updateStatus("GraphQL benchmark completed!");
      this.showRateLimitInfo();
      this.showGraphQLPayloads();
      this.showSummary();
    } catch (error) {
      console.error("Benchmark error:", error);
      this.updateStatus(`Error: ${error.message}`);
    }
  }

  initializeResultsTable(config) {
    let tableRows = "";

    if (config.createCount > 0) {
      tableRows += `
        <tr id="create-row">
          <td>Product Creation</td>
          <td><span class="status-pending">Pending</span></td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
        </tr>
      `;
    }

    if (config.updateCount > 0) {
      tableRows += `
        <tr id="update-row">
          <td>Product Updates</td>
          <td><span class="status-pending">Pending</span></td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
        </tr>
      `;
    }

    if (config.deleteCount > 0) {
      tableRows += `
        <tr id="delete-row">
          <td>Product Deletion</td>
          <td><span class="status-pending">Pending</span></td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
        </tr>
      `;
    }

    this.resultsBody.innerHTML = tableRows;
  }

  async benchmarkProductCreation(storeUrl, accessToken, count, config) {
    this.updateStatus(
      `Testing GraphQL product creation performance (Count: ${count})...`
    );

    try {
      const response = await fetch("/api/benchmark/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storeUrl,
          accessToken,
          count,
          batchSize: config.batchSize || 10,
          delayBetweenBatches: config.delayBetweenBatches || 100,
        }),
      });

      const result = await response.json();
      this.updateResultRow("create-row", result);
    } catch (error) {
      this.updateResultRow("create-row", {
        status: "error",
        responseTime: "-",
        rateLimit: { current: 0, limit: 1000, remaining: 1000 },
        cost: { total: 0, average: 0, perSecond: 0, productsPerSecond: 0 },
        details: error.message,
      });
    }
  }

  async benchmarkProductUpdates(storeUrl, accessToken, count, config) {
    this.updateStatus(
      `Testing GraphQL product update performance (Count: ${count})...`
    );

    try {
      const response = await fetch("/api/benchmark/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storeUrl,
          accessToken,
          count,
          batchSize: config.batchSize || 10,
          delayBetweenBatches: config.delayBetweenBatches || 100,
        }),
      });

      const result = await response.json();
      this.updateResultRow("update-row", result);
    } catch (error) {
      this.updateResultRow("update-row", {
        status: "error",
        responseTime: "-",
        rateLimit: { current: 0, limit: 1000, remaining: 1000 },
        cost: { total: 0, average: 0, perSecond: 0, productsPerSecond: 0 },
        details: error.message,
      });
    }
  }

  async benchmarkProductDeletion(storeUrl, accessToken, count, config) {
    this.updateStatus(
      `Testing GraphQL product deletion performance (Count: ${count})...`
    );

    try {
      const response = await fetch("/api/benchmark/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storeUrl,
          accessToken,
          count,
          batchSize: config.batchSize || 10,
          delayBetweenBatches: config.delayBetweenBatches || 100,
        }),
      });

      const result = await response.json();
      this.updateResultRow("delete-row", result);
    } catch (error) {
      this.updateResultRow("delete-row", {
        status: "error",
        responseTime: "-",
        rateLimit: { current: 0, limit: 1000, remaining: 1000 },
        cost: { total: 0, average: 0, perSecond: 0, productsPerSecond: 0 },
        details: error.message,
      });
    }
  }

  updateResultRow(rowId, result) {
    const row = document.getElementById(rowId);
    if (!row) return;

    const statusCell = row.querySelector("td:nth-child(2) span");
    const responseTimeCell = row.querySelector("td:nth-child(3)");
    const rateLimitCell = row.querySelector("td:nth-child(4)");
    const costCell = row.querySelector("td:nth-child(5)");
    const productsPerSecondCell = row.querySelector("td:nth-child(6)");
    const detailsCell = row.querySelector("td:nth-child(7)");

    // Update status
    statusCell.className = `status-${result.status}`;
    statusCell.textContent =
      result.status === "success"
        ? "Completed"
        : result.status === "error"
        ? "Failed"
        : "Pending";

    // Update other cells
    responseTimeCell.textContent = result.responseTime || "-";

    // Rate limit display
    if (result.rateLimit && typeof result.rateLimit === "object") {
      rateLimitCell.textContent = `${result.rateLimit.current || 0}/${
        result.rateLimit.limit || 1000
      }`;
    } else {
      rateLimitCell.textContent = result.rateLimit || "-";
    }

    // Cost display
    if (result.cost && typeof result.cost === "object") {
      costCell.textContent = `${result.cost.average || 0} pts`;
      productsPerSecondCell.textContent = result.cost.productsPerSecond || "-";
    } else {
      costCell.textContent = "-";
      productsPerSecondCell.textContent = "-";
    }

    detailsCell.textContent = result.details || "-";
  }

  updateStatus(message) {
    this.status.textContent = message;
  }

  updateProgress(percentage) {
    this.progressFill.style.width = `${percentage}%`;
  }

  showRateLimitInfo() {
    // Calculate aggregate rate limit info from all results
    const rows = this.resultsBody.querySelectorAll("tr");
    let totalCost = 0;
    let maxProductsPerSecond = 0;
    let currentUsage = 0;
    let limit = 1000;

    rows.forEach((row) => {
      const costText = row.querySelector("td:nth-child(5)").textContent;
      const productsPerSecondText =
        row.querySelector("td:nth-child(6)").textContent;
      const rateLimitText = row.querySelector("td:nth-child(4)").textContent;

      if (costText !== "-") {
        const cost = parseFloat(costText);
        if (!isNaN(cost)) totalCost += cost;
      }

      if (productsPerSecondText !== "-") {
        const pps = parseFloat(productsPerSecondText);
        if (!isNaN(pps) && pps > maxProductsPerSecond) {
          maxProductsPerSecond = pps;
        }
      }

      if (rateLimitText !== "-") {
        const [current, lim] = rateLimitText.split("/").map(Number);
        if (!isNaN(current)) currentUsage = Math.max(currentUsage, current);
        if (!isNaN(lim)) limit = lim;
      }
    });

    // Update rate limit display
    this.currentUsage.textContent = currentUsage;
    this.remainingCalls.textContent = limit - currentUsage;
    this.totalCost.textContent = totalCost;
    this.maxProductsPerSecond.textContent = maxProductsPerSecond.toFixed(2);

    this.rateLimitInfo.style.display = "block";
  }

  showGraphQLPayloads() {
    this.graphqlPayloads.style.display = "block";
  }

  async testGraphQLConnection() {
    console.log("🔍 testGraphQLConnection called");

    const storeUrl = document.getElementById("storeUrl").value;
    const accessToken = document.getElementById("accessToken").value;

    if (!storeUrl || !accessToken) {
      alert("Please enter store URL and access token first");
      return;
    }

    try {
      console.log("🔍 Making test GraphQL connection request...");
      const response = await fetch("/api/test-graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeUrl, accessToken }),
      });

      const result = await response.json();
      console.log("🔍 Test result:", result);
      this.showTestResults("GraphQL Connection Test", result);
    } catch (error) {
      console.error("🔍 Test error:", error);
      this.showTestResults("GraphQL Connection Test", { error: error.message });
    }
  }

  async testSchemaInfo() {
    const storeUrl = document.getElementById("storeUrl").value;
    const accessToken = document.getElementById("accessToken").value;

    if (!storeUrl || !accessToken) {
      alert("Please enter store URL and access token first");
      return;
    }

    try {
      const response = await fetch("/api/schema-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeUrl, accessToken }),
      });

      const result = await response.json();
      this.showTestResults("Schema Information", result);
    } catch (error) {
      this.showTestResults("Schema Information", { error: error.message });
    }
  }

  async testProductCreation() {
    const storeUrl = document.getElementById("storeUrl").value;
    const accessToken = document.getElementById("accessToken").value;

    if (!storeUrl || !accessToken) {
      alert("Please enter store URL and access token first");
      return;
    }

    try {
      const response = await fetch("/api/test-product-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeUrl, accessToken }),
      });

      const result = await response.json();
      this.showTestResults("Product Creation Test", result);
    } catch (error) {
      this.showTestResults("Product Creation Test", { error: error.message });
    }
  }

  showTestResults(title, data) {
    console.log("🔍 showTestResults called with:", title, data);

    const testResults = document.getElementById("testResults");
    const testOutput = document.getElementById("testOutput");

    if (!testResults || !testOutput) {
      console.error("🔍 Test results elements not found!");
      return;
    }

    testOutput.textContent = `${title}:\n${JSON.stringify(data, null, 2)}`;
    testResults.style.display = "block";
    console.log("🔍 Test results displayed successfully");
  }

  showSummary() {
    console.log(
      "🔍 showSummary called - this should only happen after main benchmark"
    );

    try {
      // Check if results table exists and has rows
      if (!this.resultsBody || !this.resultsBody.querySelectorAll) {
        console.warn("Results table not ready yet");
        return;
      }

      const rows = this.resultsBody.querySelectorAll("tr");
      let totalTime = 0;
      let successCount = 0;
      let errorCount = 0;
      let totalCost = 0;

      if (rows.length === 0) {
        // No results yet, show default summary
        this.summaryStats.innerHTML = `
          <div class="stat-card">
            <div class="stat-value">📊</div>
            <div class="stat-label">Benchmark Complete</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">✅</div>
            <div class="stat-label">Ready for Analysis</div>
          </div>
        `;
        this.summary.style.display = "block";
        return;
      }

      rows.forEach((row) => {
        try {
          const statusElement = row.querySelector("td:nth-child(2) span");
          const responseTimeElement = row.querySelector("td:nth-child(3)");
          const costElement = row.querySelector("td:nth-child(5)");

          if (statusElement && responseTimeElement && costElement) {
            const status = statusElement.textContent;
            const responseTime = responseTimeElement.textContent;
            const cost = costElement.textContent;

            if (status === "Completed" || status === "Success") {
              successCount++;
              if (responseTime !== "-" && responseTime !== "") {
                const timeValue = parseFloat(responseTime);
                if (!isNaN(timeValue)) totalTime += timeValue;
              }
              if (cost !== "-" && cost !== "") {
                const costValue = parseFloat(cost);
                if (!isNaN(costValue)) totalCost += costValue;
              }
            } else if (status === "Failed" || status === "Error") {
              errorCount++;
            }
          }
        } catch (rowError) {
          console.warn("Error processing row:", rowError);
        }
      });

      this.summaryStats.innerHTML = `
        <div class="stat-card">
          <div class="stat-value">${successCount}</div>
          <div class="stat-label">Successful Tests</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${errorCount}</div>
          <div class="stat-label">Failed Tests</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalTime.toFixed(2)}s</div>
          <div class="stat-label">Total Response Time</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalCost.toFixed(0)}</div>
          <div class="stat-label">Total Query Cost</div>
        </div>
      `;

      this.summary.style.display = "block";
    } catch (error) {
      console.error("Error in showSummary:", error);
      // Fallback to simple summary
      this.summaryStats.innerHTML = `
        <div class="stat-card">
          <div class="stat-value">📊</div>
          <div class="stat-label">Benchmark Complete</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">✅</div>
          <div class="stat-label">Ready for Analysis</div>
        </div>
      `;
      this.summary.style.display = "block";
    }
  }

  async downloadAuditLog(format) {
    try {
      const response = await fetch(`/api/audit-log/${format}`);
      if (!response.ok) {
        throw new Error(`Failed to download ${format} log`);
      }

      if (format === "json") {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `benchmarkify-audit-${Date.now()}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        const text = await response.text();
        const blob = new Blob([text], { type: "text/plain" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `benchmarkify-audit-${Date.now()}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }

      console.log(`${format.toUpperCase()} audit log downloaded successfully`);
    } catch (error) {
      console.error(`Error downloading ${format} audit log:`, error);
      alert(`Failed to download ${format} audit log: ${error.message}`);
    }
  }

  async viewAuditSummary() {
    try {
      const response = await fetch("/api/audit-log/summary");
      if (!response.ok) {
        throw new Error("Failed to fetch audit summary");
      }

      const data = await response.json();
      const auditSummary = document.getElementById("auditSummary");
      const auditSummaryContent = document.getElementById(
        "auditSummaryContent"
      );

      auditSummaryContent.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
          <div style="text-align: center; padding: 10px; background: #f0f9ff; border-radius: 6px;">
            <div style="font-size: 1.5rem; font-weight: bold; color: #0ea5e9;">${
              data.summary.totalOperations
            }</div>
            <div style="font-size: 0.8rem; color: #0369a1;">Total Operations</div>
          </div>
          <div style="text-align: center; padding: 10px; background: #ecfdf5; border-radius: 6px;">
            <div style="font-size: 1.5rem; font-weight: bold; color: #059669;">${
              data.summary.successfulOperations
            }</div>
            <div style="font-size: 0.8rem; color: #047857;">Successful</div>
          </div>
          <div style="text-align: center; padding: 10px; background: #fef3c7; border-radius: 6px;">
            <div style="font-size: 1.5rem; font-weight: bold; color: #dc2626;">${
              data.summary.failedOperations
            }</div>
            <div style="font-size: 0.8rem; color: #0c4a6e;">Failed</div>
          </div>
          <div style="text-align: center; padding: 10px; background: #fef3c7; border-radius: 6px;">
            <div style="font-size: 1.5rem; font-weight: bold; color: #d97706;">${
              data.summary.totalCost
            }</div>
            <div style="font-size: 0.8rem; color: #b45309;">Total Cost</div>
          </div>
        </div>
        <div style="margin-top: 20px; padding: 15px; background: #f8fafc; border-radius: 6px;">
          <h6 style="margin-top: 0; color: #475569;">Performance Metrics</h6>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; font-size: 0.9rem;">
            <div><strong>Average Response Time:</strong> ${data.summary.averageResponseTime.toFixed(
              2
            )}ms</div>
            <div><strong>Peak Rate Limit Usage:</strong> ${data.summary.peakRateLimitUsage.toFixed(
              1
            )}%</div>
            <div><strong>Recommended Batch Size:</strong> ${
              data.summary.recommendedBatchSize
            }</div>
            <div><strong>Recommended Delay:</strong> ${
              data.summary.recommendedDelay
            }ms</div>
          </div>
        </div>
        <div style="margin-top: 15px; padding: 10px; background: #f0f9ff; border-radius: 6px; border-left: 3px solid #0ea5e9;">
          <p style="margin: 0; font-size: 0.85rem; color: #0c4a6e;">
            <strong>💡 Rate Limit Insights:</strong> Based on your benchmark performance, the system recommends adjusting batch size and delay for optimal API usage.
          </p>
        </div>
      `;

      auditSummary.style.display = "block";
    } catch (error) {
      console.error("Error viewing audit summary:", error);
      alert(`Failed to view audit summary: ${error.message}`);
    }
  }
}

// Initialize the app when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new Benchmarkify();
});
