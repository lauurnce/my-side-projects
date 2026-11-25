import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const headers = securityHeaders({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  development: process.env.NODE_ENV !== "production",
});

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
