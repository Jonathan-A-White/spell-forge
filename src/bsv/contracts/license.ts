// Recovered verbatim from the spec review, round 4 (2026-09-17), research file
// 2026-09-17-bsv-spec-v05-fuel-slack-research.md, prototype dir 2026-09-17-size-proto/.
// Toolchain at measurement: scrypt-cli 0.2.3, scrypt-ts (latest via template on 2026-09-17), sCrypt compiler 1.20.0.
// Measured (two methods, 32-byte collectionId, 33-byte owner key, 200-byte payload, real FuelSingle script as output 1):
//   locking 4,171 B, unlocking (write) 5,828 B  -- spec §3.7 "License (exact layout, ALL) v0.5".
// PROTOTYPE: minimal, written to measure size. Diff it against spec v0.13 §3.7 rules (a)-(f) before treating it as the contract.
import { SmartContract, method, prop, assert, ByteString, PubKey, Sig, hash256, Utils, slice, toByteString, len } from 'scrypt-ts'

// License token, SIGHASH_ALL preimage with an EXACT output layout:
// [0] self (1 sat), [1] Fuel(C) (script checked against a code hash), [2] zero-value OP_FALSE OP_RETURN. Nothing else.
export class LicenseExact extends SmartContract {
    @prop() collectionId: ByteString
    @prop() fuelScriptHash: ByteString
    @prop(true) owner: PubKey

    constructor(collectionId: ByteString, fuelScriptHash: ByteString, owner: PubKey) {
        super(...arguments)
        this.collectionId = collectionId
        this.fuelScriptHash = fuelScriptHash
        this.owner = owner
    }

    @method()
    public write(sig: Sig, fuelScript: ByteString, fuelValue: bigint, dataScript: ByteString) {
        assert(this.checkSig(sig, this.owner), 'owner sig')
        const me: ByteString = this.ctx.utxo.outpoint.txid + Utils.toLEUnsigned(this.ctx.utxo.outpoint.outputIndex, 4n)
        assert(slice(this.prevouts, 0n, 36n) == me, 'token must be input 0')
        assert(hash256(fuelScript) == this.fuelScriptHash, 'output 1 is Fuel(C)')
        assert(slice(dataScript, 0n, 2n) == toByteString('006a'), 'output 2 is OP_FALSE OP_RETURN')
        const outs: ByteString = this.buildStateOutput(1n)
            + Utils.buildOutput(fuelScript, fuelValue)
            + Utils.buildOutput(dataScript, 0n)
        assert(this.ctx.hashOutputs == hash256(outs), 'exact layout')
    }

    // TR transfer: owner changes; outputs 0-2 fixed as above, outputs 3+ (payment/change) passed as restOutputs
    @method()
    public transfer(sig: Sig, newOwner: PubKey, fuelScript: ByteString, fuelValue: bigint, dataScript: ByteString, restOutputs: ByteString) {
        assert(this.checkSig(sig, this.owner), 'owner sig')
        const me: ByteString = this.ctx.utxo.outpoint.txid + Utils.toLEUnsigned(this.ctx.utxo.outpoint.outputIndex, 4n)
        assert(slice(this.prevouts, 0n, 36n) == me, 'token must be input 0')
        assert(hash256(fuelScript) == this.fuelScriptHash, 'output 1 is Fuel(C)')
        assert(slice(dataScript, 0n, 2n) == toByteString('006a'), 'output 2 is OP_FALSE OP_RETURN')
        this.owner = newOwner
        const outs: ByteString = this.buildStateOutput(1n)
            + Utils.buildOutput(fuelScript, fuelValue)
            + Utils.buildOutput(dataScript, 0n)
        assert(this.ctx.hashOutputs == hash256(outs + restOutputs), 'layout')
    }
}
