import { lazy, Suspense } from "react";

const RecruitmentConsole = lazy(() => import("./RecruitmentConsole"));

export default function RecruitmentPage() {
  return <Suspense fallback={<p>正在读取招新数据…</p>}><RecruitmentConsole /></Suspense>;
}
