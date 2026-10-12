import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLUMN_NAMES, HEX_COLUMNS, SECRET_KEYS, cellAt, checkText, findSecrets, isSecretKey, readTable, secretShape } from '../src/index.js';
import { ARGS, cell, clean, criteriaFile, idsOf, lineOf, run, table } from './helpers.js';

// Shapes built from repeated characters, so that no file of the repository holds anything that could be a real seed or
// key.
const MNEMONIC = Array.from({ length: 12 }, () => 'lantern').join(' ');
const MNEMONIC_24 = Array.from({ length: 24 }, (_, i) => (i % 2 ? 'harbor' : 'lantern')).join(' ');
const XPRV = `x${'prv'}${'9'.repeat(107)}`;
const HEX = `0x${'ab'.repeat(32)}`;
const WIF = `5${'H'.repeat(50)}`;

test('secretShape: a mnemonic of 12 to 24 words, an extended private key, a key in hex and a key in WIF', () => {
  assert.equal(secretShape(MNEMONIC), 'a mnemonic');
  assert.equal(secretShape(MNEMONIC_24), 'a mnemonic');
  assert.equal(secretShape(`  ${MNEMONIC}  `), 'a mnemonic');
  assert.equal(secretShape(XPRV), 'an extended private key');
  assert.equal(secretShape(HEX), 'a private key in hex');
  assert.equal(secretShape(HEX.slice(2)), 'a private key in hex');
  assert.equal(secretShape(WIF), 'a private key in WIF');
  assert.equal(secretShape(`K${'z'.repeat(51)}`), 'a private key in WIF');
});

test('secretShape: vendor names, criteria, links, notes and other near misses of a scorecard are not secrets', () => {
  for (const ok of ['Vendor Alpha', 'DOC-12', 'https://example.com/alpha/audit-report', 'Two reports, one with open findings', Array.from({ length: 11 }, () => 'lantern').join(' '), Array.from({ length: 13 }, () => 'lantern').join(' '), `x${'pub'}${'9'.repeat(107)}`, '', 'ab'.repeat(31)]) assert.equal(secretShape(ok), null, ok);
});

test('isSecretKey: names of columns and keys in any case and with any separator, and near misses', () => {
  for (const k of ['privateKey', 'private_key', 'PRIVATE-KEY', 'mnemonic', 'seedPhrase', 'seed phrase', 'xprv', 'wif', 'secret', 'passphrase', 'password']) assert.ok(isSecretKey(k), k);
  for (const k of ['vendor', 'criterion', 'evidence', 'score', 'publicKey', 'note']) assert.ok(!isSecretKey(k), k);
  assert.ok(SECRET_KEYS.includes('privatekey'));
});

test('secret-in-file: a column named for a seed, at its cell of the header, reported once and never shown in any format', async () => {
  const columns = [...COLUMN_NAMES, 'seed_phrase'];
  const text = table([{ ...cell(), seed_phrase: MNEMONIC }], columns);
  const r = checkText(text);
  const f = r.findings.filter((x) => x.id === 'secret-in-file');
  assert.equal(f.length, 1, 'the column is reported once, as a secret');
  assert.match(f[0].message, /^The file holds the column "seed_phrase", which names a seed, a mnemonic or a private key\. The tool never reads one, and the values under it are not shown\.$/);
  assert.equal(f[0].line, 1);
  assert.equal(f[0].column, text.split('\n')[0].indexOf('seed_phrase') + 1);
  for (const format of ['text', 'markdown', 'json', 'sarif']) {
    const out = await run({ 'scores.csv': text }, [...ARGS, '--format', format]);
    assert.ok(!out.out.includes('lantern'), format);
    assert.ok(!out.err.includes('lantern'), format);
  }
});

test('secret-in-file: a cell shaped like a key, at its line and column, left out of the checks and never echoed', () => {
  for (const [shape, value] of [['a mnemonic', MNEMONIC], ['an extended private key', XPRV], ['a private key in hex', HEX], ['a private key in WIF', WIF]]) {
    const text = table([cell({ note: value })]);
    const r = checkText(text);
    const secrets = r.findings.filter((f) => f.id === 'secret-in-file');
    assert.equal(secrets.length, 1, shape);
    assert.match(secrets[0].message, new RegExp(`^A cell of the column "note" is shaped like ${shape}\\. The tool never reads a seed or a key, and the value is not shown\\.$`));
    assert.equal(secrets[0].line, 2);
    assert.ok(!r.findings.some((f) => f.message.includes(value)), shape);
  }
});

