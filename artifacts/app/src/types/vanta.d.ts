type VantaEffect = (options: Record<string, unknown>) => { destroy: () => void; resize?: () => void };
declare module "vanta/dist/vanta.net.min.js" { const effect: VantaEffect; export default effect; }
declare module "vanta/dist/vanta.globe.min.js" { const effect: VantaEffect; export default effect; }
declare module "vanta/dist/vanta.halo.min.js" { const effect: VantaEffect; export default effect; }
declare module "vanta/dist/vanta.cells.min.js" { const effect: VantaEffect; export default effect; }
declare module "vanta/dist/vanta.rings.min.js" { const effect: VantaEffect; export default effect; }
declare module "vanta/dist/vanta.topology.min.js" { const effect: VantaEffect; export default effect; }
