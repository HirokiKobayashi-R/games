"""Original fighter silhouettes on Unicode Braille's 2 x 4 dot grid.

Only rendering is quantized here; combat positions and timers are untouched.
"""

import math

from combat import ARENA, JUMP_TIME, PLAYER_RECOVERY, CPU_RECOVERY, WHIFF_RECOVERY

# Unicode Braille dot numbers: left 1,2,3,7; right 4,5,6,8.
DOT_BITS = ((1, 2, 4, 64), (8, 16, 32, 128))


def origin(fighter, width):
    """Position relative to the arena: half columns and quarter rows."""
    return (round(fighter.x / ARENA * (width - 5) * 2),
            -round(16 * math.sin(math.pi * fighter.jump / JUMP_TIME)))


def fighter_pixels(fighter, facing, cpu=False):
    pixels = {(-1, 0), (0, 0), (1, 0), (-1, 1), (1, 1),
              (-1, 2), (0, 2), (1, 2), (0, 3)}

    def line(x0, y0, x1, y1):
        steps = max(abs(x1-x0), abs(y1-y0), 1)
        for i in range(steps+1):
            pixels.add((round(x0+(x1-x0)*i/steps), round(y0+(y1-y0)*i/steps)))

    # Torso, back arm, legs. Locomotion poses use distance, not frame count.
    line(0, 4, 0, 8)
    line(-1, 4, -2, 7)
    stride = round(math.sin(fighter.x * 1.4)) if fighter.step > 0 else 0
    line(0, 8, -2-stride, 11)
    line(0, 8, 2+stride, 11)
    if fighter.guard > 0:
        line(1, 4, 3, 5)
        line(3, 2, 3, 7)
    elif fighter.phase == "windup":
        # Pull the fist back visibly before the committed strike.
        line(1, 4, -2, 3)
        line(-2, 2, -2, 4)
    elif fighter.phase == "recover":
        duration = (WHIFF_RECOVERY if fighter.open else CPU_RECOVERY) if cpu else PLAYER_RECOVERY
        reach = round(2 + 4 * min(1, fighter.timer / duration))
        line(1, 4, reach, 4)
        line(reach, 3, reach, 5)
    else:
        line(1, 4, 2, 6)
        line(2, 6, 3, 5)
    return {(x*facing, y) for x, y in pixels}


def fighter_cells(fighter, width, left, top, facing, cpu=False):
    """Map the moving silhouette to actual one-column glyphs."""
    ox, oy = origin(fighter, width)
    ox += (left + 2) * 2
    oy += (top + 12) * 4
    cells = {}
    for x, y in fighter_pixels(fighter, facing, cpu):
        px, py = ox+x, oy+y
        col, dx = divmod(px, 2)
        row, dy = divmod(py, 4)
        # Keep reach, knockback and jumping inside the existing arena.
        if left < col < left+width-1 and top+5 < row < top+15:
            key = row, col
            cells[key] = cells.get(key, 0) | DOT_BITS[dx][dy]
    return cells
