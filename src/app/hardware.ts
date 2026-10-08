/**
 * Simulated cabinet hardware. The coin acceptor and card reader are keyboard keys (and on-screen buttons);
 * the ticket dispenser is an animation. A real driver would implement the same interface.
 */
export interface HardwareEvents {
  onCoin(): void;
  onCard(uid: string): void;
}

export const TEST_CARDS = ["A3F2", "7B19", "C04D", "5E88"];

export class SimulatedHardware {
  private cardIdx = 0;
  constructor(private readonly handlers: HardwareEvents, target: Window = window) {
    target.addEventListener("keydown", (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.code === "KeyC") this.coin();
      else if (e.code === "KeyT") e.shiftKey ? this.card(this.randomUid()) : this.card(TEST_CARDS[this.cardIdx]!);
      else if (e.code === "KeyY") this.cardIdx = (this.cardIdx + 1) % TEST_CARDS.length;
    });
  }
  coin(): void { this.handlers.onCoin(); }
  card(uid: string): void { this.handlers.onCard(uid); }
  randomUid(): string { return Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, "0"); }
  get currentCard(): string { return TEST_CARDS[this.cardIdx]!; }
}
