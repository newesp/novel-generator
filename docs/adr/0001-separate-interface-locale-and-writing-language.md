---
status: accepted
---

# Separate interface locale from immutable book writing language

The App treats **Interface Locale** and **Writing Language** as separate concepts. Interface Locale is a persisted global preference that only localizes product-owned UI and formatting. Writing Language is selected when a book is created, stored on that book, and immutable afterward; it controls reader-facing AI story content, export language metadata, and the default TTS voice family. This avoids coupling an author's UI preference to the language of a work and prevents a single book or Multi-Agent run from drifting between languages.

## Considered options

- Coupling writing language to Interface Locale was rejected because switching the App UI must not alter a book's output.
- A mutable global writing language was rejected because users may keep Chinese and English books in the same library.
- A mutable per-book writing language was rejected to avoid mixed-language books and mid-run behavior.

## Consequences

- Preferences hold only the default used by the new-book form; changing that default never updates existing books.
- Existing books and legacy backups are normalized to Traditional Chinese.
- Multi-Agent context snapshots still record Writing Language for auditability and defensive consistency.
- Technical prompts for image providers, stable data codes, slugs, and existing user-authored content are outside Writing Language.
