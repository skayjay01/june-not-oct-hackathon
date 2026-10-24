import { OnboardForm } from "./onboard-form";

// The form's action starts the crawl + AI profile in the background (after()); give it room.
export const maxDuration = 300;

export const metadata = { title: "Add your brand · Ask-a-Trend" };

export default function OnboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Add your brand</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Give us your website and we&apos;ll write a profile of your style in a couple of minutes. You can edit it before
          anything is sent.
        </p>
      </div>
      <OnboardForm />
    </main>
  );
}
