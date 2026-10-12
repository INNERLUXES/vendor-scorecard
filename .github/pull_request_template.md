## What changes

<!-- One or two sentences. -->

## Checks

- [ ] `npm test`, `npm run test:coverage`, `npm run check` and `npm run example` pass, and the files under `examples/output` are the ones `npm run example` wrote
- [ ] A change to a check is described in docs/method.md, says what it can and cannot see, and has a test with the rows written inline and a near miss on each side
- [ ] A change to what the tool cannot see is in docs/limits.md
- [ ] A check is still a best practice of the tool and says so in its `own` and `cannot` text; nothing in the change claims that a standard sets it
- [ ] Nothing in the change, the README or the output reads as a judgement of a vendor, as advice, or as a statement that a score or a link is true; a clean report is still worded as "no finding at or above the level"
- [ ] A red flag is still only listed and counted: it changes no score and drops no vendor
- [ ] The tool still reads the text of the files and nothing else: it contacts nothing over the network, opens no link, runs nothing, reads no clock and writes nothing to disk
- [ ] The tool still never reads or asks for a private key, a seed or an API key, a value that looks like one is still a `secret-in-file` finding, and no report or error message shows such a value
- [ ] A file the reader cannot follow is still a `file-unreadable` finding, and a check never takes a part it did not read for one that is fine
- [ ] Weights, scores and thresholds are still exact decimals with BigInt, with no floating point number, and a number is rounded only when it is shown
- [ ] The reader, the checks and the ranking still do not recurse, and no pair of a vendor and a criterion is walked
- [ ] No pattern is built from a file or from an argument
- [ ] Text from the input goes through `safeText` before it reaches the output or an error message, and the markdown format escapes what markdown gives a meaning to
- [ ] The work stays bounded: the limits of docs/limits.md hold, and a hostile test has a time check that widens under coverage through `NODE_V8_COVERAGE`
- [ ] A test that depends on the operating system (a link, a device) is guarded with `process.platform`, asserts no line of its own, and builds its paths with `resolve()` from forward-slash names; no test asserts the hash or version of an action
- [ ] The examples stay made up and minimal: no real company, link, person or price, no key, no phrase of a wallet, no date and no number that reads like a year
- [ ] The commit messages of this pull request follow Conventional Commits
