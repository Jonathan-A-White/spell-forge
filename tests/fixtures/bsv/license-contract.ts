// Drives the License covenant (src/bsv/contracts/license.ts) through scrypt-ts's local
// verification: the committed artifact is loaded (no compiler at test time), a
// transaction is built around the call, and its input 0 is checked by scrypt-ts's own
// bsv script interpreter. No network: TestWallet over DummyProvider only signs, and the
// token's source transaction is built here rather than deployed.
//
// scrypt-ts's bsv library is confined to src/bsv/contracts/ and this fixture (eslint.config.js).

import { bsv, DummyProvider, findSig, hash256, PubKey, TestWallet, toByteString, Utils } from 'scrypt-ts';
import type { Artifact, ByteString, ContractTransaction, MethodCallOptions, SignatureResponse } from 'scrypt-ts';
import { License } from '../../../src/bsv/contracts/license';
import artifact from '../../../src/bsv/contracts/artifacts/license.json';
import keys from './license-contract-keys.json';

License.loadArtifact(artifact as unknown as Artifact);

const ownerKey = bsv.PrivateKey.fromWIF(keys.owner);
const buyerKey = bsv.PrivateKey.fromWIF(keys.buyer);
const strangerKey = bsv.PrivateKey.fromWIF(keys.stranger);

const COLLECTION_ID: ByteString = toByteString('11'.repeat(32));

/**
 * Stand-in for Fuel(C) at output 1 until the Fuel contract exists: push 1,166 bytes,
 * drop them, OP_1. 1,171 bytes long, the length of the prototype's FuelSingle locking
 * script, so unlocking sizes compare with the prototype's.
 */
const FUEL_STAND_IN_SCRIPT: ByteString = toByteString('4d8e04' + '00'.repeat(1166) + '7551');
const FUEL_SCRIPT_HASH: ByteString = hash256(FUEL_STAND_IN_SCRIPT);

const FUEL_IN_SATOSHIS = 100_000;
const FUEL_OUT_SATOSHIS = 99_000;

/** 'nftgate' (push 7), format version 0x02 (push 1), then the record type push. */
const DATA_HEADER = '006a' + '076e667467617465' + '0102';
const RECORD_TYPE_PUSH = { W: '0157', TR: '025452' } as const;
export type RecordType = keyof typeof RECORD_TYPE_PUSH;

/** A 200-byte opaque payload (OP_PUSHDATA1 200), standing in for §3.8 fields 3-5. */
const PAYLOAD_PUSH = '4cc8' + 'ab'.repeat(200);

function dataScript(recordType: RecordType): ByteString {
  return toByteString(DATA_HEADER + RECORD_TYPE_PUSH[recordType] + PAYLOAD_PUSH);
}

export interface LicenseScenario {
  method: 'write' | 'transfer';
  /** Whose key signs input 0; default the owner. */
  signer?: 'owner' | 'stranger';
  /** The sighash flag on input 0's signature; default ALL (SIGHASH_ALL|FORKID). */
  sigHashType?: 'ALL' | 'ANYONECANPAY_ALL';
  /** Owner key in output 0's state; default the owner on a write, the buyer on a transfer. */
  output0Owner?: 'owner' | 'buyer';
  /** Output 0's value; default 1. */
  output0Satoshis?: number;
  /** Record type of the Data output; default W on a write, TR on a transfer. */
  recordType?: RecordType;
  /** Outputs after output 2; default none on a write, payment and change on a transfer. */
  extraOutputs?: number;
}

export interface LicenseCall {
  tx: bsv.Transaction;
  /** Script lengths in bytes: the License locking script, input 0's unlocking script, outputs 2 and 1. */
  sizes: { lockingBytes: number; unlockingBytes: number; dataScriptBytes: number; fuelScriptBytes: number };
}

const { SIGHASH_ALL, SIGHASH_FORKID, SIGHASH_ANYONECANPAY } = bsv.crypto.Signature;
const SIGHASH_FLAGS = {
  ALL: SIGHASH_ALL | SIGHASH_FORKID,
  ANYONECANPAY_ALL: SIGHASH_ALL | SIGHASH_FORKID | SIGHASH_ANYONECANPAY,
};

function keyFor(name: 'owner' | 'buyer' | 'stranger'): bsv.PrivateKey {
  return name === 'owner' ? ownerKey : name === 'buyer' ? buyerKey : strangerKey;
}

function p2pkhOutput(key: bsv.PrivateKey, satoshis: number): bsv.Transaction.Output {
  return new bsv.Transaction.Output({ script: bsv.Script.buildPublicKeyHashOut(key.toAddress()), satoshis });
}

function fundingInput(prevTxIdByte: string): bsv.Transaction.Input {
  return new bsv.Transaction.Input({ prevTxId: prevTxIdByte.repeat(32), outputIndex: 0, script: bsv.Script.empty() });
}

