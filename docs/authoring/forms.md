# Named forms

Named forms are editable data, and the `Forms` component provides explicit
selection for behavior scripts. Supplied `components`, `moves`, and `poses` maps
replace their base map, omitted maps inherit during composition, and `{}` is
explicitly empty. Component entries need full required settings. Form selection
updates active config data but does not install or remove component handles;
definitions equip those once and scripts decide which to use. Thresholds and pose
sequences do not execute by being present in JSON. For a working threshold and
transformation sequence, follow [Granny's behavior](../../src/content/fighters/granny/behavior.ts).

Related: [configuration](../../config/README.md), [behavior runtime](../architecture/behavior-runtime.md).
