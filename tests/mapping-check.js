'use strict';

const NUM_COLS = 32;
const NUM_ROWS = 8;
const NUM_PIXELS = NUM_COLS * NUM_ROWS;
const PANEL_SERPENTINE = true;
const PANEL_COLUMN_MAJOR = true;
const PANEL_ROTATION = 0;

function xyToHardwareIndex(x, y){
  if(x < 0 || x >= NUM_COLS || y < 0 || y >= NUM_ROWS) return -1;
  let tx = x;
  let ty = y;
  if(PANEL_ROTATION === 2){
    tx = NUM_COLS - 1 - x;
    ty = NUM_ROWS - 1 - y;
  }
  if(PANEL_COLUMN_MAJOR){
    let column = tx;
    let row = ty;
    if(PANEL_SERPENTINE && (column % 2 === 1)) row = NUM_ROWS - 1 - row;
    return column * NUM_ROWS + row;
  }
  let row = ty;
  let column = tx;
  if(PANEL_SERPENTINE && (row % 2 === 1)) column = NUM_COLS - 1 - column;
  return row * NUM_COLS + column;
}

function buildMaps(){
  const gridToHardware = new Array(NUM_PIXELS).fill(-1);
  const hardwareToGrid = new Array(NUM_PIXELS).fill(-1);
  for(let y = 0; y < NUM_ROWS; y++){
    for(let x = 0; x < NUM_COLS; x++){
      const gridIndex = y * NUM_COLS + x;
      const hardwareIndex = xyToHardwareIndex(x, y);
      gridToHardware[gridIndex] = hardwareIndex;
      hardwareToGrid[hardwareIndex] = gridIndex;
    }
  }
  return { gridToHardware, hardwareToGrid };
}

(function main(){
  const { gridToHardware, hardwareToGrid } = buildMaps();
  if(gridToHardware.some(index => index < 0)){
    throw new Error('Unmapped grid pixel detected.');
  }
  if(hardwareToGrid.some(index => index < 0)){
    throw new Error('Unmapped hardware pixel detected.');
  }
  const testPayload = [];
  for(let i = 0; i < NUM_PIXELS; i++){
    testPayload.push(i.toString(16).padStart(6, '0'));
  }
  const hardwareString = testPayload.join('').toUpperCase();
  const reconPayload = new Array(NUM_PIXELS).fill('');
  for(let ledIndex = 0; ledIndex < NUM_PIXELS; ledIndex++){
    const colour = hardwareString.slice(ledIndex * 6, ledIndex * 6 + 6);
    const gridIndex = hardwareToGrid[ledIndex];
    reconPayload[gridIndex] = colour;
  }
  const roundTrip = reconPayload.join('');
  if(roundTrip.length !== hardwareString.length){
    throw new Error('Round trip mismatch length.');
  }
  const reencoded = new Array(NUM_PIXELS).fill('').map((_, gridIndex) => {
    const hardwareIndex = gridToHardware[gridIndex];
    return roundTrip.slice(gridIndex * 6, gridIndex * 6 + 6);
  }).join('');
  if(reencoded !== roundTrip){
    throw new Error('Mapping is not bijective.');
  }
  console.log('Mapping check passed for 32x8 panel.');
})();
