#!/usr/bin/env python3
"""Rename every ACTA Trainers folder to the trainer's FULL NAME IN CAPITALS ("(DR)" for a doctorate).

House rule (Alfred, 9 Nov 2026): folder name == HRMS trainer name, e.g.
    "Dr. Alfred Ang "          -> "ALFRED ANG CHEW HOE (DR)"
    "Malcolm Soo (Finance)"    -> "MALCOLM SOO CHEE KONG"
Topic labels in the old names ("(Finance)", "(AWS:Azure)") are kept as skills in
<ACTA>/_trainer-labels.json so no information is lost.

Full name, in order of preference: the name on the trainer's own documents read from their CV/certificates
(.trainers/cv-profiles.json "fullName"), the LMS/TMS full name, the email application name, the old folder name.
Two folders that resolve to the same person are merged (files moved; a clashing file name gets " (2)").

  python3 scripts/trainers/rename_acta_folders.py            # dry run: print the plan
  python3 scripts/trainers/rename_acta_folders.py --apply    # rename + write the undo manifest
  python3 scripts/trainers/rename_acta_folders.py --undo <manifest.json>

Also re-keys Vesta's ~/DigitalWorkforce/agents/vesta/trainer-notes.json and trainer-lists.json (backups kept).
After --apply: re-run export_planner_trainers.py, then the import (sourceKeys are migrated via the manifest).
"""
import json, os, re, shutil, sys
from datetime import datetime

HOME = os.path.expanduser("~")
ACTA = os.path.join(HOME, "Documents", "Supporting Document", "Tertiary Infotech", "ACTA Trainers ")
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TR = os.path.join(REPO, ".trainers")
VESTA = os.path.join(HOME, "DigitalWorkforce", "agents", "vesta")
LABELS = os.path.join(ACTA, "_trainer-labels.json")
INDEX = os.path.join(ACTA, "_trainer-index.json")   # {"<FOLDER>": "<TMS user id>"}: explicit links, see export

DOCTORATE = re.compile(r"\b(ph\.?\s?d|d\.?phil|doctor of|doctorate|doctoral|dba\b|ed\.?d\b|d\.?eng)", re.I)
TITLE = re.compile(r"^\s*(dr|prof|professor|mr|mrs|ms|mdm|miss)\.?\s+", re.I)


def has_doctorate(name, *texts):
    return bool(re.match(r"^\s*(dr|prof)\.?\s", name or "", re.I) or re.search(r"\(DR\)\s*$", name or "", re.I)
                or any(t and DOCTORATE.search(t) for t in texts))


def canonical(name, is_dr=False):
    """Same rule as canonicalTrainerName() in src/lib/trainers.ts."""
    n = re.sub(r"\(DR\)\s*$", "", name or "", flags=re.I)
    while TITLE.match(n):
        n = TITLE.sub("", n)
    n = re.sub(r"\(.*?\)", " ", n)
    n = re.sub(r"[_\]\[]+", " ", n)
    n = re.sub(r"\s+", " ", n).strip().rstrip(".,;").upper()
    return n + " (DR)" if is_dr else n


def folder_name(display):
    """Display name -> POSIX folder name. Finder shows ':' as '/', so "S/O" stays "S/O" on screen."""
    return display.replace("/", ":")


def tokens(s):
    s = re.sub(r"\(.*?\)", " ", (s or "").lower())
    s = re.sub(r"\b(s/o|d/o|bin|binte|dr|mr|ms)\b\.?", " ", s)
    return [t for t in re.split(r"[^a-z]+", s) if len(t) > 1]


def load(p, default):
    try:
        return json.load(open(p))
    except (OSError, ValueError):
        return default


