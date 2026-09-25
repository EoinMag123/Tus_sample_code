I need a C# implementation that validates submitted SurveyJS JSON responses
against their SurveyJS JSON form definitions — no Node.js, no JavaScript
runtime, no external services. Pure C#.

Context: submitted responses arrive as JSON in a WebAPI. This is a data
integrity check before the data proceeds further — unknown/extra fields in
the response must be rejected, not silently ignored.

Validation philosophy: only check that data which IS PRESENT conforms to
its field's rules. Do not enforce field presence/required-ness — if a
field is missing or empty, skip it, don't flag it. The only exception is
plain statically-required fields with no conditional logic attached
(`isRequired: true` with no dependency on other state) — for those, still
check presence. Every other field: validate only if a value is actually
submitted for it.

Scope for this version — built-in checks only:
- If a field is present and non-empty: data type matches the question type
  (string, number, boolean, array)
- Choice-based questions (dropdown, radiogroup, checkbox, tagbox): if a
  value is present, it must exist in that question's `choices`
- Regex / numeric min-max validators from the question's `validators`
  array: applied only when a value is present
- Statically required fields (`isRequired: true`, no conditional logic):
  still enforce presence
- Treat null / empty string / missing key as "not present" — do not run
  format/regex/type checks against empty values, and do not fail them

Known non-schema fields: maintain a configurable array of top-level field
names that are allowed through the whitelist check even though they have
no corresponding element in the SurveyJS JSON — these are added by our
own client code, not part of the form definition (e.g. "context_bindings").
Start with this array containing "context_bindings", but structure it so
more names can be added easily without changing validator logic — e.g. a
static readonly list/HashSet<string> at the top of the file, or a
constructor/config parameter, not hardcoded inline in the walking logic.

When an unknown top-level field IS rejected (i.e. it's not in this known
list), the returned error should clearly name the exact field name that
caused the rejection, so it's easy to identify and add to the list if it
turns out to be a legitimate bespoke field rather than a genuine problem.

Reject any other top-level key with no matching schema field and not in
this known list. Do not extend this exception below the top level — only
top-level keys can be in the known-fields list; unknown keys nested inside
otherwise-valid schema fields should still be rejected normally.

Custom convention: a question with `isYesNo: true` is our own shorthand
(expanded client-side in Angular into a Yes/No dropdown — not a native
SurveyJS property). Treat any question with `isYesNo: true` as a boolean
field regardless of its declared `type`: if a value is present, it must
be a genuine JSON boolean (`true` or `false`) — reject any other type
(string, number, etc.) submitted for it.

File upload question types (e.g. `file`) should be ignored entirely by
this validator — they're handled by a separate process. Skip them during
both schema building and validation; do not attempt to validate their
values at all.

Must handle nested/recursive structures: `panel`, `paneldynamic` (repeating
groups via `templateElements`), `matrix` (fixed rows), `matrixdynamic` /
`matrixdropdown` (repeating rows via `columns`).

Explicitly OUT of scope — do not implement: cross-field/expression
validators, `visibleIf`/`requiredIf` conditional logic, any status-based
or conditional required-ness, custom registered validator functions.
Skip all of these entirely — no required-checking beyond plain static
`isRequired: true`.

Requirements:
- Use Newtonsoft.Json (JObject/JToken)
- Two pieces: (1) a recursive builder that walks a survey JSON schema into
  a lightweight rule tree, built once per form and cacheable; (2) a
  recursive validator that walks a submitted payload against that tree and
  returns a list of errors
- Keep it minimal and readable — small number of clear files, no
  unnecessary abstraction layers, interfaces, or design patterns for their
  own sake. Favor straightforward, obviously-correct code over cleverness.
