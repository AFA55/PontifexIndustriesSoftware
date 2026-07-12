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
 * Theme parity (founder P1, Jul 12): the room follows the app's light/dark
 * toggle. Light = clean-room slate (panels read like the admin app); dark =
 * midnight-steel HUD. The orb sits in an always-dark reactor bezel so the
 * canvas art works on both.
 */
export default function CommandCenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] overflow-hidden bg-slate-100 text-slate-900 dark:bg-[#070B14] dark:text-white">
      {children}
    </div>
  );
}
