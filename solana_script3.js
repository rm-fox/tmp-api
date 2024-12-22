const express = require('express');
const {
  Keypair,
  Connection,
  clusterApiUrl,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} = require('@solana/web3.js');
const bs58 = require('bs58');

const app = express();
const port = 8010;

app.use(express.json());

// Helius API key and URL
const HELIUS_API_KEY = "eb63d937-0f78-43f6-9cd5-5da6295c2631";
const HELIUS_API_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// Generate a wallet and return the public and private keys
async function generateWallet() {
  const keypair = Keypair.generate();
  const privateKeyBase58 = bs58.encode(keypair.secretKey);
  const publicKey = keypair.publicKey.toBase58();

  console.log(`Generated Wallet: PublicKey = ${publicKey}`);

  return { publicKey, privateKeyBase58 };
}

// Get SOL balance of the wallet
async function getWalletBalance(publicKey, network = 'mainnet-beta') {
    const connection = new Connection(clusterApiUrl(network), 'confirmed');
    const balance = await connection.getBalance(new PublicKey(publicKey)); // Get the balance in lamports
    return balance / LAMPORTS_PER_SOL; // Convert lamports to SOL
}
  

// Get token holdings using Helius API
async function getTokenHoldings(publicKey) {
  const fetch = (await import("node-fetch")).default;

  try {
    const response = await fetch(HELIUS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "getTokenAccounts",
        id: "helius-test",
        params: {
          page: 1,
          limit: 100,
          displayOptions: {
            showZeroBalance: false,
          },
          owner: publicKey,
        },
      }),
    });

    const data = await response.json();

    if (!data.result) {
      console.error("No result in the response", data);
      return [];
    }

    return data.result;
  } catch (error) {
    console.error("Error fetching token holdings:", error);
    throw error;
  }
}

// Function to fetch metadata for all token holdings
async function getTokenHoldingsWithMetadata(publicKey) {
  try {
    const tokenHoldings = await getTokenHoldings(publicKey);

    const metadataPromises = tokenHoldings.token_accounts.map(async (token) => {
      const mint = token.mint;
      const metadata = await getAssetMetadata(mint);

      return {
        mint,
        amount: token.amount,
        metadata,
      };
    });

    const tokenHoldingsWithMetadata = await Promise.all(metadataPromises);

    return tokenHoldingsWithMetadata;
  } catch (error) {
    console.error("Error fetching token holdings with metadata:", error);
    throw error;
  }
}

// Function to fetch asset metadata using Helium API
async function getAssetMetadata(assetId) {
  try {
    const response = await fetch(HELIUS_API_URL, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "helius-asset-metadata",
        method: "getAsset",
        params: {
          id: assetId,
        },
      }),
    });

    const data = await response.json();

    if (!data.result) {
      throw new Error(`No metadata found for asset ID: ${assetId}`);
    }

    return data.result;
  } catch (error) {
    console.error("Error fetching asset metadata:", error);
    throw error;
  }
}

async function transferSOL(privateKeyBase58, recipientPublicKey, amountSol) {
  const connection = new Connection(clusterApiUrl('mainnet-beta'));
  const senderKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: senderKeypair.publicKey,
      toPubkey: new PublicKey(recipientPublicKey),
      lamports: amountSol * LAMPORTS_PER_SOL, // Convert SOL to lamports
    })
  );

  const signature = await connection.sendTransaction(transaction, [senderKeypair]);
  console.log(`Transfer transaction signature: ${signature}`);
  await connection.confirmTransaction(signature);

  return { success: true, transactionId: signature };
}

// async function getTokenDecimals(connection, mintAddress) {
//   try {
//       const mintAccountInfo = await connection.getParsedAccountInfo(
//           new PublicKey(mintAddress)
//       );

//       if (
//           mintAccountInfo &&
//           mintAccountInfo.value &&
//           mintAccountInfo.value.data &&
//           mintAccountInfo.value.data.parsed
//       ) {
//           return mintAccountInfo.value.data.parsed.info.decimals;
//       }
//   } catch (error) {
//       console.error("Error fetching token decimals:", error);
//       throw new Error("Failed to fetch token decimals");
//   }
//   return 0; // Default fallback
// }

// Function to get the best quote from Jupiter API
async function getBestQuote(inputMint, outputMint, amount) {
  const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}`;

  const headers = {
    'Accept': 'application/json',
  };

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching quote:", error.message);
    throw error;
  }
}
// API endpoint to get Jupiter best quote
app.get('/get-quote', async (req, res) => {
  const { inputMint, outputMint, amount } = req.query;

  if (!inputMint || !outputMint || !amount) {
    return res.status(400).json({ error: "Please provide inputMint, outputMint, and amount parameters." });
  }

  try {
    const quote = await getBestQuote(inputMint, outputMint, amount);
    res.json(quote);
  } catch (error) {
    console.error("Error fetching Jupiter quote:", error);
    res.status(500).json({ error: error.message });
  }
});


app.get('/transfer-sol', async (req, res) => {
  const { privateKeyBase58, recipientPublicKey, amountSol } = req.query;

  if (!privateKeyBase58 || !recipientPublicKey || !amountSol) {
    return res.status(400).json({
      error: 'privateKeyBase58, recipientPublicKey, and amountSol are required',
    });
  }

  try {
    const result = await transferSOL(privateKeyBase58, recipientPublicKey, parseFloat(amountSol));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to generate a wallet and return keys along with token holdings
app.get('/generate-wallet', async (req, res) => {
  try {
    const { publicKey, privateKeyBase58 } = await generateWallet();
    const explorerMainnetLink = `https://explorer.solana.com/address/${publicKey}`;

    res.json({
      publicKey,
      privateKeyBase58,
      explorerLinks: {
        mainnet: explorerMainnetLink,
      },
    });
    } catch (error) {
        console.error("Error generating wallet:", error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/get-wallet-balance', async (req, res) => {
    try {
        const { publicKey } = req.query;

        if (!publicKey) {
            return res.status(400).json({ error: "Missing 'publicKey' in query parameters." });
        }

        const balance = await getWalletBalance(publicKey);

        // const tokenHoldings = await getTokenHoldings(publicKey);
        const tokenHoldings = await getTokenHoldingsWithMetadata(publicKey);

        // Return wallet details
        res.json({
            publicKey,
            balance, // SOL balance
            tokenHoldings, // SPL token holdings from Helius API
        });
    } catch (error) {
        console.error("Error fetching wallet details:", error);
        res.status(500).json({ error: error.message });
    }
});


// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});



