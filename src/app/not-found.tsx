import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
      <p className="mt-2 text-[14px] text-muted">That player or fixture isn&apos;t in the current dataset.</p>
      <Link href="/" className="mt-4 inline-block text-[14px] font-medium text-fg hover:underline">Back to dashboard</Link>
    </div>
  );
}
