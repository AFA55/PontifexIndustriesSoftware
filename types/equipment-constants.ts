/**
 * Equipment Constants
 *
 * Shared equipment lists used by the Schedule Board edit modal,
 * Job Board edit modal, and dispatch scheduling.
 */

export const CORE_DRILLING_EQUIPMENT = {
  drills: ['Hilti DD250CA', 'Hilti DD500CA', 'Hilti DD160'],
  bitSizes: ['1/2" Bit', '3/4" Bit', '1" Bit', '1-1/4" Bit', '1-1/2" Bit', '2" Bit', '2-1/2" Bit', '3" Bit', '4" Bit', '5" Bit', '6" Bit', '8" Bit', '10" Bit', '12" Bit'],
  ladders: ['6ft Ladder', '8ft Ladder', '10ft Ladder', '12ft Ladder'],
  lifts: ['Scissor Lift'],
  accessories: ['Plastic', 'Vacuum Base', 'Drill Extensions', 'Tape', 'Sticky Spray'],
  cords: ['50ft Extension Cord', '100ft Extension Cord', '150ft Extension Cord'],
  vacuums: ['Hilti Vacuum', 'Regular Vacuum'],
  power: ['Portable Generator'],
};

export const WALL_SAWING_EQUIPMENT = {
  saws: ['Pentruder Wall Saw'],
  hydraulics: ['100ft 480 Cord', '200ft 480 Cord', '250ft 480 Hose'],
  barsAndChains: ['10\' Bar and Chain', '15\' Bar and Chain', '24" Bar and Chain'],
  accessories: ['Slurry Drums', 'Plastic'],
};

export const SLAB_SAWING_EQUIPMENT = {
  blades: ['20" Blade', '26" Blade', '30" Blade', '36" Blade', '42" Blade', '54" Blade'],
  guards: ['20" Guard', '26" Guard', '30" Guard', '36" Guard', '42" Guard', '54" Guard'],
  saws: ['5000 Slab Saw', '7000 Slab Saw', 'Electric Slab Saw'],
  hydraulics: ['100ft 480 Cord', '200ft 480 Cord'],
  accessories: ['Slurry Drums', 'Plastic'],
};

export const HAND_SAWING_EQUIPMENT = {
  saws: ['20" Handsaw', '24" Handsaw', '30" Handsaw'],
  blades: ['20" Blade', '24" Blade', '30" Blade'],
  accessories: ['Plastic Sheeting', 'Water Bucket'],
  powerUnits: ['5hp Power Unit', '13hp Power Unit', '20hp Power Unit'],
  hydraulics: ['Hydraulic Hose (50ft)', 'Hydraulic Hose (100ft)', 'Hydraulic Hose (150ft)', 'Hydraulic Hose (200ft)'],
};

export const commonEquipment = [
  ...CORE_DRILLING_EQUIPMENT.drills,
  ...CORE_DRILLING_EQUIPMENT.bitSizes,
  ...CORE_DRILLING_EQUIPMENT.ladders,
  ...CORE_DRILLING_EQUIPMENT.lifts,
  ...CORE_DRILLING_EQUIPMENT.accessories,
  ...CORE_DRILLING_EQUIPMENT.cords,
  ...CORE_DRILLING_EQUIPMENT.vacuums,
  ...CORE_DRILLING_EQUIPMENT.power,
  ...WALL_SAWING_EQUIPMENT.saws,
  ...WALL_SAWING_EQUIPMENT.hydraulics,
  ...WALL_SAWING_EQUIPMENT.barsAndChains,
  ...WALL_SAWING_EQUIPMENT.accessories,
  ...SLAB_SAWING_EQUIPMENT.blades,
  ...SLAB_SAWING_EQUIPMENT.guards,
  ...SLAB_SAWING_EQUIPMENT.saws,
  ...SLAB_SAWING_EQUIPMENT.hydraulics,
  ...SLAB_SAWING_EQUIPMENT.accessories,
  ...HAND_SAWING_EQUIPMENT.saws,
  ...HAND_SAWING_EQUIPMENT.blades,
  ...HAND_SAWING_EQUIPMENT.accessories,
  ...HAND_SAWING_EQUIPMENT.powerUnits,
  ...HAND_SAWING_EQUIPMENT.hydraulics,
  'Wall Saw', 'Slab Saw', 'Hand Saw', 'Diamond Blades', 'Water Hose (250\')', 'Water Tank', 'Safety Gear',
];
