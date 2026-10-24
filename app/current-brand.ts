import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db/server";

// The customer's own brand. There are no accounts yet, so the browser remembers which brand it
// created (or opened) in a cookie; every customer-facing screen is about that one brand.
const COOKIE = "brand_id";
const YEAR = 60 * 60 * 24 * 365;

export type CurrentBrand = { id: string; name: string; hasProfile: boolean };

export async function currentBrand(): Promise<CurrentBrand | null> {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return brandById(id);
}

export async function brandById(id: string): Promise<CurrentBrand | null> {
  const { data } = await db().from("brands").select("id, name, brand_profiles(brand_id)").eq("id", id).maybeSingle();
  if (!data) return null;
  const profile = data.brand_profiles as unknown; // one-to-one, but tolerate either shape
  const hasProfile = Array.isArray(profile) ? profile.length > 0 : !!profile;
  return { id: data.id as string, name: data.name as string, hasProfile };
}

/** Server actions and route handlers only (cookies can't be set while a page renders). */
export async function rememberBrand(id: string) {
  (await cookies()).set(COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: YEAR, path: "/" });
}

export async function forgetBrand(id: string) {
  const jar = await cookies();
  if (jar.get(COOKIE)?.value === id) jar.delete(COOKIE);
}
