const express = require("express");
const cors = require("cors");
const { GraphQLClient } = require("graphql-request");
const { faker } = require("@faker-js/faker");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("."));

// Rate limiting tracking
const rateLimitStore = new Map();

// Audit logging system
const auditLog = {
  sessionId: null,
  startTime: null,
  endTime: null,
  operations: [],
  rateLimitHistory: [],
  summary: {
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    totalCost: 0,
    averageResponseTime: 0,
    peakRateLimitUsage: 0,
    recommendedBatchSize: 10,
    recommendedDelay: 100,
  },
};

// Generate unique benchmark tag for this session
function generateBenchmarkTag() {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  return `benchmarkify-${timestamp}-${randomId}`;
}

// Store benchmark tag for this session
const SESSION_BENCHMARK_TAG = generateBenchmarkTag();
console.log(`🔒 Benchmark session tag: ${SESSION_BENCHMARK_TAG}`);

// Initialize audit log for this session
auditLog.sessionId = SESSION_BENCHMARK_TAG;
auditLog.startTime = new Date().toISOString();
console.log(`📊 Audit log initialized for session: ${SESSION_BENCHMARK_TAG}`);

// Audit logging functions
function logOperation(operation) {
  auditLog.operations.push({
    timestamp: new Date().toISOString(),
    ...operation,
  });
}

function logRateLimitStatus(
  storeUrl,
  currentUsage,
  limit,
  remaining,
  resetTime
) {
  auditLog.rateLimitHistory.push({
    timestamp: new Date().toISOString(),
    storeUrl,
    currentUsage,
    limit,
    remaining,
    resetTime,
    usagePercentage: (currentUsage / limit) * 100,
  });
}

function updateAuditSummary() {
  const operations = auditLog.operations;
  const rateLimitHistory = auditLog.rateLimitHistory;

  auditLog.summary.totalOperations = operations.length;
  auditLog.summary.successfulOperations = operations.filter(
    (op) => op.success
  ).length;
  auditLog.summary.failedOperations = operations.filter(
    (op) => !op.success
  ).length;
  auditLog.summary.totalCost = operations.reduce(
    (sum, op) => sum + (op.cost || 0),
    0
  );

  const responseTimes = operations
    .map((op) => op.responseTime)
    .filter((time) => time !== null);
  auditLog.summary.averageResponseTime =
    responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) /
        responseTimes.length
      : 0;

  auditLog.summary.peakRateLimitUsage =
    rateLimitHistory.length > 0
      ? Math.max(...rateLimitHistory.map((rl) => rl.usagePercentage))
      : 0;

  // Calculate recommended settings based on rate limit performance
  if (rateLimitHistory.length > 0) {
    const recentHistory = rateLimitHistory.slice(-10); // Last 10 rate limit checks
    const avgUsage =
      recentHistory.reduce((sum, rl) => sum + rl.usagePercentage, 0) /
      recentHistory.length;

    if (avgUsage > 80) {
      // High usage - reduce batch size and increase delay
      auditLog.summary.recommendedBatchSize = Math.max(
        1,
        Math.floor(auditLog.summary.recommendedBatchSize * 0.7)
      );
      auditLog.summary.recommendedDelay = Math.min(
        5000,
        Math.floor(auditLog.summary.recommendedDelay * 1.5)
      );
    } else if (avgUsage < 40) {
      // Low usage - increase batch size and reduce delay
      auditLog.summary.recommendedBatchSize = Math.min(
        100,
        Math.floor(auditLog.summary.recommendedBatchSize * 1.3)
      );
      auditLog.summary.recommendedDelay = Math.max(
        50,
        Math.floor(auditLog.summary.recommendedDelay * 0.8)
      );
    }
  }
}

function finalizeAuditLog() {
  auditLog.endTime = new Date().toISOString();
  updateAuditSummary();
  console.log(
    `📊 Audit log finalized. Total operations: ${auditLog.summary.totalOperations}`
  );
}

// GraphQL queries with cost analysis
const GRAPHQL_QUERIES = {
  // Product creation - typically costs 10 points
  createProduct: `
    mutation productCreate($product: ProductCreateInput!) {
      productCreate(product: $product) {
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
    }
  `,

  // Product update - typically costs 10 points
  updateProduct: `
    mutation productUpdate($input: ProductInput!) {
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
    }
  `,

  // Product deletion - typically costs 10 points
  deleteProduct: `
    mutation productDelete($input: ProductDeleteInput!) {
      productDelete(input: $input) {
        deletedProductId
        userErrors {
          field
          message
        }
      }
    }
  `,

  // Get products for updates/deletions - typically costs 1 point per product
  getProducts: `
    query getProducts($first: Int!) {
      products(first: $first) {
        edges {
          node {
            id
            title
            handle
            createdAt
            tags
          }
        }
      }
    }
  `,
};

