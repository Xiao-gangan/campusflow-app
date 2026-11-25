import { lazy, Suspense, useEffect } from "react";
import { getModuleByPath } from "./app/module-meta";
import { MODULE_COMPONENTS } from "./app/modules";
import { useHashRoute } from "./app/use-hash-route";
import OverviewPage from "./pages/OverviewPage";
import { MobileNav } from "./components/app/mobile-nav";
import { Sidebar } from "./components/app/sidebar";

const CandidateInvitePage = lazy(() => import("./modules/invite/CandidateInvitePage"));
const DesignerPage = lazy(() => import("./modules/designer/DesignerPage"));
const InvitePreviewPage = lazy(() => import("./modules/invite/InvitePreviewPage"));

function RouteLoading({ fullPage = false }: { fullPage?: boolean }) {
  return (
    <div
      className={
        fullPage
          ? "grid min-h-dvh place-items-center bg-background text-sm text-muted-foreground"
          : "grid min-h-[40vh] place-items-center text-sm text-muted-foreground"
      }
    >
      正在加载…
    </div>
  );
}

export default function App() {
  const route = useHashRoute();
  const module = getModuleByPath(route);
  const ModulePage = module ? MODULE_COMPONENTS[module.id] : null;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  if (route === "/invite/rsvp") {
    return <Suspense fallback={<RouteLoading fullPage />}><CandidateInvitePage /></Suspense>;
  }

  if (route === "/invite/preview") {
    return (
      <Suspense fallback={<RouteLoading fullPage />}>
        <InvitePreviewPage />
      </Suspense>
    );
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        跳到主要内容
      </a>

      <Sidebar activeRoute={route} />

      <div className="lg:pl-[236px]">
        <MobileNav activeRoute={route} />
        <main
          id="main-content"
          className={
            route === "/designer"
              ? "mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8 xl:px-10"
              : "mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10"
          }
        >
          {route === "/designer" ? (
            <Suspense fallback={<RouteLoading />}>
              <DesignerPage />
            </Suspense>
          ) : ModulePage ? (
            <ModulePage />
          ) : (
            <OverviewPage />
          )}
        </main>
      </div>
    </div>
  );
}
