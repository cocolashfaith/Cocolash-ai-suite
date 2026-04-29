import type { NextConfig } from "next";

function getSupabaseHostname(): string {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : "*.supabase.co";
  } catch {
    return "*.supabase.co";
  }
}

const supabaseHostname = getSupabaseHostname();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHostname,
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        // HeyGen uses multiple controlled CDN subdomains, e.g. files.heygen.ai and files2.heygen.ai.
        hostname: "**.heygen.ai",
      },
    ],
  },
};

export default nextConfig;
