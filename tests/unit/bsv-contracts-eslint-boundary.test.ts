// Proves the no-restricted-imports rule that confines 'scrypt-ts', 'scrypt-ord' and 'bsv'
// to files under src/bsv/contracts/ (spec §3.7 toolchain story, mw-5wuz6.1).
import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import { join } from 'node:path';

const RESTRICTED_IMPORT_SOURCE = "import { SmartContract } from 'scrypt-ts';\nexport const x = SmartContract;\n";

function messagesFor(ruleId: string, results: Awaited<ReturnType<ESLint['lintText']>>): number {
  return results[0].messages.filter((m) => m.ruleId === ruleId).length;
}

describe('scrypt-ts/scrypt-ord/bsv import boundary', () => {
  it('errors when scrypt-ts is imported outside src/bsv/contracts', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const results = await eslint.lintText(RESTRICTED_IMPORT_SOURCE, {
      filePath: join(process.cwd(), 'src/bsv/outside-contracts-fixture.ts'),
    });
    expect(messagesFor('no-restricted-imports', results)).toBeGreaterThan(0);
  });

  it('allows scrypt-ts under src/bsv/contracts', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const results = await eslint.lintText(RESTRICTED_IMPORT_SOURCE, {
      filePath: join(process.cwd(), 'src/bsv/contracts/inside-contracts-fixture.ts'),
    });
    expect(messagesFor('no-restricted-imports', results)).toBe(0);
  });
});
