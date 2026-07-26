import path from "path"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  /**
   * TESTS UNITAIRES — Vitest, ajouté en Tranche 9.5.
   *
   * ═══ PÉRIMÈTRE VOLONTAIREMENT ÉTROIT ═══
   * On teste les fonctions PURES : calculs, mises en page, formatage, échappement. Pas de
   * rendu de composant, pas de DOM simulé, pas de requête interceptée. Ce n'est pas une
   * limite d'ambition mais un choix de rendement : la logique métier vit dans `backend/`
   * (462 tests) et les parcours se vérifient au navigateur. Ce qui reste ici est ce qu'aucun
   * des deux ne couvre — une fonction qui se trompe SILENCIEUSEMENT, sans planter ni
   * s'afficher de travers.
   *
   * Pas de `globals: true` : `describe`/`it`/`expect` sont importés explicitement. Un test
   * dont on voit d'où viennent les symboles se relit sans connaître la configuration.
   *
   * `environment: 'node'` : aucun de ces tests ne touche au DOM. Charger jsdom coûterait une
   * seconde par lancement pour rien. Le jour où un composant sera testé, il faudra jsdom ET
   * `@testing-library/react` — c'est une décision à prendre à ce moment-là, pas d'avance.
   */
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
})
