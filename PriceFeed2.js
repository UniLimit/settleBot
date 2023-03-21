const Web3 = require("web3");
const { request } = require("graphql-request");
require("dotenv").config();

const provider = new Web3.providers.WebsocketProvider(
  `wss://mainnet.infura.io/ws/v3/${process.env.INFURA_PROJECT_ID}`
);
const web3 = new Web3(provider);
const BigNumber = require("bignumber.js");
const UNISWAP_V3_POOL_ABI = require("./UniswapV3Pool.json");

//get open orders data
async function getOpenLimitOrdersFromSubgraph() {
  // Replace this with the actual API call to fetch data from the subgraph. This is a mock data structure
  return [
    {
      user: "0x851dB07Ac4c422010F5dD2a904EC470D660b15e5",
      pool: "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8",
      targetPrice: "1000000000000000000000",
      limitType: "Limit Short",
    },
  ];
}

//get price from V3 pool
async function getPoolPriceByPoolAddress(poolAddress) {
  try {
    const poolContract = new web3.eth.Contract(
      UNISWAP_V3_POOL_ABI,
      poolAddress
    );

    const [token0, token1, tickSpacing] = await Promise.all([
      poolContract.methods.token0().call(),
      poolContract.methods.token1().call(),
      poolContract.methods.tickSpacing().call(),
    ]);

    const [tick] = await Promise.all([
      poolContract.methods
        .slot0()
        .call()
        .then((slot0) => slot0.tick),
    ]);

    const tickLower = Math.floor(tick / tickSpacing) * tickSpacing;
    const tickUpper = Math.ceil(tick / tickSpacing) * tickSpacing;

    const [position] = await Promise.all([
      poolContract.methods
        .positions(
          web3.utils.keccak256(
            web3.eth.abi.encodeParameters(
              ["address", "int24", "int24"],
              [poolAddress, tickLower, tickUpper]
            )
          )
        )
        .call(),
    ]);

    const liquidity = position.liquidity;
    const sqrtPriceX96 = new BigNumber(1.0001)
      .pow(tick)
      .times(2 ** 96)
      .sqrt();
    const price = sqrtPriceX96
      .times(liquidity)
      .times(2)
      .div(2 ** 128);
    const priceInWei = price
      .times(10 ** 18)
      .toFixed(0)
      .toString();

    console.log(`Pool ${poolAddress}: ${priceInWei}`);
    return priceInWei;
  } catch (error) {
    console.error("Error fetching pool data:", error);
  }
}

//call smart contrat settle function to settle order
async function executeLimitOrder(user, poolAddress, limitType) {
  // Replace this with the actual function execution logic
  console.log(`Executing ${limitType} for user ${user} on pool ${poolAddress}`);
}

//check if limit order should be settled
async function processLimitOrders() {
  try {
    const openLimitOrders = await getOpenLimitOrdersFromSubgraph();

    // Iterate through the limit orders
    for (const order of openLimitOrders) {
      const { user, pool, targetPrice, limitType } = order;

      // Get the current price of the pool
      const currentPrice = await getPoolPriceByPoolAddress(pool);

      // Compare the current price with the target price based on the limit type
      const currentPriceBN = web3.utils.toBN(currentPrice);
      const targetPriceBN = web3.utils.toBN(targetPrice);
      const isLimitShort = limitType === "Limit Short";
      const isLimitLong = limitType === "Limit Long";

      if (
        (isLimitLong && currentPriceBN.gte(targetPriceBN)) ||
        (isLimitShort && currentPriceBN.lt(targetPriceBN))
      ) {
        // Execute the limit order
        await executeLimitOrder(user, pool, limitType);
      } else {
        console.log(`Target price not met for ${user} on pool ${pool}`);
      }
    }
  } catch (error) {
    console.error("Error processing limit orders:", error);
  }
}

//subscribe to blocks
let isProcessing = false;

web3.eth
  .subscribe("newBlockHeaders", async (error, blockHeader) => {
    if (error) {
      console.error("Error subscribing to new block headers:", error);
      return;
    }

    console.log(`New block received. Block #${blockHeader.number}`);

    if (!isProcessing) {
      isProcessing = true;
      try {
        await processLimitOrders();
      } catch (error) {
        console.error("Error processing limit orders:", error);
      } finally {
        isProcessing = false;
      }
    } else {
      console.log("Already processing limit orders. Skipping this block.");
    }
  })
  .on("error", (error) => {
    console.error("Error in new block headers subscription:", error);
  });
