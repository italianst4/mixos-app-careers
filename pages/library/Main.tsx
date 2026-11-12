import Link from "next/link";

import { callAppRoute } from "@/lib/apps/call";
import { ErrorState } from "@/components/ui/app-states";
import AppPageHeader from "@/components/ui/app-page-header";

import type { Library } from "../../lib/shared/schemas";
import { LibraryEditor } from "./library-editor";

/**
 * The career library.
 *
 * Everything a generated document can assert is selected, ordered and at most
 * lightly reworded from what is on this page. Nothing else is a source of fact,
 * which is why the editor spends as much space on what is *unfinished* as on
 * what is filled in.
 */
export default async function LibraryPage() {
  let library: Library | null = null;

  try {
    library = await callAppRoute<Library>("careers-baa28a1b", "GET /library");
  } catch {
    library = null;
  }

  if (!library) {
    return (
      <div className="p-6">
        <ErrorState
          title="The library is unavailable"
          message="Your career library could not be loaded."
        />
        <p className="mt-4 text-sm text-muted-foreground">
          <Link href="/apps/careers-baa28a1b/library" className="underline underline-offset-2">
            Try again
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <AppPageHeader
        title="Career library"
        subtitle="The only source of fact any generated document may draw on. Nothing is invented from anywhere else."
        actions={[{ label: "Applications", href: "/apps/careers-baa28a1b", variant: "secondary" }]}
      />
      <LibraryEditor initial={library} />
    </div>
  );
}
