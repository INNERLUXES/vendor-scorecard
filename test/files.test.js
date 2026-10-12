import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { COLUMN_NAMES, FILE_LIMITS, InputError, checkFile, decode, displayPath, locateInput, readInputText } from '../src/index.js';
import { ARGS, GOOD, cli, clean, criteriaFile, run, table, withFiles } from './helpers.js';

test('decode: UTF-8 with and without a byte order mark, and UTF-16 in both byte orders', () => {
  assert.equal(decode(Buffer.from('[]\n')), '[]\n');
  assert.equal(decode(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('"\u00e9"', 'utf16le')])), '"\u00e9"');
  const be = Buffer.from('{"a": 1}', 'utf16le').swap16();
  assert.equal(decode(Buffer.concat([Buffer.from([0xfe, 0xff]), be])), '{"a": 1}');
});

test('decode: the byte order mark of UTF-8 is dropped', () => {
  assert.equal(decode(Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d])), '{}');
});

test('decode: a null byte, bytes that are not UTF-8, an odd number of UTF-16 bytes and a lone UTF-16 surrogate are refused', () => {
  assert.throws(() => decode(Buffer.from([0x7b, 0x00, 0x7d])), /null byte/);
  assert.throws(() => decode(Buffer.from([0xc3, 0x28])), /not valid UTF-8/);
  assert.throws(() => decode(Buffer.from([0xff, 0xfe, 0x61])), /odd number of bytes/);
  assert.throws(() => decode(Buffer.from([0xff, 0xfe, 0x00, 0xd8])), /not valid UTF-16/);
});

test('displayPath: relative with forward slashes inside the folder, and the whole path outside it', () => {
  const base = resolve('/work/project');
  assert.equal(displayPath(resolve(base, 'shortlist/scores.csv'), base), 'shortlist/scores.csv');
  const outside = resolve(base, '..', 'elsewhere', 'scores.csv');
  assert.ok(!displayPath(outside, base).includes('\\'));
  assert.ok(displayPath(outside, base).endsWith('elsewhere/scores.csv'));
});

test('locateInput: a file is read; a folder and a missing path are refused', async () => {
  await withFiles({ 'a/scores.csv': GOOD['scores.csv'] }, async (dir) => {
    assert.equal(await locateInput('a/scores.csv', dir), resolve(dir, 'a/scores.csv'));
    await assert.rejects(locateInput('a', dir), /is a folder; give the records file/);
    await assert.rejects(locateInput('missing.csv', dir), /does not exist/);
    await assert.rejects(locateInput('a/scores.csv/x', dir), /does not exist/);
  });
});

test('an absolute path is used as it is, with resolve() and not a join', async () => {
  await withFiles(GOOD, async (dir) => {
    const r = await cli([resolve(dir, 'scores.csv')], process.cwd());
    assert.equal(r.code, 0, r.err);
  });
});

test('a file over the size limit is refused before it is read, and the limit is in the error', async () => {
  await withFiles(GOOD, async (dir) => {
    await assert.rejects(checkFile({ path: 'scores.csv', version: '0', base: dir, limits: { maxBytes: 200 } }), (e) => e instanceof InputError && /larger than 200 bytes/.test(e.message));
  });
  assert.ok(FILE_LIMITS.maxBytes >= 1024 * 1024);
});

test('a binary file, and bytes that are not UTF-8, are an input error with exit code 2 and no report', async () => {
  const bin = await run({ 'scores.csv': Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]) }, ARGS);
  assert.equal(bin.code, 2);
  assert.match(bin.err, /scores.csv: holds a null byte/);
  assert.equal(bin.out, '');
  const bad = await run({ 'scores.csv': Buffer.from([0x7b, 0xc3, 0x28, 0x7d]) }, ARGS);
  assert.equal(bad.code, 2);
  assert.match(bad.err, /scores.csv: is not valid UTF-8/);
  const none = await run({}, ['a.csv']);
  assert.match(none.err, /a problem:\n {2}a\.csv: does not exist/);
});

