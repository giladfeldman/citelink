# Contributing to citelink

Thank you for helping. citelink's output is used to check real manuscripts, so a wrong
answer that looks right (a citation silently dropped, a confident wrong match) is the most
serious kind of bug. The rules below exist to catch exactly that.

## Reporting a problem

Open an issue with:

- the smallest text sample that reproduces it (invent the author names and titles if the
  original is not yours to share; please do not paste copyrighted article text);
- what citelink returned and what you expected;
- the version (the tag you installed).

## Development setup

```bash
git clone https://github.com/giladfeldman/citelink.git
cd citelink
npm install        # also builds dist/ through the prepare script
npm test           # jest: every suite in tests/
npm run build      # tsc -> dist/
npm run docs:check # documentation-drift gate (also run by npm test, without the quickstart)
```

## What a change needs

1. **A test that fails before the fix.** Write the test, watch it fail against the current
   code, then fix. A test written afterwards that re-asserts the new behaviour proves nothing.
2. **Both directions.** A detection fix must show the new true positive AND that a nearby
   non-citation (a table label, an equation number, a year in a table) is still rejected.
3. **Measured effect.** For a change to detection, parsing or matching, report how many
   outputs changed on a set of real article texts and check the changed ones. Say what you
   measured in the CHANGELOG entry.
4. **Documentation.** A new export, result field, literal value, parameter or violation code
   must be documented in `README.md` or `docs/API.md` inside a code span. `npm run docs:check`
   fails otherwise, and lists what is missing. Never add an exemption to make it pass.
5. **Release metadata.** A release bumps `package.json`, adds a `## x.y.z` entry at the top of
   `CHANGELOG.md`, and updates the version in the README install pin and in `CITATION.cff`;
   the docs gate checks that all four agree.

## Style

TypeScript, strict mode, ES modules. Keep functions pure (text in, data out). Comment the
reason for a rule, with the example that motivated it, next to the rule.

## License

By contributing you agree that your contributions are licensed under the MIT License.
