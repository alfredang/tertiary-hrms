import { SopDirectory } from "@/components/sop/sop-directory";
import { getSops } from "@/lib/sops";
import { toSopListItem } from "@/lib/sop-utils";

export const dynamic = "force-dynamic";

// Standard Operating Procedures index — visible to ALL authenticated users (staff and interns);
// middleware only requires login. SOPs come from the `Sop` table (static fallback until seeded).
export default async function SopIndexPage() {
  const { sops } = await getSops();
  const items = sops.map(toSopListItem);
  const categories = new Set(items.map((i) => i.category)).size;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Standard Operating Procedures</h1>
        <p className="mt-1 text-sm text-gray-400 sm:text-base">
          {items.length} procedures in {categories} areas, from the company&apos;s TPQA Policy &amp; Operations Manual.
          Follow each SOP as written; if anything is unclear, check with your supervisor first.
        </p>
      </div>
      <SopDirectory items={items} />
    </div>
  );
}
