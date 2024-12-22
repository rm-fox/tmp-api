const express = require('express');
const {
  Keypair,
  Connection,
  clusterApiUrl,
  PublicKey,
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

// API endpoint to generate a wallet and return keys along with token holdings
app.get('/generate-wallet', async (req, res) => {
  try {
    const { publicKey, privateKeyBase58 } = await generateWallet();

    // Fetch SOL balance

    // const publicKeyHard = '9cbW4bEyy35kAntz3fvLqZ3iMDpTtVeDN2L9if729RrR' //publicKey
    // // const publicKeyHard = 'CckxW6C1CjsxYcXSiDbk7NYfPLhfqAm3kSB5LEZunnSE'
    // const balance = await getWalletBalance(publicKeyHard);

    // // Fetch token holdings using Helius API
    // const tokenHoldings = await getTokenHoldings(publicKeyHard);
    // Generate Solana Explorer links for Devnet and Mainnet
    // const explorerDevnetLink = `https://explorer.solana.com/address/${publicKey}?cluster=devnet`;
    const explorerMainnetLink = `https://explorer.solana.com/address/${publicKey}`;
    // console.log(explorerDevnetLink)
    // Return the wallet details along with token holdings and explorer links
    res.json({
      publicKey,
      privateKeyBase58,
    //   balance, // SOL balance
    //   tokenHoldings, // SPL token holdings from Helius API
      explorerLinks: {
        // devnet: explorerDevnetLink,
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
        // Extract the publicKey from the query parameters
        const { publicKey } = req.query;

        // Validate the publicKey
        if (!publicKey) {
            return res.status(400).json({ error: "Missing 'publicKey' in query parameters." });
        }

        // Fetch SOL balance
        const balance = await getWalletBalance(publicKey);

        // Fetch token holdings using Helius API
        const tokenHoldings = await getTokenHoldings(publicKey);

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