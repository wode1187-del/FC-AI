import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import NotFoundPage from "@/pages/NotFoundPage/NotFoundPage";
import GeneratorPage from "@/pages/GeneratorPage/GeneratorPage";
import ApiPage from "@/pages/ApiPage/ApiPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/generator" replace />} />
        <Route path="generator" element={<GeneratorPage />} />
        <Route path="api" element={<ApiPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
