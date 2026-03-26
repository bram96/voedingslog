/**
 * Shared html5-qrcode camera wrapper.
 * Used for both barcode scanning and photo capture.
 * Handles light DOM container, position tracking, start/stop lifecycle.
 */
import { Html5Qrcode } from "html5-qrcode";

export interface CameraHost {
  shadowRoot: ShadowRoot | null;
  requestUpdate(): void;
  updateComplete: Promise<boolean>;
}

export class Html5Camera {
  private _host: CameraHost;
  private _containerId: string;
  private _placeholderId: string;
  private _qrcode: Html5Qrcode | null = null;
  private _posFrame: number | null = null;

  constructor(host: CameraHost, containerId: string, placeholderId: string) {
    this._host = host;
    this._containerId = containerId;
    this._placeholderId = placeholderId;
  }

  get active(): boolean {
    return this._qrcode !== null;
  }

  /**
   * Start the camera as a barcode scanner.
   * Calls `onDecode` when a barcode is successfully scanned.
   * Calls `onFail` if the camera fails to start.
   */
  async startScanner(
    onDecode: (barcode: string) => void,
    onFail: () => void,
    timeoutMs = 10000,
  ): Promise<void> {
    try {
      this._cleanup();
      await this._createContainer();

      this._qrcode = new Html5Qrcode(this._containerId);
      const startPromise = this._qrcode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 150 }, aspectRatio: 1.5 },
        (decodedText: string) => {
          this.stop();
          onDecode(decodedText);
        },
        () => {},
      );

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Camera timeout")), timeoutMs),
      );

      await Promise.race([startPromise, timeout]);
    } catch (e) {
      console.warn("Barcode scanner failed:", e);
      this.stop();
      onFail();
    }
  }

  /**
   * Start the camera as a photo viewfinder (no barcode decoding).
   * User manually captures a frame via `captureFrame()`.
   */
  async startViewfinder(): Promise<boolean> {
    try {
      this._cleanup();
      await this._createContainer();

      this._qrcode = new Html5Qrcode(this._containerId);
      await this._qrcode.start(
        { facingMode: "environment" },
        { fps: 2, qrbox: { width: 9999, height: 9999 } },
        () => {},
        () => {},
      );
      return true;
    } catch (e) {
      console.warn("Photo camera failed:", e);
      this.stop();
      return false;
    }
  }

  /**
   * Capture the current video frame as base64 JPEG.
   */
  captureFrame(): string | null {
    const container = document.getElementById(this._containerId);
    const video = container?.querySelector("video");
    if (!video) return null;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
  }

  stop(): void {
    if (this._qrcode) {
      this._qrcode.stop().catch(() => {}).finally(() => {
        this._qrcode = null;
        this._cleanup();
      });
    } else {
      this._cleanup();
    }
  }

  private async _createContainer(): Promise<void> {
    await this._host.updateComplete;

    const container = document.createElement("div");
    container.id = this._containerId;
    document.body.appendChild(container);

    const placeholder = this._host.shadowRoot?.getElementById(this._placeholderId);
    if (placeholder) placeholder.style.minHeight = "250px";
    this._trackPosition();
  }

  private _trackPosition(): void {
    const container = document.getElementById(this._containerId);
    const placeholder = this._host.shadowRoot?.getElementById(this._placeholderId);
    if (!container || !placeholder) return;

    const rect = placeholder.getBoundingClientRect();
    container.style.cssText = `
      position:fixed; top:${rect.top}px; left:${rect.left}px;
      width:${rect.width}px; height:${Math.max(rect.height, 250)}px;
      z-index:101; border-radius:8px; overflow:hidden;
    `;
    this._posFrame = requestAnimationFrame(() => this._trackPosition());
  }

  private _cleanup(): void {
    if (this._posFrame) {
      cancelAnimationFrame(this._posFrame);
      this._posFrame = null;
    }
    const existing = document.getElementById(this._containerId);
    if (existing) existing.remove();
  }
}
