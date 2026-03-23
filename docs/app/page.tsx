import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: "1rem",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <h1 style={{ fontSize: "3rem", fontWeight: 800 }}>Cosmio</h1>
      <p style={{ fontSize: "1.25rem", opacity: 0.7, maxWidth: "600px" }}>
        Type-safe model definition &amp; operation library for Azure Cosmos DB.
        <br />
        Powered by Zod, built for TypeScript.
      </p>
      <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
        <Link
          href="/docs"
          style={{
            padding: "0.75rem 2rem",
            borderRadius: "0.5rem",
            background: "#0070f3",
            color: "white",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Get Started
        </Link>
        <Link
          href="https://github.com/masahirodev/cosmio"
          style={{
            padding: "0.75rem 2rem",
            borderRadius: "0.5rem",
            border: "1px solid #333",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          GitHub
        </Link>
      </div>
    </main>
  );
}
