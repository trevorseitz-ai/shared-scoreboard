"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import {
  Check,
  Copy,
  ExternalLink,
  LoaderCircle,
  Plus,
  QrCode,
  RotateCcw,
  Unplug,
  UserRoundCheck,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ConnectionBadge } from "@/components/connection-badge";
import { HostScoreControl } from "@/components/host-score-control";
import { ScorePair } from "@/components/score-pair";
import { announceLocalUpdate, apiRequest } from "@/lib/client-api";
import {
  DEFAULT_DEVICE_COUNT,
  DEVICE_STORAGE_PREFIX,
  isDeviceCount,
  type DeviceCount,
} from "@/lib/device-mode";
import type { GameSecrets, GameSide, PublicGameState } from "@/lib/game-types";
import { useGameState } from "@/lib/use-game-state";

const HOST_STORAGE_PREFIX = "shared-scoreboard:host:";

function readHostSecrets(code: string): GameSecrets | null {
  try {
    const raw = window.localStorage.getItem(`${HOST_STORAGE_PREFIX}${code}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<GameSecrets>;
    if (!value.hostToken || !value.controllerOneInvite || !value.controllerTwoInvite) return null;
    return value as GameSecrets;
  } catch {
    return null;
  }
}

function ControllerInvite({
  side,
  name,
  invite,
  claimed,
  origin,
  mode,
  busy,
  onReplace,
}: {
  side: GameSide;
  name: string;
  invite: string;
  claimed: boolean;
  origin: string;
  mode: 2 | 3;
  busy: boolean;
  onReplace: (side: GameSide) => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = origin ? `${origin}/control/${invite}` : "";

  async function copyLink() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <article className={`qr-card qr-card-${side}`}>
      <div className="qr-card-top">
        <div>
          <span className="qr-side-label">Side {side} controller</span>
          <h3>{name}</h3>
        </div>
        <span className={`claim-state ${claimed ? "is-claimed" : ""}`}>
          {claimed ? <UserRoundCheck size={14} /> : <QrCode size={14} />}
          {claimed ? "Connected" : "Scan to connect"}
        </span>
      </div>

      <div className="qr-body">
        <div className="qr-code-wrap" aria-label={`QR code for ${name}`}>
          {url ? <QRCodeSVG value={url} size={144} marginSize={1} bgColor="#ffffff" fgColor="#0b0d12" /> : <div className="qr-placeholder" />}
        </div>
        <div className="qr-instructions">
          <p>
            {mode === 2
              ? "Scan on the other device, or use this device for this side."
              : "Open the camera on this side's phone and scan the code."}
          </p>
          <div className="qr-actions">
            <button className="small-button" type="button" onClick={copyLink} disabled={!url}>
              {copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy link"}
            </button>
            <a className="small-button" href={url || undefined} target="_blank" rel="noreferrer" aria-disabled={!url}>
              <ExternalLink size={15} /> {mode === 2 ? "Use this device" : "Open"}
            </a>
          </div>
          {claimed ? (
            <button className="replace-link" type="button" disabled={busy} onClick={() => onReplace(side)}>
              <Unplug size={14} /> Replace controller
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function ScoreboardView({ code }: { code: string }) {
  const { game, setGame, loading, error, connection } = useGameState(code.toUpperCase());
  const [origin, setOrigin] = useState("");
  const [secrets, setSecrets] = useState<GameSecrets | null>(null);
  const [deviceCount, setDeviceCount] =
    useState<DeviceCount>(DEFAULT_DEVICE_COUNT);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingRound, setConfirmingRound] = useState(false);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setOrigin(window.location.origin);
      setSecrets(readHostSecrets(code.toUpperCase()));
      const savedDeviceCount = Number(
        window.localStorage.getItem(
          `${DEVICE_STORAGE_PREFIX}${code.toUpperCase()}`,
        ),
      );
      if (isDeviceCount(savedDeviceCount)) {
        setDeviceCount(savedDeviceCount);
      }
    });
    return () => {
      active = false;
    };
  }, [code]);

  function changeDeviceCount(nextDeviceCount: DeviceCount) {
    setDeviceCount(nextDeviceCount);
    window.localStorage.setItem(
      `${DEVICE_STORAGE_PREFIX}${code.toUpperCase()}`,
      String(nextDeviceCount),
    );
    setNotice(null);
  }

  async function startNewRound() {
    if (!game || !secrets) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await apiRequest<{ game: PublicGameState }>(`/api/games/${game.code}/rematch`, {
        method: "POST",
        body: JSON.stringify({ hostToken: secrets.hostToken, actionId: crypto.randomUUID() }),
      });
      setGame(result.game);
      announceLocalUpdate(result.game);
      setConfirmingRound(false);
      setNotice(`Rematch started — round ${result.game.roundNumber} is ready.`);
    } catch (requestError) {
      setNotice(requestError instanceof Error ? requestError.message : "The round could not be reset.");
    } finally {
      setBusy(false);
    }
  }

  async function replaceController(side: GameSide) {
    if (!game || !secrets) return;
    const name = side === 1 ? game.sideOneName : game.sideTwoName;
    if (!window.confirm(`Replace ${name}'s controller? The old controller will stop working.`)) return;

    setBusy(true);
    setNotice(null);
    try {
      const result = await apiRequest<{ game: PublicGameState; inviteToken: string }>(`/api/games/${game.code}/replace-controller`, {
        method: "POST",
        body: JSON.stringify({ hostToken: secrets.hostToken, side }),
      });
      const nextSecrets = {
        ...secrets,
        ...(side === 1 ? { controllerOneInvite: result.inviteToken } : { controllerTwoInvite: result.inviteToken }),
      };
      window.localStorage.setItem(`${HOST_STORAGE_PREFIX}${game.code}`, JSON.stringify(nextSecrets));
      setSecrets(nextSecrets);
      setGame(result.game);
      announceLocalUpdate(result.game);
      setNotice(`Side ${side} has a new controller link.`);
    } catch (requestError) {
      setNotice(requestError instanceof Error ? requestError.message : "The controller could not be replaced.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !game) {
    return <main className="center-state"><LoaderCircle className="spin" size={30} /><p>Loading scoreboard…</p></main>;
  }

  if (!game) {
    return (
      <main className="center-state">
        <span className="state-icon"><Unplug size={28} /></span>
        <h1>Scoreboard unavailable</h1>
        <p>{error ?? "This scoreboard could not be found."}</p>
        <Link className="primary-button" href="/">Create a new scoreboard</Link>
      </main>
    );
  }

  return (
    <main className="scoreboard-page">
      <header className="scoreboard-header">
        <BrandMark compact />
        <div className="game-meta">
          <span className="game-code">Game {game.code}</span>
          <span className="meta-divider" />
          <span>Round {game.roundNumber}</span>
          <ConnectionBadge state={connection} />
        </div>
      </header>

      <ScorePair game={game} compact={Boolean(secrets) && deviceCount === 1} />

      {secrets && deviceCount === 1 ? (
        <section
          className="shared-scoreboard-controls"
          aria-label="Shared scoring controls"
        >
          <div className="shared-controls-grid">
            <HostScoreControl
              game={game}
              hostToken={secrets.hostToken}
              side={1}
              onGameChange={setGame}
            />
            <HostScoreControl
              game={game}
              hostToken={secrets.hostToken}
              side={2}
              onGameChange={setGame}
            />
          </div>
        </section>
      ) : null}

      <section
        className="controller-dock"
        aria-label="Scoring controls and player controller links"
      >
        {secrets ? (
          <div className="device-mode-bar">
            <div>
              <p className="eyebrow">Device setup</p>
              <strong>How many devices are you using?</strong>
            </div>
            <div className="device-mode-switch" role="group" aria-label="Number of devices">
              {([1, 2, 3] as const).map((count) => (
                <button
                  key={count}
                  className={deviceCount === count ? "is-selected" : ""}
                  type="button"
                  aria-pressed={deviceCount === count}
                  onClick={() => changeDeviceCount(count)}
                >
                  <span>{count}</span>
                  {count === 1 ? "device" : "devices"}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="dock-heading">
          <div>
            <p className="eyebrow">
              {secrets && deviceCount === 1 ? "Game options" : "Player controls"}
            </p>
            <h2>
              {!secrets
                ? "Scoreboard view"
                : deviceCount === 1
                  ? "Shared scoring is ready"
                  : deviceCount === 2
                    ? "Put one side on each device"
                    : "Scan one code per side"}
            </h2>
            <p>
              {!secrets
                ? "QR codes and round controls are available on the device that created this game."
                : deviceCount === 1
                  ? "Both sides can score from the panels directly below the scoreboard."
                  : deviceCount === 2
                    ? "Tap a side on this device, then scan the other side on the second device."
                    : "Keep this scoreboard visible while each side scans its own code."}
            </p>
          </div>
          <div className="dock-actions">
            {secrets ? (
              <button className="round-button" type="button" onClick={() => setConfirmingRound(true)} disabled={busy}>
                <RotateCcw size={17} /> Rematch
              </button>
            ) : null}
            <Link className="round-button new-game-button" href="/">
              <Plus size={17} /> New game
            </Link>
          </div>
        </div>

        {notice ? <p className="dock-notice" role="status">{notice}</p> : null}

        {secrets && deviceCount !== 1 ? (
          <div className="qr-grid">
            <ControllerInvite side={1} name={game.sideOneName} invite={secrets.controllerOneInvite} claimed={game.controllerOneClaimed} origin={origin} mode={deviceCount === 2 ? 2 : 3} busy={busy} onReplace={replaceController} />
            <ControllerInvite side={2} name={game.sideTwoName} invite={secrets.controllerTwoInvite} claimed={game.controllerTwoClaimed} origin={origin} mode={deviceCount === 2 ? 2 : 3} busy={busy} onReplace={replaceController} />
          </div>
        ) : !secrets ? (
          <div className="viewer-note"><QrCode size={22} /><span>Keep the original scoreboard tab open to share controller links.</span></div>
        ) : null}
      </section>

      {confirmingRound ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setConfirmingRound(false)}>
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="new-round-title">
            <span className="dialog-icon"><RotateCcw size={23} /></span>
            <h2 id="new-round-title">Start a rematch?</h2>
            <p>Both scores will return to zero. Team names and any phone controllers will stay connected.</p>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setConfirmingRound(false)} disabled={busy}>Cancel</button>
              <button className="primary-button" type="button" onClick={startNewRound} disabled={busy}>
                {busy ? <LoaderCircle className="spin" size={18} /> : <RotateCcw size={18} />} Start rematch
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