// Query costs (Shopify's standard costs)
const QUERY_COSTS = {
  createProduct: 10,
  updateProduct: 10,
  deleteProduct: 10,
  getProducts: 1,
};

// Helper function to generate random product data
function generateRandomProduct() {
  return {
    title: faker.commerce.productName(),
    descriptionHtml: faker.commerce.productDescription(),
    vendor: faker.company.name(),
    productType: faker.commerce.product(),
    tags: [
      ...faker.helpers.arrayElements(
        ["organic", "handmade", "sustainable", "local"],
        2
      ),
      SESSION_BENCHMARK_TAG, // Add benchmark tag for safe identification
    ],
    productOptions: [
      {
        name: "Title",
        values: [{ name: "Default Title" }],
      },
    ],
  };
}

// Helper function to create GraphQL client
function createGraphQLClient(storeUrl, accessToken) {
  const graphqlEndpoint = `${storeUrl}/admin/api/2025-07/graphql.json`;
  console.log(`Creating GraphQL client for endpoint: ${graphqlEndpoint}`);

  const client = new GraphQLClient(graphqlEndpoint, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });

  return client;
}

// Helper function to handle Shopify rate limits and extract costs
// Helper functions for audit logging
function extractProductId(response, operationName) {
  if (!response) return "N/A";

  switch (operationName) {
    case "createProduct":
      return response.productCreate?.product?.id || "N/A";
    case "updateProduct":
      return response.productUpdate?.product?.id || "N/A";
    case "deleteProduct":
      return response.productDelete?.deletedProductId || "N/A";
    default:
      return "N/A";
  }
}

function generateOperationSummary(operationName, response, success) {
  if (!success) return "Operation failed";

  switch (operationName) {
    case "createProduct":
      const createdProduct = response.productCreate?.product;
      return createdProduct
        ? `Created product: ${createdProduct.title}`
        : "Product created";
    case "updateProduct":
      const updatedProduct = response.productUpdate?.product;
      return updatedProduct
        ? `Updated product: ${updatedProduct.title}`
        : "Product updated";
    case "deleteProduct":
      return "Product deleted successfully";
    default:
      return "Operation completed";
  }
}

async function handleGraphQLRequest(
  client,
  query,
  variables,
  operationName,
  storeUrl = null
) {
  const startTime = Date.now();

  try {
    console.log(`Making GraphQL request: ${operationName}`);
    console.log(`Variables:`, JSON.stringify(variables, null, 2));

    const response = await client.request(query, variables);
    const responseTime = (Date.now() - startTime) / 1000;

    console.log(
      `GraphQL response for ${operationName}:`,
      JSON.stringify(response, null, 2)
    );

    // Extract rate limit info from response headers
    const rateLimitInfo = {
      current: 0,
      limit: 1000, // Default Shopify limit
      remaining: 1000,
      resetTime: null,
      cost: QUERY_COSTS[operationName] || 0,
    };

    // Log successful operation
    logOperation({
      action: operationName,
      success: true,
      responseTime: responseTime * 1000, // Convert to ms
      cost: rateLimitInfo.cost,
      productId: extractProductId(response, operationName),
      summary: generateOperationSummary(operationName, response, true),
      rateLimit: rateLimitInfo,
    });

    // Log rate limit status if storeUrl is provided
    if (storeUrl) {
      logRateLimitStatus(
        storeUrl,
        rateLimitInfo.current,
        rateLimitInfo.limit,
        rateLimitInfo.remaining,
        rateLimitInfo.resetTime
      );
    }

    return {
      success: true,
      responseTime,
      rateLimit: rateLimitInfo,
      data: response,
      cost: rateLimitInfo.cost,
    };
  } catch (error) {
    const responseTime = (Date.now() - startTime) / 1000;

    console.error(`GraphQL error for ${operationName}:`, error.message);
    if (error.response) {
      console.error(`Response status:`, error.response.status);
      console.error(`Response headers:`, error.response.headers);
      console.error(`Response data:`, error.response.data);
    }

    // Handle rate limiting
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers["retry-after"] || 60;
      console.log(`Rate limit exceeded. Waiting ${retryAfter}s...`);

      // Log rate limit hit
      logOperation({
        action: operationName,
        success: false,
        responseTime: responseTime * 1000,
        cost: QUERY_COSTS[operationName] || 0,
        productId: "N/A",
        summary: `Rate limit exceeded - waiting ${retryAfter}s`,
        error: "Rate limit exceeded",
      });

      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      return handleGraphQLRequest(
        client,
        query,
        variables,
        operationName,
        storeUrl
      );
    }

    // Extract rate limit info from error response if available
    let rateLimitInfo = {
      current: 0,
      limit: 1000,
      remaining: 1000,
      resetTime: null,
      cost: QUERY_COSTS[operationName] || 0,
    };

    if (error.response?.headers) {
      const headers = error.response.headers;
      const limitHeader = headers["x-shopify-shop-api-call-limit"];
      const costHeader = headers["x-shopify-graphql-query-cost"];

      if (limitHeader) {
        const [current, limit] = limitHeader.split("/").map(Number);
        rateLimitInfo = {
          current,
          limit,
          remaining: limit - current,
          resetTime: headers["x-shopify-shop-api-call-limit-reset"],
          cost: costHeader
            ? parseInt(costHeader)
            : QUERY_COSTS[operationName] || 0,
        };
      }
    }

    // Log failed operation
    logOperation({
      action: operationName,
      success: false,
      responseTime: responseTime * 1000,
      cost: rateLimitInfo.cost,
      productId: "N/A",
      summary: generateOperationSummary(operationName, null, false),
      error: error.message,
      rateLimit: rateLimitInfo,
    });

    // Log rate limit status if storeUrl is provided
    if (storeUrl) {
      logRateLimitStatus(
        storeUrl,
        rateLimitInfo.current,
        rateLimitInfo.limit,
        rateLimitInfo.remaining,
        rateLimitInfo.resetTime
      );
    }

    return {
      success: false,
      responseTime,
      rateLimit: rateLimitInfo,
      error: error.message,
      cost: rateLimitInfo.cost,
    };
  }
}

