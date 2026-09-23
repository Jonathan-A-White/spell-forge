// Recovered verbatim from the spec review, round 3 (2026-09-17), prototype dir 2026-09-17-size-proto/.
// sCrypt compiler 1.20.0. Measured: locking 1,171 B, unlocking (spend) 1,374 B -- spec §3.7 "Fuel spend (SINGLE)".
// NOTE: FEE_CAP here is 1000n; spec v0.13 §3.9 sets FEE_CAP = 2,000 sat, applied per restricted input (F49).
// PROTOTYPE: diff against spec v0.13 §3.7 before use. Only needed from step 3 (License + Fuel).
import { SmartContract, method, prop, assert, ByteString, hash256, Utils, slice, toByteString, SigHash } from 'scrypt-ts'

// Fuel with FB-1 + index-mapped conservation (VC-A), SIGHASH_SINGLE
export class FuelSingle extends SmartContract {
    static readonly FEE_CAP = 1000n
    @prop() collectionId: ByteString

    constructor(collectionId: ByteString) {
        super(...arguments)
        this.collectionId = collectionId
    }

    @method(SigHash.SINGLE)
    public spend(fuelValue: bigint) {
        assert(slice(this.prevouts, 0n, 36n) == this.ctx.utxo.outpoint.txid + toByteString('00000000'), 'FB-1')
        assert(fuelValue >= this.ctx.utxo.value - FuelSingle.FEE_CAP, 'value conservation')
        assert(this.ctx.hashOutputs == hash256(Utils.buildOutput(this.ctx.utxo.script, fuelValue)), 'output i')
    }
}