test('an empty file, and a file that is not a table, are an error finding, not a pass', async () => {
  const r = await run({ 'scores.csv': '' }, ARGS);
  assert.equal(r.code, 1);
  assert.match(r.out, /ERROR {4}file-unreadable +scores\.csv:1\n/);
  assert.match(r.out, /The file holds no text to read as a table/);
  assert.match(r.out, /\nscorecard: not read\n/);
  const open = await run({ 'scores.csv': 'vendor,score\nVendor Alpha,"5\n' }, ARGS);
  assert.equal(open.code, 1);
  assert.match(open.out, /The file is not a table the reader can follow: The quote that opens the cell was never closed; the file ends inside it\. Nothing was checked\./);
  const header = await run({ 'scores.csv': 'vendor,score\n' }, ARGS);
  assert.equal(header.code, 1);
  assert.match(header.out, /The file holds a header and no rows/);
});

test('a criteria file that is not a table, or holds a header and no rows, is an error finding on its own file', async () => {
  const open = await run({ 'scores.csv': table(clean()), 'criteria.csv': 'criterion,weight\n"Chain\n' }, [...ARGS, '--criteria', 'criteria.csv']);
  assert.equal(open.code, 1);
  assert.match(open.out, /ERROR {4}file-unreadable +criteria\.csv:2\n/);
  assert.match(open.out, /The criteria file is not a table the reader can follow/);
  const header = await run({ 'scores.csv': table(clean()), 'criteria.csv': 'criterion,weight\n' }, [...ARGS, '--criteria', 'criteria.csv']);
  assert.equal(header.code, 1);
  assert.match(header.out, /The criteria file holds a header and no rows/);
});

test('the same file as the scores file and the criteria file is refused, and a criteria file that is not there is an input error', async () => {
  const same = await run(GOOD, [...ARGS, '--criteria', './scores.csv']);
  assert.equal(same.code, 2);
  assert.match(same.err, /is given as both the scores file and the criteria file/);
  const missing = await run(GOOD, [...ARGS, '--criteria', 'nope.csv']);
  assert.equal(missing.code, 2);
  assert.match(missing.err, /nope\.csv: does not exist/);
});

test('a symbolic link is refused by name, not followed', { skip: process.platform === 'win32' ? 'creating symbolic links needs a privilege on Windows' : false }, async () => {
  await withFiles({ 'real/scores.csv': GOOD['scores.csv'] }, async (dir) => {
    await mkdir(resolve(dir, 'linked'));
    await symlink(resolve(dir, 'real/scores.csv'), resolve(dir, 'linked/scores.csv'));
    const r = await cli(['linked/scores.csv'], dir);
    assert.equal(r.code, 2);
    assert.match(r.err, /symbolic link/);
    const c = await cli(['real/scores.csv', '--criteria', 'linked/scores.csv'], dir);
    assert.equal(c.code, 2);
    assert.match(c.err, /symbolic link/);
  });
});

test('a device is refused as not a regular file', { skip: process.platform === 'win32' ? 'there is no /dev/null on Windows' : false }, async () => {
  const r = await cli(['/dev/null'], process.cwd());
  assert.equal(r.code, 2);
  assert.match(r.err, /not a regular file/);
});

test('readInputText reads a file through a handle and reports its size in bytes', async () => {
  await withFiles({ 'scores.csv': '"\u00e9"\n' }, async (dir) => {
    const r = await readInputText(resolve(dir, 'scores.csv'), dir);
    assert.equal(r.text, '"\u00e9"\n');
    assert.equal(r.bytes, 5);
  });
});

test('a file with another extension is still read as a table, and a file with tabs as TSV, with a criteria file in TSV too', async () => {
  const r = await run({ 'scores.txt': GOOD['scores.csv'] }, ['scores.txt']);
  assert.equal(r.code, 0);
  assert.match(r.out, /\nfile: scores\.txt \(CSV, /);
  const tsv = await run({ 'scores.tsv': table(clean(), COLUMN_NAMES, '\t'), 'criteria.tsv': criteriaFile().split('\n').map((l) => l.split(',').join('\t')).join('\n') }, ['scores.tsv', '--criteria', 'criteria.tsv']);
  assert.equal(tsv.code, 0, tsv.out);
  assert.match(tsv.out, /\nfile: scores\.tsv \(TSV, /);
  assert.match(tsv.out, /\ncriteria file: criteria\.tsv \(TSV, /);
});
