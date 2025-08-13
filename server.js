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
  createdProductIds: [], // Store created product IDs for direct deletion
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

// Store created product IDs for direct deletion
function storeCreatedProductId(productId, productTitle) {
  auditLog.createdProductIds.push({
    id: productId,
    title: productTitle,
    timestamp: new Date().toISOString(),
    sessionTag: SESSION_BENCHMARK_TAG,
  });
  console.log(
    `📝 Stored product ID for deletion: ${productId} (${productTitle})`
  );
}

// Get stored product IDs for deletion
function getStoredProductIds(count = null) {
  const ids = auditLog.createdProductIds;
  if (count === null) return ids;
  return ids.slice(0, Math.min(count, ids.length));
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

// Helper: return all known created product IDs from memory (primary)
// and audit operations (secondary) in case primary missed some
function getKnownBenchmarkProductIds(limit = null) {
  const fromMemory = Array.isArray(auditLog.createdProductIds)
    ? auditLog.createdProductIds
    : [];

  const fromOps = Array.isArray(auditLog.operations)
    ? auditLog.operations
        .filter(
          (op) =>
            op.action === "createProduct" &&
            op.success &&
            op.productId &&
            op.productId !== "N/A"
        )
        .map((op) => ({
          id: op.productId,
          title: "Benchmark product (ops)",
          sessionTag: SESSION_BENCHMARK_TAG,
        }))
    : [];

  const byId = new Map();
  for (const p of [...fromMemory, ...fromOps]) {
    if (p && p.id && !byId.has(p.id)) {
      byId.set(p.id, {
        id: p.id,
        title: p.title || "Benchmark product",
        sessionTag: SESSION_BENCHMARK_TAG,
      });
    }
  }

  const list = Array.from(byId.values());
  if (limit == null) return list;
  return list.slice(0, Math.min(limit, list.length));
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
    query getProducts(
      $first: Int!
      $after: String
      $query: String
      $sortKey: ProductSortKeys
      $reverse: Boolean
    ) {
      products(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
        edges {
          cursor
          node {
            id
            title
            handle
            createdAt
            tags
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `,
};

/**
 * Fetch products by tag using GraphQL cursor-based pagination.
 * Respects Shopify's 250 page size limit and stops after maxToFetch items.
 * Docs: https://shopify.dev/docs/api/usage/pagination-graphql
 */
async function fetchProductsByTagWithPagination(
  client,
  storeUrl,
  accessToken,
  tag,
  maxToFetch
) {
  const collectedProducts = [];
  let hasNextPage = true;
  let afterCursor = null;

  while (hasNextPage && collectedProducts.length < maxToFetch) {
    const pageSize = Math.min(250, maxToFetch - collectedProducts.length);

    const response = await handleGraphQLRequest(
      client,
      GRAPHQL_QUERIES.getProducts,
      {
        first: pageSize,
        after: afterCursor,
        query: `tag:${tag}`,
        sortKey: "CREATED_AT",
        reverse: true,
      },
      "getProducts",
      storeUrl,
      accessToken
    );

    const connection = response?.data?.data?.products;
    const edges = connection?.edges || [];
    const pageInfo = connection?.pageInfo;

    for (const edge of edges) {
      if (edge?.node) collectedProducts.push(edge.node);
      if (collectedProducts.length >= maxToFetch) break;
    }

    hasNextPage = Boolean(pageInfo?.hasNextPage);
    afterCursor = pageInfo?.endCursor || null;
  }

  // Extra safety: filter by tag in case query matches broader set
  return collectedProducts.filter(
    (p) => Array.isArray(p.tags) && p.tags.includes(tag)
  );
}

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
      "benchmarkify",
      // Removed session-specific tag; unified tagging only
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
function calculateOptimalBatchConfig(
  leakRate,
  costPerProduct = 10,
  optimizationMode = "throughput"
) {
  // Calculate how many products we can process per second
  const productsPerSecond = Math.floor(leakRate / costPerProduct);

  // Choose optimization strategy based on mode
  let optimalBatchSize, finalDelay, safetyMargin;

  if (optimizationMode === "aggressive") {
    // Maximum throughput mode - push the limits
    const bucketCapacity = leakRate * 2; // Approximate bucket capacity
    const maxBatchSizeByCapacity = Math.floor(
      (bucketCapacity * 0.9) / costPerProduct
    );
    const optimalBatchSizeByTime = Math.floor(productsPerSecond * 0.9);

    optimalBatchSize = Math.min(
      Math.max(maxBatchSizeByCapacity, optimalBatchSizeByTime, 20),
      1000 // Higher cap for aggressive mode
    );

    const batchCost = optimalBatchSize * costPerProduct;
    const minDelayForRateLimit = (batchCost / leakRate) * 1000;
    safetyMargin = 1.02; // Only 2% safety margin
    finalDelay = Math.max(Math.ceil(minDelayForRateLimit * safetyMargin), 25);
  } else if (optimizationMode === "balanced") {
    // Balanced mode - good throughput with reasonable safety
    const bucketCapacity = leakRate * 2;
    const maxBatchSizeByCapacity = Math.floor(
      (bucketCapacity * 0.7) / costPerProduct
    );
    const optimalBatchSizeByTime = Math.floor(productsPerSecond * 0.7);

    optimalBatchSize = Math.min(
      Math.max(maxBatchSizeByCapacity, optimalBatchSizeByTime, 15),
      300
    );

    const batchCost = optimalBatchSize * costPerProduct;
    const minDelayForRateLimit = (batchCost / leakRate) * 1000;
    safetyMargin = 1.1; // 10% safety margin
    finalDelay = Math.max(Math.ceil(minDelayForRateLimit * safetyMargin), 50);
  } else {
    // Default throughput mode (current optimized approach)
    const bucketCapacity = leakRate * 2;
    const maxBatchSizeByCapacity = Math.floor(
      (bucketCapacity * 0.8) / costPerProduct
    );
    const optimalBatchSizeByTime = Math.floor(productsPerSecond * 0.8);

    optimalBatchSize = Math.min(
      Math.max(maxBatchSizeByCapacity, optimalBatchSizeByTime, 10),
      500
    );

    const batchCost = optimalBatchSize * costPerProduct;
    const minDelayForRateLimit = (batchCost / leakRate) * 1000;
    safetyMargin = 1.05; // 5% safety margin
    finalDelay = Math.max(Math.ceil(minDelayForRateLimit * safetyMargin), 50);
  }

  const batchCost = optimalBatchSize * costPerProduct;
  const minDelayForRateLimit = (batchCost / leakRate) * 1000;

  console.log(
    `Rate limit analysis - Leak rate: ${leakRate} points/sec, Products/sec: ${productsPerSecond}`
  );
  console.log(
    `Optimization mode: ${optimizationMode} - Batch size: ${optimalBatchSize}, Delay: ${finalDelay}ms`
  );
  console.log(
    `Batch cost: ${batchCost} points, Safety margin: ${(
      (safetyMargin - 1) *
      100
    ).toFixed(1)}%`
  );

  return {
    batchSize: Math.floor(optimalBatchSize),
    delayBetweenBatches: Math.min(finalDelay, 2000), // Cap at 2 seconds for responsiveness
  };
}

// Helper: fetch benchmark products with optional GraphQL query filter and pagination
async function fetchBenchmarkProducts(
  client,
  storeUrl,
  accessToken,
  maxCount = 250
) {
  console.log(`🚀 fetchBenchmarkProducts called with maxCount: ${maxCount}`);
  console.log(`🚀 Client URL: ${client.url}`);
  const products = [];
  let after = null;
  const perPage = Math.min(250, maxCount);
  // Try combined filter first, then fallback to unified tag only
  const queriesToTry = [`tag:benchmarkify`];
  console.log(`🚀 Will try queries:`, queriesToTry);
  for (const queryFilter of queriesToTry) {
    after = null;
    while (products.length < maxCount) {
      const variables = {
        first: perPage,
        after,
        query: queryFilter,
        sortKey: "CREATED_AT",
        reverse: true,
      };
      const result = await handleGraphQLRequest(
        client,
        GRAPHQL_QUERIES.getProducts,
        variables,
        "getProducts",
        storeUrl,
        accessToken
      );
      console.log(
        `🔍 GraphQL request result:`,
        JSON.stringify(result, null, 2)
      );
      if (!result.success) break;
      const edges = result.data?.data?.products?.edges || [];
      console.log(
        `🔍 GraphQL query returned ${edges.length} edges for filter: ${queryFilter}`
      );
      console.log(
        `🔍 Full response data:`,
        JSON.stringify(result.data, null, 2)
      );
      for (const edge of edges) {
        const node = edge.node;
        const tags = node.tags || [];
        console.log(`🔍 Product: ${node.title}, Tags: [${tags.join(", ")}]`);
        // Only check for the unified "benchmarkify" tag since that's what we use now
        if (tags.includes("benchmarkify")) {
          products.push(node);
          console.log(`✅ Added product: ${node.title}`);
        } else {
          console.log(
            `❌ Skipped product: ${node.title} (no "benchmarkify" tag)`
          );
        }
        if (products.length >= maxCount) break;
      }
      const pageInfo = result.data?.data?.products?.pageInfo;
      if (!pageInfo?.hasNextPage) break;
      after = pageInfo.endCursor;
    }
    if (products.length) break;
  }
  return products;
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
      headers: {
        ...requestHeaders,
        // Include cost debug header to expose detailed cost info per Shopify docs
        "Shopify-GraphQL-Cost-Debug": "1",
      },
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

      // Calculate optimal batch size and delay for more accurate time estimates
      // Use aggressive mode for maximum throughput in time estimates
      const { batchSize, delayBetweenBatches } = calculateOptimalBatchConfig(
        leakRate,
        costPerProduct,
        "aggressive"
      );
      const productsPerBatch = batchSize;
      const totalBatches = Math.ceil(productCount / productsPerBatch);

      // Calculate actual processing time including delays between batches
      const processingTimeSeconds = totalCost / leakRate; // Pure processing time
      const totalDelaySeconds =
        (totalBatches - 1) * (delayBetweenBatches / 1000); // Delays between batches
      const totalTimeSeconds = processingTimeSeconds + totalDelaySeconds;

      // Format time display based on duration
      let timeDisplay, timeUnit;
      if (totalTimeSeconds < 60) {
        timeDisplay = Math.ceil(totalTimeSeconds);
        timeUnit = "seconds";
      } else if (totalTimeSeconds < 3600) {
        timeDisplay = Math.ceil(totalTimeSeconds / 60);
        timeUnit = "minutes";
      } else {
        timeDisplay = Math.ceil(totalTimeSeconds / 3600);
        timeUnit = "hours";
      }

      return {
        timeInSeconds: totalTimeSeconds,
        timeInMinutes: Math.ceil(totalTimeSeconds / 60),
        timeInHours: Math.ceil(totalTimeSeconds / 3600),
        timeDisplay: timeDisplay,
        timeUnit: timeUnit,
        batches: totalBatches,
        batchSize: batchSize,
        delayBetweenBatches: delayBetweenBatches,
        totalCost,
        processingTimeSeconds,
        totalDelaySeconds,
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
        timeCalculationDetails: {
          leakRate: leakRate,
          costPerProduct: costPerProduct,
          productsPerSecond: productsPerSecond,
          optimizationMode: "aggressive",
          batchSize: calculateOptimalBatchConfig(
            leakRate,
            costPerProduct,
            "aggressive"
          ).batchSize,
          delayBetweenBatches: calculateOptimalBatchConfig(
            leakRate,
            costPerProduct,
            "aggressive"
          ).delayBetweenBatches,
        },
        recommendations: [
          "Using aggressive optimization mode for maximum throughput",
          "Large batch sizes reduce API overhead and improve efficiency",
          "Minimal delays between batches maximize data flow",
          "System will automatically retry with exponential backoff if rate limited",
          "Monitor rate limit usage during high-volume operations",
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
    console.log(`🔒 Using benchmark tag: benchmarkify`);
    console.log(`🎯 Requested to create exactly ${count} products`);

    // Reset rate limit manager for fresh start
    rateLimitManager.reset();

    // Create GraphQL client first
    const client = createGraphQLClient(storeUrl, accessToken);

    // Get current rate limits to calculate optimal batch configuration
    const rateLimitResult = await handleGraphQLRequest(
      client,
      `query { shop { name id } }`,
      {},
      "rateLimitCheck",
      storeUrl,
      accessToken
    );

    // Initialize rate limit manager with initial response
    rateLimitManager.updateFromResponse(
      rateLimitResult.rateLimit,
      rateLimitResult.success
    );

    // Calculate optimal initial settings based on detected rate limits
    if (rateLimitResult.rateLimit?.leakRate) {
      rateLimitManager.calculateOptimalInitialSettings(
        rateLimitResult.rateLimit.leakRate
      );
    }

    // Get current optimal settings from manager
    const { batchSize, delay: delayBetweenBatches } =
      rateLimitManager.getCurrentSettings();

    console.log(
      `📊 Creating ${count} products with adaptive rate limiting - Initial batch size: ${batchSize}, Delay: ${delayBetweenBatches}ms`
    );

    const results = [];
    const numProducts = Math.min(Math.max(1, count), 1000000); // Support up to 1 million products
    const startTime = Date.now();

    // Process in batches with adaptive rate limiting
    for (
      let batchStart = 0;
      batchStart < numProducts;
      batchStart += batchSize
    ) {
      // Get current optimal settings (may have changed from previous batch)
      const currentSettings = rateLimitManager.getCurrentSettings();
      const currentBatchSize = currentSettings.batchSize;
      const currentDelay = currentSettings.delay;

      const batchEnd = Math.min(batchStart + currentBatchSize, numProducts);
      const batchSizeActual = batchEnd - batchStart;

      console.log(
        `🔄 Processing batch ${
          Math.floor(batchStart / batchSize) + 1
        }: products ${
          batchStart + 1
        }-${batchEnd} (batch size: ${batchSizeActual}, delay: ${currentDelay}ms)`
      );

      // Process batch in parallel
      const batchPromises = [];
      for (let i = batchStart; i < batchEnd; i++) {
        const productData = generateRandomProduct();
        batchPromises.push(
          retryGraphQLRequest(
            client,
            GRAPHQL_QUERIES.createProduct,
            { product: productData },
            "createProduct",
            storeUrl,
            accessToken
          )
        );
      }

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Log batch results for debugging
      const batchSuccesses = batchResults.filter((r) => r.success).length;
      const batchFailures = batchResults.filter((r) => !r.success).length;
      console.log(
        `📊 Batch ${
          Math.floor(batchStart / batchSize) + 1
        } results: ${batchSuccesses} success, ${batchFailures} failures`
      );

      // Store successful product IDs for direct deletion
      batchResults.forEach((result) => {
        if (result.success && result.data?.productCreate?.product?.id) {
          const productId = result.data.productCreate.product.id;
          const productTitle =
            result.data.productCreate.product.title || "Unknown Product";
          storeCreatedProductId(productId, productTitle);
        }
      });

      // Optimize for maximum throughput if we have headroom
      if (batchSuccesses > batchFailures * 2) {
        rateLimitManager.optimizeForThroughput();
      }

      // Use current delay from rate limit manager
      if (batchStart + batchSize < numProducts) {
        console.log(`⏳ Waiting ${currentDelay}ms before next batch...`);
        await new Promise((resolve) => setTimeout(resolve, currentDelay));
      }
    }

    const totalTime = (Date.now() - startTime) / 1000; // Convert to seconds

    // Ensure we only return results for the requested number of products
    const limitedResults = results.slice(0, numProducts);
    console.log(
      `✅ Created exactly ${limitedResults.length} products as requested`
    );

    // Calculate metrics
    const successfulResults = limitedResults.filter((r) => r.success);
    const avgResponseTime =
      successfulResults.length > 0
        ? (
            successfulResults.reduce((sum, r) => sum + r.responseTime, 0) /
            successfulResults.length
          ).toFixed(2)
        : 0;

    const totalCost = limitedResults.reduce((sum, r) => sum + (r.cost || 0), 0);
    const avgCost = (totalCost / limitedResults.length).toFixed(2);

    const successCount = successfulResults.length;
    const totalCount = limitedResults.length;

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

    // Get rate limit manager performance summary
    const rateLimitSummary = rateLimitManager.getPerformanceSummary();

    // Calculate theoretical maximum performance
    const theoreticalMax = rateLimitSummary?.isEnterprisePlan
      ? {
          productsPerSecond: "200+",
          batchSize: rateLimitSummary.currentBatchSize,
          delay: rateLimitSummary.currentDelay,
          efficiency: "Enterprise API - Maximum throughput mode",
        }
      : {
          productsPerSecond: "50-150",
          batchSize: rateLimitSummary.currentBatchSize,
          delay: rateLimitSummary.currentDelay,
          efficiency: "Standard/Plus API - Optimized mode",
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
      rateLimitAdaptation: rateLimitSummary,
      theoreticalMax,
      retryStats: {
        totalRetries: results.filter((r) => r.retriesExhausted).length,
        successfulAfterRetry: results.filter(
          (r) => r.success && r.retriesExhausted === false
        ).length,
      },
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

/* SECOND DELETE ENDPOINT DISABLED */
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
    console.log(`🔒 Looking for products with tag: benchmarkify`);
    console.log(`🎯 Requested to delete exactly ${count} products`);

    // Reset rate limit manager for fresh start
    rateLimitManager.reset();

    // Create GraphQL client first
    const client = createGraphQLClient(storeUrl, accessToken);

    // Get current rate limits to calculate optimal batch configuration
    const rateLimitResult = await handleGraphQLRequest(
      client,
      `query { shop { name id } }`,
      {},
      "rateLimitCheck",
      storeUrl,
      accessToken
    );

    // Initialize rate limit manager with initial response
    rateLimitManager.updateFromResponse(
      rateLimitResult.rateLimit,
      rateLimitResult.success
    );

    // Calculate optimal initial settings based on detected rate limits
    if (rateLimitResult.rateLimit?.leakRate) {
      rateLimitManager.calculateOptimalInitialSettings(
        rateLimitResult.rateLimit.leakRate
      );
    }

    // Get current optimal settings from manager
    const { batchSize, delay: delayBetweenBatches } =
      rateLimitManager.getCurrentSettings();

    console.log(
      `📊 Deleting ${count} products with adaptive rate limiting - Initial batch size: ${batchSize}, Delay: ${delayBetweenBatches}ms`
    );

    // Fetch products with "benchmarkify" tag using pagination (up to requested count)
    console.log(`🔍 Fetching products with tag: benchmarkify (paginated)`);
    const productsToDelete = await fetchProductsByTagWithPagination(
      client,
      storeUrl,
      accessToken,
      "benchmarkify",
      Math.max(1, Math.min(count, 1000000))
    );
    console.log(
      `🔍 Paginated fetch returned ${productsToDelete.length} products`
    );

    console.log(`🔍 Found ${productsToDelete.length} products to delete`);

    // If we have products to delete, proceed with deletion
    if (productsToDelete.length > 0) {
      console.log(
        `🎯 Proceeding with ${productsToDelete.length} products found via Shopify query`
      );
      const products = productsToDelete;
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
        // Get current optimal settings (may have changed from previous batch)
        const currentSettings = rateLimitManager.getCurrentSettings();
        const currentBatchSize = currentSettings.batchSize;
        const currentDelay = currentSettings.delay;

        const batchEnd = Math.min(batchStart + batchSize, deleteCount);
        const batchSizeActual = batchEnd - batchStart;

        console.log(
          `🔄 Processing delete batch ${
            Math.floor(batchStart / batchSize) + 1
          }: products ${
            batchStart + 1
          }-${batchEnd} (batch size: ${batchSizeActual}, delay: ${currentDelay}ms)`
        );

        // Process batch in parallel
        const batchPromises = [];
        for (let i = batchStart; i < batchEnd; i++) {
          const product = products[i];

          batchPromises.push(
            retryGraphQLRequest(
              client,
              GRAPHQL_QUERIES.deleteProduct,
              { input: { id: product.id } },
              "deleteProduct",
              storeUrl,
              accessToken
            )
          );
        }

        // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Log batch results for debugging
        const batchSuccesses = batchResults.filter((r) => r.success).length;
        const batchFailures = batchResults.filter((r) => !r.success).length;
        console.log(
          `📊 Delete batch ${
            Math.floor(batchStart / batchSize) + 1
          } results: ${batchSuccesses} success, ${batchFailures} failures`
        );

        // Optimize for maximum throughput if we have headroom
        if (batchSuccesses > batchFailures * 2) {
          rateLimitManager.optimizeForThroughput();
        }

        // Use current delay from rate limit manager
        if (batchStart + batchSize < deleteCount) {
          console.log(`⏳ Waiting ${currentDelay}ms before next batch...`);
          await new Promise((resolve) => setTimeout(resolve, currentDelay));
        }
      }

      const totalTime = (Date.now() - startTime) / 1000; // Convert to seconds

      // Ensure we only return results for the requested number of products
      const limitedResults = results.slice(0, deleteCount);
      console.log(
        `✅ Deleted exactly ${limitedResults.length} products as requested`
      );

      // Calculate metrics
      const successfulResults = limitedResults.filter((r) => r.success);
      const avgResponseTime =
        successfulResults.length > 0
          ? (
              limitedResults.reduce((sum, r) => sum + r.responseTime, 0) /
              limitedResults.length
            ).toFixed(2)
          : 0;

      const totalCost = limitedResults.reduce(
        (sum, r) => sum + (r.cost || 0),
        0
      );
      const avgCost = (totalCost / limitedResults.length).toFixed(2);

      const successCount = successfulResults.length;
      const totalCount = limitedResults.length;

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

      // Get rate limit manager performance summary
      const rateLimitSummary = rateLimitManager.getPerformanceSummary();

      res.json({
        status: successCount > 0 ? "success" : "error",
        responseTime: avgResponseTime,
        totalTime: totalTime.toFixed(2),
        rateLimit: results[results.length - 1]?.rateLimit || {
          current: 0,
          limit: 1000,
          remaining: 1000,
        },
        details: `Deleted ${successCount}/${totalCount} products successfully using Shopify query. Total time: ${totalTime.toFixed(
          2
        )}s`,
        cost: {
          total: totalCost,
          average: avgCost,
          perSecond: costPerSecond,
          productsPerSecond: (1000 / avgCost).toFixed(2),
        },
        performanceProjections,
        rateLimitAdaptation: rateLimitSummary,
        retryStats: {
          totalRetries: results.filter((r) => r.retriesExhausted).length,
          successfulAfterRetry: results.filter(
            (r) => r.success && r.retriesExhausted === false
          ).length,
        },
      });
      return;
    } else {
      // Fallback: We already set productsToDelete above; use them directly
      const benchmarkProducts = productsToDelete;

      // Only allow deletions of products created by Benchmarkify ('benchmarkify' tag)

      if (benchmarkProducts.length === 0) {
        return res.json({
          status: "error",
          responseTime: 0,
          totalTime: 0,
          rateLimit: { current: 0, limit: 1000, remaining: 1000 },
          details: "No benchmark products available for deletion",
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
        // Get current optimal settings (may have changed from previous batch)
        const currentSettings = rateLimitManager.getCurrentSettings();
        const currentBatchSize = currentSettings.batchSize;
        const currentDelay = currentSettings.delay;

        const batchEnd = Math.min(batchStart + batchSize, deleteCount);
        const batchSizeActual = batchEnd - batchStart;

        console.log(
          `🔄 Processing delete batch ${
            Math.floor(batchStart / batchSize) + 1
          }: products ${
            batchStart + 1
          }-${batchEnd} (batch size: ${batchSizeActual}, delay: ${currentDelay}ms)`
        );

        // Process batch in parallel
        const batchPromises = [];
        for (let i = batchStart; i < batchEnd; i++) {
          const product = products[i];

          batchPromises.push(
            retryGraphQLRequest(
              client,
              GRAPHQL_QUERIES.deleteProduct,
              { input: { id: product.id } },
              "deleteProduct",
              storeUrl,
              accessToken
            )
          );
        }

        // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Log batch results for debugging
        const batchSuccesses = batchResults.filter((r) => r.success).length;
        const batchFailures = batchResults.filter((r) => !r.success).length;
        console.log(
          `📊 Delete batch ${
            Math.floor(batchStart / batchSize) + 1
          } results: ${batchSuccesses} success, ${batchFailures} failures`
        );

        // Optimize for maximum throughput if we have headroom
        if (batchSuccesses > batchFailures * 2) {
          rateLimitManager.optimizeForThroughput();
        }

        // Use current delay from rate limit manager
        if (batchStart + batchSize < deleteCount) {
          console.log(`⏳ Waiting ${currentDelay}ms before next batch...`);
          await new Promise((resolve) => setTimeout(resolve, currentDelay));
        }
      }

      const totalTime = (Date.now() - startTime) / 1000; // Convert to seconds

      // Ensure we only return results for the requested number of products
      const limitedResults = results.slice(0, deleteCount);
      console.log(
        `✅ Deleted exactly ${limitedResults.length} products as requested`
      );

      // Calculate metrics
      const successfulResults = limitedResults.filter((r) => r.success);
      const avgResponseTime =
        successfulResults.length > 0
          ? (
              limitedResults.reduce((sum, r) => sum + r.responseTime, 0) /
              limitedResults.length
            ).toFixed(2)
          : 0;

      const totalCost = limitedResults.reduce(
        (sum, r) => sum + (r.cost || 0),
        0
      );
      const avgCost = (totalCost / limitedResults.length).toFixed(2);

      const successCount = successfulResults.length;
      const totalCount = limitedResults.length;

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

      res.json({
        status: successCount > 0 ? "success" : "error",
        responseTime: avgResponseTime,
        totalTime: totalTime.toFixed(2),
        rateLimit: results[results.length - 1]?.rateLimit || {
          current: 0,
          limit: 1000,
          remaining: 1000,
        },
        details: `Deleted ${successCount}/${totalCount} products successfully using Shopify query. Total time: ${totalTime.toFixed(
          2
        )}s`,
        cost: {
          total: totalCost,
          average: avgCost,
          perSecond: costPerSecond,
          productsPerSecond: (1000 / avgCost).toFixed(2),
        },
        performanceProjections,
        rateLimitAdaptation: rateLimitSummary,
        retryStats: {
          totalRetries: results.filter((r) => r.retriesExhausted).length,
          successfulAfterRetry: results.filter(
            (r) => r.success && r.retriesExhausted === false
          ).length,
        },
      });
    }
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
    console.log(`🔒 Looking for products with tag: benchmarkify`);
    console.log(`🎯 Requested to update exactly ${count} products`);

    // Reset rate limit manager for fresh start
    rateLimitManager.reset();

    // Create GraphQL client first
    const client = createGraphQLClient(storeUrl, accessToken);

    // Get current rate limits to calculate optimal batch configuration
    const rateLimitResult = await handleGraphQLRequest(
      client,
      `query { shop { name id } }`,
      {},
      "rateLimitCheck",
      storeUrl,
      accessToken
    );

    // Initialize rate limit manager with initial response
    rateLimitManager.updateFromResponse(
      rateLimitResult.rateLimit,
      rateLimitResult.success
    );

    // Calculate optimal initial settings based on detected rate limits
    if (rateLimitResult.rateLimit?.leakRate) {
      rateLimitManager.calculateOptimalInitialSettings(
        rateLimitResult.rateLimit.leakRate
      );
    }

    // Get current optimal settings from manager
    const { batchSize, delay: delayBetweenBatches } =
      rateLimitManager.getCurrentSettings();

    console.log(
      `📊 Updating ${count} products with adaptive rate limiting - Initial batch size: ${batchSize}, Delay: ${delayBetweenBatches}ms`
    );

    // Fetch products with "benchmarkify" tag using pagination (up to requested count)
    console.log(`🔍 Fetching products with tag: benchmarkify (paginated)`);
    const allProducts = await fetchProductsByTagWithPagination(
      client,
      storeUrl,
      accessToken,
      "benchmarkify",
      Math.max(1, Math.min(count, 1000000))
    );
    console.log(`🔍 Paginated fetch returned ${allProducts.length} products`);

    console.log(`🔍 Found ${allProducts.length} products to update`);

    // Products are fetched directly from Shopify with "benchmarkify" tag
    const benchmarkProducts = allProducts;

    // Only allow updates to products created by Benchmarkify (with "benchmarkify" tag)

    if (benchmarkProducts.length === 0) {
      return res.json({
        status: "error",
        responseTime: 0,
        totalTime: 0,
        rateLimit: { current: 0, limit: 1000, remaining: 1000 },
        details: "No benchmark products available for update",
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
      // Get current optimal settings (may have changed from previous batch)
      const currentSettings = rateLimitManager.getCurrentSettings();
      const currentBatchSize = currentSettings.batchSize;
      const currentDelay = currentSettings.delay;

      const batchEnd = Math.min(batchStart + batchSize, updateCount);
      const batchSizeActual = batchEnd - batchStart;

      console.log(
        `🔄 Processing update batch ${
          Math.floor(batchStart / batchSize) + 1
        }: products ${
          batchStart + 1
        }-${batchEnd} (batch size: ${batchSizeActual}, delay: ${currentDelay}ms)`
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
          retryGraphQLRequest(
            client,
            GRAPHQL_QUERIES.updateProduct,
            { input: updateData },
            "updateProduct",
            storeUrl,
            accessToken
          )
        );
      }

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Log batch results for debugging
      const batchSuccesses = batchResults.filter((r) => r.success).length;
      const batchFailures = batchResults.filter((r) => !r.success).length;
      console.log(
        `📊 Update batch ${
          Math.floor(batchStart / batchSize) + 1
        } results: ${batchSuccesses} success, ${batchFailures} failures`
      );

      // Optimize for maximum throughput if we have headroom
      if (batchSuccesses > batchFailures * 2) {
        rateLimitManager.optimizeForThroughput();
      }

      // Use current delay from rate limit manager
      if (batchStart + batchSize < updateCount) {
        console.log(`⏳ Waiting ${currentDelay}ms before next batch...`);
        await new Promise((resolve) => setTimeout(resolve, currentDelay));
      }
    }

    // Ensure we only return results for the requested number of products
    const limitedResults = results.slice(0, updateCount);
    console.log(
      `✅ Updated exactly ${limitedResults.length} products as requested`
    );

    // Calculate metrics
    const successfulResults = limitedResults.filter((r) => r.success);
    const avgResponseTime =
      successfulResults.length > 0
        ? (
            limitedResults.reduce((sum, r) => sum + r.responseTime, 0) /
            limitedResults.length
          ).toFixed(2)
        : 0;

    const totalCost = limitedResults.reduce((sum, r) => sum + (r.cost || 0), 0);
    const avgCost = (totalCost / limitedResults.length).toFixed(2);

    const successCount = successfulResults.length;
    const totalCount = limitedResults.length;

    const totalTime = (Date.now() - startTime) / 1000; // Convert to seconds

    const costPerSecond =
      successfulResults.length > 0
        ? (
            totalCost /
            limitedResults.reduce((sum, r) => sum + r.responseTime, 0)
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

    // Get rate limit manager performance summary
    const rateLimitSummary = rateLimitManager.getPerformanceSummary();

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
      rateLimitAdaptation: rateLimitSummary,
      retryStats: {
        totalRetries: results.filter((r) => r.retriesExhausted).length,
        successfulAfterRetry: results.filter(
          (r) => r.success && r.retriesExhausted === false
        ).length,
      },
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
      (product) => product.tags && product.tags.includes("benchmarkify")
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

// Rate limiting and retry management system
class RateLimitManager {
  constructor() {
    // More aggressive initial settings for higher throughput
    this.currentBatchSize = 50; // Increased from 10
    this.currentDelay = 25; // Reduced from 100ms
    this.maxBatchSize = 200; // Increased from 100
    this.minDelay = 10; // Reduced from 50ms
    this.maxDelay = 2000; // Reduced from 5000ms
    this.retryAttempts = 3;
    this.retryDelay = 500; // Reduced from 1000ms
    this.rateLimitHistory = [];
    this.failureHistory = [];

    // Enterprise API optimization flags
    this.isEnterprisePlan = false;
    this.aggressiveMode = true;
  }

  // Update settings based on rate limit response
  updateFromResponse(rateLimitInfo, success = true) {
    if (success && rateLimitInfo) {
      // Detect Enterprise plan based on leak rate
      if (rateLimitInfo.leakRate >= 2000) {
        this.isEnterprisePlan = true;
        this.aggressiveMode = true;
        console.log(
          `🚀 Enterprise API detected (${rateLimitInfo.leakRate} points/sec) - enabling aggressive mode`
        );
      }

      const usagePercentage =
        (rateLimitInfo.current / rateLimitInfo.limit) * 100;

      // Store rate limit info
      this.rateLimitHistory.push({
        timestamp: Date.now(),
        usage: usagePercentage,
        current: rateLimitInfo.current,
        limit: rateLimitInfo.limit,
        remaining: rateLimitInfo.remaining,
        leakRate: rateLimitInfo.leakRate || rateLimitInfo.restoreRate,
      });

      // More aggressive adjustment strategy for Enterprise plans
      if (this.isEnterprisePlan && this.aggressiveMode) {
        if (usagePercentage > 90) {
          // Very high usage - minimal reduction
          this.currentBatchSize = Math.max(
            Math.floor(this.currentBatchSize * 0.85),
            this.maxBatchSize / 4
          );
          this.currentDelay = Math.min(
            this.maxDelay,
            Math.floor(this.currentDelay * 1.2)
          );
          console.log(
            `⚠️ Very high rate limit usage (${usagePercentage.toFixed(
              1
            )}%). Reducing batch size to ${
              this.currentBatchSize
            }, increasing delay to ${this.currentDelay}ms`
          );
        } else if (usagePercentage > 75) {
          // High usage - slight reduction
          this.currentBatchSize = Math.max(
            Math.floor(this.currentBatchSize * 0.9),
            this.maxBatchSize / 3
          );
          this.currentDelay = Math.min(
            this.maxDelay,
            Math.floor(this.currentDelay * 1.1)
          );
          console.log(
            `⚠️ High rate limit usage (${usagePercentage.toFixed(
              1
            )}%). Adjusting batch size to ${this.currentBatchSize}, delay to ${
              this.currentDelay
            }ms`
          );
        } else if (usagePercentage < 50) {
          // Low usage - aggressive increase
          this.currentBatchSize = Math.min(
            this.maxBatchSize,
            Math.floor(this.currentBatchSize * 1.3)
          );
          this.currentDelay = Math.max(
            this.minDelay,
            Math.floor(this.currentDelay * 0.7)
          );
          console.log(
            `✅ Low rate limit usage (${usagePercentage.toFixed(
              1
            )}%). Increasing batch size to ${
              this.currentBatchSize
            }, reducing delay to ${this.currentDelay}ms`
          );
        } else if (usagePercentage < 30) {
          // Very low usage - maximum throughput
          this.currentBatchSize = Math.min(
            this.maxBatchSize,
            Math.floor(this.currentBatchSize * 1.5)
          );
          this.currentDelay = Math.max(
            this.minDelay,
            Math.floor(this.currentDelay * 0.5)
          );
          console.log(
            `🚀 Very low rate limit usage (${usagePercentage.toFixed(
              1
            )}%). Maximizing batch size to ${
              this.currentBatchSize
            }, minimizing delay to ${this.currentDelay}ms`
          );
        }
      } else {
        // Standard adjustment strategy (existing logic)
        if (usagePercentage > 85) {
          this.currentBatchSize = Math.max(
            1,
            Math.floor(this.currentBatchSize * 0.7)
          );
          this.currentDelay = Math.min(
            this.maxDelay,
            Math.floor(this.currentDelay * 1.5)
          );
          console.log(
            `⚠️ High rate limit usage (${usagePercentage.toFixed(
              1
            )}%). Reducing batch size to ${
              this.currentBatchSize
            }, increasing delay to ${this.currentDelay}ms`
          );
        } else if (usagePercentage > 70) {
          this.currentBatchSize = Math.max(
            1,
            Math.floor(this.currentBatchSize * 0.9)
          );
          this.currentDelay = Math.min(
            this.maxDelay,
            Math.floor(this.currentDelay * 1.2)
          );
          console.log(
            `⚠️ Moderate rate limit usage (${usagePercentage.toFixed(
              1
            )}%). Adjusting batch size to ${this.currentBatchSize}, delay to ${
              this.currentDelay
            }ms`
          );
        } else if (usagePercentage < 30) {
          this.currentBatchSize = Math.min(
            this.maxBatchSize,
            Math.floor(this.currentBatchSize * 1.2)
          );
          this.currentDelay = Math.max(
            this.minDelay,
            Math.floor(this.currentDelay * 0.8)
          );
          console.log(
            `✅ Low rate limit usage (${usagePercentage.toFixed(
              1
            )}%). Increasing batch size to ${
              this.currentBatchSize
            }, reducing delay to ${this.currentDelay}ms`
          );
        }
      }
    }
  }

  // Get current optimal settings
  getCurrentSettings() {
    return {
      batchSize: this.currentBatchSize,
      delay: this.currentDelay,
    };
  }

  // Calculate retry delay with exponential backoff
  getRetryDelay(attempt) {
    return Math.min(this.retryDelay * Math.pow(2, attempt), this.maxDelay);
  }

  // Record failure for analysis
  recordFailure(error, operation) {
    this.failureHistory.push({
      timestamp: Date.now(),
      error: error.message,
      operation,
      batchSize: this.currentBatchSize,
      delay: this.currentDelay,
    });

    // If we have many recent failures, reduce batch size
    const recentFailures = this.failureHistory.filter(
      (f) => Date.now() - f.timestamp < 60000 // Last minute
    );

    if (recentFailures.length > 5) {
      this.currentBatchSize = Math.max(
        1,
        Math.floor(this.currentBatchSize * 0.8)
      );
      this.currentDelay = Math.min(
        this.maxDelay,
        Math.floor(this.currentDelay * 1.3)
      );
      console.log(
        `🚨 High failure rate detected. Reducing batch size to ${this.currentBatchSize}, increasing delay to ${this.currentDelay}ms`
      );
      // Clear failure history to avoid continuous reduction
      this.failureHistory = [];
    }
  }

  // Get performance summary
  getPerformanceSummary() {
    if (this.rateLimitHistory.length === 0) return null;

    const recent = this.rateLimitHistory.slice(-10);
    const avgUsage =
      recent.reduce((sum, r) => sum + r.usage, 0) / recent.length;
    const avgLeakRate =
      recent.reduce((sum, r) => sum + (r.leakRate || 100), 0) / recent.length;

    return {
      averageUsage: avgUsage,
      averageLeakRate: avgLeakRate,
      currentBatchSize: this.currentBatchSize,
      currentDelay: this.currentDelay,
      totalRateLimitChecks: this.rateLimitHistory.length,
      totalFailures: this.failureHistory.length,
      isEnterprisePlan: this.isEnterprisePlan,
      aggressiveMode: this.aggressiveMode,
    };
  }

  // Optimize for maximum throughput during operation
  optimizeForThroughput() {
    if (this.isEnterprisePlan && this.aggressiveMode) {
      // For Enterprise API, push the limits more aggressively
      const currentUsage =
        this.rateLimitHistory.length > 0
          ? this.rateLimitHistory[this.rateLimitHistory.length - 1].usage
          : 0;

      if (currentUsage < 60) {
        // We have plenty of headroom - maximize throughput
        this.currentBatchSize = Math.min(
          this.maxBatchSize,
          this.currentBatchSize + 25
        );
        this.currentDelay = Math.max(this.minDelay, this.currentDelay - 5);
        console.log(
          `🚀 Optimizing for maximum throughput: batch size ${this.currentBatchSize}, delay ${this.currentDelay}ms`
        );
      }
    }
  }

  // Calculate optimal initial settings based on rate limits
  calculateOptimalInitialSettings(leakRate) {
    if (leakRate >= 2000) {
      // Enterprise API - maximum throughput
      this.currentBatchSize = Math.min(200, Math.floor(leakRate / 10));
      this.currentDelay = 10;
      this.maxBatchSize = Math.min(400, Math.floor(leakRate / 5));
      console.log(
        `🚀 Enterprise API detected - setting batch size to ${this.currentBatchSize}, delay to ${this.currentDelay}ms`
      );
    } else if (leakRate >= 1000) {
      // Shopify Plus - high throughput
      this.currentBatchSize = Math.min(100, Math.floor(leakRate / 10));
      this.currentDelay = 20;
      this.maxBatchSize = Math.min(200, Math.floor(leakRate / 5));
      console.log(
        `⚡ Shopify Plus detected - setting batch size to ${this.currentBatchSize}, delay to ${this.currentDelay}ms`
      );
    } else if (leakRate >= 200) {
      // Advanced Shopify - moderate throughput
      this.currentBatchSize = Math.min(50, Math.floor(leakRate / 10));
      this.currentDelay = 50;
      this.maxBatchSize = Math.min(100, Math.floor(leakRate / 5));
      console.log(
        `📈 Advanced Shopify detected - setting batch size to ${this.currentBatchSize}, delay to ${this.currentDelay}ms`
      );
    } else {
      // Standard Shopify - conservative throughput
      this.currentBatchSize = Math.min(25, Math.floor(leakRate / 10));
      this.currentDelay = 100;
      this.maxBatchSize = Math.min(50, Math.floor(leakRate / 5));
      console.log(
        `📊 Standard Shopify detected - setting batch size to ${this.currentBatchSize}, delay to ${this.currentDelay}ms`
      );
    }
  }

  // Reset manager for new operation
  reset() {
    this.currentBatchSize = 50;
    this.currentDelay = 25;
    this.rateLimitHistory = [];
    this.failureHistory = [];
    this.isEnterprisePlan = false;
    this.aggressiveMode = true;
    console.log(
      `🔄 Rate limit manager reset to aggressive settings (batch: ${this.currentBatchSize}, delay: ${this.currentDelay}ms)`
    );
  }
}

// Global rate limit manager
const rateLimitManager = new RateLimitManager();

// Retry wrapper for GraphQL requests with exponential backoff
async function retryGraphQLRequest(
  client,
  query,
  variables,
  operationName,
  storeUrl,
  accessToken,
  maxRetries = 3
) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await handleGraphQLRequest(
        client,
        query,
        variables,
        operationName,
        storeUrl,
        accessToken
      );

      // Update rate limit manager with response info
      rateLimitManager.updateFromResponse(result.rateLimit, result.success);

      if (result.success) {
        return result;
      } else {
        // Log the failure
        console.log(
          `❌ ${operationName} failed (attempt ${attempt + 1}/${
            maxRetries + 1
          }): ${result.error}`
        );
        lastError = result.error;

        // Record failure for rate limit analysis
        rateLimitManager.recordFailure(new Error(result.error), operationName);

        // If this is a rate limit error, wait longer
        if (result.error && result.error.includes("rate limit")) {
          const retryDelay = rateLimitManager.getRetryDelay(attempt);
          console.log(
            `⏳ Rate limit hit, waiting ${retryDelay}ms before retry...`
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    } catch (error) {
      console.log(
        `❌ ${operationName} threw error (attempt ${attempt + 1}/${
          maxRetries + 1
        }): ${error.message}`
      );
      lastError = error;

      // Record failure for rate limit analysis
      rateLimitManager.recordFailure(error, operationName);

      // If this is the last attempt, don't wait
      if (attempt < maxRetries) {
        const retryDelay = rateLimitManager.getRetryDelay(attempt);
        console.log(`⏳ Waiting ${retryDelay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  // All retries exhausted
  return {
    success: false,
    error: `All ${maxRetries + 1} attempts failed. Last error: ${lastError}`,
    cost: QUERY_COSTS[operationName] || 0,
    retriesExhausted: true,
  };
}
