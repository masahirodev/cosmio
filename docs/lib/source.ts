import { docs, jaDocs } from "@/.source";
import { loader } from "fumadocs-core/source";

export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: "/docs",
});

export const jaSource = loader({
  source: jaDocs.toFumadocsSource(),
  baseUrl: "/ja/docs",
});
