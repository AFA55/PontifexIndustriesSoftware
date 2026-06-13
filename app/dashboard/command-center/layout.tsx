/**
 * Command Center layout — a full-bleed dark shell that escapes the normal
 * dashboard chrome.
 *
 * This route is a SIBLING of /dashboard/admin, so it does NOT inherit the admin
 * sidebar/header (that chrome lives in app/dashboard/admin/layout.tsx). It still
 * inherits app/dashboard/layout.tsx (headless push/subscription providers), which
 * renders no visible chrome. This wrapper just pins the scene to the full viewport
 * with the deep-indigo HUD background.
 *
 * Intentional dark HUD: the background is hardcoded brand indigo and does NOT
 * follow light/dark mode — the command center is always dark.
 */
export default function CommandCenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] overflow-hidden bg-[#0d0820] text-white">
      {children}
    </div>
  );
}
