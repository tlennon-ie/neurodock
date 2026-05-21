import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import sitemap from "@astrojs/sitemap";
import mermaid from "astro-mermaid";

// NeuroDock documentation site.
// Tech stack and visual language pinned by plan.md §2 and §4.
// Body: Atkinson Hyperlegible. Headings: Lexend. Code: JetBrains Mono.
// Two colour modes only: calm light, dim dark. No animation by default.
// Single neutral accent hue. Line-height >= 1.65. No gradients.
export default defineConfig({
  site: "https://docs.neurodock.org",
  integrations: [
    sitemap(),
    // Render ```mermaid code blocks as SVG diagrams. Client-side render
    // (no Playwright dependency) using mermaid.js loaded from a CDN.
    // Reduced motion respected via mermaid's `theme: 'base'` defaults.
    mermaid({
      theme: "neutral",
      autoTheme: true,
    }),
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
      // OpenGraph + Twitter social card. SVG is intentional: GitHub's
      // social-card preview server and most messaging clients accept it,
      // and we avoid shipping a rasterised duplicate that drifts from
      // the visual tokens in src/styles/tokens.css. See docs/public/og-image.svg.
      head: [
        {
          tag: "meta",
          attrs: { property: "og:image", content: "/og-image.svg" },
        },
        {
          tag: "meta",
          attrs: { property: "og:image:width", content: "1200" },
        },
        {
          tag: "meta",
          attrs: { property: "og:image:height", content: "630" },
        },
        {
          tag: "meta",
          attrs: { name: "twitter:card", content: "summary_large_image" },
        },
        {
          tag: "meta",
          attrs: { name: "twitter:image", content: "/og-image.svg" },
        },
      ],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/tlennon-ie/neurodock",
        },
      ],
      editLink: {
        baseUrl: "https://github.com/tlennon-ie/neurodock/edit/main/docs/",
      },
      customCss: ["./src/styles/tokens.css", "./src/styles/overrides.css"],
      lastUpdated: true,
      pagination: true,
      tableOfContents: {
        minHeadingLevel: 2,
        maxHeadingLevel: 3,
      },
      // Sidebar order: Manifesto, Getting started, Concepts, Reference, Decisions, Contribute, Ethics, FAQ.
      sidebar: [
        {
          label: "Manifesto",
          link: "/manifesto/",
        },
        {
          label: "Getting started",
          items: [
            {
              label: "I'm tired. Just tell me what to do.",
              link: "/getting-started/im-tired/",
            },
            { label: "Installation", link: "/getting-started/installation/" },
            {
              label: "Your first skill",
              link: "/getting-started/first-skill/",
            },
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
                {
                  label: "mcp-translation",
                  link: "/reference/mcp-servers/translation/",
                },
                {
                  label: "mcp-guardrail",
                  link: "/reference/mcp-servers/guardrail/",
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
                  label: "asd-meeting-translator",
                  link: "/reference/skills/asd-meeting-translator/",
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
            { label: "Bundled plugins", link: "/reference/plugins/" },
            { label: "Bundled profile presets", link: "/reference/profiles/" },
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
            {
              label: "0005 — Translation tool design",
              link: "/decisions/0005-translation/",
            },
            {
              label: "0006 — Guardrail tool design",
              link: "/decisions/0006-guardrail/",
            },
            {
              label: "0007 — Plugin protocol design",
              link: "/decisions/0007-plugin-protocol/",
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
                {
                  label: "mcp-server",
                  link: "/contribute/plugin-types/mcp-server/",
                },
                { label: "profile", link: "/contribute/plugin-types/profile/" },
                {
                  label: "translation-pack",
                  link: "/contribute/plugin-types/translation-pack/",
                },
                {
                  label: "language-pack",
                  link: "/contribute/plugin-types/language-pack/",
                },
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
        { label: "FAQ", link: "/faq/" },
      ],
      // Honour prefers-reduced-motion at the platform level.
      // Starlight ships minimal animation; overrides.css strips remaining transitions.
      components: {},
    }),
  ],
});
