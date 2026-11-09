#!/usr/bin/env python3
"""Export every trainer known to the Planner app's Trainer Directory as JSON for the HRMS import.

Sources (all on Alfred's Mac, read-only):
  ~/DigitalWorkforce/state/hr/trainers.json             LMS/TMS trainers + class runs (bin/trainers-sync.sh)
  ~/DigitalWorkforce/agents/vesta/trainer-notes.json    Vesta's CV extracts (education, experience, skills) + email prospects
  ~/DigitalWorkforce/agents/vesta/trainer-calendar.json classes found in Google Calendar
  ~/Documents/Supporting Document/Tertiary Infotech/ACTA Trainers /   one evidence folder per trainer

It reuses the Planner builder (~/DigitalWorkforce/bin/trainers-dashboard.py) for folder matching,
certification parsing and finance-background detection, so HRMS and Planner agree.

Output: .trainers/trainers-export.json (git-ignored: holds NRIC, phone and email).
Usage:  python3 scripts/trainers/export_planner_trainers.py [--out PATH]
Then:   npx tsx scripts/trainers/import-trainers.ts
"""
import importlib.util, json, os, re, sys
from collections import defaultdict
from datetime import datetime, timezone

HOME = os.path.expanduser("~")
BUILDER = os.path.join(HOME, "DigitalWorkforce", "bin", "trainers-dashboard.py")
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(REPO, ".trainers", "trainers-export.json")

spec = importlib.util.spec_from_file_location("trainers_dashboard", BUILDER)
td = importlib.util.module_from_spec(spec)
spec.loader.exec_module(td)

IBF_FIT = re.compile(r"fit\s*(and|&)\s*proper|IBF\s*form|IBF\s+Trainer\s+Assessor\s+Declaration|IBF.*declar", re.I)
EVIDENCE = re.compile(r"\.(pdf|docx?|jpe?g|png|opencert|pptx)$", re.I)
# Order and labels shown in the HRMS. Planner calls the diploma "DDDLP"; people also write "DDDPL".
TRAINING_ORDER = ["ACLP", "ACTA", "ACTAS", "DACE", "DDDLP", "AE Registry"]


def nz(v):
    """TMS snapshot stores missing values as None or the string 'None'."""
    if v is None:
        return ""
    s = str(v).strip()
    return "" if s in ("None", "null") else s


def as_list(v):
    out = []
    for x in v or []:
        x = re.sub(r"\s+", " ", str(x)).strip(" ,;.")
        if x and x.lower() not in (y.lower() for y in out):
            out.append(x)
    return out


def label_skills(labels):
    """Folder topic labels are Alfred's own skill tags: "(AWS:Azure:PMP)" -> AWS, Azure, PMP."""
    out = []
    for lab in labels:
        for x in re.split(r"[:,/;]|\band\b", lab):
            x = x.strip(" .,_")
            if len(x) > 1:
                out.append(x)
    return out


def files_of(row):
    acta_dir = td.ACTA_DIR
    out = []
    for f in td.folder_files(row):
        rel = os.path.relpath(f, acta_dir)
        if EVIDENCE.search(rel):
            out.append(rel)
    return sorted(out, key=str.lower)