def plan():
    exp = load(os.path.join(TR, "trainers-export.json"), None)
    if not exp:
        sys.exit("run scripts/trainers/export_planner_trainers.py first")
    cv = load(os.path.join(TR, "cv-profiles.json"), {}).get("profiles", {})
    by_folder = {}
    for t in exp["trainers"]:
        for f in [t["actaFolder"]] + t["moreFolders"]:
            if f:
                by_folder[f] = t
    email = load(os.path.join(TR, "email-trainers.json"), {}).get("trainers", [])
    folders = sorted(n for n in os.listdir(ACTA) if os.path.isdir(os.path.join(ACTA, n)) and not n.startswith("_"))
    rows = []
    for f in folders:
        t = by_folder.get(f)
        key = t["sourceKey"] if t else "folder:" + f
        p = cv.get(key) or cv.get("folder:" + f) or {}
        base, why = None, None
        tms = t["name"] if t and t.get("inTms") else None
        cvname = (p.get("fullName") or "").strip()
        conflict = False
        tt, ct = tokens(tms), tokens(cvname)
        if cvname and tms and set(tt) <= set(ct):
            base, why = cvname, "CV (contains TMS name)"
        elif cvname and tms and [x for x in tt if x not in ct] == tt[:1] and len(set(tt) & set(ct)) >= 1:
            # English name + legal name, Singapore style: TMS "Amanda Liaw" + CV "Liaw Yit Lan" -> "Amanda Liaw Yit Lan"
            base, why = (tms.split()[0] if not re.match(r"(?i)dr\.?$", tms.split()[0]) else tms.split()[1]) + " " + cvname, "English name + CV legal name"
        elif cvname and tms and len(set(tokens(tms)) & set(tokens(cvname))) < min(2, len(set(tokens(cvname))), len(set(tokens(tms)))):
            # The documents in the folder name someone else than the TMS record it was matched to
            # (e.g. "AJAY (GCP)": CV = Bidari Ajay Babu, TMS = Ajay Kumar Ravindran). Never guess: leave it for review.
            base, why, conflict = f, "CONFLICT: CV '%s' vs TMS '%s' — left unchanged" % (cvname, tms), True
        elif tms:
            base, why = tms, "TMS"
        elif cvname:
            ft = tokens(f)
            if len(ft) == 1 and ft[0] not in tokens(cvname):
                base, why = f.split("(")[0].strip().split()[0] + " " + cvname, "folder name + CV legal name"   # "Don" + "Chan WeiZheng"
            else:
                base, why = cvname, "CV"
        else:
            ft = tokens(f)
            em = next((e for e in email if ft and set(ft) <= set(tokens(e.get("fullName")))), None)
            base, why = (em["fullName"], "email") if em else (f, "folder")
        edu = " ".join(filter(None, [p.get("education"), t.get("education") if t else None]))
        is_dr = bool(p.get("isDoctor")) or has_doctorate(base, edu) or has_doctorate(f)
        new = f if conflict else folder_name(canonical(base, is_dr))
        labels = re.findall(r"\((.*?)\)", f)
        labels = [l for l in labels if l.strip().upper() != "DR"]
        rows.append({"old": f, "new": new, "why": why, "sourceKey": key, "labels": labels, "conflict": conflict})
    return rows


def unique_path(path):
    if not os.path.exists(path):
        return path
    root, ext = os.path.splitext(path)
    i = 2
    while os.path.exists("%s (%d)%s" % (root, i, ext)):
        i += 1
    return "%s (%d)%s" % (root, i, ext)


