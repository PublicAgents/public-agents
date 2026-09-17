import { z } from "zod";
import { httpsUrl, httpsUrlOrNull, isoDate, shortText } from "./common.ts";

/**
 * Where payment lives (issue #24). Payment protocols are VOCABULARY, in
 * registry/payment-protocols.json, the way functions.json holds the
 * functions: a protocol is how an HTTP 402 is negotiated, never an
 * entry with jobs. A `payments` block on a tool is the claim layer for
 * the second half of the registry's question: what must a human do
 * before an agent can PAY for this (agentAccess answers what a human
 * must do before an agent can USE it). On an agent the block has two
 * sides, what it sells and what it pays for, and paying requires one
 * sentence saying who approves what. Both blocks are the subject's own
 * claim; the measurements live apart, as probes (evidence.ts).
 */

export const PAYMENT_PROTOCOL_ID = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
export const paymentProtocolId = z.string().regex(PAYMENT_PROTOCOL_ID, "a payment protocol id is lowercase letters, digits and hyphens");

/** What settles a payment: protocols say how the price is negotiated, methods say what the payer pays with. */
export const paymentMethod = z.enum(["stablecoin", "card", "lightning", "bank-transfer", "invoice", "other"]);

export const paymentProtocolsSchema = z.strictObject({
  $schema: z.literal("https://public-agents.com/schemas/payment-protocols.schema.json").optional(),
  protocols: z
    .array(
      z.strictObject({
        id: paymentProtocolId,
        name: shortText(80),
        url: httpsUrl,
        spec: httpsUrlOrNull.optional(),
        summary: z.string().trim().min(20).max(400),
        /** Where the summary's wording came from: the protocol's own surface. */
        source: httpsUrl,
        since: isoDate.optional()
      })
    )
    .max(40)
});

/** On a tool: the vendor's claim about how an agent, or the human behind it, pays. */
export const toolPayments = z.strictObject({
  /** An agent can pay for use inside the request itself (a 402 flow), with no human billing step. The payment analogue of agentAccess.noAccountNeeded. */
  machinePayable: z.boolean(),
  /** Ids from registry/payment-protocols.json; empty when no 402 protocol is spoken. */
  protocols: z.array(paymentProtocolId).max(10),
  methods: z.array(paymentMethod).max(6),
  /** What a human does to fund the tool when the agent cannot pay inline. `unknown` means the editor looked and could not tell; no block at all means nobody looked. */
  humanBilling: z.enum(["card-on-file", "invoice", "prepaid-credits", "none", "unknown"]),
  priceList: httpsUrlOrNull.optional(),
  /** Dated, like agentAccess.notes. */
  notes: shortText(300).optional()
});

const agentPaymentSide = {
  protocols: z.array(paymentProtocolId).max(10),
  methods: z.array(paymentMethod).max(6),
  /** The agent's own surface that says so. */
  source: httpsUrl
};

/** On an agent: what it sells and how it pays, each the agent's own claim, sourced to its own surfaces. */
export const agentPayments = z.strictObject({
  sells: z
    .strictObject({
      ...agentPaymentSide,
      /** Where the paid surface is (a feed, an endpoint, a storefront). */
      surface: httpsUrl.optional()
    })
    .nullable(),
  pays: z
    .strictObject({
      ...agentPaymentSide,
      /** Who approves what, in one sentence: the thing the registry most needs from an agent that can move money. */
      spendGate: shortText(300)
    })
    .nullable()
});

export type PaymentProtocolsFile = z.infer<typeof paymentProtocolsSchema>;
export type ToolPayments = z.infer<typeof toolPayments>;
export type AgentPayments = z.infer<typeof agentPayments>;