/** A fresh License owned by ownerKey, sitting at output 0 of a fixed source transaction. */
async function mintedLicense(signerKey: bsv.PrivateKey): Promise<License> {
  const license = new License(COLLECTION_ID, FUEL_SCRIPT_HASH, PubKey(ownerKey.publicKey.toHex()));
  await license.connect(new TestWallet(signerKey, new DummyProvider()));
  const source = new bsv.Transaction()
    .addInput(fundingInput('aa'), bsv.Script.buildPublicKeyHashOut(ownerKey.toAddress()), 10_000)
    .addOutput(new bsv.Transaction.Output({ script: license.lockingScript, satoshis: 1 }));
  license.from = { tx: source, outputIndex: 0 };
  return license;
}

/**
 * Builds and signs a write or transfer per the scenario. With exec (the default) the
 * contract's TypeScript runs first and a broken rule rejects with its assert message;
 * without it the unlocking script is built blind, for the interpreter to judge.
 */
export async function callLicense(scenario: LicenseScenario, { exec = true }: { exec?: boolean } = {}): Promise<LicenseCall> {
  const isTransfer = scenario.method === 'transfer';
  const signerKey = keyFor(scenario.signer ?? 'owner');
  const license = await mintedLicense(signerKey);

  const next = license.next();
  next.ownerPubKey = PubKey(keyFor(scenario.output0Owner ?? (isTransfer ? 'buyer' : 'owner')).publicKey.toHex());
  const data = dataScript(scenario.recordType ?? (isTransfer ? 'TR' : 'W'));

  const extraCount = scenario.extraOutputs ?? (isTransfer ? 2 : 0);
  const extraOutputs = Array.from({ length: extraCount }, (_, i) =>
    p2pkhOutput(i % 2 === 0 ? ownerKey : buyerKey, 5_000 + i),
  );
  const restOutputs = toByteString(
    extraOutputs.map((output) => Utils.buildOutput(toByteString(output.script.toHex()), BigInt(output.satoshis))).join(''),
  );

  const buildTx = async (current: License): Promise<ContractTransaction> => {
    const tx = new bsv.Transaction()
      .addInput(current.buildContractInput())
      // Input 1: the fuel being spent. Input 2 on a transfer: the buyer's payment.
      .addInput(fundingInput('bb'), bsv.Script.fromHex(FUEL_STAND_IN_SCRIPT), FUEL_IN_SATOSHIS);
    if (isTransfer) tx.addInput(fundingInput('cc'), bsv.Script.buildPublicKeyHashOut(buyerKey.toAddress()), 20_000);
    tx.addOutput(new bsv.Transaction.Output({ script: next.lockingScript, satoshis: scenario.output0Satoshis ?? 1 }));
    tx.addOutput(new bsv.Transaction.Output({ script: bsv.Script.fromHex(FUEL_STAND_IN_SCRIPT), satoshis: FUEL_OUT_SATOSHIS }));
    tx.addOutput(new bsv.Transaction.Output({ script: bsv.Script.fromHex(data), satoshis: 0 }));
    for (const output of extraOutputs) tx.addOutput(output);
    return { tx, atInputIndex: 0, nexts: [{ instance: next, atOutputIndex: 0, balance: 1 }] };
  };
  license.bindTxBuilder(scenario.method, buildTx);

  const sigHashType = SIGHASH_FLAGS[scenario.sigHashType ?? 'ALL'];
  const options: MethodCallOptions<License> = {
    pubKeyOrAddrToSign: { pubKeyOrAddr: signerKey.publicKey, sigHashType },
    autoPayFee: false,
    partiallySigned: true,
    exec,
  };
  const sig = (sigs: SignatureResponse[]) => findSig(sigs, signerKey.publicKey, sigHashType);
  const newOwner = next.ownerPubKey;
  const { tx } = isTransfer
    ? await license.methods.transfer(sig, newOwner, FUEL_STAND_IN_SCRIPT, BigInt(FUEL_OUT_SATOSHIS), data, restOutputs, options)
    : await license.methods.write(sig, FUEL_STAND_IN_SCRIPT, BigInt(FUEL_OUT_SATOSHIS), data, options);

  return {
    tx,
    sizes: {
      lockingBytes: license.lockingScript.toBuffer().length,
      unlockingBytes: tx.inputs[0].script.toBuffer().length,
      dataScriptBytes: data.length / 2,
      fuelScriptBytes: FUEL_STAND_IN_SCRIPT.length / 2,
    },
  };
}

/** Runs input 0's unlocking script against the License locking script it spends. */
export function verifyInput0(call: LicenseCall): { success: boolean; error: string } {
  const { success, error } = call.tx.verifyScript(0);
  return { success, error };
}
