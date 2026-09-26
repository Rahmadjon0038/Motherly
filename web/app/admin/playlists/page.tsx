import { redirect } from "next/navigation";

// Pleylistlar "Video darslar" sahifasida (alohida tab).
export default function PlaylistsRedirect() {
  redirect("/admin/videos?tab=playlists");
}
