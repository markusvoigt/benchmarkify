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

    const leakRate =
      rateLimitResult.rateLimit?.leakRate ||
      rateLimitResult.rateLimit?.restoreRate ||
      100;
    const { batchSize, delayBetweenBatches } =
      calculateOptimalBatchConfig(leakRate);

    console.log(
      `📊 Deleting ${count} products with dynamic config - Batch size: ${batchSize}, Delay: ${delayBetweenBatches}ms (Leak rate: ${leakRate} points/sec)`
    );

    // First, try to use stored product IDs from creation logs (most reliable)
    const storedProductIds = getStoredProductIds(count);
    let productsToDelete = [];

    if (storedProductIds.length > 0) {
      console.log(
        `🎯 Using ${storedProductIds.length} stored product IDs for direct deletion`
      );
      productsToDelete = storedProductIds.map((product) => ({
        id: product.id,
        title: product.title,
        source: "stored_ids",
      }));
    } else {
      console.log(
        `🔍 No stored product IDs found, falling back to product search...`
      );

      // Fallback: Get products to delete with multiple fallback strategies and retry logic
      let productsResponse;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        productsResponse = await handleGraphQLRequest(
          client,
          GRAPHQL_QUERIES.getProducts,
          { first: 250 }, // Get more products to find benchmark ones
          "getProducts",
          storeUrl,
          accessToken
        );

        // If we found products, break out of retry loop
        if (
          productsResponse.success &&
          productsResponse.data?.products?.edges?.length > 0
        ) {
          break;
        }

        // If no products found and we're not on the last retry, wait and retry
        if (retryCount < maxRetries - 1) {
          const waitTime = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
          console.log(
            `⏳ No products found, retrying in ${
              waitTime / 1000
            } seconds... (attempt ${retryCount + 1}/${maxRetries})`
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          retryCount++;
        } else {
          retryCount++;
        }
      }
    }

    // If we have stored product IDs, use them directly
    if (productsToDelete.length > 0) {
      console.log(
        `🎯 Proceeding with ${productsToDelete.length} stored product IDs`
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
        details: `Deleted ${successCount}/${totalCount} products successfully using stored IDs. Total time: ${totalTime.toFixed(
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
      return;
    } else {
      // Fallback: Process products from search results
      if (
        !productsResponse.success ||
        !productsResponse.data?.products?.edges?.length
      ) {
        return res.json({
          status: "error",
          responseTime: 0,
          totalTime: 0,
          rateLimit: { current: 0, limit: 1000, remaining: 1000 },
          details: "No products found in store",
          cost: { total: 0, average: 0, perSecond: 0, productsPerSecond: 0 },
          performanceProjections: {},
        });
      }

      // Filter products with multiple fallback strategies
      const allProducts = productsResponse.data.products.edges.map(
        (edge) => edge.node
      );

      // Strategy 1: Look for products with current session tag
      let benchmarkProducts = allProducts.filter(
        (product) =>
          product.tags && product.tags.includes(SESSION_BENCHMARK_TAG)
      );

      // Strategy 2: If no current session products, look for any benchmarkify products
      if (benchmarkProducts.length === 0) {
        benchmarkProducts = allProducts.filter(
          (product) =>
            product.tags &&
            product.tags.some((tag) => tag.startsWith("benchmarkify-"))
        );
        console.log(
          `🔍 Found ${benchmarkProducts.length} products with benchmarkify tags (fallback strategy 2)`
        );
      }

      // Strategy 3: If still no products, look for recently created products (last 24 hours)
      if (benchmarkProducts.length === 0) {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        benchmarkProducts = allProducts.filter((product) => {
          const createdAt = new Date(product.createdAt);
          return createdAt > oneDayAgo;
        });
        console.log(
          `🔍 Found ${benchmarkProducts.length} recently created products (fallback strategy 3)`
        );
      }

      // Strategy 4: If still no products, use any available products (with warning)
      if (benchmarkProducts.length === 0) {
        benchmarkProducts = allProducts.slice(
          0,
          Math.min(count, allProducts.length)
        );
        console.log(
          `⚠️ Using ${benchmarkProducts.length} available products (fallback strategy 4 - use with caution)`
        );
      }

      if (benchmarkProducts.length === 0) {
        return res.json({
          status: "error",
          responseTime: 0,
          totalTime: 0,
          rateLimit: { current: 0, limit: 1000, remaining: 1000 },
          details:
            "No products available for deletion after all fallback strategies",
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
