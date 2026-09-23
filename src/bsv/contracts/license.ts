// The License covenant, spec v0.13 §3.7 rules (a)-(f) (mw-5wuz6.2). Grown from the size
// prototype (prototype/licenseExact.ts); NOTES.md lists each rule and the line enforcing it.
// Compiled only by the isolated toolchain (npm run bsv:contracts:build) to artifacts/license.json.
import { SmartContract, method, prop, assert, ByteString, PubKey, Sig, SigHash, hash256, Utils, slice, toByteString, len } from 'scrypt-ts'

// A 1-sat token whose locking script is this contract. Both methods take a SIGHASH_ALL
// preimage and bind the exact output list:
// [0] itself (1 sat), [1] Fuel(C) (script hash fixed at construction), [2] a zero-value
// OP_FALSE OP_RETURN Data output of record type W (write) or TR (transfer); in transfer
// only, any further outputs (payment, change). Inputs after index 0 are unrestricted.
export class License extends SmartContract {
    // Data output prefix: OP_FALSE OP_RETURN, push 7 'nftgate', then a one-byte push (the
    // format version, §3.8, not checked here), then the record type push at byte 12.
    @prop()
    static readonly DATA_PREFIX: ByteString = toByteString('006a076e66746761746501')
    @prop()
    static readonly RECORD_W: ByteString = toByteString('0157')
    @prop()
    static readonly RECORD_TR: ByteString = toByteString('025452')
    // SIGHASH_ALL|FORKID, the last byte of the owner's signature.
    @prop()
    static readonly SIGHASH_ALL_FORKID: ByteString = toByteString('41')

    @prop()
    collectionId: ByteString
    @prop()
    fuelScriptHash: ByteString
    @prop(true)
    ownerPubKey: PubKey

    constructor(collectionId: ByteString, fuelScriptHash: ByteString, ownerPubKey: PubKey) {
        super(...arguments)
        this.collectionId = collectionId
        this.fuelScriptHash = fuelScriptHash
        this.ownerPubKey = ownerPubKey
    }

    @method(SigHash.ALL)
    public write(sig: Sig, fuelScript: ByteString, fuelValue: bigint, dataScript: ByteString) {
        this.checkSpend(sig, fuelScript, dataScript)
        assert(slice(dataScript, 12n, 14n) == License.RECORD_W, 'rule (f): output 2 is a W Data output')
        const outs: ByteString = this.buildStateOutput(1n)
            + Utils.buildOutput(fuelScript, fuelValue)
            + Utils.buildOutput(dataScript, 0n)
        assert(this.ctx.hashOutputs == hash256(outs), 'rules (b), (c), (f): outputs are exactly itself at 1 sat, Fuel, Data')
    }

    @method(SigHash.ALL)
    public transfer(sig: Sig, newOwnerPubKey: PubKey, fuelScript: ByteString, fuelValue: bigint, dataScript: ByteString, restOutputs: ByteString) {
        this.checkSpend(sig, fuelScript, dataScript)
        assert(slice(dataScript, 12n, 15n) == License.RECORD_TR, 'rule (c): a transfer carries a TR Data output')
        this.ownerPubKey = newOwnerPubKey
        const outs: ByteString = this.buildStateOutput(1n)
            + Utils.buildOutput(fuelScript, fuelValue)
            + Utils.buildOutput(dataScript, 0n)
        assert(this.ctx.hashOutputs == hash256(outs + restOutputs), 'rules (b), (c), (f): outputs are exactly itself at 1 sat, Fuel, Data')
    }

    // Rules (a), (d), (e) and the fixed parts of (f), common to write and transfer.
    @method()
    checkSpend(sig: Sig, fuelScript: ByteString, dataScript: ByteString): void {
        const me: ByteString = this.ctx.utxo.outpoint.txid + Utils.toLEUnsigned(this.ctx.utxo.outpoint.outputIndex, 4n)
        assert(slice(this.prevouts, 0n, 36n) == me, 'rule (a): the token is input 0')
        assert(slice(sig, len(sig) - 1n) == License.SIGHASH_ALL_FORKID, 'rule (e): signature flag is ALL|FORKID')
        assert(this.checkSig(sig, this.ownerPubKey), 'rule (d): signed by the current owner')
        assert(hash256(fuelScript) == this.fuelScriptHash, 'rule (f): output 1 is Fuel(C)')
        assert(slice(dataScript, 0n, 11n) == License.DATA_PREFIX, 'rule (f): output 2 is an nftgate Data output')
    }
}