def apply(rows):
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    manifest = {"createdAt": stamp, "acta": ACTA, "renames": [], "merges": []}
    labels = load(LABELS, {})
    groups = {}
    for r in rows:
        groups.setdefault(r["new"], []).append(r)
    for new, rs in sorted(groups.items()):
        target = os.path.join(ACTA, new)
        for r in rs:
            if r["labels"]:
                labels[new] = sorted(set(labels.get(new, []) + r["labels"]), key=str.lower)
        first, rest = rs[0], rs[1:]
        if first["old"] != new:
            if os.path.exists(target) and first["old"].lower() != new.lower():
                rest = [first] + rest                     # target already exists: merge into it
            else:
                tmp = os.path.join(ACTA, "_tmp_rename_" + stamp)
                os.rename(os.path.join(ACTA, first["old"]), tmp)   # two steps: case-only renames on APFS
                os.rename(tmp, target)
                manifest["renames"].append({"old": first["old"], "new": new})
        for r in rest:
            src = os.path.join(ACTA, r["old"])
            moved = []
            for name in os.listdir(src):
                if name == ".DS_Store":
                    continue
                dst = unique_path(os.path.join(target, name))
                shutil.move(os.path.join(src, name), dst)
                moved.append({"from": name, "to": os.path.basename(dst)})
            leftover = [n for n in os.listdir(src) if n != ".DS_Store"]
            if not leftover:
                shutil.rmtree(src)
            manifest["merges"].append({"old": r["old"], "into": new, "files": moved})
    json.dump(labels, open(LABELS, "w"), indent=1, ensure_ascii=False)
    index = load(INDEX, {})
    moved = {x["old"]: x["new"] for x in manifest["renames"]}
    moved.update({x["old"]: x["into"] for x in manifest["merges"]})
    index = {moved.get(f, f): tid for f, tid in index.items()}
    for r in rows:
        if r["sourceKey"].startswith("tms:"):
            index[r["new"]] = r["sourceKey"][4:]
    json.dump(index, open(INDEX, "w"), indent=1, ensure_ascii=False)
    os.makedirs(TR, exist_ok=True)
    mpath = os.path.join(TR, "acta-rename-manifest-%s.json" % stamp)
    json.dump(manifest, open(mpath, "w"), indent=1, ensure_ascii=False)
    shutil.copy(mpath, os.path.join(ACTA, "_rename-manifest-%s.json" % stamp))
    rekey_vesta(manifest)
    print("renamed %d, merged %d folders. Manifest: %s" % (len(manifest["renames"]), len(manifest["merges"]), mpath))


def rekey_vesta(manifest):
    m = {x["old"]: x["new"] for x in manifest["renames"]}
    m.update({x["old"]: x["into"] for x in manifest["merges"]})
    for fname in ("trainer-notes.json", "trainer-lists.json"):
        p = os.path.join(VESTA, fname)
        data = load(p, None)
        if data is None:
            continue
        shutil.copy(p, p + ".bak-before-rename-" + manifest["createdAt"])
        def rk(d):
            out = {}
            for k, v in d.items():
                if k.startswith("folder:") and k[7:] in m:
                    k = "folder:" + m[k[7:]]
                elif k in m:
                    k = m[k]
                out.setdefault(k, v)
            return out
        if fname == "trainer-notes.json":
            data["trainers"] = rk(data.get("trainers", {}))
        else:
            data = rk(data)
        json.dump(data, open(p, "w"), indent=1, ensure_ascii=False)


def undo(mpath):
    man = json.load(open(mpath))
    for x in reversed(man["merges"]):
        src = os.path.join(ACTA, x["old"])
        os.makedirs(src, exist_ok=True)
        for f in x["files"]:
            shutil.move(os.path.join(ACTA, x["into"], f["to"]), os.path.join(src, f["from"]))
    for x in reversed(man["renames"]):
        os.rename(os.path.join(ACTA, x["new"]), os.path.join(ACTA, x["old"]))
    print("undone: %d renames, %d merges (Vesta backups: *.bak-before-rename-%s)" % (len(man["renames"]), len(man["merges"]), man["createdAt"]))


if __name__ == "__main__":
    if "--undo" in sys.argv:
        undo(sys.argv[sys.argv.index("--undo") + 1])
        sys.exit()
    rows = plan()
    changed = [r for r in rows if r["old"] != r["new"]]
    dupes = {}
    for r in rows:
        dupes.setdefault(r["new"], []).append(r["old"])
    for r in rows:
        mark = "  " if r["old"] == r["new"] else "->"
        print("%-48s %s %-44s [%s]%s" % (r["old"][:48], mark, r["new"], r["why"], "  labels: " + ", ".join(r["labels"]) if r["labels"] else ""))
    merges = {k: v for k, v in dupes.items() if len(v) > 1}
    conflicts = [r for r in rows if r.get("conflict")]
    if conflicts:
        print("\nNEEDS REVIEW (not renamed): " + "; ".join("%s — %s" % (r["old"], r["why"]) for r in conflicts))
    print("\n%d folders, %d to rename, %d names shared by several folders (merged): %s" % (
        len(rows), len(changed), len(merges), "; ".join("%s <- %s" % (k, " + ".join(v)) for k, v in merges.items())))
    if "--apply" in sys.argv:
        apply(rows)
    else:
        print("dry run — add --apply to rename")
