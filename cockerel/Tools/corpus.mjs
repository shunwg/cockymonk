#!/usr/bin/env node
/**
 * corpus.mjs — inspect and check the versioned word corpora.
 *
 *   node Tools/corpus.mjs list              # every lang/version on disk, active marked
 *   node Tools/corpus.mjs validate          # shape/quality checks on all of them
 *   node Tools/corpus.mjs validate en v2    # just one
 *   node Tools/corpus.mjs diff en v1 v2     # what changed between two versions
 *
 * Deliberately read-only: switching the active version is a one-line edit to
 * js/config.js CORPUS_VERSIONS, which belongs in a commit and a diff, not in a
 * command that mutates source behind your back. `list` prints the line to
 * change.
 */
import {
  allCorpusVersions, listVersions, listCorpusLangs, activeVersion,
  corpusMeta, validateCorpus, loadCorpus,
} from "../js/words.js";
import { LANGS } from "../js/config.js";

const [cmd, ...rest] = process.argv.slice(2);

function activeOrNull(lang) {
  try {
    return activeVersion(lang);
  } catch {
    return null; // misconfigured — `list` should still show what IS on disk
  }
}

function list() {
  for (const lang of listCorpusLangs()) {
    const active = activeOrNull(lang);
    const inPlay = LANGS.includes(lang) ? "" : "  (not in config.js LANGS — inert)";
    console.log(`\n${lang}${inPlay}`);
    for (const version of listVersions(lang)) {
      const m = corpusMeta(lang, version);
      const marker = version === active ? "*" : " ";
      console.log(`  ${marker} ${version.padEnd(4)} ${String(m.counts.words).padStart(5)} words  ${String(m.counts.fakeDefs).padStart(6)} decoys  [${m.status}]  ${m.label}`);
      if (m.importedAt) console.log(`         imported ${m.importedAt}${m.source ? ` from ${m.source}` : ""}`);
    }
    if (!active) console.log("    ! no valid active version — check js/config.js CORPUS_VERSIONS");
  }
  console.log("\n(* = active) Switch by editing js/config.js CORPUS_VERSIONS, e.g.");
  console.log("  export const CORPUS_VERSIONS = { " + listCorpusLangs().map((l) => `${l}: "${activeOrNull(l) ?? "v1"}"`).join(", ") + " };");
  console.log("Only NEW daily batches follow the change; days already played stay pinned to the version they were drawn from.");
}

function validate(targets) {
  let failed = 0;
  for (const { lang, version } of targets) {
    const { problems, warnings } = validateCorpus(lang, version);
    const status = problems.length ? "FAIL" : warnings.length ? "warn" : "ok  ";
    console.log(`${status}  ${lang}/${version}`);
    for (const p of problems) console.log(`        ! ${p}`);
    for (const w of warnings) console.log(`        · ${w}`);
    failed += problems.length;
  }
  if (failed) {
    console.error(`\n${failed} problem(s) found.`);
    process.exitCode = 1;
  }
}

function diff(lang, a, b) {
  const from = loadCorpus(lang, a);
  const to = loadCorpus(lang, b);
  const fromById = from.byId;
  const toById = to.byId;

  const added = to.words.filter((w) => !fromById.has(w.id));
  const removed = from.words.filter((w) => !toById.has(w.id));
  const changed = to.words.filter((w) => {
    const old = fromById.get(w.id);
    return old && (old.word !== w.word || old.definition !== w.definition);
  });

  console.log(`${lang}: ${a} (${from.words.length} words) -> ${b} (${to.words.length} words)`);
  console.log(`  added ${added.length}, removed ${removed.length}, reworded ${changed.length}`);
  // Zero shared ids usually means the two versions come from different
  // pipelines rather than being an edit of one another — worth flagging,
  // because recently-used exclusion can't carry across that boundary
  // (see recentlyUsedWordIds in server/db.mjs).
  const shared = to.words.length - added.length;
  if (shared === 0) console.log("  ! no shared word ids — these are unrelated id namespaces, not an edit");
  const show = (label, list) => {
    if (!list.length) return;
    console.log(`\n  ${label}:`);
    for (const w of list.slice(0, 20)) console.log(`    ${w.id}  ${w.word}`);
    if (list.length > 20) console.log(`    … and ${list.length - 20} more`);
  };
  show("added", added);
  show("removed", removed);
  show("reworded", changed);
}

switch (cmd) {
  case "list":
  case undefined:
    list();
    break;
  case "validate":
    validate(rest.length === 2 ? [{ lang: rest[0], version: rest[1] }] : allCorpusVersions());
    break;
  case "diff":
    if (rest.length !== 3) throw new Error("usage: node Tools/corpus.mjs diff <lang> <fromVersion> <toVersion>");
    diff(rest[0], rest[1], rest[2]);
    break;
  default:
    throw new Error(`Unknown command "${cmd}" — try list, validate, or diff.`);
}
