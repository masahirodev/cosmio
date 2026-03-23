import { RootProvider } from "fumadocs-ui/provider";
import "fumadocs-ui/style.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Cosmio — Type-safe Cosmos DB",
  description:
    "Type-safe model definition and operation library for Azure Cosmos DB with Zod schema inference.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
