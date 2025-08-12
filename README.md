# 🚀 Benchmarkify

A mini website for benchmarking Shopify store **GraphQL Admin API** performance. Test your store's speed for product creation, updates, and deletions while automatically handling Shopify's API rate limits and analyzing query costs.

## ✨ Features

- **GraphQL Admin API**: Uses Shopify's modern GraphQL API instead of REST
- **Product Creation Benchmark**: Tests how fast your store can create new products
- **Product Update Benchmark**: Measures update operation performance
- **Product Deletion Benchmark**: Evaluates deletion speed
- **Rate Limit Monitoring**: Real-time tracking of API usage and limits
- **Query Cost Analysis**: Shows cost per operation and theoretical limits
- **GraphQL Query Display**: View actual GraphQL queries and mutations used
- **Performance Metrics**: Response times, costs per second, products per second
- **Real-time Progress**: Live updates during benchmarking
- **Beautiful UI**: Modern, responsive interface with GraphQL-specific styling
- **Random Data**: Uses Faker data for realistic testing

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

2. **Start Benchmarking**

   - Click "Start GraphQL Benchmarking"
   - Watch real-time progress
   - View results in the enhanced table

3. **Review Results**

   - Response times for each operation
   - Rate limit information (current/limit)
   - Query costs per operation
   - Products per second calculations
   - Success/failure counts

4. **Analyze Performance**
   - Rate limit & cost analysis dashboard
   - GraphQL query/mutation display
   - Theoretical performance limits
   - Summary statistics

## ⚠️ Important Notes

### ⚠️ **WARNING: This tool creates and deletes real products!**

- **Product Creation**: Creates 5 test products with random data
- **Product Updates**: Updates 3 existing products
- **Product Deletion**: Deletes 3 products from your store

**Only use this on development/test stores or stores where you're okay with losing products!**

### GraphQL Query Costs

- **Product Creation**: 10 cost points
- **Product Update**: 10 cost points
- **Product Deletion**: 10 cost points
- **Product Query**: 1 cost point per product

Shopify's standard rate limit is 1000 cost points per minute, so you can theoretically:

- Create/update/delete up to 100 products per minute
- Query up to 1000 products per minute

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
- `GET /api/health` - Health check with GraphQL info

## 🔧 Configuration

### Environment Variables

- `PORT`: Server port (default: 3000)

### Customization

You can modify these values in `server.js`:

- Number of products to create/update/delete
- Delay between API calls
- Rate limit thresholds
- GraphQL query structures

## 🚨 Troubleshooting

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

---

**Happy GraphQL Benchmarking! 🎯**
