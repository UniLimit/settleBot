const Web3 = require("web3");
const web3 = new Web3("https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID"); // Replace YOUR_INFURA_PROJECT_ID with your Infura project ID
const { request } = require("graphql-request");

const poolAddresses = [
  "0x...", // Pool address 1
  "0x...", // Pool address 2
  "0x...", // Pool address 3
  // Add more pool addresses as needed
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
  const targetPrices = await getTargetPricesFromSubgraph();
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

        const isLimitShort = targetPrice.limitType === "Limit Short";
        const isLimitLong = targetPrice.limitType === "Limit Long";

        if (isLimitLong && currentPriceBN.gte(targetPriceBN)) {
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
            PRIVATE_KEY
          ); // Replace PRIVATE_KEY with the private key of the sender's Ethereum account
          const txReceipt = await web3.eth.sendSignedTransaction(
            signedTx.rawTransaction
          );
          console.log(
            `Function called with transaction hash: ${txReceipt.transactionHash}`
          );
          await updateSubgraphWithOpenOrders(
            targetPrice.user,
            poolAddress,
            "Limit Long"
          );
        } else if (isLimitShort && currentPriceBN.lt(targetPriceBN)) {
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
            PRIVATE_KEY
          ); // Replace PRIVATE_KEY with the private key of the sender's Ethereum account
          const txReceipt = await web3.eth.sendSignedTransaction(
            signedTx.rawTransaction
          );
          console.log(
            `Function called with transaction hash: ${txReceipt.transactionHash}`
          );
          await updateSubgraphWithOpenOrders(
            targetPrice.user,
            poolAddress,
            "Limit short"
          );
        } else {
          console.log(
            `Target price of ${targetPrice.targetPrice} not surpassed for ${targetPrice.user}`
          );
        }
      }
    }
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
