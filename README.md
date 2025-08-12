# 🚀 Benchmarkify

A mini website for benchmarking Shopify store **GraphQL Admin API** performance. Test your store's speed for product creation, updates, and deletions while automatically handling Shopify's API rate limits and analyzing query costs.

## ✨ Features

- **GraphQL Admin API**: Uses Shopify's modern GraphQL API instead of REST
- **Product Creation Benchmark**: Tests how fast your store can create new products (up to 1,000,000 products)
- **Product Update Benchmark**: Measures update operation performance (up to 1,000,000 products)
- **Product Deletion Benchmark**: Evaluates deletion speed (up to 1,000,000 products)
- **Rate Limit Monitoring**: Real-time tracking of API usage and limits
- **Query Cost Analysis**: Shows cost per operation and theoretical limits
- **Performance Projections**: Estimates for 1K, 100K, 1M, and 10M product operations
- **Rate Limit Analysis**: Detailed explanation of your store's API limits and practical implications
- **Credential Storage**: Securely store and reuse credentials for repeated testing
- **GraphQL Query Display**: View actual GraphQL queries and mutations used
- **Performance Metrics**: Response times, costs per second, products per second
- **Real-time Progress**: Live updates during benchmarking
- **Beautiful UI**: Modern, responsive interface with GraphQL-specific styling
- **Random Data**: Uses Faker data for realistic testing
- **Audit Logging**: Detailed logs of all operations for analysis

## 🛠️ Setup

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- A Shopify store with Admin API access

### Installation

1. **Clone or download the project**

   ```bash
   git clone <repository-url>
   cd benchmarkify
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Start the server**

   ```bash
   npm start
   ```

   For development with auto-restart:

   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:3000`

## 🔑 Shopify Setup

### Getting Your Access Token

1. Go to your Shopify admin panel
2. Navigate to **Apps** → **Develop apps**
3. Create a new app or select an existing one
4. Go to **API credentials**
5. Generate an **Admin API access token**
6. Copy the token (starts with `shpat_`)

### Required Permissions

Your app needs these scopes:

- `read_products`
- `write_products`

## 📊 How to Use

1. **Enter Store Details**

   - Store URL: `https://your-store.myshopify.com`
   - Access Token: Your Admin API token

2. **Store Credentials (Optional)**

   - Click "Store Current Credentials" to save for later use
   - Use "Load Stored Credentials" to quickly reload previous settings
   - Credentials are stored securely and expire after 24 hours

3. **Analyze Rate Limits (Optional)**

   - Click "Analyze Rate Limits" to understand your store's API capabilities
   - Get detailed explanations of what your rate limits mean in practice
   - View time estimates for large-scale operations

4. **Configure Benchmark**

   - Select operations to run (Create, Update, Delete)
   - Set product counts (1 to 1,000,000)
   - Configure batch size and delay settings

5. **Start Benchmarking**

   - Click "Start GraphQL Benchmarking"
   - Watch real-time progress
   - View results in the enhanced table

6. **Review Results**

   - Response times for each operation
   - Rate limit information (current/limit)
   - Query costs per operation
   - Products per second calculations
   - Success/failure counts
   - Performance projections for larger operations

7. **Analyze Performance**
   - Rate limit & cost analysis dashboard
   - GraphQL query/mutation display
   - Theoretical performance limits
   - Summary statistics
   - Download detailed audit logs

## 🆕 New Features

### 🔐 Credential Storage

- **Secure Storage**: Store your store URL and access token for easy reuse
- **24-Hour Expiry**: Credentials automatically expire for security
- **Local & Server Storage**: Backed up both locally and on server
- **Quick Reload**: One-click credential restoration

### 📈 Performance Projections

- **Scalability Analysis**: See how your store would perform with larger operations
- **Time Estimates**: Projected completion times for 1K, 100K, 1M, and 10M products
- **Cost Projections**: Estimated API cost for large-scale operations
- **Real-time Updates**: Projections update based on actual benchmark results

### 📊 Rate Limit Analysis

- **Detailed Explanation**: Understand what your API limits mean in practice
- **Practical Implications**: See how many products you can create/update/delete per second/minute/hour
- **Time Estimates**: Calculate how long large operations would take
- **Recommendations**: Get tips for optimizing your API usage

