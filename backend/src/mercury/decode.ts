import { xdr, scValToNative } from '@stellar/stellar-sdk';
import type { MercuryEvent } from './client.js';

/** A contract event with XDR topics and data decoded to JS natives. */
export interface DecodedEvent {
  mercuryId: number;
  contractId: string;
  /** First topic, the event name symbol (deposit, redeem, transfer, ...). */
  kind: string;
  /** Remaining topics decoded (addresses, asset strings, ...). */
  topics: unknown[];
  /** Event payload decoded (tuples come back as arrays). */
  data: unknown;
  tx: string;
  eventIndex: number;
}

function decodeScVal(b64: string): unknown {
  return scValToNative(xdr.ScVal.fromXDR(b64, 'base64'));
}

export function decodeEvent(e: MercuryEvent): DecodedEvent {
  const rawTopics = [e.topic1, e.topic2, e.topic3, e.topic4].filter(Boolean);
  const [kind, ...topics] = rawTopics.map(decodeScVal);
  return {
    mercuryId: e.id,
    contractId: e.contract_id,
    kind: String(kind),
    topics,
    data: e.data ? decodeScVal(e.data) : null,
    tx: e.tx,
    eventIndex: e.event_index,
  };
}

// Typed views of the vault and token events the platform cares about.

export interface DepositEvent {
  user: string;
  lots: bigint;
  paid: bigint;
  attestation: Buffer;
}

export function asDeposit(e: DecodedEvent): DepositEvent {
  const [lots, paid, attestation] = e.data as [bigint, bigint, Buffer];
  return { user: String(e.topics[0]), lots, paid, attestation };
}

export interface RedeemEvent {
  user: string;
  lots: bigint;
  payout: bigint;
}

export function asRedeem(e: DecodedEvent): RedeemEvent {
  const [lots, payout] = e.data as [bigint, bigint];
  return { user: String(e.topics[0]), lots, payout };
}

export interface ClaimEvent {
  user: string;
  lots: bigint;
  deliveryHash: Buffer;
}

export function asClaim(e: DecodedEvent): ClaimEvent {
  const [lots, deliveryHash] = e.data as [bigint, Buffer];
  return { user: String(e.topics[0]), lots, deliveryHash };
}

export interface SettledEvent {
  amount: bigint;
  redeemableLots: bigint;
}

export function asSettled(e: DecodedEvent): SettledEvent {
  const [amount, redeemableLots] = e.data as [bigint, bigint];
  return { amount, redeemableLots };
}

export interface ExtendedEvent {
  oldMaturity: bigint;
  newMaturity: bigint;
}

export function asExtended(e: DecodedEvent): ExtendedEvent {
  const [oldMaturity, newMaturity] = e.data as [bigint, bigint];
  return { oldMaturity, newMaturity };
}

/** SAC transfer: topics are [from, to, sep11 asset], data is the amount. */
export interface TransferEvent {
  from: string;
  to: string;
  amount: bigint;
}

export function asTransfer(e: DecodedEvent): TransferEvent {
  return {
    from: String(e.topics[0]),
    to: String(e.topics[1]),
    amount: e.data as bigint,
  };
}
