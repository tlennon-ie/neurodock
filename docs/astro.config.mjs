import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import sitemap from "@astrojs/sitemap";

// NeuroDock documentation site.
// Tech stack and visual language pinned by plan.md §2 and §4.
// Body: Atkinson Hyperlegible. Headings: Lexend. Code: JetBrains Mono.
// Two colour modes only: calm light, dim dark. No animation by default.
// Single neutral accent hue. Line-height >= 1.65. No gradients.
export default defineConfig({
  site: "https://docs.neurodock.org",
  integrations: [
    sitemap(),
    starlight({
      title: "NeuroDock",
      description:
        "Open-source, MCP-native, vendor-neutral, local-first cognitive substrate for neurodivergent professionals.",
      logo: {
        // Single neutral hue. No gradients. Logomark to be added by design-system-keeper.
        src: "./src/assets/logo-placeholder.svg",
        replacesTitle: false,
      },
      favicon: "/favicon.svg",
      social: {
        github: "https://github.com/tlennon-ie/neurodock",
      },
      editLink: {
        baseUrl:
          "https://github.com/tlennon-ie/neurodock/edit/main/docs/",
      },
      customCss: [
        "./src/styles/tokens.css",
        "./src/styles/overrides.css",
      ],
      lastUpdated: true,
      pagination: true,
      tableOfContents: {
        minHeadingLevel: 2,
        maxHeadingLevel: 3,
      },
      // Sidebar order: Getting started, Concepts, Reference, Decisions, Contribute, Ethics.
      sidebar: [
        {
          label: "Manifesto",
          link: "/manifesto/",
        },
        {
          label: "Getting started",
          items: [
            { label: "Installation", link: "/getting-started/installation/" },
            { label: "Your first skill", link: "/getting-started/first-skill/" },
            { label: "Profile", link: "/getting-started/profile/" },
          ],
        },
        {
          label: "Concepts",
          items: [
            { label: "Substrate", link: "/concepts/substrate/" },
            { label: "Skills", link: "/concepts/skills/" },
            { label: "Profiles", link: "/concepts/profiles/" },
            { label: "Guardrails", link: "/concepts/guardrails/" },
            { label: "Plugins", link: "/concepts/plugins/" },
          ],
        },
        {
          label: "Reference",
          items: [
            {
              label: "MCP servers",
              items: [
                {
                  label: "mcp-chronometric",
                  link: "/reference/mcp-servers/chronometric/",
                },
                {
                  label: "mcp-cognitive-graph",
                  link: "/reference/mcp-servers/cognitive-graph/",
                },
                {
                  label: "mcp-task-fractionator",
                  link: "/reference/mcp-servers/task-fractionator/",
                },
              ],
            },
            {
              label: "Skills",
              items: [
                {
                  label: "adhd-daily-planner",
                  link: "/reference/skills/adhd-daily-planner/",
                },
                {
                  label: "audhd-context-recovery",
                  link: "/reference/skills/audhd-context-recovery/",
                },
                {
                  label: "ocd-decision-finalizer",
                  link: "/reference/skills/ocd-decision-finalizer/",
                },
                {
                  label: "hyperfocus-formatter",
                  link: "/reference/skills/hyperfocus-formatter/",
                },
                {
                  label: "visual-organizer",
                  link: "/reference/skills/visual-organizer/",
                },
              ],
            },
            { label: "Profile schema", link: "/reference/profile-schema/" },
            { label: "Plugin manifest", link: "/reference/plugin-manifest/" },
            { label: "CLI", link: "/reference/cli/" },
          ],
        },
        {
          label: "Decisions (ADRs)",
          items: [
            { label: "Index", link: "/decisions/" },
            {
              label: "0001 — Chronometric tool design",
              link: "/decisions/0001-chronometric/",
            },
            {
              label: "0002 — Cognitive graph tool design",
              link: "/decisions/0002-cognitive-graph/",
            },
            {
              label: "0003 — Task fractionator tool design",
              link: "/decisions/0003-task-fractionator/",
            },
            {
              label: "0004 — Profile schema design",
              link: "/decisions/0004-profile/",
            },
          ],
        },
        {
          label: "Contribute",
          items: [
            { label: "Overview", link: "/contribute/overview/" },
            { label: "Write a skill", link: "/contribute/write-a-skill/" },
            { label: "Write a plugin", link: "/contribute/write-a-plugin/" },
            {
              label: "Plugin types",
              items: [
                { label: "skill", link: "/contribute/plugin-types/skill/" },
                { label: "mcp-server", link: "/contribute/plugin-types/mcp-server/" },
                { label: "profile", link: "/contribute/plugin-types/profile/" },
                { label: "translation-pack", link: "/contribute/plugin-types/translation-pack/" },
                { label: "language-pack", link: "/contribute/plugin-types/language-pack/" },
                { label: "theme", link: "/contribute/plugin-types/theme/" },
              ],
            },
            {
              label: "Contribute an eval example",
              link: "/contribute/contribute-eval-example/",
            },
            { label: "Governance", link: "/contribute/governance/" },
          ],
        },
        { label: "Ethics", link: "/ethics/" },
      ],
      // Honour prefers-reduced-motion at the platform level.
      // Starlight ships minimal animation; overrides.css strips remaining transitions.
      components: {},
    }),
  ],
});