def enrich(row, notes_entry):
    """Add the HRMS-only attributes: training certs, professional certs, IBF fit, evidence files."""
    # certifications() reads r["quals"]; include Vesta's CV certifications so ACTA/DACE in a CV count too.
    row["quals"] = as_list(row["quals"] + list(notes_entry.get("certifications", [])))
    # The builder scans r["type"] too, and "non-ACLP" would read as ACLP: pass only a real ACLP/DACE type.
    probe = dict(row, type=row["type"] if row["type"] in ("ACLP", "DACE") else "",
                 folderLabels=[re.sub(r"(?i)\bALCP\b", "ACLP", x) for x in row["folderLabels"]])
    training, pro, _cert_files = td.certifications(probe)
    # File names with the common "ALCP" typo (e.g. "All_Certs_including_ALCP.pdf") still mean ACLP.
    if "ACLP" not in training and any(re.search(r"(?<![A-Za-z])ALCP(?![A-Za-z])", f) for f in td.folder_files(row)):
        training.append("ACLP")
    training = [t for t in TRAINING_ORDER if t in training]
    files = files_of(row)
    fit_files = [f for f in files if IBF_FIT.search(os.path.basename(f)) or IBF_FIT.search(f)]
    # "WSQ ACTA", "ACLP certificate" etc. are training certs, already shown as flags.
    pro = [p for p in as_list(pro) if not re.search(r"(?<![A-Za-z])(ACLP|ACTA|ACTAS|DACE|DDD[LP][LP]|ALCP)(?![A-Za-z])", p)]
    return training, pro, files, fit_files


def load_index():
    """<ACTA>/_trainer-index.json: {"<FOLDER NAME>": "<TMS user id>"} — explicit folder<->TMS links kept by
    rename_acta_folders.py, so capital full-name folders still match a shorter TMS name."""
    try:
        return json.load(open(os.path.join(td.ACTA_DIR, "_trainer-index.json")))
    except (OSError, ValueError):
        return {}


def tms_rows(snap, notes, cal_classes, folders):
    index = load_index()
    by_tms = defaultdict(list)
    for f, tid in index.items():
        if f in folders:
            by_tms[tid].append(f)
    runs = defaultdict(list)
    for r in snap["runs"]:
        runs[r["trainer_id"]].append(r)
    rows, used = [], set()
    indexed = set(index)
    for t in snap["trainers"]:
        linked = sorted(by_tms.get(t["id"], []))
        folder = linked[0] if linked else td.match_folder(t, {f: v for f, v in folders.items() if f not in indexed})
        if folder:
            used.add(folder)
        for extra in linked[1:]:
            used.add(extra)
        n = notes.get(t["id"]) or notes.get(t["full_name"]) or (notes.get(folder) if folder else None) or {}
        gcal = cal_classes.get((t["full_name"] or "").lower()) or cal_classes.get((t.get("common_name") or "").lower()) \
            or (cal_classes.get(folder.lower()) if folder else None) or []
        rr = runs.get(t["id"], [])
        by_course = defaultdict(list)
        for r in rr:
            by_course[(r["title"] or "Untitled", r["course_code"] or "")].append(r)
        courses = sorted(([k[0], k[1], len(v), min((x["start_date"] or "")[:10] for x in v), max((x["start_date"] or "")[:10] for x in v)]
                          for k, v in by_course.items()), key=lambda c: (-c[2], c[0]))
        skills = sorted(set(td.tolist(t["skills_tags"]) + td.tolist(t["areas_of_expertise"]) + list(n.get("skills", []))), key=str.lower)
        quals = sorted(set(td.tolist(t["qualifications"]) + td.tolist(t["certification_tags"])), key=str.lower)
        folder_tags = folders.get(folder, (None, []))[1] if folder else []
        skills = sorted(set(skills + label_skills(folder_tags)), key=str.lower)
        experience = n.get("experience", [])
        if isinstance(experience, str):
            experience = [experience]
        education = n.get("education") or nz(t.get("education"))
        row = {
            "sourceKey": "tms:" + t["id"], "tmsId": t["id"], "name": nz(t["full_name"]), "nickname": nz(t.get("common_name")) or n.get("nickname", ""),
            "type": t["trainer_type"], "trainerType": t["trainer_type"], "status": nz(t["status"]) or "Active", "inTms": True,
            "folder": folder, "moreFolders": [], "folderLabels": folder_tags,
            "phone": nz(t.get("tel")), "email": nz(t.get("email")), "secondaryEmail": nz(t.get("secondary_email")),
            "nric": nz(t.get("nric")), "nationality": nz(t.get("nationality")) or nz(t.get("country")), "gender": nz(t.get("gender")),
            "linkedinUrl": nz(t.get("linkedin_url")), "cvUrl": nz(t.get("cv_url")), "cvFolderUrl": nz(t.get("cv_folder_url")),
            "education": education, "experience": as_list(experience), "summary": n.get("summary", ""), "notesSource": n.get("source", ""),
            "skills": skills, "quals": quals,
            "courses": [{"title": c[0], "code": c[1], "classes": c[2], "first": c[3], "last": c[4]} for c in courses],
            "recentClasses": [{"start": (r["start_date"] or "")[:10], "title": r["title"] or "", "run": nz(r.get("course_run_id")),
                               "status": nz(r.get("class_status")), "mode": nz(r.get("mode_of_learning"))} for r in sorted(rr, key=lambda r: r["start_date"] or "", reverse=True)[:15]],
            "calendarClasses": [{"date": g.get("date", ""), "title": g.get("title", ""), "calendar": g.get("calendar", "")} for g in gcal],
            "classesCount": len(rr),
            "_notes": n,
        }
        rows.append(row)
    return rows, used


