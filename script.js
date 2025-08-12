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

    // New elements for performance projections and rate limit explanation
    this.performanceProjections = document.getElementById(
      "performanceProjections"
    );
    this.rateLimitExplanation = document.getElementById("rateLimitExplanation");
    this.rateLimitExplanationContent = document.getElementById(
      "rateLimitExplanationContent"
    );

    // Credential storage elements
    this.credentialStatus = document.getElementById("credentialStatus");
    this.credentialMessage = document.getElementById("credentialMessage");

    // Performance projection elements
    this.projection1000 = document.getElementById("projection1000");
    this.projection100k = document.getElementById("projection100k");
    this.projection1m = document.getElementById("projection1m");
    this.projection10m = document.getElementById("projection10m");

    this.bindEvents();
    this.initializeGraphQLQueries();
    this.loadStoredCredentials();
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
    document
      .getElementById("analyzeRateLimits")
      .addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("🔍 Analyze Rate Limits button clicked");
        this.analyzeRateLimits();
      });

    // Credential storage events
    document
      .getElementById("storeCredentials")
      .addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.storeCredentials();
      });
    document
      .getElementById("loadStoredCredentials")
      .addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.loadStoredCredentials();
      });
    document
      .getElementById("clearStoredCredentials")
      .addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.clearStoredCredentials();
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

    // Dynamic batch size and delay based on rate limits (will be calculated by backend)
    const batchSize = 10; // Default, will be overridden by backend
    const delayBetweenBatches = 100; // Default, will be overridden by backend

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
      operations.push(`⚡ Dynamic configuration based on rate limits`);
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
    // Dynamic configuration will be set by backend based on rate limits
    const batchSize = 10; // Default, will be overridden
    const delayBetweenBatches = 100; // Default, will be overridden

    // Validate configuration for enabled operations
    if (enableCreate && (createCount < 1 || createCount > 1000000)) {
      alert("Please enter a valid number of products to create (1-1,000,000)");
      return;
    }
    if (enableUpdate && (updateCount < 1 || updateCount > 1000000)) {
      alert("Please enter a valid number of products to update (1-1,000,000)");
      return;
    }
    if (enableDelete && (deleteCount < 1 || deleteCount > 1000000)) {
      alert("Please enter a valid number of products to delete (1-1,000,000)");
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
      delayBetweenOperations: 3, // 3 second delay between operations
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

        // Add delay after creation to ensure products are indexed
        if (config.deleteCount > 0 || config.updateCount > 0) {
          const delaySeconds = config.delayBetweenOperations || 8; // Increased from 3 to 8 seconds
          console.log(
            `⏳ Waiting ${delaySeconds} seconds for products to be indexed...`
          );
          this.updateStatus(
            `Waiting ${delaySeconds} seconds for products to be indexed...`
          );
          await new Promise((resolve) =>
            setTimeout(resolve, delaySeconds * 1000)
          );
        }
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

        // Add delay after updates if delete is next
        if (config.deleteCount > 0) {
          const delaySeconds = config.delayBetweenOperations || 2;
          console.log(
            `⏳ Waiting ${delaySeconds} seconds for updates to be indexed...`
          );
          this.updateStatus(
            `Waiting ${delaySeconds} seconds for updates to be indexed...`
          );
          await new Promise((resolve) =>
            setTimeout(resolve, delaySeconds * 1000)
          );
        }
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
      this.showDetailedError("Product Creation Failed", {
        message: error.message,
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
      this.showDetailedError("Product Update Failed", {
        message: error.message,
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
        error,
        rateLimit: { current: 0, limit: 1000, remaining: 1000 },
        cost: { total: 0, average: 0, perSecond: 0, productsPerSecond: 0 },
        details: error.message,
      });
      this.showDetailedError("Product Deletion Failed", {
        message: error.message,
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

    // Store performance projections for later display
    if (result.performanceProjections) {
      this.storePerformanceProjections(result.performanceProjections);
    }
  }

  storePerformanceProjections(projections) {
    // Store the latest projections for display
    this.latestProjections = projections;
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

    // Use the actual calculated products per second from rate limit analysis
    // If we have rate limit data from analysis, use that; otherwise fall back to benchmark results
    if (this.latestRateLimitData && this.latestRateLimitData.analysis) {
      this.maxProductsPerSecond.textContent =
        this.latestRateLimitData.analysis.productsPerSecond.toFixed(2);
    } else {
      this.maxProductsPerSecond.textContent = maxProductsPerSecond.toFixed(2);
    }

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

      // Show performance projections if available
      if (this.latestProjections) {
        this.showPerformanceProjections(this.latestProjections);
      }
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

  // Credential storage methods
  async storeCredentials() {
    const storeUrl = document.getElementById("storeUrl").value;
    const accessToken = document.getElementById("accessToken").value;

    if (!storeUrl || !accessToken) {
      this.showCredentialMessage(
        "Please enter store URL and access token first",
        "error"
      );
      return;
    }

    try {
      const response = await fetch("/api/store-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeUrl, accessToken }),
      });

      const result = await response.json();

      if (result.status === "success") {
        // Store in localStorage as backup
        localStorage.setItem(
          "benchmarkify_credentials",
          JSON.stringify({
            storeUrl,
            accessToken,
            sessionId: result.sessionId,
            timestamp: Date.now(),
          })
        );

        this.showCredentialMessage(
          `Credentials stored successfully! Session ID: ${result.sessionId}`,
          "success"
        );
      } else {
        this.showCredentialMessage(
          `Failed to store credentials: ${result.message}`,
          "error"
        );
      }
    } catch (error) {
      this.showCredentialMessage(
        `Error storing credentials: ${error.message}`,
        "error"
      );
    }
  }

  loadStoredCredentials() {
    try {
      // Try localStorage first
      const stored = localStorage.getItem("benchmarkify_credentials");
      if (stored) {
        const credentials = JSON.parse(stored);

        // Check if credentials are expired (24 hours)
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        if (credentials.timestamp > oneDayAgo) {
          document.getElementById("storeUrl").value = credentials.storeUrl;
          document.getElementById("accessToken").value =
            credentials.accessToken;
          this.showCredentialMessage(
            "Credentials loaded from local storage",
            "success"
          );
          return;
        } else {
          localStorage.removeItem("benchmarkify_credentials");
        }

        // Try server-side storage if we have a sessionId
        if (credentials.sessionId) {
          this.loadCredentialsFromServer(credentials.sessionId);
          return;
        }
      }

      this.showCredentialMessage("No stored credentials found", "info");
    } catch (error) {
      this.showCredentialMessage(
        `Error loading credentials: ${error.message}`,
        "error"
      );
    }
  }

  async loadCredentialsFromServer(sessionId) {
    try {
      const response = await fetch(`/api/stored-credentials/${sessionId}`);
      const result = await response.json();

      if (result.status === "success") {
        document.getElementById("storeUrl").value = result.storeUrl;
        this.showCredentialMessage("Credentials loaded from server", "success");
      } else {
        this.showCredentialMessage(
          `Failed to load credentials: ${result.error}`,
          "error"
        );
      }
    } catch (error) {
      this.showCredentialMessage(
        `Error loading credentials from server: ${error.message}`,
        "error"
      );
    }
  }

  clearStoredCredentials() {
    localStorage.removeItem("benchmarkify_credentials");
    document.getElementById("storeUrl").value = "";
    document.getElementById("accessToken").value = "";
    this.showCredentialMessage("Stored credentials cleared", "success");
  }

  showCredentialMessage(message, type) {
    this.credentialMessage.textContent = message;
    this.credentialStatus.style.display = "block";

    // Update styling based on message type
    this.credentialStatus.className = "";
    this.credentialStatus.classList.add("credential-status");

    if (type === "success") {
      this.credentialStatus.style.background = "#ecfdf5";
      this.credentialStatus.style.border = "1px solid #10b981";
      this.credentialMessage.style.color = "#065f46";
    } else if (type === "error") {
      this.credentialStatus.style.background = "#fef2f2";
      this.credentialStatus.style.border = "1px solid #ef4444";
      this.credentialMessage.style.color = "#991b1b";
    } else {
      this.credentialStatus.style.background = "#f0f9ff";
      this.credentialStatus.style.border = "1px solid #0ea5e9";
      this.credentialMessage.style.color = "#0c4a6e";
    }
  }

  // Rate limit analysis method
  async analyzeRateLimits() {
    const storeUrl = document.getElementById("storeUrl").value;
    const accessToken = document.getElementById("accessToken").value;

    if (!storeUrl || !accessToken) {
      alert("Please enter store URL and access token first");
      return;
    }

    try {
      const response = await fetch("/api/rate-limit-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeUrl, accessToken }),
      });

      const result = await response.json();
      this.showRateLimitAnalysis(result);
    } catch (error) {
      alert(`Error analyzing rate limits: ${error.message}`);
    }
  }

  showRateLimitAnalysis(data) {
    if (data.status === "success") {
      // Store the rate limit data for use in other parts of the UI
      this.latestRateLimitData = data;

      this.rateLimitExplanationContent.innerHTML = `
        <div style="margin-bottom: 20px;">
          <h4 style="color: #065f46; margin-bottom: 10px;">${
            data.explanation.title
          }</h4>
          <p style="margin-bottom: 10px;">${data.explanation.description}</p>
          <p style="margin-bottom: 15px;"><strong>Practical Meaning:</strong> ${
            data.explanation.practicalMeaning
          }</p>
        </div>
        
        <div style="margin-bottom: 20px; padding: 15px; background: white; border-radius: 8px; border: 1px solid #81e6d9;">
          <h5 style="margin-top: 0; color: #065f46;">📊 Current Rate Limit Status</h5>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; font-size: 0.9rem;">
            <div><strong>Plan Type:</strong> <span class="plan-type">${
              data.planType || "Standard Shopify"
            }</span></div>
            <div><strong>Leak Rate:</strong> ${
              data.rateLimit.leakRate
            } points/second</div>
            <div><strong>Bucket Capacity:</strong> ${
              data.rateLimit.bucketCapacity
            } points</div>
            <div><strong>Current Usage:</strong> ${
              data.rateLimit.current
            } points</div>
            <div><strong>Available:</strong> ${
              data.rateLimit.remaining
            } points</div>
            <div><strong>Restore Rate:</strong> ${
              data.rateLimit.restoreRate
                ? `${data.rateLimit.restoreRate} points/sec`
                : "Continuous (leaky bucket)"
            }</div>
          </div>
        </div>

        <div style="margin-bottom: 20px; padding: 15px; background: white; border-radius: 8px; border: 1px solid #81e6d9;">
          <h5 style="margin-top: 0; color: #065f46;">⚡ Performance Analysis</h5>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; font-size: 0.9rem;">
            <div><strong>Products/Second:</strong> ${
              data.analysis.productsPerSecond
            }</div>
            <div><strong>Products/Minute:</strong> ${
              data.analysis.productsPerMinute
            }</div>
            <div><strong>Products/Hour:</strong> ${
              data.analysis.productsPerHour
            }</div>
            <div><strong>Cost per Product:</strong> ${
              data.analysis.costPerProduct
            } points</div>
            <div><strong>Max Products/Batch:</strong> ${
              data.analysis.maxProductsPerBatch
            }</div>
            <div><strong>Bucket Capacity:</strong> ${
              data.rateLimit.bucketCapacity
            } points</div>
            <div><strong>Restore Rate:</strong> ${
              data.rateLimit.restoreRate
                ? `${data.rateLimit.restoreRate} points/sec`
                : "Continuous"
            }</div>
          </div>
        </div>

        <div style="margin-bottom: 20px; padding: 15px; background: white; border-radius: 8px; border: 1px solid #81e6d9;">
          <h5 style="margin-top: 0; color: #065f46;">🚀 Time Estimates for Large Operations</h5>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; font-size: 0.9rem;">
            <div><strong>1,000 Products:</strong> ${
              data.projections.products1000.timeDisplay
            } ${data.projections.products1000.timeUnit} (${
        data.projections.products1000.batches
      } batches of ${data.projections.products1000.batchSize})</div>
            <div><strong>100,000 Products:</strong> ${
              data.projections.products100k.timeDisplay
            } ${data.projections.products100k.timeUnit} (${
        data.projections.products100k.batches
      } batches of ${data.projections.products100k.batchSize})</div>
            <div><strong>1,000,000 Products:</strong> ${
              data.projections.products1m.timeDisplay
            } ${data.projections.products1m.timeUnit} (${
        data.projections.products1m.batches
      } batches of ${data.projections.products1m.batchSize})</div>
            <div><strong>10,000,000 Products:</strong> ${
              data.projections.products10m.timeDisplay
            } ${data.projections.products10m.timeUnit} (${
        data.projections.products10m.batches
      } batches of ${data.projections.products10m.batchSize})</div>
          </div>
        </div>

        <div style="margin-bottom: 20px; padding: 15px; background: #f0f9ff; border-radius: 8px; border-left: 4px solid #0ea5e9;">
          <h5 style="margin-top: 0; color: #0c4a6e;">📊 Time Calculation Breakdown</h5>
          <div style="font-size: 0.9rem; color: #0c4a6e;">
            <p style="margin-bottom: 10px;"><strong>How time is calculated:</strong></p>
            <ul style="margin: 0; padding-left: 20px;">
              <li><strong>Processing Time:</strong> Total points ÷ Leak rate = Pure API processing time</li>
              <li><strong>Batch Delays:</strong> (Number of batches - 1) × Delay between batches</li>
              <li><strong>Total Time:</strong> Processing time + Batch delays</li>
            </ul>
            <p style="margin-top: 10px; font-size: 0.85rem;">
              <strong>Example for 100,000 products:</strong> 1,000,000 points ÷ 2,000 points/sec = 500 seconds processing + batch delays = more accurate total time
            </p>
          </div>
        </div>

        <div style="margin-bottom: 20px; padding: 15px; background: white; border-radius: 8px; border: 1px solid #81e6d9;">
          <h5 style="margin-top: 0; color: #065f46;">🔧 Current Configuration (Aggressive Mode)</h5>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; font-size: 0.9rem;">
            <div><strong>Leak Rate:</strong> ${
              data.explanation.timeCalculationDetails?.leakRate || "N/A"
            } points/second</div>
            <div><strong>Cost per Product:</strong> ${
              data.explanation.timeCalculationDetails?.costPerProduct || "N/A"
            } points</div>
            <div><strong>Products per Second:</strong> ${
              data.explanation.timeCalculationDetails?.productsPerSecond ||
              "N/A"
            }</div>
            <div><strong>Optimization Mode:</strong> <span style="color: #dc2626; font-weight: bold;">${
              data.explanation.timeCalculationDetails?.optimizationMode || "N/A"
            }</span></div>
            <div><strong>Optimal Batch Size:</strong> ${
              data.explanation.timeCalculationDetails?.batchSize || "N/A"
            } products</div>
            <div><strong>Delay Between Batches:</strong> ${
              data.explanation.timeCalculationDetails?.delayBetweenBatches ||
              "N/A"
            } ms</div>
          </div>
        </div>

        <div style="margin-bottom: 20px; padding: 15px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
          <h5 style="margin-top: 0; color: #92400e;">⚡ Optimization Strategies</h5>
          <div style="font-size: 0.9rem; color: #92400e;">
            <p style="margin-bottom: 10px;"><strong>Current Mode: Aggressive</strong></p>
            <ul style="margin: 0; padding-left: 20px;">
              <li><strong>Aggressive:</strong> Maximum throughput (90% bucket usage, 2% safety margin)</li>
              <li><strong>Balanced:</strong> Good throughput with safety (70% bucket usage, 10% safety margin)</li>
              <li><strong>Conservative:</strong> Safe and steady (50% bucket usage, 20% safety margin)</li>
            </ul>
            <p style="margin-top: 10px; font-size: 0.85rem;">
              <strong>💡 Tip:</strong> Aggressive mode maximizes throughput but may occasionally hit rate limits. The system will automatically retry with exponential backoff if needed.
            </p>
          </div>
        </div>

        <div style="padding: 15px; background: #f0f9ff; border-radius: 8px; border-left: 4px solid #0ea5e9;">
          <h5 style="margin-top: 0; color: #0c4a6e;">💡 Recommendations</h5>
          <ul style="margin: 0; padding-left: 20px; color: #0c4a6e;">
            ${data.explanation.recommendations
              .map((rec) => `<li>${rec}</li>`)
              .join("")}
          </ul>
        </div>
        
        <div style="margin-top: 15px; padding: 15px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
          <h5 style="margin-top: 0; color: #92400e;">🔍 Cost Analysis Tips</h5>
          <p style="margin: 0; color: #92400e; font-size: 0.9rem;">
            <strong>Pro Tip:</strong> Add the header <code>Shopify-GraphQL-Cost-Debug=1</code> to your GraphQL requests to get detailed cost breakdowns. This helps optimize queries by showing exactly how much each field costs.
          </p>
        </div>
            `;

      this.rateLimitExplanation.style.display = "block";

      // Update the rate limit info display with the actual calculated values
      this.updateRateLimitDisplay(data);
    } else {
      alert(`Rate limit analysis failed: ${data.message}`);
    }
  }

  // Update rate limit display with actual calculated values
  updateRateLimitDisplay(data) {
    if (data.analysis && data.analysis.productsPerSecond) {
      this.maxProductsPerSecond.textContent =
        data.analysis.productsPerSecond.toFixed(2);

      // Also update other rate limit info if available
      if (data.rateLimit) {
        this.currentUsage.textContent = data.rateLimit.current || 0;
        this.remainingCalls.textContent = data.rateLimit.remaining || 0;
      }

      // Show the rate limit info section
      this.rateLimitInfo.style.display = "block";
    }
  }

  // Helper function to show more informative error messages
  showDetailedError(title, data) {
    if (data.details && data.details.includes("fallback strategies")) {
      const message = `${title}\n\n${data.details}\n\n💡 Tip: Try creating some products first, or the system will automatically find existing products to work with.`;
      alert(message);
    } else {
      alert(`${title}: ${data.details || data.message || "Unknown error"}`);
    }
  }

  showPerformanceProjections(projections) {
    if (!projections) return;

    // Use the new timeDisplay and timeUnit from backend if available
    const formatTime = (projection) => {
      if (projection.timeDisplay && projection.timeUnit) {
        return `${projection.timeDisplay} ${projection.timeUnit}`;
      }
      // Fallback to old format if new fields aren't available
      const seconds = projection.time || 0;
      if (seconds < 60) return `${seconds.toFixed(1)} seconds`;
      if (seconds < 3600) return `${(seconds / 60).toFixed(1)} minutes`;
      return `${(seconds / 3600).toFixed(1)} hours`;
    };

    // Update projection cards
    if (this.projection1000) {
      this.projection1000.innerHTML = `
        <div><strong>Time:</strong> ${formatTime(
          projections.products1000
        )}</div>
        <div><strong>Cost:</strong> ${projections.products1000.cost.toFixed(
          0
        )} points</div>
      `;
    }

    if (this.projection100k) {
      this.projection100k.innerHTML = `
        <div><strong>Time:</strong> ${formatTime(
          projections.products100k
        )}</div>
        <div><strong>Cost:</strong> ${projections.products100k.cost.toFixed(
          0
        )} points</div>
      `;
    }

    if (this.projection1m) {
      this.projection1m.innerHTML = `
        <div><strong>Time:</strong> ${formatTime(projections.products1m)}</div>
        <div><strong>Cost:</strong> ${projections.products1m.cost.toFixed(
          0
        )} points</div>
      `;
    }

    if (this.projection10m) {
      this.projection10m.innerHTML = `
        <div><strong>Time:</strong> ${formatTime(projections.products10m)}</div>
        <div><strong>Cost:</strong> ${projections.products10m.cost.toFixed(
          0
        )} points</div>
      `;
    }

    this.performanceProjections.style.display = "block";
  }
}

// Initialize the app when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  const app = new Benchmarkify();

  // Auto-trigger rate limit analysis when credentials are loaded
  const autoAnalyzeRateLimits = () => {
    const storeUrl = document.getElementById("storeUrl").value;
    const accessToken = document.getElementById("accessToken").value;

    if (storeUrl && accessToken) {
      // Small delay to ensure the app is fully initialized
      setTimeout(() => {
        app.analyzeRateLimits();
      }, 1000);
    }
  };

  // Check if credentials are already filled (from stored credentials)
  if (
    document.getElementById("storeUrl").value &&
    document.getElementById("accessToken").value
  ) {
    autoAnalyzeRateLimits();
  }

  // Also listen for credential changes
  document
    .getElementById("storeUrl")
    .addEventListener("input", autoAnalyzeRateLimits);
  document
    .getElementById("accessToken")
    .addEventListener("input", autoAnalyzeRateLimits);
});