test('secret-in-file: the value is not echoed by the other checks either: a score, a weight, a vendor, a criterion, a flag, a link', () => {
  for (const column of ['score', 'weight', 'vendor', 'criterion', 'red_flag', 'evidence', 'note']) {
    const text = table([cell({ [column]: MNEMONIC }), cell({ vendor: 'Vendor Beta', criterion: 'Published audits', [column]: MNEMONIC })]);
    const r = checkText(text);
    assert.ok(r.findings.some((f) => f.id === 'secret-in-file'), column);
    assert.ok(!r.findings.some((f) => f.message.includes('lantern') || (f.subject ?? '').includes('lantern')), column);
    assert.ok(!r.notes.some((n) => n.includes('lantern')), column);
  }
});

test('secret-in-file: a secret in a vendor or criterion cell leaves the row out without a second finding about the empty cell', () => {
  assert.deepEqual(idsOf([cell({ vendor: MNEMONIC })]), ['secret-in-file']);
  assert.deepEqual(idsOf([cell({ criterion: MNEMONIC })]), ['secret-in-file']);
});

test('secret-in-file: a secret in the criteria file is found there, with its own line', () => {
  const criteria = `criterion,weight,required,description\nChain experience,3,no,${MNEMONIC}\n`;
  const r = checkText(table([cell()]), criteria);
  const f = r.findings.find((x) => x.id === 'secret-in-file');
  assert.equal(f.file, 1);
  assert.equal(f.line, 2);
  assert.ok(!r.findings.some((x) => x.message.includes('lantern')));
  assert.equal(checkText(table([cell()]), criteriaFile([['Chain experience', '3', 'no', 'a fine description']])).findings.filter((x) => x.id === 'secret-in-file').length, 0);
});

test('secret-in-file: 64 hex digits in the evidence column is a hash used as a reference, and anywhere else is a key', () => {
  const hash = 'cd'.repeat(32);
  assert.deepEqual(HEX_COLUMNS, ['evidence']);
  assert.deepEqual(checkText(table([cell({ evidence: hash })])).findings.filter((f) => f.id === 'secret-in-file'), []);
  for (const column of ['note', 'vendor', 'criterion']) assert.equal(checkText(table([cell({ [column]: hash })])).findings.filter((f) => f.id === 'secret-in-file').length, 1, column);
  assert.equal(checkText(table([cell({ evidence: MNEMONIC })])).findings.filter((f) => f.id === 'secret-in-file').length, 1, 'only the hex shape is excused');
  assert.equal(checkText(table([cell({ evidence: XPRV })])).findings.filter((f) => f.id === 'secret-in-file').length, 1);
});

test('secret-in-file: a hash used as evidence is a reference of no known form, and the value is not echoed as a key', () => {
  const hash = 'cd'.repeat(32);
  assert.deepEqual(idsOf([cell({ evidence: hash })]), ['evidence-form']);
});

test('findSecrets: a short cell is not looked at, a secret column hides its cells, and a long cell of a plain sentence is not a secret', () => {
  const t = readTable(`vendor,password,note\nVendor Alpha,${MNEMONIC},${'ab'.repeat(20)}\nVendor Beta,${HEX},${'word '.repeat(20)}\n`);
  const found = findSecrets(t, cellAt);
  assert.equal(found.length, 1, 'only the column; its cells are not reported one by one');
  assert.deepEqual([...t.secretColumns], [1]);
  assert.equal(t.rows[0].secrets, undefined);
});

test('secret-in-file: a secret in a row does not hide a real mistake in the same row, and a clean table has none', () => {
  assert.ok(!idsOf(clean()).includes('secret-in-file'));
  const ids = idsOf([cell({ note: MNEMONIC, score: '9' })]);
  assert.ok(ids.includes('secret-in-file') && ids.includes('score-invalid'));
  assert.equal(COLUMN_NAMES.includes('password'), false);
});

test('secret-in-file: the line of a cell after a quoted line end is the line it starts on', () => {
  const text = table([cell(), cell({ criterion: 'Published audits', note: MNEMONIC })]).replace('Vendor Alpha', '"Vendor\nAlpha"');
  const f = checkText(text).findings.find((x) => x.id === 'secret-in-file');
  assert.equal(f.line, lineOf(text, 'lantern'));
});
