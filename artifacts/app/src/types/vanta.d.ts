/**
 * @fileOverview Web support role: configures or validates the Vanta.D part of the Vite/React application.
 * System connection: participates in browser development, build, quality checks, or deployment.
 */
type VantaEffect = (options: Record<string, unknown>) => { destroy: () => void; resize?: () => void };
declare module "vanta/dist/vanta.net.min.js" { const effect: VantaEffect; export default effect; }
declare module "vanta/dist/vanta.globe.min.js" { const effect: VantaEffect; export default effect; }
declare module "vanta/dist/vanta.halo.min.js" { const effect: VantaEffect; export default effect; }
declare module "vanta/dist/vanta.cells.min.js" { const effect: VantaEffect; export default effect; }
declare module "vanta/dist/vanta.rings.min.js" { const effect: VantaEffect; export default effect; }
declare module "vanta/dist/vanta.topology.min.js" { const effect: VantaEffect; export default effect; }
