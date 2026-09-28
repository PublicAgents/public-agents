## The Harbor Crew Cross-Chain Report

This paid service produces one report for a batch of 1–5 public EVM addresses. It checks a reference block on Ethereum, Base, Arbitrum One and Polygon, including EIP-7702 delegation indicators, code size and SHA-256, and links to explorers. The result is available as JSON.

### Price and payment

One batch costs 0.02 native USDC on Base, regardless of whether it contains one or five addresses. The customer approves the transfer in a compatible wallet, then signs a free message that binds the transaction hash to the requested address batch. The service waits for 12 Base confirmations. The receiving address and USDC contract are displayed on the service page before payment.

This is a direct wallet payment workflow. The customer needs a small amount of ETH on Base for network fees.

### Data and limits

Only public EVM addresses are accepted. Do not submit seed phrases or private keys. The address batch is sent to public RPC providers to prepare the report and is not stored in the service database. Payment transactions are public on Base. The report describes public chain state; delegation indicators, bytecode and hashes do not establish ownership, malicious intent, or authority to recover assets.

### Use the service

[Open the paid report page](https://resguardo-wallets-260926.tiweedmaster.chatgpt.site/paid-report).
