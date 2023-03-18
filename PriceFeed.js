const Web3 = require("web3");
const web3 = new Web3("https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID"); // Replace YOUR_INFURA_PROJECT_ID with your Infura project ID

const poolAddresses = [
  "0x...", // Pool address 1
  "0x...", // Pool address 2
  "0x...", // Pool address 3
  // Add more pool addresses as needed
];

const targetPrices = [
  {
    user: "User 1",
    pool: "0x...", // Pool address
    targetPrice: "1000000000000000000", // Target price in wei
    isHigher: true, // True if target price is higher than current price, false otherwise
    isSurpassed: false, // True if target price has been surpassed, false otherwise
  },
  {
    user: "User 2",
    pool: "0x...", // Pool address
    targetPrice: "2000000000000000000", // Target price in wei
    isHigher: false, // True if target price is higher than current price, false otherwise
    isSurpassed: false, // True if target price has been surpassed, false otherwise
  },
  // Add more target prices as needed
];

async function trackPrices() {
  const blockNumber = await web3.eth.getBlockNumber();
  console.log(`Current block number: ${blockNumber}`);

  for (const poolAddress of poolAddresses) {
    const poolContract = new web3.eth.Contract(
      UNISWAP_V3_POOL_ABI,
      poolAddress
    );
    const [tick, liquidity] = await Promise.all([
      poolContract.methods
        .slot0()
        .call()
        .then((slot0) => slot0.tick),
      poolContract.methods.liquidity().call(),
    ]);

    const sqrtPriceX96 = Math.sqrt(Math.pow(1.0001, tick) * 2 ** 96);
    const price = (liquidity * 2 * sqrtPriceX96) / 2 ** 128;

    console.log(`Pool ${poolAddress}: ${price}`);

    for (const targetPrice of targetPrices) {
      if (targetPrice.pool === poolAddress) {
        const currentPriceBN = web3.utils.toBN(price);
        const targetPriceBN = web3.utils.toBN(targetPrice.targetPrice);

        if (
          targetPrice.isHigher &&
          !targetPrice.isSurpassed &&
          currentPriceBN.gte(targetPriceBN)
        ) {
          console.log(
            `Target price of ${targetPrice.targetPrice} surpassed for ${targetPrice.user}`
          );
          // Execute the function for the user whose target price has been surpassed
          // TODO: Implement the function execution here
          targetPrice.isSurpassed = true;
        } else if (
          !targetPrice.isHigher &&
          targetPrice.isSurpassed &&
          currentPriceBN.lt(targetPriceBN)
        ) {
          console.log(
            `Target price of ${targetPrice.targetPrice} not surpassed anymore for ${targetPrice.user}`
          );
          // TODO: Implement the function execution here
          targetPrice.isSurpassed = false;
        }
      }
    }
  }
}

web3.eth
  .subscribe("newBlockHeaders", (error, result) => {
    if (!error) {
      trackPrices();
    } else {
      console.error(error);
    }
  })
  .on("error", console.error);
