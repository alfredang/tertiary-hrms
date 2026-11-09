// GET /api/mobile/trainers/[id] — one trainer's full profile for the native apps ({ trainer }),
// TRAINER_ADMIN only. Includes the NRIC: the apps must show it masked until the user taps "Show".
export { GET } from "@/app/api/trainers/[id]/route";
export const dynamic = "force-dynamic";
