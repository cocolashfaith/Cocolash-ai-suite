import { redirect } from "next/navigation";

/**
 * Root page — redirects to /generate (the main app page).
 * Auth middleware will catch unauthenticated users and send them to /login.
 */
export default function Home() {
  redirect("/generate");
}
