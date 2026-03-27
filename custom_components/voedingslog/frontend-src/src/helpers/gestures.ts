/**
 * Touch gesture handler for swipe navigation and pull-to-refresh.
 */
export class GestureHandler {
  private _startX = 0;
  private _startY = 0;
  private _pulling = false;
  pullDistance = 0;

  private _isDialogOpen: () => boolean;
  private _onSwipe: (delta: number) => void;
  private _onRefresh: () => void;
  private _requestUpdate: () => void;

  constructor(opts: {
    isDialogOpen: () => boolean;
    onSwipe: (delta: number) => void;
    onRefresh: () => void;
    requestUpdate: () => void;
  }) {
    this._isDialogOpen = opts.isDialogOpen;
    this._onSwipe = opts.onSwipe;
    this._onRefresh = opts.onRefresh;
    this._requestUpdate = opts.requestUpdate;
  }

  onTouchStart = (e: TouchEvent): void => {
    this._startX = e.touches[0].clientX;
    this._startY = e.touches[0].clientY;
    this._pulling = !this._isDialogOpen() && window.scrollY <= 0;
  };

  onTouchMove = (e: TouchEvent): void => {
    if (!this._pulling) return;
    const dy = e.touches[0].clientY - this._startY;
    if (dy > 0 && dy < 120) {
      this.pullDistance = dy;
      this._requestUpdate();
    }
  };

  onTouchEnd = (e: TouchEvent): void => {
    if (this._pulling && this.pullDistance > 60) {
      this.pullDistance = 0;
      this._pulling = false;
      this._onRefresh();
      return;
    }
    this.pullDistance = 0;
    this._pulling = false;

    if (this._isDialogOpen()) return;
    const dx = e.changedTouches[0].clientX - this._startX;
    const dy = e.changedTouches[0].clientY - this._startY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) {
      this._onSwipe(dx < 0 ? 1 : -1);
    }
  };

  attach(el: HTMLElement): void {
    el.addEventListener("touchstart", this.onTouchStart, { passive: true });
    el.addEventListener("touchmove", this.onTouchMove, { passive: true });
    el.addEventListener("touchend", this.onTouchEnd, { passive: true });
  }

  detach(el: HTMLElement): void {
    el.removeEventListener("touchstart", this.onTouchStart);
    el.removeEventListener("touchmove", this.onTouchMove);
    el.removeEventListener("touchend", this.onTouchEnd);
  }
}
