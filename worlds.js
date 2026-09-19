/* World registry.
 * Each world = 360° sky dome + ground texture + fog/light mood + procedural scenery + portals to neighbours.
 * Portals are placed on the compass edge of the world; walk into one to travel.
 *
 * Map (all connected in a loop + cross-links):
 *
 *          meadow ───── craterlake
 *            │              │
 *        mistwood ─────  alpinelake
 *            │              │
 *        mossgrove ───── fernbrook
 */
window.WORLDS = {
  mossgrove: {
    name: 'Moss Grove',
    tagline: 'Hall of Mosses — the ancient maples',
    sky: 'assets/sky/mossgrove.jpg', skyRotation: 90,
    ground: 'assets/tex/moss.jpg', groundRepeat: 40,
    path: 'assets/tex/leaflitter.jpg',
    fog: { color: '#6f8a4a', density: 0.014 },
    ambient: '#9fb37a', sun: { color: '#e8f0c8', intensity: 0.7, pos: '2 8 -3' },
    hemi: { sky: '#bcd39a', ground: '#2a3a14' },
    scenery: { trees: 70, treeKind: 'maple', ferns: 260, rocks: 40, logs: 6, fireflies: 0, particles: 'spores' },
    portals: { N: 'mistwood', E: 'fernbrook' },
    guideLine: 'These maples have worn their moss for three hundred years. Walk softly.'
  },
  fernbrook: {
    name: 'Fern Brook',
    tagline: 'Where the creek cuts through the ferns',
    sky: 'assets/sky/fernbrook.jpg', skyRotation: 90,
    ground: 'assets/tex/moss.jpg', groundRepeat: 40,
    path: 'assets/tex/rock.jpg',
    fog: { color: '#2b3a2a', density: 0.018 },
    ambient: '#5b7a5a', sun: { color: '#c9dcc0', intensity: 0.45, pos: '-2 8 -2' },
    hemi: { sky: '#7a9a70', ground: '#141c10' },
    scenery: { trees: 80, treeKind: 'fir', ferns: 420, rocks: 90, logs: 10, fireflies: 0, particles: 'mist', water: 'creek' },
    portals: { W: 'mossgrove', N: 'alpinelake' },
    guideLine: 'Follow the water. Everything in this forest eventually does.'
  },
  mistwood: {
    name: 'Mistwood',
    tagline: 'Old growth, fog, and light',
    sky: 'assets/sky/mistwood.jpg', skyRotation: 90,
    ground: 'assets/tex/moss.jpg', groundRepeat: 36,
    path: 'assets/tex/leaflitter.jpg',
    fog: { color: '#7d9a98', density: 0.024 },
    ambient: '#8fb0ae', sun: { color: '#e6f4f2', intensity: 0.9, pos: '4 10 -6' },
    hemi: { sky: '#aac9c6', ground: '#233026' },
    scenery: { trees: 110, treeKind: 'fir', ferns: 200, rocks: 50, logs: 8, fireflies: 0, particles: 'mist', godrays: true },
    portals: { S: 'mossgrove', N: 'meadow', E: 'alpinelake' },
    guideLine: 'The fog is not hiding anything. It is showing you how far the light can reach.'
  },
  alpinelake: {
    name: 'Alpine Lake',
    tagline: 'Sunset mirror under the mountain',
    sky: 'assets/sky/alpinelake.jpg', skyRotation: 90,
    ground: 'assets/tex/rock.jpg', groundRepeat: 30,
    path: 'assets/tex/rock.jpg',
    fog: { color: '#5a4a6a', density: 0.012 },
    ambient: '#7a6a8a', sun: { color: '#ffb088', intensity: 0.8, pos: '-8 3 -20' },
    hemi: { sky: '#c98aa0', ground: '#1a1420' },
    scenery: { trees: 50, treeKind: 'fir', ferns: 60, rocks: 70, logs: 4, fireflies: 30, particles: 'none', water: 'lake' },
    portals: { S: 'fernbrook', W: 'mistwood', N: 'craterlake' },
    guideLine: 'Stand very still and the lake forgets which way is up.'
  },
  meadow: {
    name: 'Wildflower Meadow',
    tagline: 'Lupine and paintbrush under the peaks',
    sky: 'assets/sky/meadow.jpg', skyRotation: 90,
    ground: 'assets/tex/grass.jpg', groundRepeat: 40,
    path: 'assets/tex/rock.jpg',
    fog: { color: '#9fc0e0', density: 0.006 },
    ambient: '#b0c8e0', sun: { color: '#fff4dc', intensity: 1.2, pos: '6 12 4' },
    hemi: { sky: '#8fbfff', ground: '#3a5a1a' },
    scenery: { trees: 35, treeKind: 'fir', ferns: 0, grass: 500, flowers: 220, rocks: 30, logs: 0, fireflies: 0, particles: 'pollen' },
    portals: { S: 'mistwood', E: 'craterlake' },
    guideLine: 'Every flower here is a single afternoon of summer, stored for later.'
  },
  craterlake: {
    name: 'Crater Rim',
    tagline: 'The deepest blue in the world',
    sky: 'assets/sky/craterlake.jpg', skyRotation: 90,
    ground: 'assets/tex/rock.jpg', groundRepeat: 32,
    path: 'assets/tex/rock.jpg',
    fog: { color: '#a8b8c8', density: 0.004 },
    ambient: '#b8c4d0', sun: { color: '#ffffff', intensity: 1.3, pos: '3 14 2' },
    hemi: { sky: '#a0c8ff', ground: '#4a4034' },
    scenery: { trees: 40, treeKind: 'fir', ferns: 0, grass: 80, rocks: 120, logs: 3, fireflies: 0, particles: 'none' },
    portals: { W: 'meadow', S: 'alpinelake' },
    guideLine: 'A mountain fell in on itself here and filled with sky. That is the whole story.'
  }
};

// Compass edge → position/rotation for a portal ring, and where you arrive when coming *from* that side.
window.PORTAL_EDGES = {
  N: { pos: [0, 0, -34], rot: 0,   arrive: [0, 0, -30] },
  S: { pos: [0, 0, 34],  rot: 180, arrive: [0, 0, 30] },
  E: { pos: [34, 0, 0],  rot: -90, arrive: [30, 0, 0] },
  W: { pos: [-34, 0, 0], rot: 90,  arrive: [-30, 0, 0] }
};
window.OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };
