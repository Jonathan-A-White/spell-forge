#!/usr/bin/env bash
# Checks docs/best-practices-audit.md against its own rules (mw-vtjxh4.26). Run from the repo root:
#   bash docs/check-best-practices-audit.sh [path to the vault's pwa-best-practices/checklist.md]
# It prints one line per problem and exits non-zero when there is any; it prints "ok: ..." lines otherwise.
# The vault is not on CI, so the counts below are fixed (31 checklist lines at the vault's 2026-10-10 edition,
# 6 rules added 2026-10-09 in the story, at least 1 extra later rule); when a vault path is given (or the
# default one exists) the checklist count is also compared with the vault's own.

set -u
DOC=docs/best-practices-audit.md
EXPECT_CHECKLIST=31
EXPECT_RULES=6
VAULT_CHECKLIST=${1:-$HOME/millwright-vault/seats/builder/pwa-best-practices/checklist.md}
bad=0
problem() { echo "PROBLEM: $*"; bad=1; }

[ -f "$DOC" ] || { problem "$DOC does not exist"; exit 1; }

# Table rows: | ID | Rule | Status | Evidence | Fix | Size |
rows=$(awk -F'|' '/^\| *(C|R|X)[0-9]+ *\|/ { for (i = 1; i <= 7; i++) gsub(/^ +| +$/, "", $i); print $2 "\t" $4 "\t" $5 "\t" $6 "\t" $7 }' "$DOC")

nc=$(printf '%s\n' "$rows" | grep -c '^C[0-9]')
nr=$(printf '%s\n' "$rows" | grep -c '^R[0-9]')
nx=$(printf '%s\n' "$rows" | grep -c '^X[0-9]')
[ "$nc" -eq "$EXPECT_CHECKLIST" ] || problem "checklist rows: found $nc, expected $EXPECT_CHECKLIST"
[ "$nr" -eq "$EXPECT_RULES" ] || problem "2026-10-09 rule rows: found $nr, expected $EXPECT_RULES"
[ "$nx" -ge 1 ] || problem "no X rows (later rules)"
if [ -f "$VAULT_CHECKLIST" ]; then
  vc=$(grep -c '^\[ \]' "$VAULT_CHECKLIST")
  [ "$nc" -eq "$vc" ] || problem "checklist rows $nc but the vault's checklist.md has $vc [ ] lines"
  echo "ok: vault checklist has $vc [ ] lines, audit has $nc checklist rows"
fi
dups=$(printf '%s\n' "$rows" | cut -f1 | sort | uniq -d)
[ -z "$dups" ] || problem "duplicate row ids: $dups"

# Every row: a status and evidence; every fail row: a fix and a size.
while IFS=$'\t' read -r id status evidence fix size; do
  [ -n "$id" ] || continue
  case "$status" in pass | fail | n/a) ;; *) problem "$id: status '$status' is not pass, fail or n/a" ;; esac
  [ ${#evidence} -ge 12 ] || problem "$id: evidence missing or too short"
  if [ "$status" = fail ]; then
    [ ${#fix} -ge 12 ] || problem "$id: fail row without a fix"
    case "$size" in S* | M* | L*) ;; *) problem "$id: fail row without a size (S, M or L) - got '$size'" ;; esac
  fi
done <<EOF
$rows
EOF
echo "ok: $nc checklist + $nr rule + $nx extra rows checked for status, evidence, fix and size"

# Every file:line a row cites exists and the line is inside the file.
cites=$(grep -o '`[A-Za-z0-9_./-]*:[0-9][0-9,-]*`' "$DOC" | tr -d '`' | sort -u)
ncite=0
for c in $cites; do
  path=${c%%:*}
  first=$(printf '%s' "${c#*:}" | grep -o '^[0-9]*')
  ncite=$((ncite + 1))
  if [ ! -f "$path" ]; then problem "cited file missing: $c"; continue; fi
  total=$(wc -l <"$path")
  [ "$first" -ge 1 ] && [ "$first" -le $((total + 1)) ] || problem "cited line outside file: $c (file has $total lines)"
done
echo "ok: $ncite file:line citations checked"

# Every other backticked repo path exists (a path to create is written in bold, not in backticks).
npath=0
for p in $(awk '/^```/{f=!f; next} !f' "$DOC" | grep -o '`[^` ]*`' | tr -d '`' | grep -E '^(src|tests|docs|public|scripts|packages|grinds|\.github)/' | grep -v ':[0-9]' | sort -u); do
  npath=$((npath + 1))
  [ -e "$p" ] || problem "backticked path missing: $p"
done
echo "ok: $npath bare paths checked"

# The ranked list: 1 to 10 numbered items, each with a Check: that is a command.
ranked=$(awk '/^## Ranked fix stories/{f=1; next} /^## /{f=0} f && /^[0-9]+\. /' "$DOC")
nrank=$(printf '%s\n' "$ranked" | grep -c '^[0-9]')
{ [ "$nrank" -ge 1 ] && [ "$nrank" -le 10 ]; } || problem "ranked list has $nrank items (need 1 to 10)"
nocheck=$(printf '%s\n' "$ranked" | grep '^[0-9]' | grep -v 'Check: `[^`]*`')
[ -z "$nocheck" ] || problem "ranked item without a runnable Check: $nocheck"
echo "ok: $nrank ranked fix stories"

[ "$bad" -eq 0 ] && echo "PASS" || { echo "FAIL"; exit 1; }
