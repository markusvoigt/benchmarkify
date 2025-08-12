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

// Store credentials for reuse
const storedCredentials = new Map();

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
    totalTime: 0,
    performanceProjections: {
      products1000: { time: 0, cost: 0 },
      products100k: { time: 0, cost: 0 },
      products1m: { time: 0, cost: 0 },
      products10m: { time: 0, cost: 0 },
    },
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
      Accept: "application/json",
    },
  });

  return client;
}

// Calculate optimal batch configuration based on rate limits
function calculateOptimalBatchConfig(leakRate, costPerProduct = 10) {
  // Calculate how many products we can process per second
  const productsPerSecond = Math.floor(leakRate / costPerProduct);

  // Batch size: aim for batches that complete in 1-2 seconds
  // This allows for some burst capacity while maintaining steady flow
  const optimalBatchSize = Math.min(
    Math.max(productsPerSecond * 1.5, 5), // At least 5, up to 1.5x products/second
    100 // Cap at 100 to avoid overwhelming the API
  );

  // Delay: ensure we don't exceed the leak rate
  // With leak rate of X points/second, we need to wait X/costPerProduct seconds between batches
  const minDelayBetweenBatches = Math.ceil(
    ((costPerProduct * optimalBatchSize) / leakRate) * 1000
  );

  // Add some safety margin (20%)
  const safeDelayBetweenBatches = Math.ceil(minDelayBetweenBatches * 1.2);

  console.log(
    `Rate limit analysis - Leak rate: ${leakRate} points/sec, Products/sec: ${productsPerSecond}`
  );
  console.log(
    `Optimal batch size: ${optimalBatchSize}, Delay: ${safeDelayBetweenBatches}ms`
  );

  return {
    batchSize: Math.floor(optimalBatchSize),
    delayBetweenBatches: Math.min(safeDelayBetweenBatches, 5000), // Cap at 5 seconds
  };
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
  storeUrl = null,
  accessToken = null
) {
  const startTime = Date.now();

  try {
    console.log(`Making GraphQL request: ${operationName}`);
    console.log(`Variables:`, JSON.stringify(variables, null, 2));

    // Use direct fetch approach matching Shopify documentation
    const requestHeaders = {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
      Accept: "application/json",
    };

    console.log("Request headers:", requestHeaders);
    console.log("Request URL:", client.url);

    const response = await fetch(client.url, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const responseData = await response.json();
    const responseTime = (Date.now() - startTime) / 1000;

    console.log(
      `GraphQL response for ${operationName}:`,
      JSON.stringify(responseData, null, 2)
    );

    // Check for GraphQL errors in the response
    if (responseData.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(responseData.errors)}`);
    }

    // Extract rate limit info from response headers and extensions
    let rateLimitInfo = {
      current: 0,
      limit: 100, // Default Shopify limit (100 points/second)
      remaining: 100,
      resetTime: null,
      cost: QUERY_COSTS[operationName] || 0,
    };

    // Extract rate limit headers from successful response
    const headers = response.headers;
    const limitHeader = headers.get("x-shopify-shop-api-call-limit");
    const costHeader = headers.get("x-shopify-graphql-query-cost");

    console.log("Rate limit headers found:", {
      limitHeader: limitHeader,
      costHeader: costHeader,
      allHeaders: Object.fromEntries(headers.entries()),
    });

    // Check GraphQL response extensions for rate limit info (most reliable)
    if (responseData.extensions?.cost?.throttleStatus) {
      const throttleStatus = responseData.extensions.cost.throttleStatus;
      console.log("Rate limit info from GraphQL extensions:", throttleStatus);

      // The restoreRate is the actual leak rate (points per second)
      const leakRate = throttleStatus.restoreRate;

      rateLimitInfo = {
        current:
          throttleStatus.maximumAvailable - throttleStatus.currentlyAvailable,
        limit: throttleStatus.maximumAvailable, // Total bucket capacity
        remaining: throttleStatus.currentlyAvailable, // Available points
        restoreRate: throttleStatus.restoreRate, // Points restored per second (leak rate)
        leakRate: leakRate, // Same as restoreRate for clarity
        resetTime: "Continuous (leaky bucket)",
        cost:
          responseData.extensions.cost.actualQueryCost ||
          QUERY_COSTS[operationName] ||
          0,
      };

      console.log("Parsed rate limit info from extensions:", rateLimitInfo);
    }
    // Fall back to headers if extensions not available
    else if (limitHeader) {
      const [current, limit] = limitHeader.split("/").map(Number);
      rateLimitInfo = {
        current,
        limit,
        remaining: limit - current,
        resetTime:
          headers.get("x-shopify-shop-api-call-limit-reset") ||
          "Continuous (leaky bucket)",
        cost: costHeader
          ? parseInt(costHeader)
          : QUERY_COSTS[operationName] || 0,
      };
    }

    console.log("Final rate limit info:", rateLimitInfo);

    // Log successful operation
    logOperation({
      action: operationName,
      success: true,
      responseTime: responseTime * 1000, // Convert to ms
      cost: rateLimitInfo.cost,
      productId: extractProductId(responseData, operationName),
      summary: generateOperationSummary(operationName, responseData, true),
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
      data: responseData,
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
      "testConnection",
      storeUrl,
      accessToken
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
      "testProductCreate",
      storeUrl,
      accessToken
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
      "schemaIntrospection",
      storeUrl,
      accessToken
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

// Store credentials endpoint
app.post("/api/store-credentials", (req, res) => {
  try {
    const { storeUrl, accessToken, sessionId } = req.body;

    if (!storeUrl || !accessToken) {
      return res.status(400).json({
        error: "Missing store URL or access token",
      });
    }

    const sessionKey = sessionId || generateBenchmarkTag();
    storedCredentials.set(sessionKey, {
      storeUrl,
      accessToken,
      timestamp: Date.now(),
      sessionId: sessionKey,
    });

    // Clean up old credentials (older than 24 hours)
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    for (const [key, value] of storedCredentials.entries()) {
      if (value.timestamp < oneDayAgo) {
        storedCredentials.delete(key);
      }
    }

    res.json({
      status: "success",
      message: "Credentials stored successfully",
      sessionId: sessionKey,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (error) {
    console.error("Store credentials error:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Get stored credentials endpoint
app.get("/api/stored-credentials/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const credentials = storedCredentials.get(sessionId);

    if (!credentials) {
      return res.status(404).json({
        error: "Credentials not found or expired",
      });
    }

    // Check if credentials are expired (24 hours)
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    if (credentials.timestamp < oneDayAgo) {
      storedCredentials.delete(sessionId);
      return res.status(404).json({
        error: "Credentials expired",
      });
    }

    res.json({
      status: "success",
      storeUrl: credentials.storeUrl,
      sessionId: credentials.sessionId,
      expiresAt: new Date(
        credentials.timestamp + 24 * 60 * 60 * 1000
      ).toISOString(),
    });
  } catch (error) {
    console.error("Get stored credentials error:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Rate limit analysis endpoint
app.post("/api/rate-limit-analysis", async (req, res) => {
  try {
    const { storeUrl, accessToken } = req.body;

    if (!storeUrl || !accessToken) {
      return res.status(400).json({
        error: "Missing store URL or access token",
      });
    }

    console.log("Analyzing rate limits for store...");

    const client = createGraphQLClient(storeUrl, accessToken);

    // Test with a simple query to get rate limit info
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
      "rateLimitAnalysis",
      storeUrl,
      accessToken
    );

    if (!result.success) {
      return res.json({
        status: "error",
        message: "Failed to analyze rate limits",
        error: result.error,
      });
    }

    const rateLimit = result.rateLimit;

    // Use the leak rate (restoreRate) for calculations, not the bucket capacity
    const leakRate = rateLimit.leakRate || rateLimit.restoreRate || 100; // Default to Standard Shopify
    const bucketCapacity = rateLimit.limit || 1000; // Total bucket capacity

    console.log(
      "Rate limit analysis - using leak rate:",
      leakRate,
      "bucket capacity:",
      bucketCapacity
    );

    // Determine Shopify plan based on leak rate (points per second)
    let planType = "Standard Shopify";
    if (leakRate >= 2000) planType = "Shopify for Enterprise";
    else if (leakRate >= 1000) planType = "Shopify Plus";
    else if (leakRate >= 200) planType = "Advanced Shopify";

    const costPerProduct = 10; // Standard cost for product operations
    const productsPerSecond = Math.floor(leakRate / costPerProduct);
    const productsPerMinute = productsPerSecond * 60;
    const productsPerHour = productsPerMinute * 60;

    // Calculate time estimates for different product counts
    const calculateTimeEstimate = (productCount) => {
      const totalCost = productCount * costPerProduct;
      // With leak rate (points/second), we can calculate time more accurately
      const timeInSeconds = totalCost / leakRate; // points / (points/second) = seconds
      return {
        timeInSeconds,
        timeInMinutes: Math.ceil(timeInSeconds / 60),
        timeInHours: Math.ceil(timeInSeconds / 3600),
        batches: Math.ceil(totalCost / leakRate), // For display purposes
        totalCost,
      };
    };

    const projections = {
      products1000: calculateTimeEstimate(1000),
      products100k: calculateTimeEstimate(100000),
      products1m: calculateTimeEstimate(1000000),
      products10m: calculateTimeEstimate(10000000),
    };

    const responseData = {
      status: "success",
      rateLimit: {
        leakRate: leakRate, // Points per second (leak rate)
        bucketCapacity: bucketCapacity, // Total bucket capacity
        current: rateLimit.current || 0,
        remaining: rateLimit.remaining || bucketCapacity,
        restoreRate: rateLimit.restoreRate,
        resetTime: rateLimit.resetTime,
      },
      analysis: {
        productsPerSecond,
        productsPerMinute,
        productsPerHour,
        costPerProduct,
        maxProductsPerBatch: Math.floor(leakRate / costPerProduct),
      },
      projections,
      planType: planType, // Add plan type directly to response
      explanation: {
        title: "Understanding Your API Rate Limits",
        description: `Your store appears to be on the ${planType} plan with a leak rate of ${leakRate} calculated query points per second. Each product operation (create/update/delete) costs ${costPerProduct} points.`,
        practicalMeaning: `This means you can perform approximately ${productsPerSecond} product operations per second, ${productsPerMinute} per minute, or ${productsPerHour} per hour through a single API client.`,
        recommendations: [
          "Use batch operations to maximize efficiency",
          "Implement exponential backoff when hitting rate limits",
          "Consider using multiple API clients for high-volume operations",
          "Monitor rate limit usage during operations",
          "Use the Shopify-GraphQL-Cost-Debug=1 header to analyze query costs",
          `Consider upgrading to a higher plan if you need more throughput (current: ${planType})`,
        ],
      },
    };

    res.json(responseData);
  } catch (error) {
    console.error("Rate limit analysis error:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Benchmark endpoint for product creation
app.post("/api/benchmark/create", async (req, res) => {
  try {
    const { storeUrl, accessToken, count = 5 } = req.body;

    if (!storeUrl || !accessToken) {
      return res.status(400).json({
        error: "Missing store URL or access token",
      });
    }

    console.log(`Starting GraphQL product creation benchmark...`);
    console.log(`🔒 Using benchmark tag: ${SESSION_BENCHMARK_TAG}`);

    // Get current rate limits to calculate optimal batch configuration
    const rateLimitResult = await handleGraphQLRequest(
      client,
      `query { shop { name id } }`,
      {},
      "rateLimitCheck",
      storeUrl,
      accessToken
    );

    const leakRate =
      rateLimitResult.rateLimit?.leakRate ||
      rateLimitResult.rateLimit?.restoreRate ||
      100;
    const { batchSize, delayBetweenBatches } =
      calculateOptimalBatchConfig(leakRate);

    console.log(
      `📊 Creating ${count} products with dynamic config - Batch size: ${batchSize}, Delay: ${delayBetweenBatches}ms (Leak rate: ${leakRate} points/sec)`
    );

    const client = createGraphQLClient(storeUrl, accessToken);
    const results = [];
    const numProducts = Math.min(Math.max(1, count), 1000000); // Support up to 1 million products
    const startTime = Date.now();

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
            storeUrl,
            accessToken
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

    const totalTime = (Date.now() - startTime) / 1000; // Convert to seconds

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

    // Calculate performance projections
    const calculateProjection = (productCount) => {
      const estimatedCost = productCount * avgCost;
      const estimatedTime = estimatedCost / (totalCost / totalTime);
      return {
        time: estimatedTime,
        cost: estimatedCost,
      };
    };

    const performanceProjections = {
      products1000: calculateProjection(1000),
      products100k: calculateProjection(100000),
      products1m: calculateProjection(1000000),
      products10m: calculateProjection(10000000),
    };

    // Update audit log with performance data
    auditLog.summary.totalTime = totalTime;
    auditLog.summary.performanceProjections = performanceProjections;

    res.json({
      status: successCount > 0 ? "success" : "error",
      responseTime: avgResponseTime,
      totalTime: totalTime.toFixed(2),
      rateLimit: results[results.length - 1]?.rateLimit || {
        current: 0,
        limit: 1000,
        remaining: 1000,
      },
      details: `Created ${successCount}/${totalCount} products successfully. Total time: ${totalTime.toFixed(
        2
      )}s`,
      cost: {
        total: totalCost,
        average: avgCost,
        perSecond: costPerSecond,
        productsPerSecond: (1000 / avgCost).toFixed(2), // Theoretical max based on cost
      },
      performanceProjections,
    });
  } catch (error) {
    console.error("Product creation benchmark error:", error);
    res.status(500).json({
      status: "error",
      responseTime: 0,
      totalTime: 0,
      rateLimit: { current: 0, limit: 1000, remaining: 1000 },
      details: error.message,
      cost: { total: 0, average: 0, perSecond: 0, productsPerSecond: 0 },
      performanceProjections: {},
    });
  }
});

// Benchmark endpoint for product updates
app.post("/api/benchmark/update", async (req, res) => {
  try {
    const { storeUrl, accessToken, count = 3 } = req.body;

    if (!storeUrl || !accessToken) {
      return res.status(400).json({
        error: "Missing store URL or access token",
      });
    }

    console.log("Starting GraphQL product update benchmark...");
    console.log(`🔒 Looking for products with tag: ${SESSION_BENCHMARK_TAG}`);

    // Get current rate limits to calculate optimal batch configuration
    const rateLimitResult = await handleGraphQLRequest(
      client,
      `query { shop { name id } }`,
      {},
      "rateLimitCheck",
      storeUrl,
      accessToken
    );

    const leakRate =
      rateLimitResult.rateLimit?.leakRate ||
      rateLimitResult.rateLimit?.restoreRate ||
      100;
    const { batchSize, delayBetweenBatches } =
      calculateOptimalBatchConfig(leakRate);

    console.log(
      `📊 Updating ${count} products with dynamic config - Batch size: ${batchSize}, Delay: ${delayBetweenBatches}ms (Leak rate: ${leakRate} points/sec)`
    );

    const client = createGraphQLClient(storeUrl, accessToken);

    // First, get existing products with benchmark tag
    const productsResponse = await handleGraphQLRequest(
      client,
      GRAPHQL_QUERIES.getProducts,
      { first: 250 }, // Get more products to find benchmark ones
      "getProducts",
      storeUrl,
      accessToken
    );

    if (
      !productsResponse.success ||
      !productsResponse.data?.products?.edges?.length
    ) {
      return res.json({
        status: "error",
        responseTime: 0,
        totalTime: 0,
        rateLimit: { current: 0, limit: 1000, remaining: 1000 },
        details: "No products found to update",
        cost: { total: 0, average: 0, perSecond: 0, productsPerSecond: 0 },
        performanceProjections: {},
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
        totalTime: 0,
        rateLimit: { current: 0, limit: 1000, remaining: 1000 },
        details: `No benchmark products found with tag: ${SESSION_BENCHMARK_TAG}`,
        cost: { total: 0, average: 0, perSecond: 0, productsPerSecond: 0 },
        performanceProjections: {},
      });
    }

    console.log(
      `🔍 Found ${benchmarkProducts.length} benchmark products to update`
    );

    const products = benchmarkProducts;
    const results = [];

    // Update products in batches with adaptive rate limiting
    const updateCount = Math.min(
      Math.max(1, count),
      Math.min(products.length, 1000000)
    ); // Support up to 1 million products
    const startTime = Date.now();

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
            storeUrl,
            accessToken
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

    const totalTime = (Date.now() - startTime) / 1000; // Convert to seconds

    const costPerSecond =
      successfulResults.length > 0
        ? (
            totalCost /
            successfulResults.reduce((sum, r) => sum + r.responseTime, 0)
          ).toFixed(2)
        : 0;

    // Calculate performance projections
    const calculateProjection = (productCount) => {
      const estimatedCost = productCount * avgCost;
      const estimatedTime = estimatedCost / (totalCost / totalTime);
      return {
        time: estimatedTime,
        cost: estimatedCost,
      };
    };

    const performanceProjections = {
      products1000: calculateProjection(1000),
      products100k: calculateProjection(100000),
      products1m: calculateProjection(1000000),
      products10m: calculateProjection(10000000),
    };

    res.json({
      status: successCount > 0 ? "success" : "error",
      responseTime: avgResponseTime,
      totalTime: totalTime.toFixed(2),
      rateLimit: results[results.length - 1]?.rateLimit || {
        current: 0,
        limit: 1000,
        remaining: 1000,
      },
      details: `Updated ${successCount}/${totalCount} products successfully. Total time: ${totalTime.toFixed(
        2
      )}s`,
      cost: {
        total: totalCost,
        average: avgCost,
        perSecond: costPerSecond,
        productsPerSecond: (1000 / avgCost).toFixed(2),
      },
      performanceProjections,
    });
  } catch (error) {
    console.error("Product update benchmark error:", error);
    res.status(500).json({
      status: "error",
      responseTime: 0,
      totalTime: 0,
      rateLimit: { current: 0, limit: 1000, remaining: 1000 },
      details: error.message,
      cost: { total: 0, average: 0, perSecond: 0, productsPerSecond: 0 },
      performanceProjections: {},
    });
  }
});

// Benchmark endpoint for product deletion
app.post("/api/benchmark/delete", async (req, res) => {
  try {
    const { storeUrl, accessToken, count = 3 } = req.body;

    if (!storeUrl || !accessToken) {
      return res.status(400).json({
        error: "Missing store URL or access token",
      });
    }

    console.log("Starting GraphQL product deletion benchmark...");
    console.log(`🔒 Looking for products with tag: ${SESSION_BENCHMARK_TAG}`);

    // Get current rate limits to calculate optimal batch configuration
    const rateLimitResult = await handleGraphQLRequest(
      client,
      `query { shop { name id } }`,
      {},
      "rateLimitCheck",
      storeUrl,
      accessToken
    );

    const leakRate =
      rateLimitResult.rateLimit?.leakRate ||
      rateLimitResult.rateLimit?.restoreRate ||
      100;
    const { batchSize, delayBetweenBatches } =
      calculateOptimalBatchConfig(leakRate);

    console.log(
      `📊 Deleting ${count} products with dynamic config - Batch size: ${batchSize}, Delay: ${delayBetweenBatches}ms (Leak rate: ${leakRate} points/sec)`
    );

    const client = createGraphQLClient(storeUrl, accessToken);

    // Get products to delete (only benchmark products)
    const productsResponse = await handleGraphQLRequest(
      client,
      GRAPHQL_QUERIES.getProducts,
      { first: 250 }, // Get more products to find benchmark ones
      "getProducts",
      storeUrl,
      accessToken
    );

    if (
      !productsResponse.success ||
      !productsResponse.data?.products?.edges?.length
    ) {
      return res.json({
        status: "error",
        responseTime: 0,
        totalTime: 0,
        rateLimit: { current: 0, limit: 1000, remaining: 1000 },
        details: "No products found to delete",
        cost: { total: 0, average: 0, perSecond: 0, productsPerSecond: 0 },
        performanceProjections: {},
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
        totalTime: 0,
        rateLimit: { current: 0, limit: 1000, remaining: 1000 },
        details: `No benchmark products found with tag: ${SESSION_BENCHMARK_TAG}`,
        cost: { total: 0, average: 0, perSecond: 0, productsPerSecond: 0 },
        performanceProjections: {},
      });
    }

    console.log(
      `🔍 Found ${benchmarkProducts.length} benchmark products to delete`
    );

    const products = benchmarkProducts;
    const results = [];

    // Delete products in batches with adaptive rate limiting
    const deleteCount = Math.min(
      Math.max(1, count),
      Math.min(products.length, 1000000)
    ); // Support up to 1 million products
    const startTime = Date.now();

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
            storeUrl,
            accessToken
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

    const totalTime = (Date.now() - startTime) / 1000; // Convert to seconds

    const costPerSecond =
      successfulResults.length > 0
        ? (
            totalCost /
            successfulResults.reduce((sum, r) => sum + r.responseTime, 0)
          ).toFixed(2)
        : 0;

    // Calculate performance projections
    const calculateProjection = (productCount) => {
      const estimatedCost = productCount * avgCost;
      const estimatedTime = estimatedCost / (totalCost / totalTime);
      return {
        time: estimatedTime,
        cost: estimatedCost,
      };
    };

    const performanceProjections = {
      products1000: calculateProjection(1000),
      products100k: calculateProjection(100000),
      products1m: calculateProjection(1000000),
      products10m: calculateProjection(10000000),
    };

    res.json({
      status: successCount > 0 ? "success" : "error",
      responseTime: avgResponseTime,
      totalTime: totalTime.toFixed(2),
      rateLimit: results[results.length - 1]?.rateLimit || {
        current: 0,
        limit: 1000,
        remaining: 1000,
      },
      details: `Deleted ${successCount}/${totalCount} products successfully. Total time: ${totalTime.toFixed(
        2
      )}s`,
      cost: {
        total: totalCost,
        average: avgCost,
        perSecond: costPerSecond,
        productsPerSecond: (1000 / avgCost).toFixed(2),
      },
      performanceProjections,
    });
  } catch (error) {
    console.error("Product deletion benchmark error:", error);
    res.status(500).json({
      status: "error",
      responseTime: 0,
      totalTime: 0,
      rateLimit: { current: 0, limit: 1000, remaining: 1000 },
      details: error.message,
      cost: { total: 0, average: 0, perSecond: 0, productsPerSecond: 0 },
      performanceProjections: {},
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
          "cleanupDelete",
          storeUrl,
          accessToken
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
