# Draft handover

The rewrite makes beautification an agent-led design task. The existing helper
provides a useful preset, reliable conversion and desktop export, but cannot
judge reading order or fix a weak composition by itself. The draft asks agents
to identify problems in the rendered diagram, make purposeful changes, and
inspect the final editable result again. It avoids a mandatory palette or a
fixed sequence of cosmetic adjustments.

The key scope distinction is provenance and user intent. A newly generated
diagram requested to be beautified permits layout improvements as part of that
request. An existing manually arranged Draw.io file retains geometry by default;
redesign authorization expands that scope. Explicit styling-only or faithful
requests remain restrictive. Content, semantic groups, shapes, connectivity and
meaningful color distinctions remain protected in every case. Visual grouping
must not quietly invent hierarchy.

Everything prescribed is executable now through the current helper plus normal
file/XML tools. Agent-guided composition does not need a new CLI. The helper's
beautify mode changes rendering defaults and then XML styles; render-only only
exports. Automatic existing-file styling and layout assistance are still proposed
capabilities, not prerequisites or advertised features. The draft also records
the ELK spacing limitation, limited scope of the helper's structural check, and
the need for final Draw.io desktop previews after manual edits.

Before activation, review the draft and exercise representative new-diagram and
fixed-geometry requests, ideally including meaningful source colors and a
manually edited file. Multi-page/compressed files need particular care because
the helper has no page-selection or decoding/editing workflow. No helper fixes
are bundled with this rewrite. Activation and any metadata alignment are a
separate step: the installed junction points at this folder, so replacing
SKILL.md would take effect immediately. Both files remain drafts.
