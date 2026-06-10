import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import sitemap from "@astrojs/sitemap";
import mermaid from "astro-mermaid";

// NeuroDock documentation site.
// Tech stack and visual language pinned by plan.md §2 and §4.
// Body: Atkinson Hyperlegible. Headings: Lexend. Code: JetBrains Mono.
// Two colour modes only: calm light, dim dark. No animation by default.
// Single neutral accent hue. Line-height >= 1.65. No gradients.
//
// Sidebar conventions (changes.md §1):
//   - `collapsed: true` on deep-technical groups so the sidebar opens calm.
//     Decisions (ADRs), the entire Reference tree, and Contribute > Plugin
//     types all default closed. Starlight reads this key directly.
//   - `badge:` tags every entry as either {text:'user'} (calm, default
//     variant) or {text:'developer', variant:'caution'} (deep-tech).
//     This makes the user vs. developer split visible at a glance without
//     reorganising the IA.
const userBadge = { text: "user", variant: "default" };
const devBadge = { text: "developer", variant: "caution" };

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
        "Local-first cognitive substrate for neurodivergent professionals. Memory, time, and a guardrail that refuses to amplify rumination. MCP-native. No telemetry.",
      logo: {
        src: "./src/assets/logo.png",
        replacesTitle: false,
      },
      favicon: "/icon/128.png",
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
          badge: userBadge,
        },
        {
          label: "Getting started",
          // Open by default — first-run journey.
          items: [
            {
              label: "I'm tired. Just tell me what to do.",
              link: "/getting-started/im-tired/",
              badge: userBadge,
            },
            {
              label: "Installation",
              link: "/getting-started/installation/",
              badge: userBadge,
            },
            {
              label: "Hosted server (remote MCP)",
              link: "/getting-started/remote/",
              badge: userBadge,
            },
            {
              label: "Your first skill",
              link: "/getting-started/first-skill/",
              badge: userBadge,
            },
            {
              label: "Profile",
              link: "/getting-started/profile/",
              badge: userBadge,
            },
          ],
        },
        {
          label: "Concepts",
          // Open by default — shallow conceptual overview.
          items: [
            {
              label: "Substrate",
              link: "/concepts/substrate/",
              badge: userBadge,
            },
            { label: "Skills", link: "/concepts/skills/", badge: userBadge },
            {
              label: "Profiles",
              link: "/concepts/profiles/",
              badge: userBadge,
            },
            {
              label: "Guardrails",
              link: "/concepts/guardrails/",
              badge: userBadge,
            },
            { label: "Plugins", link: "/concepts/plugins/", badge: userBadge },
          ],
        },
        {
          label: "Reference",
          // Deep-technical surface area — keep collapsed by default so the
          // sidebar reads calm. Users who need it expand it explicitly.
          collapsed: true,
          items: [
            {
              label: "MCP servers",
              collapsed: true,
              items: [
                {
                  label: "mcp-chronometric",
                  link: "/reference/mcp-servers/chronometric/",
                  badge: devBadge,
                },
                {
                  label: "mcp-cognitive-graph",
                  link: "/reference/mcp-servers/cognitive-graph/",
                  badge: devBadge,
                },
                {
                  label: "mcp-task-fractionator",
                  link: "/reference/mcp-servers/task-fractionator/",
                  badge: devBadge,
                },
                {
                  label: "mcp-translation",
                  link: "/reference/mcp-servers/translation/",
                  badge: devBadge,
                },
                {
                  label: "mcp-guardrail",
                  link: "/reference/mcp-servers/guardrail/",
                  badge: devBadge,
                },
              ],
            },
            {
              label: "Skills",
              collapsed: true,
              items: [
                {
                  label: "adhd-daily-planner",
                  link: "/reference/skills/adhd-daily-planner/",
                  badge: devBadge,
                },
                {
                  label: "asd-meeting-translator",
                  link: "/reference/skills/asd-meeting-translator/",
                  badge: devBadge,
                },
                {
                  label: "audhd-context-recovery",
                  link: "/reference/skills/audhd-context-recovery/",
                  badge: devBadge,
                },
                {
                  label: "ocd-decision-finalizer",
                  link: "/reference/skills/ocd-decision-finalizer/",
                  badge: devBadge,
                },
                {
                  label: "hyperfocus-formatter",
                  link: "/reference/skills/hyperfocus-formatter/",
                  badge: devBadge,
                },
                {
                  label: "visual-organizer",
                  link: "/reference/skills/visual-organizer/",
                  badge: devBadge,
                },
              ],
            },
            {
              label: "Profile schema",
              link: "/reference/profile-schema/",
              badge: devBadge,
            },
            {
              label: "Plugin manifest",
              link: "/reference/plugin-manifest/",
              badge: devBadge,
            },
            {
              label: "Bundled plugins",
              link: "/reference/plugins/",
              badge: devBadge,
            },
            {
              label: "Bundled profile presets",
              link: "/reference/profiles/",
              badge: devBadge,
            },
            { label: "CLI", link: "/reference/cli/", badge: devBadge },
          ],
        },
        {
          label: "Decisions (ADRs)",
          // ADRs are historical/technical context. Collapsed by default.
          collapsed: true,
          items: [
            { label: "Index", link: "/decisions/", badge: devBadge },
            {
              label: "0001 — Chronometric tool design",
              link: "/decisions/0001-chronometric/",
              badge: devBadge,
            },
            {
              label: "0002 — Cognitive graph tool design",
              link: "/decisions/0002-cognitive-graph/",
              badge: devBadge,
            },
            {
              label: "0003 — Task fractionator tool design",
              link: "/decisions/0003-task-fractionator/",
              badge: devBadge,
            },
            {
              label: "0004 — Profile schema design",
              link: "/decisions/0004-profile/",
              badge: devBadge,
            },
            {
              label: "0005 — Translation tool design",
              link: "/decisions/0005-translation/",
              badge: devBadge,
            },
            {
              label: "0006 — Guardrail tool design",
              link: "/decisions/0006-guardrail/",
              badge: devBadge,
            },
            {
              label: "0007 — Plugin protocol design",
              link: "/decisions/0007-plugin-protocol/",
              badge: devBadge,
            },
          ],
        },
        {
          label: "Contribute",
          items: [
            {
              label: "Overview",
              link: "/contribute/overview/",
              badge: devBadge,
            },
            {
              label: "Write a skill",
              link: "/contribute/write-a-skill/",
              badge: devBadge,
            },
            {
              label: "Write a plugin",
              link: "/contribute/write-a-plugin/",
              badge: devBadge,
            },
            {
              label: "Plugin types",
              // Reference-style enumeration of plugin kinds. Collapsed.
              collapsed: true,
              items: [
                {
                  label: "skill",
                  link: "/contribute/plugin-types/skill/",
                  badge: devBadge,
                },
                {
                  label: "mcp-server",
                  link: "/contribute/plugin-types/mcp-server/",
                  badge: devBadge,
                },
                {
                  label: "profile",
                  link: "/contribute/plugin-types/profile/",
                  badge: devBadge,
                },
                {
                  label: "translation-pack",
                  link: "/contribute/plugin-types/translation-pack/",
                  badge: devBadge,
                },
                {
                  label: "language-pack",
                  link: "/contribute/plugin-types/language-pack/",
                  badge: devBadge,
                },
                {
                  label: "theme",
                  link: "/contribute/plugin-types/theme/",
                  badge: devBadge,
                },
              ],
            },
            {
              label: "Contribute an eval example",
              link: "/contribute/contribute-eval-example/",
              badge: devBadge,
            },
            {
              label: "Governance",
              link: "/contribute/governance/",
              badge: devBadge,
            },
          ],
        },
        { label: "Ethics", link: "/ethics/", badge: userBadge },
        { label: "Privacy", link: "/legal/privacy/", badge: userBadge },
        { label: "FAQ", link: "/faq/", badge: userBadge },
      ],
      // Honour prefers-reduced-motion at the platform level.
      // Starlight ships minimal animation; overrides.css strips remaining transitions.
      //
      // SiteTitle override hosts the font-hinting dropdown that lets users
      // toggle between Atkinson Hyperlegible, Lexend (ADHD), and the
      // system default. See src/overrides/SiteTitle.astro.
      components: {
        SiteTitle: "./src/overrides/SiteTitle.astro",
      },
    }),
  ],
});