def folder_rows(rows, used, notes, cal_classes, folders):
    by_name = {re.sub(r"[^a-z]", "", r["name"].lower()): r for r in rows}
    groups = {}
    for folder in sorted(set(folders) - used):
        if folder.startswith("_"):
            continue                                   # e.g. _stage_tmp
        key = re.sub(r"[^a-z]", "", td.clean_folder(folder).lower())
        if key in by_name:
            by_name[key]["moreFolders"].append(folder)
            continue
        groups.setdefault(key, []).append(folder)
    out = []
    for key, fl in groups.items():
        folder = fl[0]
        n = next((notes[f] for f in fl if f in notes), {})
        label = [t for f in fl for t in folders[f][1]]
        name = n.get("fullName") or td.clean_folder(folder)
        experience = n.get("experience", [])
        if isinstance(experience, str):
            experience = [experience]
        gcal = cal_classes.get(name.lower()) or cal_classes.get(folder.lower()) or []
        out.append({
            "sourceKey": "folder:" + folder, "tmsId": None, "name": name, "nickname": n.get("nickname", ""),
            "type": "Not in TMS", "trainerType": "Not in TMS", "status": "Active", "inTms": False,
            "folder": folder, "moreFolders": fl[1:], "folderLabels": label,
            "phone": n.get("tel", ""), "email": n.get("email", ""), "secondaryEmail": "", "nric": n.get("nric", ""),
            "nationality": n.get("nationality", ""), "gender": "", "linkedinUrl": n.get("linkedin", ""), "cvUrl": "", "cvFolderUrl": "",
            "education": n.get("education", ""), "experience": as_list(experience), "summary": n.get("summary", ""),
            "notesSource": n.get("source", ""), "skills": sorted(set(label + list(n.get("skills", []))), key=str.lower),
            "quals": as_list(n.get("certifications", [])), "courses": [], "recentClasses": [],
            "calendarClasses": [{"date": g.get("date", ""), "title": g.get("title", ""), "calendar": g.get("calendar", "")} for g in gcal],
            "classesCount": 0, "_notes": n,
        })
    return out


def canonical_folder(f):
    """A folder already renamed to the house rule (FULL NAME IN CAPITALS) is the trainer's name; ':' shows as '/'."""
    return bool(f) and f == f.upper() and re.search(r"[A-Z]", f) is not None and not f.startswith("_")


