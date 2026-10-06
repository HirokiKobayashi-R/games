"""Bait, dodge, punish. Combat is independent of terminal rendering."""

from dataclasses import dataclass
import random

ARENA = 72.0
ROUND_SECONDS = 25.0
BODY_GAP = 3.0
REACH = 7.0
STEP_TIME = 0.16
JUMP_TIME = 0.72
GUARD_TIME = 0.65
PLAYER_WINDUP = 0.12
CPU_WINDUP = 0.48
PLAYER_RECOVERY = 0.38
CPU_RECOVERY = 0.55
WHIFF_RECOVERY = 0.95
HITSTOP = 0.065


@dataclass
class Fighter:
    x: float
    hp: int = 100
    move: int = 0
    step: float = 0.0
    jump: float = 0.0
    guard: float = 0.0
    phase: str = "ready"
    timer: float = 0.0
    flash: float = 0.0
    stun: float = 0.0
    open: bool = False

    @property
    def airborne(self):
        return 0.10 < self.jump < JUMP_TIME - 0.10


class Match:
    def __init__(self, seed=None):
        self.player = Fighter(25.0)
        self.cpu = Fighter(42.0)
        self.remaining = ROUND_SECONDS
        self.result = None
        self.message = "Bait the windup. Step back. Hit the OPEN recovery!"
        self.message_time = 3.0
        self.rng = random.Random(seed)
        self.cpu_think = 0.3
        self.hitstop = 0.0
        self.impact = None
        self.impact_time = 0.0
        self.punishes = 0

    def say(self, message):
        self.message = message
        self.message_time = 1.0

    def command(self, fighter, action):
        if self.result or fighter.stun > 0 or self.hitstop > 0:
            return
        if fighter.phase != "ready":
            return
        if action in ("left", "right"):
            fighter.move = -1 if action == "left" else 1
            fighter.step = STEP_TIME
            fighter.guard = 0.0
        elif action == "jump" and fighter.jump <= 0:
            fighter.jump = JUMP_TIME
            fighter.guard = 0.0
        elif action == "guard" and fighter.jump <= 0:
            fighter.guard = GUARD_TIME
            fighter.step = 0.0
        elif action == "attack":
            fighter.guard = 0.0
            fighter.step = 0.0
            fighter.phase = "windup"
            fighter.timer = PLAYER_WINDUP if fighter is self.player else CPU_WINDUP
            fighter.open = False

    def update(self, dt):
        if self.result or dt <= 0:
            return
        while dt > 1e-10 and not self.result:
            tick = min(dt, 1 / 60)
            self._tick(tick)
            dt -= tick

    def _tick(self, dt):
        # Impact briefly freezes fighters, but the 25-second clock stays real.
        self.remaining = max(0.0, self.remaining - dt)
        self.message_time = max(0.0, self.message_time - dt)
        self.impact_time = max(0.0, self.impact_time - dt)
        freeze = min(dt, self.hitstop)
        self.hitstop = max(0.0, self.hitstop - dt)
        motion_dt = dt - freeze
        if motion_dt > 0:
            self._advance(motion_dt)
        if self.player.hp == 0 or self.cpu.hp == 0 or self.remaining <= 1e-8:
            if self.remaining <= 1e-8:
                self.remaining = 0.0
            a, b = self.player.hp, self.cpu.hp
            verdict = "DRAW" if a == b else "YOU WIN" if a > b else "CPU WINS"
            self.result = verdict + (" / TIME" if self.remaining <= 0 else " / KO")
            self.clear_motion()

    def _advance(self, dt):
        self._cpu(dt)
        strikes = []
        for fighter, defender in ((self.player, self.cpu), (self.cpu, self.player)):
            if fighter.step > 0 and fighter.stun <= 0:
                distance = fighter.move * 22 * min(dt, fighter.step)
                if fighter is self.cpu and distance < 0:
                    # Approach a readable spacing instead of overshooting into
                    # point-blank range between AI decisions.
                    distance = max(distance, min(0.0, self.player.x+5.2-fighter.x))
                fighter.x += distance
            fighter.x = min(ARENA-3, max(3, fighter.x))
            for name in ("step", "jump", "guard", "flash", "stun"):
                setattr(fighter, name, max(0.0, getattr(fighter, name)-dt))
            if fighter.phase != "ready":
                fighter.timer = max(0.0, fighter.timer-dt)
                if fighter.timer <= 1e-8:
                    if fighter.phase == "windup":
                        strikes.append((fighter, defender))
                    else:
                        fighter.phase = "ready"
                        fighter.open = False
        self._separate()
        # Snapshot contacts before either hit changes the other fighter.
        contacts = [(a, d, abs(a.x-d.x) <= REACH and a.airborne == d.airborne,
                     d.guard > 0, d.open) for a, d in strikes]
        for attacker, defender, contact, blocked, punish in contacts:
            attacker.phase = "recover"
            attacker.timer = PLAYER_RECOVERY if attacker is self.player else CPU_RECOVERY
            if not contact:
                if attacker is self.cpu:
                    attacker.timer = WHIFF_RECOVERY
                    attacker.open = True
                    self.say("CPU WHIFF!  Close in + J while OPEN")
                else:
                    self.say("YOU WHIFF - committed until recovery ends")
                continue
            is_player = attacker is self.player
            damage = (32 if punish else 8) if is_player else 22
            if blocked:
                damage = 2
            defender.hp = max(0, defender.hp-damage)
            defender.flash = 0.18
            defender.step = 0.0
            defender.stun = 0.08 if blocked else 0.18
            # CPU commits through small hits during windup: mashing trades badly.
            # A punished whiff consumes its one bonus, preventing bonus combos.
            if is_player and punish and not blocked:
                defender.open = False
                self.punishes += 1
            if defender is self.player and not blocked:
                defender.phase, defender.timer, defender.open = "ready", 0.0, False
            defender.x += (1 if defender.x > attacker.x else -1) * (0.5 if blocked else 1.6)
            defender.x = min(ARENA-3, max(3, defender.x))
            self.hitstop = max(self.hitstop, 0.025 if blocked else HITSTOP)
            self.impact = ((attacker.x+defender.x)/2, punish and is_player and not blocked)
            self.impact_time = 0.18
            if blocked:
                self.say(("CPU" if is_player else "YOU") + " BLOCK -2")
            elif is_player and punish:
                self.say("PUNISH! -32   Clean hit!")
            else:
                self.say(("CPU HIT -8 (committed!)" if is_player else "YOU HIT -22"))
        self._separate()

    def _cpu(self, dt):
        cpu = self.cpu
        self.cpu_think -= dt
        if cpu.phase != "ready" or cpu.stun > 0:
            return
        # Cover neutral and recovery transitions; drop guard only when committing.
        cpu.guard = GUARD_TIME
        if self.cpu_think > 0:
            return
        self.cpu_think = self.rng.uniform(0.12, 0.20)
        if cpu.x-self.player.x > REACH-1.2:
            self.command(cpu, "left")
        else:
            self.command(cpu, "attack")

    def _separate(self):
        if self.cpu.x-self.player.x < BODY_GAP:
            middle = (self.cpu.x+self.player.x)/2
            middle = min(ARENA-3-BODY_GAP/2, max(3+BODY_GAP/2, middle))
            self.player.x, self.cpu.x = middle-BODY_GAP/2, middle+BODY_GAP/2

    def clear_motion(self):
        for fighter in (self.player, self.cpu):
            fighter.step = 0.0
            fighter.move = 0
