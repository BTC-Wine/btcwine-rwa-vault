import { describe, expect, it } from 'vitest';
import { asDeposit, decodeEvent } from './decode.js';

// Real deposit event of vault 2025 fetched from Mercury on testnet.
const realDeposit = {
  id: 7845980,
  contract_id: 'CAVSSSO23QRLIMQYM7KMJHFZF5W4ZRHQF7DXEA4X7UVT6PPVSTDWA4XA',
  topic1: 'AAAADwAAAAdkZXBvc2l0AA==',
  topic2: 'AAAAEgAAAAAAAAAAKUtgqUlZDLNgc8OB1fePxx8XPnne7z6sMQ0u5ZBZnrs=',
  topic3: '',
  topic4: '',
  data: 'AAAAEAAAAAEAAAADAAAACgAAAAAAAAAAAAAAAAAAAAEAAAAKAAAAAAAAAAAAAAAAeskbAAAAAA0AAAAgP7zLt9Y5+AGJaRtSVCWft5V/veBDn699qUQ8uEakAM0=',
  tx: 'a4dae70a50c5b5645e9fdf20c56f6d67913d4e55f5333ab087af436f695024b9',
  event_index: 2,
};

describe('decodeEvent', () => {
  it('decodes a real vault deposit event', () => {
    const decoded = decodeEvent(realDeposit);
    expect(decoded.kind).toBe('deposit');
    expect(decoded.contractId).toBe(realDeposit.contract_id);
    expect(String(decoded.topics[0])).toMatch(/^G[A-Z2-7]{55}$/);

    const deposit = asDeposit(decoded);
    expect(deposit.lots).toBe(1n);
    expect(deposit.paid).toBe(2060000000n);
    expect(deposit.attestation.length).toBe(32);
  });
});
