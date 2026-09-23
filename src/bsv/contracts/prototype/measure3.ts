// Recovered verbatim from the spec review, round 4. The measurement harness that produced 4,171 / 5,828 B.
// Runs against DummyProvider (no network). Uses scrypt-ts's bundled bsv lib, not @bsv/sdk.
import { toByteString, PubKey, bsv, TestWallet, DummyProvider, findSig, MethodCallOptions, SignatureResponse, ContractTransaction, hash256 } from 'scrypt-ts'
import { LicenseExact } from './src/contracts/licenseExact'
import { FuelSingle } from './src/contracts/fuelSingle'
async function main() {
  await LicenseExact.loadArtifact('./artifacts/licenseExact.json')
  await FuelSingle.loadArtifact('./artifacts/fuelSingle.json')
  const key = bsv.PrivateKey.fromRandom(bsv.Networks.testnet)
  const signer = new TestWallet(key, new DummyProvider())
  const cid = toByteString('11'.repeat(32))
  const fuel = new FuelSingle(cid)
  const fuelScript = toByteString(fuel.lockingScript.toHex())
  const lic = new LicenseExact(cid, hash256(fuelScript), PubKey(key.publicKey.toHex()))
  await lic.connect(signer)
  await lic.deploy(1)
  const payload = 'ab'.repeat(200)
  const dataScript = toByteString('006a' + '4c' + 'c8' + payload) // 200-byte push
  const next = lic.next()
  lic.bindTxBuilder('write', async (current: LicenseExact, options: MethodCallOptions<LicenseExact>): Promise<ContractTransaction> => {
    const tx = new bsv.Transaction().addInput(current.buildContractInput())
    tx.addOutput(new bsv.Transaction.Output({ script: next.lockingScript, satoshis: 1 }))
    tx.addOutput(new bsv.Transaction.Output({ script: fuel.lockingScript, satoshis: 99000 }))
    tx.addOutput(new bsv.Transaction.Output({ script: bsv.Script.fromHex(dataScript), satoshis: 0 }))
    return { tx, atInputIndex: 0, nexts: [{ instance: next, atOutputIndex: 0, balance: 1 }] }
  })
  const r = await lic.methods.write(
    (s: SignatureResponse[]) => findSig(s, key.publicKey), fuelScript, 99000n, dataScript,
    { pubKeyOrAddrToSign: key.publicKey, autoPayFee: false, partiallySigned: true, exec: false } as any)
  console.log('LicenseExact locking', lic.lockingScript.toBuffer().length, 'unlocking', r.tx.inputs[0].script.toBuffer().length)
}
main().catch(e => console.error('ERR', e.message))
