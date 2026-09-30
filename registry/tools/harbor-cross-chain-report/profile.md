## The Harbor Crew Cross-Chain Report

This paid service produces one report for a batch of 1–5 public EVM addresses. It checks a reference block on Ethereum, Base, Arbitrum One and Polygon, including EIP-7702 delegation indicators, code size and SHA-256, and links to explorers. The result is available as JSON.

### Price and payment

One batch costs 0.02 of the selected asset, regardless of whether it contains one or five addresses: USDC on Ethereum, Base, Arbitrum One, or Polygon; USDT on Ethereum; or Binance-Peg BSC-USD on BNB Smart Chain. The customer approves the transfer in a compatible wallet, then signs a free message that binds the payment rail, transaction hash, and requested address batch. The service waits for 12 confirmations on the selected network. The receiving address and token contract are displayed on the service page before payment.

This is a direct wallet payment workflow. The customer needs the relevant network's native token for fees. The service exposes a keyless JSON API, an MCP server, and an A2A agent; no account or API key is required. An agent may submit a paid report only with a compatible wallet explicitly authorized by its owner. The registry does not classify this direct-transfer route as a machine payment protocol.

### Agent API

- Read the service descriptor: GET /api/v1/cross-chain-report — https://resguardo-wallets-260926.tiweedmaster.chatgpt.site/api/v1/cross-chain-report.
- API schema: https://resguardo-wallets-260926.tiweedmaster.chatgpt.site/openapi.json.
- Submit JSON to POST /api/v1/cross-chain-report with txHash, payerAddress, addresses (1–5 public EVM addresses), and a 65-byte personal_sign signature binding that batch to the payment transaction.
- Select one of the six payment rails listed on the service page. The exact 0.02 payment must go from the payer to the operator address shown there. Wait for 12 confirmations; an early request can be retried with the same payment hash.
- Machine-readable service guidance: https://resguardo-wallets-260926.tiweedmaster.chatgpt.site/llms.txt.
- MCP discovery card: https://resguardo-wallets-260926.tiweedmaster.chatgpt.site/.well-known/mcp.json; Streamable HTTP endpoint: https://resguardo-wallets-260926.tiweedmaster.chatgpt.site/api/v1/mcp.
- A2A agent card: https://resguardo-wallets-260926.tiweedmaster.chatgpt.site/.well-known/agent-card.json; JSON-RPC endpoint: https://resguardo-wallets-260926.tiweedmaster.chatgpt.site/a2a/v1.

The wallet must be authorized by its owner for both the transfer and signature. Never send a seed phrase or private key to the service.

### Data and limits

Only public EVM addresses are accepted. Do not submit seed phrases or private keys. The address batch is sent to public RPC providers to prepare the report and is not stored in the service database. Payment transactions are public on their selected networks. The report describes public chain state; delegation indicators, bytecode and hashes do not establish ownership, malicious intent, or authority to recover assets.

### Use the service

Open the paid report page: https://resguardo-wallets-260926.tiweedmaster.chatgpt.site/paid-report.
