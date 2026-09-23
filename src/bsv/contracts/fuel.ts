// The Fuel(C) covenant, spec v0.13 §3.2/§3.7 `spend` (mw-yo97u.2). Grown from the size
// prototype (prototype/fuelSingle.ts); NOTES.md lists each rule and the line enforcing it.
// Compiled only by the isolated toolchain (npm run bsv:contracts:build) to artifacts/fuel.json.
import { SmartContract, method, prop, assert, ByteString, hash256, Utils, slice, toByteString, SigHash } from 'scrypt-ts'

// The fee tank of one license: no spending key, no mutable state. Its script embeds only
// the collection id, so it is the same on every hop and the License's fuelScriptHash stays
// valid. `spend` takes a SIGHASH_SINGLE|FORKID (0x43) preimage, which binds only the output
// at its own input index; the License, spent at input 0 of the same transaction, fixes the
// rest of the layout (§3.7 rule (f)), so any slack below FEE_CAP can only become miner fee.
export class Fuel extends SmartContract {
    // Spec §3.9: the most fuel one spend may burn. Compiled in: changing it is a contract version change.
    @prop()
    static readonly FEE_CAP: bigint = 2000n

    @prop()
    collectionId: ByteString

    constructor(collectionId: ByteString) {
        super(...arguments)
        this.collectionId = collectionId
    }

    // scrypt-ts passes the preimage and the serialised prevouts list as hidden arguments
    // after fuelValue, and checks hash256(prevouts) == the preimage's hashPrevouts wherever
    // this.prevouts is read.
    @method(SigHash.SINGLE)
    public spend(fuelValue: bigint) {
        const txid: ByteString = this.ctx.utxo.outpoint.txid
        assert(slice(this.prevouts, 0n, 36n) == txid + toByteString('00000000'), 'FB-1: input 0 is the License created beside this Fuel')
        assert(slice(this.prevouts, 36n, 72n) == txid + Utils.toLEUnsigned(this.ctx.utxo.outpoint.outputIndex, 4n), 'the Fuel is input 1')
        assert(fuelValue >= this.ctx.utxo.value - Fuel.FEE_CAP, 'output 1 keeps at least own value - FEE_CAP')
        assert(this.ctx.hashOutputs == hash256(Utils.buildOutput(this.ctx.utxo.script, fuelValue)), 'output 1 is this Fuel(C), unchanged')
    }
}
