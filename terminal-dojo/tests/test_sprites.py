import math
import unittest
from unittest.mock import patch

import dojo
from combat import Fighter, Match
from sprites import DOT_BITS, fighter_cells, origin


class Screen:
    """Character grid for inspecting the exact glyphs submitted to curses."""
    def __init__(self, rows=24, cols=80):
        self.rows, self.cols = rows, cols
        self.erase()

    def erase(self):
        self.cells = {}

    def getmaxyx(self):
        return self.rows, self.cols

    def addnstr(self, row, col, text, length, style=0):
        for i, char in enumerate(text[:length]):
            self.cells[row, col+i] = char

    def refresh(self):
        pass

    def text(self):
        return "\n".join("".join(self.cells.get((r,c), " ") for c in range(self.cols))
                         for r in range(self.rows))


class SpriteTests(unittest.TestCase):
    def test_unicode_dot_mapping(self):
        self.assertEqual(chr(0x2800 | DOT_BITS[0][0]), "⠁")
        self.assertEqual(chr(0x2800 | DOT_BITS[1][3]), "⢀")
        self.assertEqual(sum(sum(column) for column in DOT_BITS), 255)

    def test_half_cell_move_changes_glyph_without_waiting_for_next_column(self):
        a, b = Fighter(30), Fighter(30 + 0.5*72/71)
        self.assertEqual(origin(b,76)[0] - origin(a,76)[0], 1)
        self.assertNotEqual(fighter_cells(a,76,2,1,1), fighter_cells(b,76,2,1,1))

    def test_wall_jump_attack_poses_stay_inside_arena(self):
        for width in (60,76,94):
            for x in (3,25,69):
                for jump in (0,0.36,0.72):
                    for phase,timer in (("ready",0),("windup",.3),("recover",.8)):
                        f = Fighter(x, jump=jump, phase=phase, timer=timer)
                        for row,col in fighter_cells(f,width,2,1,1):
                            self.assertTrue(2 < col < 2+width-1)
                            self.assertTrue(6 < row < 16)

    def test_walk_position_changes_double_at_80_columns(self):
        xs = [25+22*i/60 for i in range(61)]
        old = [round(x/72*71) for x in xs]
        new = [origin(Fighter(x),76)[0] for x in xs]
        changes = lambda values: sum(a!=b for a,b in zip(values,values[1:]))
        self.assertEqual(changes(old), 21)
        self.assertEqual(changes(new), 44)

    def test_jump_has_more_distinct_vertical_positions(self):
        remaining = [max(0,0.72-i/60) for i in range(45)]
        old = [round(4*math.sin(math.pi*t/0.72)) for t in remaining]
        new = [origin(Fighter(25,jump=t),76)[1] for t in remaining]
        self.assertEqual(len(set(old)), 5)
        self.assertEqual(len(set(new)), 17)

    def test_both_views_render_without_mutating_combat(self):
        match = Match(seed=7)
        before = (vars(match.player).copy(), vars(match.cpu).copy(), match.remaining)
        with patch("dojo.curses.color_pair", return_value=0):
            for cols, rows in ((64,22),(80,24),(120,40),(8,3)):
                for subcells in (False,True):
                    screen = Screen(rows,cols)
                    dojo.draw(screen,match,"fight",subcells)
                    self.assertTrue(all(0<=r<rows and 0<=c<cols for r,c in screen.cells))
                    if cols>=64:
                        has_dots = any(0x2800 <= ord(ch) <= 0x28ff for ch in screen.cells.values())
                        self.assertEqual(has_dots,subcells)
        self.assertEqual(before,(vars(match.player),vars(match.cpu),match.remaining))
