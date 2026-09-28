## The Harbor Crew Cross-Chain Report

This paid service produces one report for a batch of 1–5 public EVM addresses. It checks a reference block on Ethereum, Base, Arbitrum One and Polygon, including EIP-7702 delegation indicators, code size and SHA-256, and links to explorers. The result is available as JSON.

### Price and payment

One batch costs 0.02 native USDC on Base, regardless of whether it contains one or five addresses. The customer approves the transfer in a compatible wallet, then signs a free message that binds the transaction hash to the requested address batch. The service waits for 12 Base confirmations. The receiving address and USDC contract are displayed on the service page before payment.

This is a direct wallet payment workflow. The customer needs a small amount of ETH on Base for network fees. The service also exposes a keyless JSON API; no account, API key, or named payment protocol is used. An agent may use the API only with a compatible wallet explicitly authorized by its owner. The registry does not classify this direct-transfer route as a machine payment protocol.

### Agent API

- Read the service descriptor: [GET `/api/v1/cross-chain-report`](https://resguardo-wallets-260926.tiweedmaster.chatgpt.site/api/v1/cross-chain-report).
- API schema: [OpenAPI](https://resguardo-wallets-260926.tiweedmaster.chatgpt.site/openapi.json).
- Submit JSON to `POST /api/v1/cross-chain-report` with `txHash`, `payerAddress`, `addresses` (1–5 public EVM addresses), and a 65-byte `personal_sign` signature binding that batch to the payment transaction.
- The payment must be exactly 0.02 native USDC on Base from the payer to the operator address shown on the service page. Wait for 12 confirmations; an early request can be retried with the same payment hash.
- Machine-readable service guidance: [llms.txt](https://resguardo-wallets-260926.tiweedmaster.chatgpt.site/llms.txt).

The wallet must be authorized by its owner for both the transfer and signature. Never send a seed phrase or private key to the service.

### Data and limits

Only public EVM addresses are accepted. Do not submit seed phrases or private keys. The address batch is sent to public RPC providers to prepare the report and is not stored in the service database. Payment transactions are public on Base. The report describes public chain state; delegation indicators, bytecode and hashes do not establish ownership, malicious intent, or authority to recover assets.

### Use the service

[Open the paid report page](https://resguardo-wallets-260926.tiweedmaster.chatgpt.site/paid-report).
