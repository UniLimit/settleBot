const { request, gql } = require("graphql-request");
const Web3 = require("web3");

// Replace with your Ethereum node URL
const WEB3_PROVIDER_URL = "https://mainnet.infura.io/v3/YOUR-PROJECT-ID";

// Array of Uniswap V3 pool addresses to track
const POOL_ADDRESSES = ["0x123...", "0x456...", "0x789..."];

// GraphQL query to fetch pool data
const query = gql`
  query PoolQuery($poolAddress: Bytes!) {
    pool(id: $poolAddress) {
      token0 {
        symbol
      }
      token1 {
        symbol
      }
      tick
      sqrtPrice
    }
  }
`;

// GraphQL endpoint for Uniswap V3 subgraph
const endpoint = "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3";

// Create a Web3 instance to listen for new blocks
const web3 = new Web3(WEB3_PROVIDER_URL);

// Function to fetch and process pool data for a given pool address
async function trackPoolPrice(poolAddress) {
  try {
    const data = await request(endpoint, query, { poolAddress });
    const { token0, token1, tick, sqrtPrice } = data.pool;
    const price =
      (Math.pow(sqrtPrice, 2) * Math.pow(10, tick)) / Math.pow(2, 96);
    console.log(`Price of ${token0.symbol}/${token1.symbol}: ${price}`);
  } catch (error) {
    console.error(`Error fetching pool data for ${poolAddress}:`, error);
  }
}

// Function to loop through pool addresses and track their prices
async function trackPoolPrices() {
  for (const poolAddress of POOL_ADDRESSES) {
    await trackPoolPrice(poolAddress);
  }
}

// Listen for new blocks and update pool prices on each block
web3.eth.subscribe("newBlockHeaders", async (error, result) => {
  if (error) {
    console.error("Error listening for new blocks:", error);
    return;
  }

  console.log(`New block detected: ${result.number}`);
  await trackPoolPrices();
});
