export const ARCH_FORMAT_GUIDE = `# Format des documents Archi Editor (.arch.md)

Un document \`.arch.md\` est du Markdown dans lequel s'insèrent des diagrammes décrits en YAML
dans des blocs de code \`arch-box\` (composants connectés) et \`arch-seq\` (séquence).
Avec les outils MCP, on fournit les diagrammes sous forme d'objets JSON ; le serveur les
normalise, calcule la mise en page et écrit le YAML.

## Diagramme de composants (arch-box)

\`\`\`json
{
  "title": "Vue composants",
  "nodes": [
    { "id": "vpc", "componentRef": "aws-vpc", "label": "VPC Production" },
    { "id": "api", "componentRef": "microservice", "label": "Order API", "parentId": "vpc",
      "subtitle": "Node.js 20", "props": { "port": "8080" } },
    { "id": "db", "componentRef": "postgresql", "label": "Orders DB", "parentId": "vpc" }
  ],
  "edges": [
    { "source": "api", "target": "db", "label": "Read / Write", "protocol": "TCP/5432" }
  ]
}
\`\`\`

- \`componentRef\` : identifiant d'un composant du catalogue (outil \`arch_list_components\`).
- \`parentId\` : place le nœud dans un conteneur (composant \`isContainer\` : aws-vpc, aws-subnet,
  azure-rg, azure-vnet, zone-group…). Les conteneurs peuvent être imbriqués.
- \`props\` : paires clé/valeur courtes (chaînes), 4 maximum affichées.
- Liens : \`style\` = solid | dashed | dotted, \`bidirectional\`, \`animated\` (booléens).
  Convention : dashed + animated pour l'asynchrone (événements, files).
- Positions : ne pas les fournir, la mise en page automatique (Dagre, direction LR ou TB) place
  les nœuds et dimensionne les conteneurs. Fournir \`position: {x, y}\` pour tous les nœuds
  désactive la mise en page automatique (sauf \`layout: "auto"\`).
- Les liens dont une extrémité est un conteneur sont rendus mais ignorés par la mise en page :
  préférer relier les composants internes.

## Diagramme de séquence (arch-seq)

\`\`\`json
{
  "title": "Validation de commande",
  "participants": [
    { "id": "web", "label": "Portail Web", "componentRef": "web-app" },
    { "id": "api", "label": "Order API", "componentRef": "microservice" }
  ],
  "items": [
    { "type": "message", "from": "web", "to": "api", "label": "POST /orders", "protocol": "HTTPS", "kind": "sync" },
    { "type": "block", "blockKind": "alt", "label": "Stock insuffisant" },
    { "type": "message", "from": "api", "to": "web", "label": "409 Conflict", "kind": "reply" },
    { "type": "note", "participantId": "api", "label": "Idempotence par clé de requête" }
  ]
}
\`\`\`

- \`kind\` : sync (flèche pleine), async (flèche ouverte), reply (retour pointillé), self.
- \`block\` : bandeau de section (alt | opt | loop | par) qui introduit les étapes suivantes ;
  il n'y a pas de bloc de fin, utiliser un nouveau bloc ou une note pour changer de section.
- Les étapes sont rendues dans l'ordre de la liste.

## Bonnes pratiques de rédaction

- Un document = un titre H1, une courte introduction, puis des sections H2 qui alternent texte
  explicatif et diagramme.
- Viser 5 à 15 nœuds par diagramme de composants ; découper au-delà (vue contexte, vue détaillée).
- Identifiants courts en kebab-case, libellés lisibles, protocoles explicites sur les liens.
- Toujours terminer par \`arch_validate_document\` et corriger les erreurs signalées.
- Composants métier récurrents : les déclarer dans \`arch-components.yaml\` à la racine du projet.
`;
