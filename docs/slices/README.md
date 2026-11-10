# Slice packs

Each pack is one folder: `00-RULES-<pack>.md`, numbered slice files, `STATUS.md` and a `README.md` with the order.

How a task works:
1. One slice per task. The task message names the rules file, `STATUS.md` and the slice file, by path.
2. Read all three from the repo. Never work from a pasted or attached copy of a slice.
3. Run the slice's pre-flight first. If anything fails, stop and report. Never rebuild a piece an earlier slice owns.
4. Build only that slice. Don't start the next one.
5. Finish by adding the slice's block to `STATUS.md` (exact names of new tables, columns, functions, endpoints, the migration file, deviations) and writing the verification report to the area's `reports/` folder.
6. Don't edit the slice files themselves; Randy replaces them if a slice changes.