### 🚀 High-Volume Support

- **Up to 1 Million Products**: Test with much larger datasets
- **Adaptive Rate Limiting**: Automatically adjusts to your store's limits
- **Batch Processing**: Efficient handling of large operations
- **Progress Tracking**: Real-time updates for long-running operations

## ⚠️ Important Notes

### ⚠️ **WARNING: This tool creates and deletes real products!**

- **Product Creation**: Creates test products with random data (up to 1,000,000)
- **Product Updates**: Updates existing benchmark products (up to 1,000,000)
- **Product Deletion**: Deletes benchmark products from your store (up to 1,000,000)

**Only use this on development/test stores or stores where you're okay with losing products!**

### GraphQL Query Costs & Rate Limits

- **Product Creation**: 10 cost points
- **Product Update**: 10 cost points
- **Product Deletion**: 10 cost points
- **Product Query**: 1 cost point per product

Shopify's GraphQL Admin API uses **calculated query cost** rate limiting with a **leaky bucket algorithm**. The leak rates are:

- **Standard Shopify**: 100 points/second
- **Advanced Shopify**: 200 points/second
- **Shopify Plus**: 1000 points/second
- **Shopify for Enterprise**: 2000 points/second

This means you can theoretically:

- **Standard Shopify**: Create/update/delete up to 10 products per second (100 points ÷ 10 points per operation)
- **Shopify Plus**: Create/update/delete up to 100 products per second (1000 points ÷ 10 points per operation)
- **Query operations**: Much higher throughput since queries cost only 1 point per product

### How Calculated Query Points Work

Shopify's GraphQL Admin API uses a sophisticated cost calculation system:

- **Scalar/Enum fields**: 0 points (free)
- **Object fields**: 1 point each
- **Interface/Union fields**: Maximum cost of possible selections
- **Connection fields**: Sized by first/last arguments
- **Mutations**: 10 points (fixed cost)

The cost is calculated based on the **requested** fields, not the actual data returned. This means:

- Simple queries cost less and allow higher throughput
- Complex queries with many fields cost more
- You can optimize by selecting only the fields you need

Shopify uses a **leaky bucket algorithm** where:

- Each **app-store combination** has a bucket with capacity based on your plan
- Points are **consumed** when making requests (mutations cost 10 points, queries cost 1+ points)
- Points are **restored continuously** at a fixed rate per second (the "leak rate")
- This allows for **bursts of activity** while maintaining fair usage across all apps
- **No waiting periods** - points are restored in real-time, not reset at intervals

### High-Volume Operations

With the correct rate limits, here are more accurate time estimates:

**Standard Shopify (100 points/second):**

- **1,000 Products**: ~100 seconds (1.7 minutes)
- **100,000 Products**: ~1,000 seconds (16.7 minutes)
- **1,000,000 Products**: ~10,000 seconds (2.8 hours)

**Shopify Plus (1000 points/second):**

- **1,000 Products**: ~10 seconds
- **100,000 Products**: ~100 seconds (1.7 minutes)
- **1,000,000 Products**: ~1,000 seconds (16.7 minutes)

_Note: These are theoretical minimums. Actual times may be longer due to network latency, Shopify processing time, and the need to implement delays to avoid overwhelming the API._

## 🏗️ Architecture

### Frontend

- **HTML**: Clean, semantic markup with GraphQL-specific sections
- **CSS**: Modern, responsive design with rate limit cards and query tabs
- **JavaScript**: ES6+ with async/await for GraphQL API calls

### Backend

- **Express.js**: RESTful API endpoints
- **GraphQL Client**: GraphQL-request for Shopify API calls
- **Faker.js**: Random data generation
- **CORS**: Cross-origin resource sharing

### API Endpoints

- `POST /api/benchmark/create` - Test GraphQL product creation
- `POST /api/benchmark/update` - Test GraphQL product updates
- `POST /api/benchmark/delete` - Test GraphQL product deletion
- `POST /api/rate-limit-analysis` - Analyze store's rate limits
- `POST /api/store-credentials` - Store credentials securely
- `GET /api/stored-credentials/:sessionId` - Retrieve stored credentials
- `GET /api/health` - Health check with GraphQL info