// Test GraphQL connection endpoint
app.post("/api/test-graphql", async (req, res) => {
  try {
    const { storeUrl, accessToken } = req.body;

    if (!storeUrl || !accessToken) {
      return res.status(400).json({
        error: "Missing store URL or access token",
      });
    }

    console.log("Testing GraphQL connection...");

    const client = createGraphQLClient(storeUrl, accessToken);

    // Test with a simple introspection query
    const testQuery = `
      query {
        shop {
          name
          id
        }
      }
    `;

    const result = await handleGraphQLRequest(
      client,
      testQuery,
      {},
      "testConnection"
    );

    if (result.success) {
      res.json({
        status: "success",
        message: "GraphQL connection successful",
        shopName: result.data?.shop?.name || "Unknown",
        responseTime: result.responseTime,
      });
    } else {
      res.json({
        status: "error",
        message: "GraphQL connection failed",
        error: result.error,
        responseTime: result.responseTime,
      });
    }
  } catch (error) {
    console.error("GraphQL test error:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Test minimal product creation endpoint
app.post("/api/test-product-create", async (req, res) => {
  try {
    const { storeUrl, accessToken } = req.body;

    if (!storeUrl || !accessToken) {
      return res.status(400).json({
        error: "Missing store URL or access token",
      });
    }

    console.log("Testing minimal product creation...");

    const client = createGraphQLClient(storeUrl, accessToken);

    // Test with minimal product data
    const minimalProduct = {
      title: "Test Product " + Date.now(),
      productOptions: [
        {
          name: "Title",
          values: [{ name: "Default Title" }],
        },
      ],
    };

    const result = await handleGraphQLRequest(
      client,
      GRAPHQL_QUERIES.createProduct,
      { product: minimalProduct },
      "testProductCreate"
    );

    if (result.success) {
      res.json({
        status: "success",
        message: "Minimal product creation successful",
        productId: result.data?.productCreate?.product?.id || "Unknown",
        responseTime: result.responseTime,
      });
    } else {
      res.json({
        status: "error",
        message: "Minimal product creation failed",
        error: result.error,
        responseTime: result.responseTime,
      });
    }
  } catch (error) {
    console.error("Test product creation error:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Schema introspection endpoint
app.post("/api/schema-info", async (req, res) => {
  try {
    const { storeUrl, accessToken } = req.body;

    if (!storeUrl || !accessToken) {
      return res.status(400).json({
        error: "Missing store URL or access token",
      });
    }

    console.log("Getting schema information...");

    const client = createGraphQLClient(storeUrl, accessToken);

    // Introspection query to see available types
    const introspectionQuery = `
      query IntrospectionQuery {
        __schema {
          types {
            name
            kind
            description
          }
        }
      }
    `;

    const result = await handleGraphQLRequest(
      client,
      introspectionQuery,
      {},
      "schemaIntrospection"
    );

    if (result.success) {
      const productTypes =
        result.data?.__schema?.types?.filter((type) =>
          type.name.toLowerCase().includes("product")
        ) || [];

      res.json({
        status: "success",
        message: "Schema introspection successful",
        totalTypes: result.data?.__schema?.types?.length || 0,
        productTypes: productTypes,
        responseTime: result.responseTime,
      });
    } else {
      res.json({
        status: "error",
        message: "Schema introspection failed",
        error: result.error,
        responseTime: result.responseTime,
      });
    }
  } catch (error) {
    console.error("Schema introspection error:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Benchmark endpoint for product creation
app.post("/api/benchmark/create", async (req, res) => {
  try {
    const {
      storeUrl,
      accessToken,
      count = 5,
      batchSize = 10,
      delayBetweenBatches = 100,
    } = req.body;

    if (!storeUrl || !accessToken) {
      return res.status(400).json({
        error: "Missing store URL or access token",
      });
    }

    console.log(`Starting GraphQL product creation benchmark...`);
    console.log(`🔒 Using benchmark tag: ${SESSION_BENCHMARK_TAG}`);
    console.log(
      `📊 Creating ${count} products in batches of ${batchSize} with ${delayBetweenBatches}ms delay`
    );

    const client = createGraphQLClient(storeUrl, accessToken);
    const results = [];
    const numProducts = Math.min(Math.max(1, count), 10000); // Ensure count is between 1-10000

    // Process in batches with adaptive rate limiting
    for (
      let batchStart = 0;
      batchStart < numProducts;
      batchStart += batchSize
    ) {
      const batchEnd = Math.min(batchStart + batchSize, numProducts);
      const batchSizeActual = batchEnd - batchStart;

      console.log(
        `🔄 Processing batch ${
          Math.floor(batchStart / batchSize) + 1
        }: products ${batchStart + 1}-${batchEnd}`
      );

      // Process batch in parallel
      const batchPromises = [];
      for (let i = batchStart; i < batchEnd; i++) {
        const productData = generateRandomProduct();
        batchPromises.push(
          handleGraphQLRequest(
            client,
            GRAPHQL_QUERIES.createProduct,
            { product: productData },
            "createProduct",
            storeUrl
          ).catch((error) => ({
            success: false,
            error: error.message,
            cost: QUERY_COSTS.createProduct,
          }))
        );
      }

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Check rate limit status and adapt if needed
      const lastResult = batchResults[batchResults.length - 1];
      if (lastResult && lastResult.rateLimit) {
        const usagePercentage =
          (lastResult.rateLimit.current / lastResult.rateLimit.limit) * 100;

        if (usagePercentage > 80) {
          // High usage - increase delay
          const adaptiveDelay = Math.min(delayBetweenBatches * 2, 5000);
          console.log(
            `⚠️ High rate limit usage (${usagePercentage.toFixed(
              1
            )}%). Increasing delay to ${adaptiveDelay}ms`
          );
          await new Promise((resolve) => setTimeout(resolve, adaptiveDelay));
        } else if (usagePercentage < 40) {
          // Low usage - reduce delay
          const adaptiveDelay = Math.max(delayBetweenBatches * 0.5, 50);
          console.log(
            `✅ Low rate limit usage (${usagePercentage.toFixed(
              1
            )}%). Reducing delay to ${adaptiveDelay}ms`
          );
          await new Promise((resolve) => setTimeout(resolve, adaptiveDelay));
        } else {
          // Normal usage - use configured delay
          await new Promise((resolve) =>
            setTimeout(resolve, delayBetweenBatches)
          );
        }
      } else {
        // Default delay if no rate limit info
        await new Promise((resolve) =>
          setTimeout(resolve, delayBetweenBatches)
        );
      }
    }

    // Calculate metrics
    const successfulResults = results.filter((r) => r.success);
    const avgResponseTime =
      successfulResults.length > 0
        ? (
            successfulResults.reduce((sum, r) => sum + r.responseTime, 0) /
            successfulResults.length
          ).toFixed(2)
        : 0;

    const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);
    const avgCost = (totalCost / results.length).toFixed(2);

    const successCount = successfulResults.length;
    const totalCount = results.length;

    // Calculate products per second based on cost limits
    const costPerSecond =
      successfulResults.length > 0
        ? (
            totalCost /
            successfulResults.reduce((sum, r) => sum + r.responseTime, 0)
          ).toFixed(2)
        : 0;

    res.json({
      status: successCount > 0 ? "success" : "error",
      responseTime: avgResponseTime,
      rateLimit: results[results.length - 1]?.rateLimit || {
        current: 0,
        limit: 1000,
        remaining: 1000,
      },
      details: `Created ${successCount}/${totalCount} products successfully. Avg response time: ${avgResponseTime}s`,
      cost: {
        total: totalCost,
        average: avgCost,
        perSecond: costPerSecond,
        productsPerSecond: (1000 / avgCost).toFixed(2), // Theoretical max based on cost
      },
    });
  } catch (error) {
    console.error("Product creation benchmark error:", error);
    res.status(500).json({
      status: "error",
      responseTime: 0,
      rateLimit: { current: 0, limit: 1000, remaining: 1000 },
      details: error.message,
      cost: { total: 0, average: 0, perSecond: 0, productsPerSecond: 0 },
    });
  }
});

// Benchmark endpoint for product updates
app.post("/api/benchmark/update", async (req, res) => {
  try {
    const {
      storeUrl,
      accessToken,
      count = 3,
      batchSize = 10,
      delayBetweenBatches = 100,
    } = req.body;

    if (!storeUrl || !accessToken) {
      return res.status(400).json({
        error: "Missing store URL or access token",
      });
    }

    console.log("Starting GraphQL product update benchmark...");
    console.log(`🔒 Looking for products with tag: ${SESSION_BENCHMARK_TAG}`);
    console.log(`📊 Updating ${count} products...`);

    const client = createGraphQLClient(storeUrl, accessToken);

    // First, get existing products with benchmark tag
    const productsResponse = await handleGraphQLRequest(
      client,
      GRAPHQL_QUERIES.getProducts,
      { first: 50 }, // Get more products to find benchmark ones
      "getProducts",
      storeUrl
    );

    if (
      !productsResponse.success ||
      !productsResponse.data?.products?.edges?.length
    ) {
      return res.json({
        status: "error",
        responseTime: 0,
        rateLimit: { current: 0, limit: 1000, remaining: 1000 },
        details: "No products found to update",
        cost: { total: 0, average: 0, perSecond: 0, productsPerSecond: 0 },
      });
    }

    // Filter products to only include benchmark products
    const allProducts = productsResponse.data.products.edges.map(
      (edge) => edge.node
    );

    const benchmarkProducts = allProducts.filter(
      (product) => product.tags && product.tags.includes(SESSION_BENCHMARK_TAG)
    );

    if (benchmarkProducts.length === 0) {
      return res.json({
        status: "error",
        responseTime: 0,
        rateLimit: { current: 0, limit: 1000, remaining: 1000 },
        details: `No benchmark products found with tag: ${SESSION_BENCHMARK_TAG}`,
        cost: { total: 0, average: 0, perSecond: 0, productsPerSecond: 0 },
      });
    }

    console.log(
      `🔍 Found ${benchmarkProducts.length} benchmark products to update`
    );

    const products = benchmarkProducts;
    const results = [];

    // Update products in batches with adaptive rate limiting
    const updateCount = Math.min(Math.max(1, count), products.length);

    for (
      let batchStart = 0;
      batchStart < updateCount;
      batchStart += batchSize
    ) {
      const batchEnd = Math.min(batchStart + batchSize, updateCount);

      console.log(
        `🔄 Processing update batch ${
          Math.floor(batchStart / batchSize) + 1
        }: products ${batchStart + 1}-${batchEnd}`
      );

      // Process batch in parallel
      const batchPromises = [];
      for (let i = batchStart; i < batchEnd; i++) {
        const product = products[i];
        const updateData = {
          id: product.id,
          title: `${product.title} (Updated ${new Date()
            .toISOString()
            .slice(0, 10)})`,
          tags: [...(product.tags || []), "updated", "benchmark"],
        };

        batchPromises.push(
          handleGraphQLRequest(
            client,
            GRAPHQL_QUERIES.updateProduct,
            { input: updateData },
            "updateProduct",
            storeUrl
          ).catch((error) => ({
            success: false,
            error: error.message,
            cost: QUERY_COSTS.updateProduct,
          }))
        );
      }

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Check rate limit status and adapt if needed
      const lastResult = batchResults[batchResults.length - 1];
      if (lastResult && lastResult.rateLimit) {
        const usagePercentage =
          (lastResult.rateLimit.current / lastResult.rateLimit.limit) * 100;

        if (usagePercentage > 80) {
          // High usage - increase delay
          const adaptiveDelay = Math.min(delayBetweenBatches * 2, 5000);
          console.log(
            `⚠️ High rate limit usage (${usagePercentage.toFixed(
              1
            )}%). Increasing delay to ${adaptiveDelay}ms`
          );
          await new Promise((resolve) => setTimeout(resolve, adaptiveDelay));
        } else if (usagePercentage < 40) {
          // Low usage - reduce delay
          const adaptiveDelay = Math.max(delayBetweenBatches * 0.5, 50);
          console.log(
            `✅ Low rate limit usage (${usagePercentage.toFixed(
              1
            )}%). Reducing delay to ${adaptiveDelay}ms`
          );
          await new Promise((resolve) => setTimeout(resolve, adaptiveDelay));
        } else {
          // Normal usage - use configured delay
          await new Promise((resolve) =>
            setTimeout(resolve, delayBetweenBatches)
          );
        }
      } else {
        // Default delay if no rate limit info
        await new Promise((resolve) =>
          setTimeout(resolve, delayBetweenBatches)
        );
      }
    }

    // Calculate metrics
    const successfulResults = results.filter((r) => r.success);
    const avgResponseTime =
      successfulResults.length > 0
        ? (
            successfulResults.reduce((sum, r) => sum + r.responseTime, 0) /
            successfulResults.length
          ).toFixed(2)
        : 0;

    const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);
    const avgCost = (totalCost / results.length).toFixed(2);

    const successCount = successfulResults.length;
    const totalCount = results.length;

    const costPerSecond =
      successfulResults.length > 0
        ? (
            totalCost /
            successfulResults.reduce((sum, r) => sum + r.responseTime, 0)
          ).toFixed(2)
        : 0;

    res.json({
      status: successCount > 0 ? "success" : "error",
      responseTime: avgResponseTime,
      rateLimit: results[results.length - 1]?.rateLimit || {
        current: 0,
        limit: 1000,
        remaining: 1000,
      },
      details: `Updated ${successCount}/${totalCount} products successfully. Avg response time: ${avgResponseTime}s`,
      cost: {
        total: totalCost,
        average: avgCost,
        perSecond: costPerSecond,
        productsPerSecond: (1000 / avgCost).toFixed(2),
      },
    });
  } catch (error) {
    console.error("Product update benchmark error:", error);
    res.status(500).json({
      status: "error",
      responseTime: 0,
      rateLimit: { current: 0, limit: 1000, remaining: 1000 },
      details: error.message,
      cost: { total: 0, average: 0, perSecond: 0, productsPerSecond: 0 },
    });
  }
});

// Benchmark endpoint for product deletion
app.post("/api/benchmark/delete", async (req, res) => {
  try {
    const {
      storeUrl,
      accessToken,
      count = 3,
      batchSize = 10,
      delayBetweenBatches = 100,
    } = req.body;

    if (!storeUrl || !accessToken) {
      return res.status(400).json({
        error: "Missing store URL or access token",
      });
    }

    console.log("Starting GraphQL product deletion benchmark...");
    console.log(`🔒 Looking for products with tag: ${SESSION_BENCHMARK_TAG}`);
    console.log(`📊 Deleting ${count} products...`);

    const client = createGraphQLClient(storeUrl, accessToken);

    // Get products to delete (only benchmark products)
    const productsResponse = await handleGraphQLRequest(
      client,
      GRAPHQL_QUERIES.getProducts,
      { first: 100 }, // Get more products to find benchmark ones
      "getProducts",
      storeUrl
    );

    if (
      !productsResponse.success ||
      !productsResponse.data?.products?.edges?.length
    ) {
      return res.json({
        status: "error",
        responseTime: 0,
        rateLimit: { current: 0, limit: 1000, remaining: 1000 },
        details: "No products found to delete",
        cost: { total: 0, average: 0, perSecond: 0, productsPerSecond: 0 },
      });
    }

    // Filter products to only include benchmark products
    const allProducts = productsResponse.data.products.edges.map(
      (edge) => edge.node
    );

    const benchmarkProducts = allProducts.filter(
      (product) => product.tags && product.tags.includes(SESSION_BENCHMARK_TAG)
    );

    if (benchmarkProducts.length === 0) {
      return res.json({
        status: "error",
        responseTime: 0,
        rateLimit: { current: 0, limit: 1000, remaining: 1000 },
        details: `No benchmark products found with tag: ${SESSION_BENCHMARK_TAG}`,
        cost: { total: 0, average: 0, perSecond: 0, productsPerSecond: 0 },
      });
    }

    console.log(
      `🔍 Found ${benchmarkProducts.length} benchmark products to delete`
    );

    const products = benchmarkProducts;
    const results = [];

    // Delete products in batches with adaptive rate limiting
    const deleteCount = Math.min(Math.max(1, count), products.length);

    for (
      let batchStart = 0;
      batchStart < deleteCount;
      batchStart += batchSize
    ) {
      const batchEnd = Math.min(batchStart + batchSize, deleteCount);

      console.log(
        `🔄 Processing delete batch ${
          Math.floor(batchStart / batchSize) + 1
        }: products ${batchStart + 1}-${batchEnd}`
      );

      // Process batch in parallel
      const batchPromises = [];
      for (let i = batchStart; i < batchEnd; i++) {
        const product = products[i];

        batchPromises.push(
          handleGraphQLRequest(
            client,
            GRAPHQL_QUERIES.deleteProduct,
            { input: { id: product.id } },
            "deleteProduct",
            storeUrl
          ).catch((error) => ({
            success: false,
            error: error.message,
            cost: QUERY_COSTS.deleteProduct,
          }))
        );
      }

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Check rate limit status and adapt if needed
      const lastResult = batchResults[batchResults.length - 1];
      if (lastResult && lastResult.rateLimit) {
        const usagePercentage =
          (lastResult.rateLimit.current / lastResult.rateLimit.limit) * 100;

        if (usagePercentage > 80) {
          // High usage - increase delay
          const adaptiveDelay = Math.min(delayBetweenBatches * 2, 5000);
          console.log(
            `⚠️ High rate limit usage (${usagePercentage.toFixed(
              1
            )}%). Increasing delay to ${adaptiveDelay}ms`
          );
          await new Promise((resolve) => setTimeout(resolve, adaptiveDelay));
        } else if (usagePercentage < 40) {
          // Low usage - reduce delay
          const adaptiveDelay = Math.max(delayBetweenBatches * 0.5, 50);
          console.log(
            `✅ Low rate limit usage (${usagePercentage.toFixed(
              1
            )}%). Reducing delay to ${adaptiveDelay}ms`
          );
          await new Promise((resolve) => setTimeout(resolve, adaptiveDelay));
        } else {
          // Normal usage - use configured delay
          await new Promise((resolve) =>
            setTimeout(resolve, delayBetweenBatches)
          );
        }
      } else {
        // Default delay if no rate limit info
        await new Promise((resolve) =>
          setTimeout(resolve, delayBetweenBatches)
        );
      }
    }

    // Calculate metrics
    const successfulResults = results.filter((r) => r.success);
    const avgResponseTime =
      successfulResults.length > 0
        ? (
            successfulResults.reduce((sum, r) => sum + r.responseTime, 0) /
            successfulResults.length
          ).toFixed(2)
        : 0;

    const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);
    const avgCost = (totalCost / results.length).toFixed(2);

    const successCount = successfulResults.length;
    const totalCount = results.length;

    const costPerSecond =
      successfulResults.length > 0
        ? (
            totalCost /
            successfulResults.reduce((sum, r) => sum + r.responseTime, 0)
          ).toFixed(2)
        : 0;

    res.json({
      status: successCount > 0 ? "success" : "error",
      responseTime: avgResponseTime,
      rateLimit: results[results.length - 1]?.rateLimit || {
        current: 0,
        limit: 1000,
        remaining: 1000,
      },
      details: `Deleted ${successCount}/${totalCount} products successfully. Avg response time: ${avgResponseTime}s`,
      cost: {
        total: totalCost,
        average: avgCost,
        perSecond: costPerSecond,
        productsPerSecond: (1000 / avgCost).toFixed(2),
      },
    });
  } catch (error) {
    console.error("Product deletion benchmark error:", error);
    res.status(500).json({
      status: "error",
      responseTime: 0,
      rateLimit: { current: 0, limit: 1000, remaining: 1000 },
      details: error.message,
      cost: { total: 0, average: 0, perSecond: 0, productsPerSecond: 0 },
    });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    api: "GraphQL Admin API",
    features: [
      "Rate limit monitoring",
      "Query cost analysis",
      "Performance benchmarking",
    ],
    benchmarkTag: SESSION_BENCHMARK_TAG,
    safety: "Only modifies products with benchmark tag",
  });
});

// Cleanup endpoint to remove all benchmark products
app.post("/api/cleanup-benchmark", async (req, res) => {
  try {
    const { storeUrl, accessToken } = req.body;

    if (!storeUrl || !accessToken) {
      return res.status(400).json({
        error: "Missing store URL or access token",
      });
    }

    console.log(
      `🧹 Starting cleanup of benchmark products with tag: ${SESSION_BENCHMARK_TAG}`
    );

    const client = createGraphQLClient(storeUrl, accessToken);

    // Get all benchmark products
    const productsResponse = await handleGraphQLRequest(
      client,
      GRAPHQL_QUERIES.getProducts,
      { first: 250 }, // Get more products to find all benchmark ones
      "getProducts"
    );

    if (
      !productsResponse.success ||
      !productsResponse.data?.products?.edges?.length
    ) {
      return res.json({
        status: "success",
        message: "No products found to clean up",
        deletedCount: 0,
      });
    }

    // Filter products to only include benchmark products
    const allProducts = productsResponse.data.products.edges.map(
      (edge) => edge.node
    );

    const benchmarkProducts = allProducts.filter(
      (product) => product.tags && product.tags.includes(SESSION_BENCHMARK_TAG)
    );

    if (benchmarkProducts.length === 0) {
      return res.json({
        status: "success",
        message: "No benchmark products found to clean up",
        deletedCount: 0,
      });
    }

    console.log(
      `🔍 Found ${benchmarkProducts.length} benchmark products to clean up`
    );

    const results = [];

    // Delete all benchmark products
    for (let i = 0; i < benchmarkProducts.length; i++) {
      const product = benchmarkProducts[i];

      try {
        const result = await handleGraphQLRequest(
          client,
          GRAPHQL_QUERIES.deleteProduct,
          { input: { id: product.id } },
          "cleanupDelete"
        );

        results.push(result);
        await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay
      } catch (error) {
        console.error(`Cleanup deletion ${i + 1} failed:`, error.message);
        results.push({
          success: false,
          error: error.message,
        });
      }
    }

    const successfulDeletions = results.filter((r) => r.success).length;
    const totalProducts = benchmarkProducts.length;

    res.json({
      status: "success",
      message: `Cleanup completed. Deleted ${successfulDeletions}/${totalProducts} benchmark products.`,
      deletedCount: successfulDeletions,
      totalCount: totalProducts,
      benchmarkTag: SESSION_BENCHMARK_TAG,
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Audit log download endpoints
app.get("/api/audit-log/json", (req, res) => {
  try {
    finalizeAuditLog(); // Ensure summary is up to date
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="benchmarkify-audit-${auditLog.sessionId}.json"`
    );
    res.json(auditLog);
  } catch (error) {
    console.error("Error generating JSON audit log:", error);
    res.status(500).json({ error: "Failed to generate audit log" });
  }
});

app.get("/api/audit-log/txt", (req, res) => {
  try {
    finalizeAuditLog(); // Ensure summary is up to date

    let logContent = `Benchmarkify Audit Log\n`;
    logContent += `========================\n\n`;
    logContent += `Session ID: ${auditLog.sessionId}\n`;
    logContent += `Start Time: ${auditLog.startTime}\n`;
    logContent += `End Time: ${auditLog.endTime}\n\n`;

    // Summary
    logContent += `SUMMARY\n`;
    logContent += `-------\n`;
    logContent += `Total Operations: ${auditLog.summary.totalOperations}\n`;
    logContent += `Successful: ${auditLog.summary.successfulOperations}\n`;
    logContent += `Failed: ${auditLog.summary.failedOperations}\n`;
    logContent += `Total Cost: ${auditLog.summary.totalCost} points\n`;
    logContent += `Average Response Time: ${auditLog.summary.averageResponseTime.toFixed(
      2
    )}ms\n`;
    logContent += `Peak Rate Limit Usage: ${auditLog.summary.peakRateLimitUsage.toFixed(
      1
    )}%\n`;
    logContent += `Recommended Batch Size: ${auditLog.summary.recommendedBatchSize}\n`;
    logContent += `Recommended Delay: ${auditLog.summary.recommendedDelay}ms\n\n`;

    // Rate limit history
    logContent += `RATE LIMIT HISTORY\n`;
    logContent += `------------------\n`;
    auditLog.rateLimitHistory.forEach((rl, index) => {
      logContent += `${index + 1}. ${rl.timestamp} | Usage: ${
        rl.currentUsage
      }/${rl.limit} (${rl.usagePercentage.toFixed(1)}%) | Remaining: ${
        rl.remaining
      } | Reset: ${rl.resetTime}\n`;
    });
    logContent += `\n`;

    // Operations log
    logContent += `OPERATIONS LOG\n`;
    logContent += `---------------\n`;
    auditLog.operations.forEach((op, index) => {
      const status = op.success ? "✅ SUCCESS" : "❌ FAILED";
      const summary = op.summary || "No summary available";
      logContent += `${index + 1}. ${op.timestamp} | ${
        op.action
      } | ${status} | Product: ${op.productId || "N/A"} | Cost: ${
        op.cost || 0
      } | Time: ${op.responseTime || "N/A"}ms | ${summary}\n`;
    });

    res.setHeader("Content-Type", "text/plain");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="benchmarkify-audit-${auditLog.sessionId}.txt"`
    );
    res.send(logContent);
  } catch (error) {
    console.error("Error generating TXT audit log:", error);
    res.status(500).json({ error: "Failed to generate audit log" });
  }
});

app.get("/api/audit-log/summary", (req, res) => {
  try {
    updateAuditSummary();
    res.json({
      summary: auditLog.summary,
      sessionId: auditLog.sessionId,
      totalOperations: auditLog.operations.length,
      rateLimitChecks: auditLog.rateLimitHistory.length,
    });
  } catch (error) {
    console.error("Error getting audit summary:", error);
    res.status(500).json({ error: "Failed to get audit summary" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(
    `🚀 Benchmarkify GraphQL server running on http://localhost:${PORT}`
  );
  console.log(`📊 Ready to benchmark Shopify stores with GraphQL!`);
  console.log(
    `🔍 Features: Rate limit monitoring, Query cost analysis, Performance metrics`
  );
});
