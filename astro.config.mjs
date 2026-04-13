import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://epam-acme-corp.github.io",
  base: "/media-docs",
  integrations: [
    starlight({
      title: "Acme Media Docs",
      social: {
        github: "https://github.com/epam-acme-corp/media-docs",
      },
      components: {
        ThemeSelect: './src/components/ThemeSelectWithOPCO.astro',
      },
      sidebar: [
        {
          label: "Overview",
          autogenerate: { directory: "overview" },
        },
        {
          label: "Architecture",
          items: [
            {
              label: "Overview",
              slug: "architecture/overview",
            },
            {
              label: "ADRs",
              autogenerate: { directory: "architecture/adr" },
            },
          ],
        },
        {
          label: "Technical",
          autogenerate: { directory: "technical" },
        },
        {
          label: "API",
          autogenerate: { directory: "api" },
        },
        {
          label: "Data",
          autogenerate: { directory: "data" },
        },
        {
          label: "Operations",
          autogenerate: { directory: "operations" },
        },
      ],
    }),
  ],
});