## 🔧 Configuration

### Environment Variables

- `PORT`: Server port (default: 3000)

### Customization

You can modify these values in `server.js`:

- Number of products to create/update/delete (up to 1,000,000)
- Delay between API calls
- Rate limit thresholds
- GraphQL query structures

## 🚨 Troubleshooting

### Rate Limit Detection Issues

**Why doesn't the app show my updated rate limits?**

The app detects rate limits from your actual API responses, not from your Shopify plan settings. If you've upgraded your plan but don't see the new limits:

1. **Check your app's access scopes** - ensure your app has the necessary permissions
2. **Verify the API client** - rate limits are per app-store combination, not global
3. **Wait for propagation** - plan changes may take time to propagate to the API
4. **Check response headers** - the app looks for rate limit info in GraphQL response extensions
5. **Use the cost debug header** - add `Shopify-GraphQL-Cost-Debug=1` to see detailed cost information

**Pro Tip**: The app now extracts rate limit information from both HTTP headers AND GraphQL response extensions for more accurate detection.

### Common Issues

1. **"Missing store URL or access token"**

   - Ensure both fields are filled
   - Check URL format (must include `https://`)

2. **"Unauthorized" errors**

   - Verify your access token is correct
   - Check if token has required permissions
   - Ensure token hasn't expired

3. **Rate limit errors**

   - The tool should handle this automatically
   - If persistent, wait a few minutes and try again

4. **GraphQL errors**

   - Check if your store supports GraphQL Admin API
   - Ensure you're using the correct API version (2023-10)

5. **High-volume operation timeouts**
   - Large operations may take hours or days
   - Use the progress tracking to monitor status
   - Consider running smaller batches first

### Debug Mode

Check the browser console and server logs for detailed error information.

## 📈 Understanding Results

### Response Time

- Lower is better
- Includes network latency and Shopify processing time
- Measured in seconds

### Rate Limit

- Shows current API usage: `current/limit`
- Example: `45/1000` means 45 cost points used out of 1000 limit

### Query Cost

- Each operation has a specific cost in points
- Lower cost = more operations possible per minute
- Total cost shows cumulative usage

### Products Per Second

- Calculated based on response time and cost
- Theoretical maximum based on Shopify's rate limits
- Helps understand your store's performance ceiling

### Performance Projections

- **Time Estimates**: How long larger operations would take
- **Cost Estimates**: Total API cost for large operations
- **Scalability**: How your store performs under load

### Status

- **Completed**: Operation successful
- **Failed**: Operation failed (check details)
- **Pending**: Operation not yet started

## 🆕 What's New in GraphQL Version

### GraphQL Benefits

- **Efficient Queries**: Only fetch the data you need
- **Single Endpoint**: All operations through one URL
- **Better Performance**: Reduced over-fetching and under-fetching
- **Modern API**: Future-proof approach for Shopify development

### Enhanced Monitoring

- **Real-time Rate Limits**: Live tracking of API usage
- **Cost Analysis**: Understand your API consumption
- **Performance Metrics**: Products per second calculations
- **Query Display**: See exactly what GraphQL is being sent
- **Performance Projections**: Scale your operations intelligently

## 🤝 Contributing

Feel free to submit issues, feature requests, or pull requests!

## 📄 License

MIT License - feel free to use this for your own projects.

## ⚡ Performance Tips

- Run benchmarks during off-peak hours
- Use on development stores first
- Monitor your Shopify GraphQL API usage
- Consider running smaller batches for production stores
- Use the cost analysis to optimize your operations
- Store credentials for repeated testing
- Analyze rate limits before large operations
- Use performance projections to plan large-scale operations
- **Optimize GraphQL queries**: Only select the fields you need to reduce costs
- **Use the Shopify-GraphQL-Cost-Debug=1 header** to analyze query costs
- **Understand your plan limits**: Standard (100 pts/sec) vs Plus (1000 pts/sec) vs Enterprise (2000 pts/sec)

---

**Happy GraphQL Benchmarking! 🎯**
