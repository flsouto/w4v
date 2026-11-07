# Mosaic patterns

The shared pool in `src/blenders/mosaic-patterns.txt` contains 430 unique sequences:
88 entries from `../beatcli/Pattern.php` and 345 lines from its default
`saved_meshterns` file, with three duplicate entries removed. This follows
Pattern's default loading path; its `psrc` environment variable replaces that
pool with an arbitrary external file and is not imported.

The UI defaults to every pattern enabled. Expand Mosaic patterns to
select or exclude sequences, or add, edit and delete custom sequences. Letters
`a`–`z` identify repeated sample slices; `_` is silence. Custom patterns allow
1–256 steps and require at least one letter. A selected sequence is chosen with
the audio engine's seeded random generator on each mosaic generation.

Custom sequences and exclusions are saved in localStorage under
`looplicator.mosaic-patterns.v1`. New custom sequences are enabled immediately.
The selection toggle enables all patterns or clears the selection. Preview pattern
generates a mosaic from the entered sequence without saving it, even with an
empty selection or random mixer enabled. Preview skips extra FX so the waveform
can label each letter and silence step accurately across the four repetitions.
All mosaic generations show the actual engine-selected pattern on the waveform.
Tempo changes keep the labels aligned. Reverse FX reverses the label order,
and other FX retain the labels. Generating with another mixer clears them. Normal mosaic generation requires at
least one enabled sequence.
The native CLI continues to use the complete bundled pool.
