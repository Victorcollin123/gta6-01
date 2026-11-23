// Port Velo — keyboard + mouse input. Keys are read as a held set each frame;
// edge-triggered actions (enter, punch, shoot, pause, confirm, mute, save,
// restart, continue) are queued and taken once by the loop.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_SHOOT = 16;
export const ACTION_MUTE = 32;
export const ACTION_SAVE = 64;
export const ACTION_RESTART = 128;
export const ACTION_CONTINUE = 256;

export function createInput(canvas) {
  const held = new Set();
  let queued = 0;
  let mouse = { x: 0, y: 0, down: false };

  function key(e) {
    return e.key.length === 1 ? e.key.toLowerCase() : e.key;
  }

  function onKeyDown(e) {
    const k = key(e);
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    if (e.repeat) return;
    held.add(k);
    if (k === 'Enter' || k === ' ') queued |= ACTION_CONFIRM;
    if (k === 'p' || k === 'Escape') queued |= ACTION_PAUSE;
    if (k === 'e') queued |= ACTION_ENTER;
    if (k === 'f') queued |= ACTION_SHOOT;
    if (k === 'm') queued |= ACTION_MUTE;
    if (k === 's') queued |= ACTION_SAVE;
    if (k === 'r') queued |= ACTION_RESTART;
    if (k === 'c') queued |= ACTION_CONTINUE;
  }

  function onKeyUp(e) {
    held.delete(key(e));
  }

  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  }

  function onMouseDown(e) {
    onMouseMove(e);
    mouse.down = true;
    if (e.button === 0) queued |= ACTION_SHOOT;
  }

  function onMouseUp() {
    mouse.down = false;
  }

  function onClick() {
    queued |= ACTION_CONFIRM;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('click', onClick);

  function direction() {
    return {
      up: held.has('w') || held.has('ArrowUp'),
      down: held.has('s') || held.has('ArrowDown'),
      left: held.has('a') || held.has('ArrowLeft'),
      right: held.has('d') || held.has('ArrowRight'),
      run: held.has('Shift'),
      enter: false,
      punch: false,
      shoot: false,
    };
  }

  // The per-frame input object the world steps on. Edge actions are taken
  // here and cleared, so holding E does not re-enter every frame.
  function read(actions) {
    const d = direction();
    d.enter = Boolean(actions & ACTION_ENTER);
    d.punch = Boolean(actions & ACTION_PUNCH) || held.has(' ');
    d.shoot = Boolean(actions & ACTION_SHOOT) || mouse.down;
    d.mouse = { ...mouse };
    return d;
  }

  function takeActions() {
    const a = queued;
    queued = 0;
    // Space is both confirm (on menus) and punch (in play); the loop decides
    // by screen, so punch is also queued here when Space was pressed.
    if (a & ACTION_CONFIRM) queued |= 0;
    return a;
  }

  function spacePunch() {
    return held.has(' ');
  }

  return { direction, read, takeActions, spacePunch, get mouse() { return mouse; } };
}
