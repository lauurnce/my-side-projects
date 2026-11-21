import Link from "next/link";

export default function ClassNotFound() {
  return (
    <div>
      <h1>Not found</h1>
      <p>This page does not exist, or it is no longer available to you.</p>
      <p>
        <Link href="/classes">Back to your classes</Link>
      </p>
    </div>
  );
}
