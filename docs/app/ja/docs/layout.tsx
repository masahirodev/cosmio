import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { jaSource } from "@/lib/source";

export default function JaLayout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={jaSource.pageTree}
      nav={{
        title: "Cosmio",
        url: "/",
      }}
      links={[
        {
          text: "English",
          url: "/docs",
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
