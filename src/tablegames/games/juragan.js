import { JuraganHost } from '../juragan/host.js';
import { JuraganRenderer } from '../juragan/renderer.js';
import { JuraganControls } from '../juragan/phone.js';

// Juragan: game jual-beli tanah 2–4 pemain di meja persegi besar (mekanik klasik, tema orisinal Indonesia).
export default {
  id: 'juragan',
  name: 'Juragan',
  icon: 'juragan',
  art: 'linear-gradient(135deg, #c92a2a, #f08c1a)',
  min: 2,
  max: 4,
  venue: 'square',
  seatOrder: (n) => (n === 2 ? [0, 2] : [0, 1, 2, 3]), // berdua: duduk berhadapan
  topView: true,
  cam: { dist: 1.9, el: 1.2, topH: 1.5 },
  camTargetY: 0.05,
  headPitch: -0.62,
  Host: JuraganHost,
  Renderer: JuraganRenderer,
  Controls: JuraganControls,
};
