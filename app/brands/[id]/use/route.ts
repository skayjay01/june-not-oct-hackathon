import { redirect } from "next/navigation";
import { brandById, rememberBrand } from "@/app/current-brand";

// Opens a brand as "your brand" in this browser (a second device, or the demo), then goes home.
export async function GET(_req: Request, { params }: RouteContext<"/brands/[id]/use">) {
  const { id } = await params;
  const brand = await brandById(id);
  if (brand) await rememberBrand(brand.id);
  redirect("/");
}
