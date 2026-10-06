import unittest

from combat import (Match, ARENA, BODY_GAP, REACH, PLAYER_WINDUP, CPU_WINDUP,
                    WHIFF_RECOVERY, PLAYER_RECOVERY)


class CombatTests(unittest.TestCase):
    def match(self, distance=5):
        match = Match(seed=7)
        match.player.x, match.cpu.x = 30, 30+distance
        match._cpu = lambda dt: None
        return match

    def test_tap_stops_and_repeat_does_not_stack_speed(self):
        m = self.match(30)
        m.command(m.player,"left")
        m.update(.7)
        self.assertAlmostEqual(m.player.x,30-22*.16)
        for _ in range(6):
            m.command(m.player,"right")
            m.update(.05)
        self.assertAlmostEqual(m.player.x,30-22*.16+22*.3)

    def test_walls_and_collision(self):
        for direction, xs in (("left",(3,6)),("right",(ARENA-6,ARENA-3))):
            m = self.match()
            m.player.x,m.cpu.x = xs
            for _ in range(50):
                m.command(m.player,direction)
                m.command(m.cpu,direction)
                m.update(.1)
            self.assertGreaterEqual(m.player.x,3)
            self.assertLessEqual(m.cpu.x,ARENA-3)
            self.assertGreaterEqual(m.cpu.x-m.player.x,BODY_GAP)

    def test_cpu_commits_to_windup_without_tracking_backstep(self):
        m = self.match()
        m.command(m.cpu,"attack")
        x = m.cpu.x
        m.update(.12)  # Human-sized reaction delay.
        m.command(m.player,"left")
        m.update(CPU_WINDUP-.12+.01)
        self.assertEqual(m.player.hp,100)
        self.assertEqual(m.cpu.x,x)
        self.assertTrue(m.cpu.open)
        self.assertEqual(m.cpu.phase,"recover")
        self.assertGreater(m.cpu.timer,.9)

    def test_empty_attack_has_real_recovery_cannot_cancel_or_repeat(self):
        m = self.match(20)
        m.command(m.player,"attack")
        m.update(PLAYER_WINDUP+.01)
        self.assertEqual(m.player.phase,"recover")
        timer = m.player.timer
        for action in ("left","right","jump","guard","attack"):
            m.command(m.player,action)
        self.assertEqual(m.player.timer,timer)
        self.assertEqual((m.player.step,m.player.jump,m.player.guard),(0,0,0))
        m.update(PLAYER_RECOVERY)
        self.assertEqual(m.player.phase,"ready")

    def test_cpu_whiff_opens_once_for_a_big_punish(self):
        m = self.match(9)
        m.command(m.cpu,"attack")
        m.update(CPU_WINDUP+.01)
        self.assertTrue(m.cpu.open)
        m.command(m.player,"right")
        m.update(.16)
        m.command(m.player,"attack")
        m.update(PLAYER_WINDUP+.01)
        self.assertEqual(m.cpu.hp,68)
        self.assertEqual(m.punishes,1)
        self.assertFalse(m.cpu.open)
        self.assertIn("PUNISH!",m.message)
        self.assertGreater(m.hitstop,0)
        self.assertTrue(m.impact[1])

    def test_open_window_expires(self):
        m = self.match(9)
        m.command(m.cpu,"attack")
        m.update(CPU_WINDUP+WHIFF_RECOVERY+.01)
        self.assertFalse(m.cpu.open)
        self.assertEqual(m.cpu.phase,"ready")

    def test_normal_hit_does_not_cancel_cpu_commitment(self):
        m = self.match()
        m.command(m.cpu,"attack")
        m.command(m.player,"attack")
        m.update(.14)
        self.assertEqual(m.cpu.hp,92)
        self.assertEqual(m.cpu.phase,"windup")
        self.assertFalse(m.cpu.open)
        m.update(.5)
        self.assertEqual(m.player.hp,78)

    def test_guard_chips_but_does_not_open_a_punish(self):
        m = self.match()
        m.command(m.player,"guard")
        m.command(m.cpu,"attack")
        m.update(.5)
        self.assertEqual(m.player.hp,98)
        self.assertFalse(m.cpu.open)
        self.assertIn("BLOCK -2",m.message)

    def test_jump_evades_ground_attack_then_lands(self):
        m = self.match()
        m.command(m.player,"jump")
        m.command(m.cpu,"attack")
        m.update(.5)
        self.assertEqual(m.player.hp,100)
        self.assertTrue(m.cpu.open)
        m.update(.3)
        self.assertEqual(m.player.jump,0)

    def test_hitstop_freezes_fighters_but_not_round_clock(self):
        m = self.match()
        m.command(m.player,"attack")
        m.update(.125)
        timer, x, remaining = m.player.timer,m.player.x,m.remaining
        self.assertGreater(m.hitstop,.02)
        m.update(.02)
        self.assertEqual(m.player.timer,timer)
        self.assertEqual(m.player.x,x)
        self.assertAlmostEqual(m.remaining,remaining-.02)

    def test_round_is_25_seconds_including_hitstop(self):
        m = self.match(30)
        m.hitstop = 5
        m.update(25)
        self.assertEqual(m.remaining,0)
        self.assertEqual(m.result,"DRAW / TIME")

    def test_timeout_all_verdicts_and_result_is_frozen(self):
        for a,b,verdict in ((50,40,"YOU WIN"),(40,50,"CPU WINS"),(50,50,"DRAW")):
            m = self.match(30)
            m.player.hp,m.cpu.hp = a,b
            m.update(25)
            self.assertEqual(m.result,verdict+" / TIME")
            m.command(m.player,"left")
            m.update(1)
            self.assertEqual(m.player.step,0)

    def test_simultaneous_ko(self):
        m = self.match()
        m.player.hp,m.cpu.hp = 22,8
        m.player.phase=m.cpu.phase="windup"
        m.player.timer=m.cpu.timer=.01
        m.update(.02)
        self.assertEqual(m.result,"DRAW / KO")

    def test_timers_are_independent_of_frame_cadence(self):
        for dt in (1/50,1/60,1/120,.007):
            for action, attr, duration in (("left","step",.16),("jump","jump",.72),("guard","guard",.65)):
                m = self.match(30)
                m.command(m.player,action)
                elapsed=0
                while getattr(m.player,attr)>0 and elapsed<1:
                    m.update(dt)
                    elapsed+=dt
                self.assertGreaterEqual(elapsed+1e-8,duration)
                self.assertLessEqual(elapsed,duration+dt+1e-8)

    def test_reactive_bait_wins_but_mashing_loses_across_seeds(self):
        for seed in range(20):
            for reactive in (False,True):
                m = Match(seed)
                dodged=False
                for i in range(3001):
                    if reactive:
                        if m.cpu.phase!="windup":
                            dodged=False
                        if m.cpu.phase=="windup" and m.cpu.timer<=CPU_WINDUP-.12 and not dodged:
                            if m.player.phase=="ready" and m.player.stun<=0 and m.hitstop<=0:
                                m.command(m.player,"left" if m.player.x>6 else "jump")
                                dodged=True
                        if m.cpu.open:
                            m.command(m.player,"right" if m.cpu.x-m.player.x>REACH-.8 else "attack")
                    elif i%8==0:
                        m.command(m.player,"attack")
                    m.update(1/120)
                    if m.result:
                        break
                with self.subTest(seed=seed,reactive=reactive):
                    self.assertEqual(m.result,"YOU WIN / KO" if reactive else "CPU WINS / KO")
                    if reactive:
                        self.assertEqual(m.punishes,4)


if __name__=="__main__":
    unittest.main()
