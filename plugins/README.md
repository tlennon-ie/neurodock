# plugins/

Third-party plugins live here. Each plugin is a self-contained directory with a `plugin.yaml` manifest declaring its name, type (`skill | mcp-server | profile | translation-pack | language-pack`), version, neurotype tags, and trust level.

The substrate auto-discovers plugins matching the user's profile at install time.

Authoring a new plugin requires zero core changes — fork, add a directory, PR.

See `plan.md` Section 5 for the plugin protocol.
