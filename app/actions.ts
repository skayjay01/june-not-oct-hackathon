"use server";

import { redirect } from "next/navigation";
import { leaveBrand } from "./current-brand";

/** Home's "Change brand": back to the add-your-brand form; the current brand stays saved. */
export async function changeBrand() {
  await leaveBrand();
  redirect("/");
}
