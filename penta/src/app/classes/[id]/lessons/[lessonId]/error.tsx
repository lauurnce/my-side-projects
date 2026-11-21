"use client";

import Link from "next/link";

export default function LessonError() {
  return (
    <div role="alert">
      <h1>This lesson could not be shown</h1>
      <p>
        <Link href="/classes">Back to your classes</Link>
      </p>
    </div>
  );
}
