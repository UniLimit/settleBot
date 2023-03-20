const Web3 = require("web3");

const { request } = require("graphql-request");
require("dotenv").config();
const web3 = new Web3(
  `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
);

const poolAddresses = [
  "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8", // Pool address USDC/WETH Mainnet
  //"0x...", // Pool address 2
  //"0x...", // Pool address 3
];

/*
//TODO import target prices
const targetPrices = [
  {
    user: "User 1",
    pool: "0x...", // Pool address
    targetPrice: "1000000000000000000", // Target price in wei
    isSurpassed: false, // True if target price has been surpassed, false otherwise
  },
  {
    user: "User 2",
    pool: "0x...", // Pool address
    targetPrice: "2000000000000000000", // Target price in wei
    isSurpassed: false, // True if target price has been surpassed, false otherwise
  },
];
*/

async function getTargetPricesFromSubgraph() {
  const query = `
      query {
        targetPrices {
          user
          pool
          targetPrice
          limitType
        }
      }
    `;
  const data = await request(
    "https://api.thegraph.com/subgraphs/name/YOUR_SUBGRAPH_NAME",
    query
  ); // Replace YOUR_SUBGRAPH_NAME with the name of your subgraph

  return data.targetPrices;
}

async function trackPrices() {
  try {
    const targetPrices = await getTargetPricesFromSubgraph();
    const blockNumber = await web3.eth.getBlockNumber();
    console.log(`Current block number: ${blockNumber}`);

    const targetPriceMap = targetPrices.reduce((acc, targetPrice) => {
      if (!acc[targetPrice.pool]) {
        acc[targetPrice.pool] = [];
      }
      acc[targetPrice.pool].push(targetPrice);
      return acc;
    }, {});

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

      const sqrtPriceX96 = new BigNumber(1.0001)
        .pow(tick)
        .times(2 ** 96)
        .sqrt();
      const price = sqrtPriceX96
        .times(liquidity)
        .times(2)
        .div(2 ** 128);

      console.log(`Pool ${poolAddress}: ${price}`);

      const poolTargetPrices = targetPriceMap[poolAddress] || [];
      for (const targetPrice of poolTargetPrices) {
        const currentPriceBN = web3.utils.toBN(price.toFixed());
        const targetPriceBN = web3.utils.toBN(targetPrice.targetPrice);

        const isLimitShort = targetPrice.limitType === "Limit Short";
        const isLimitLong = targetPrice.limitType === "Limit Long";

        if (
          (isLimitLong && currentPriceBN.gte(targetPriceBN)) ||
          (isLimitShort && currentPriceBN.lt(targetPriceBN))
        ) {
          console.log(
            `Target price of ${targetPrice.targetPrice} surpassed for ${targetPrice.user}`
          );
          // Execute the function for the user whose target price has been surpassed
          const contract = new web3.eth.Contract(
            CONTRACT_ABI,
            CONTRACT_ADDRESS
          );
          const functionData = contract.methods.functionName().encodeABI(); // Replace functionName with the name of the function you want to call
          const tx = {
            to: CONTRACT_ADDRESS,
            data: functionData,
          };
          const signedTx = await web3.eth.accounts.signTransaction(
            tx,
            process.env.PRIVATE_KEY
          );
          const txReceipt = await web3.eth.sendSignedTransaction(
            signedTx.rawTransaction
          );
          console.log(
            `Function called with transaction hash: ${txReceipt.transactionHash}`
          );

          // Update subgraph after executing the function
          await updateSubgraphWithOpenOrders(
            targetPrice.user,
            poolAddress,
            targetPrice.limitType
          );
        } else {
          console.log(
            `Target price of ${targetPrice.targetPrice} not surpassed for ${targetPrice.user}`
          );
        }
      }
    }
  } catch (error) {
    console.error("Error in trackPrices:", error);
  }
}

//TODO write function to update subgraph
async function updateSubgraphWithOpenOrders(
  userAddress,
  poolAddress,
  orderType
) {
  const query = `
      mutation {
        createOpenOrder(
          user: "${userAddress}",
          pool: "${poolAddress}",
          orderType: "${orderType}",
          timestamp: ${Math.floor(Date.now() / 1000)}
        ) {
          id
          user
          pool
          orderType
          timestamp
        }
      }
    `;

  try {
    const data = await request(
      "https://api.thegraph.com/subgraphs/name/YOUR_SUBGRAPH_NAME",
      query
    ); // Replace YOUR_SUBGRAPH_NAME with the name of your subgraph
    console.log("Subgraph updated with open order:", data.createOpenOrder);
  } catch (error) {
    console.error("Error updating subgraph with open order:", error);
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
