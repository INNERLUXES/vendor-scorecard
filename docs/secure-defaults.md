# Secure defaults

The default run is the safe run. Nothing in the first section needs a flag, and none of it can be switched off. The rest of
the document is about what the tool cannot do for you: which files you give it, where the output goes, and who may change the
files it reads. A clean result is a scorecard with none of the problems the checks look for, not a finding that the scores are
true or fair: the tool does arithmetic and bookkeeping on the scores people enter, it does not judge vendors, and it is not
advice.

## How the tool behaves by default

- **Never a secret.** The tool needs no private key, no seed, no API key and no address of a server, and has no option to take
  one. A column named for a key or a seed, and a cell shaped like one, anywhere in either file, is a `secret-in-file` error
  that fails the run; the value is left out of every check and never written to a report or an error message, in any format.
- **Reads, never writes.** The tool reads the files it is given. It follows no symbolic link, fetches no URL, refuses an
  argument that looks like an address, contacts nothing over the network, evaluates nothing, runs no program and writes
  nothing to disk. A link in the evidence column is text and is never opened.
- **Every check on from the first run.** A file the reader cannot follow, a missing column, a repeated pair, a weight that is
  not a number above zero or that differs, a score that is not a number from 0 to 5, a criterion that no one scored, one the
  criteria file does not list and a required criterion left unscored are errors; a criterion left unscored, a vendor with a
  missing row, a high score with no evidence, a red flag, a low coverage and a column the tool does not read are warnings;
  evidence of no known form and a tie too close to call are notes. There is no configuration file of the tool that could set a
  check off.
- **No clock.** The tool reads no date and no time. The same input and options give the same report on every day.
- **Fail closed on what it cannot read.** A file that is not a table the reader can follow is an error finding that fails the
  run at the default `--fail-on` of `error`. A missing column and a row of the wrong width are findings of their own, so a
  part of a file that was not read is never taken for one that is fine. A file that is not text, is too large or is a link
  stops the run with exit code `2` and no report.
- **Numbers as written.** A weight and a score are read from the characters of the file into a whole number and a scale, never
  through a floating point number; one past the limit is a finding, never rounded, and the sums and comparisons are exact.
- **Unknown arguments are errors.** An option the tool does not know, a value that looks like an option and an option given
  twice stop the run, so a typo such as `--fail-no` cannot leave a default in place. A threshold that is not a plain number in
  its range is refused.
- **No pattern from the input.** No regular expression is built from a file or from an argument.
- **Bounded work.** The reader has limits of size, rows, columns, cells and cell length, the checks work through loops and
  maps, nothing walks every pair of a vendor and a criterion, and at most 1,000 findings of one check are listed
  (docs/limits.md), so a large file cannot exhaust the stack, the memory or the time.
- **No prototype tricks.** Names from the files are kept in maps and sets and compared with the names the tool reads, never set
  as properties of an object, so `__proto__` is only a name.
- **Clean output.** Text from the input, file names, cells, vendors and criteria included, has control characters, line
  separators and direction controls replaced and its length capped before it reaches a report or an error message; the
  markdown report also escapes what markdown gives a meaning to.
- **No dependencies.** Node 22 or newer and nothing else.

## Settings that make the check stricter

- **`--fail-on warning`.** A criterion left unscored, a vendor with a missing row, a high score with no evidence, a red flag
  and a low coverage fail the run too. Use it on the sheet that is about to go to the people who decide, and record each
  warning the team keeps on purpose.
- **`--fail-on info`.** Evidence of no known form and a tie too close to call fail the run too. Use it when the sheet is meant
  to be final.
- **`--criteria`.** A criteria file makes the weights come from one place and lets you mark criteria required, so that a gap in
  a required criterion is an error and not a warning.
- **`--evidence-above` and `--min-coverage`.** Lower the first and raise the second to ask for more evidence and more
  coverage. Both are plain numbers; nothing else is accepted.
- **Whole sheets.** Check the whole scorecard at once, so that the checks across rows can see every vendor; a sheet cut in the
  middle shows less, or shows a gap that is not there.

## Running it in a pipeline

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@<full commit hash> # vX.Y.Z
  - uses: actions/setup-node@<full commit hash> # vX.Y.Z
    with:
      node-version: 22
  - name: Vendor scorecard
    run: npx --yes github:INNERLUXES/vendor-scorecard shortlist/scores.csv --criteria shortlist/criteria.csv --format markdown >> "$GITHUB_STEP_SUMMARY"
```

- Give the job read access to the contents and nothing more. The tool needs no secret, no API key and no access to a server;
  never give it one.
- Pin every action to a full commit, as above, and pin the tool to a release commit or a tag you have read, because `npx`
  runs what it downloads.
- Check the exact file that goes to the people who decide, and have the job that sends it read the same file. A file edited
  after the check is not what was checked.
- Keep the scorecard of a real selection out of public repositories: it holds the names of the vendors you are considering
  and what you think of them. Keep the reports with the same care, because a finding quotes names, notes and cells of the file.
- Do not hide the exit code with a trailing `|| true`. To keep the report without failing, keep `--fail-on` at `error` and
  keep the SARIF or JSON report as an artifact of the job.
- Treat a report built from a file you do not trust as untrusted data.
- If the tool ever reports `secret-in-file`, treat the key or seed as exposed: remove it from the file and from every place
  the file was copied to, and move what it controls to a new key. The tool does not show the value, but the file itself was
  readable to everyone with access to it.

## SSDF

The repository is checked against NIST SP 800-218 (SSDF) in its own pipeline and before every release, with
`ssdf-repo-check` pinned to its release commit. The evidence it looks for is in these files:

| Practice | Evidence in this repository |
| --- | --- |
| PO.1 Define security requirements | CONTRIBUTING.md, docs/secure-defaults.md |
| PO.2 Roles and responsibilities | .github/CODEOWNERS |
| PO.3 Toolchain | .github/workflows/ci.yml, codeql.yml, release.yml |
| PO.4 Criteria for security checks | CodeQL with the security-extended queries, the SSDF gate in ci.yml and release.yml |
| PO.5 Secure environments | a `permissions:` block in every workflow, actions pinned to commits |
| PS.1 Protect the code | .gitignore for keys and `.env`, `npm run check` for committed secrets |
| PS.2 Integrity of releases | SHA-256 checksums and a build provenance attestation in release.yml |
| PS.3 Archive and provenance | a CycloneDX SBOM and the CHANGELOG with every release |
| PW.1 Design for security | docs/threat-model.md |
| PW.2 Review the design | docs/decisions |
| PW.4 Reuse secure components | no runtime dependencies, a lock file, Dependabot |
| PW.5 Secure coding | CONTRIBUTING.md, `npm run check` |
| PW.6 Build settings | `npm ci` from the lock file |
| PW.7 Code review | the pull request template and CODEOWNERS |
| PW.8 Testing | `npm test` on Linux, Windows and macOS with Node 22 and 24, `npm run test:coverage`, hostile input tests |
| PW.9 Secure defaults | this document |
| RV.1 Find vulnerabilities | SECURITY.md, Dependabot |
| RV.2 Respond to vulnerabilities | SECURITY.md |
