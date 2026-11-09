// GET /api/mobile/trainers?q=&cert=ACLP&tag=PMP&finance=1&ibfFit=1&status=trainers|applicants|all
// Trainer directory for the native apps — same handler, access check (TRAINER_ADMIN) and payload
// as the web API (no NRIC in the list). Returns { count, trainers: TrainerListItem[] }.
export { GET } from "@/app/api/trainers/route";
export const dynamic = "force-dynamic";
