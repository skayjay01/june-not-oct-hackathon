import { redirect } from "next/navigation";

// Adding your brand now happens on the home screen (one brand per customer).
export default function OnboardPage() {
  redirect("/");
}