def finalize(row):
    n = row.pop("_notes", {})
    if canonical_folder(row.get("folder")):
        row["name"] = row["folder"].replace(":", "/").strip()     # local drive is the source of truth
    training, pro, files, fit_files = enrich(row, n)
    evidence = [x for x in row["skills"] + row["quals"] + row["folderLabels"] + [row["education"]] + row["experience"] if td.FIN.search(x or "")]
    acta_trainer = row["type"] in ("ACLP", "DACE") or bool(row["folder"]) or bool(training)
    today = datetime.now().strftime("%Y-%m-%d")      # "last class" = most recent class already taught, not a scheduled one
    last = max([d for d in [r["start"] for r in row["recentClasses"]] + [c["first"] for c in row["courses"] if c["first"]]
                + [g["date"] for g in row["calendarClasses"] if g.get("date")] if d and d <= today] or [""])
    return {
        "sourceKey": row["sourceKey"], "tmsId": row["tmsId"], "name": row["name"], "nickname": row["nickname"] or None,
        "nric": row["nric"] or None, "phone": row["phone"] or None, "email": (row["email"] or "").lower() or None,
        "secondaryEmail": (row["secondaryEmail"] or "").lower() or None, "nationality": row["nationality"] or None,
        "gender": row["gender"] or None, "linkedinUrl": row["linkedinUrl"] or None, "cvUrl": row["cvUrl"] or None,
        "cvFolderUrl": row["cvFolderUrl"] or None, "trainerType": row["trainerType"], "status": row["status"], "inTms": row["inTms"],
        "isActaTrainer": acta_trainer, "trainingCerts": training, "certifications": pro,
        "education": row["education"] or None, "experience": row["experience"], "summary": row["summary"] or None,
        "skills": td.tidy_skills(row["skills"]), "financeBackground": bool(evidence), "financeEvidence": sorted(set(evidence))[:8],
        "ibfFitDeclaration": bool(fit_files), "ibfFitFiles": fit_files,
        "actaFolder": row["folder"], "moreFolders": row["moreFolders"], "evidenceFiles": files,
        "courses": row["courses"], "recentClasses": row["recentClasses"], "calendarClasses": row["calendarClasses"],
        "classesCount": row["classesCount"], "lastClassDate": last or None, "profileSource": row["notesSource"] or None,
    }


def main():
    out = OUT
    if "--out" in sys.argv:
        out = sys.argv[sys.argv.index("--out") + 1]
    snap = json.load(open(td.SNAP))
    try:
        nfile = json.load(open(td.NOTES))
    except (OSError, ValueError):
        nfile = {}
    notes, prospects = nfile.get("trainers", {}), nfile.get("prospects", [])
    try:
        cal = json.load(open(td.CALENDAR))
    except (OSError, ValueError):
        cal = {}
    cal_classes = {k.lower(): v for k, v in cal.get("classes", {}).items()}
    folders = td.acta_folders()
    # After the capital-name rename (rename_acta_folders.py) topic labels live in _trainer-labels.json.
    try:
        extra = json.load(open(os.path.join(td.ACTA_DIR, "_trainer-labels.json")))
    except (OSError, ValueError):
        extra = {}
    # "(DR)" in a house-rule folder name is the doctorate marker, not a topic label.
    folders = {f: (toks, sorted(set(l for l in labels + extra.get(f, []) if l.strip().upper() != "DR"), key=str.lower))
               for f, (toks, labels) in folders.items()}
    rows, used = tms_rows(snap, notes, cal_classes, folders)
    rows += folder_rows(rows, used, notes, cal_classes, folders)
    trainers = [finalize(r) for r in rows if r["name"]]
    data = {"generatedAt": datetime.now(timezone.utc).isoformat(), "tmsSnapshotAt": snap.get("generatedAt"),
            "actaDir": td.ACTA_DIR, "trainers": trainers, "prospects": prospects}
    os.makedirs(os.path.dirname(out), exist_ok=True)
    old = os.umask(0o077)
    try:
        with open(out, "w") as f:
            json.dump(data, f, indent=1, ensure_ascii=False)
    finally:
        os.umask(old)
    acta = sum(t["isActaTrainer"] for t in trainers)
    print("exported %d trainers (%d ACTA, %d in TMS, %d folder-only), %d email prospects -> %s" % (
        len(trainers), acta, sum(t["inTms"] for t in trainers), sum(not t["inTms"] for t in trainers), len(prospects), out))


if __name__ == "__main__":
    main()
