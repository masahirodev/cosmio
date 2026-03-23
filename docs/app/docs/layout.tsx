import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { source } from "@/lib/source";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{
        title: "Cosmio",
        url: "/",
      }}
      links={[
        {
          text: "日本語",
          url: "/ja/docs",
        },
        {
          text: "GitHub",
          url: "https://github.com/masahirodev/cosmio",
        },
      ]}
    >
      {children}
    </DocsLayout>
  );
}
