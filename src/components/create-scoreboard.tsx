"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowRight, LoaderCircle, Radio, UsersRound } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { apiRequest } from "@/lib/client-api";
import {
  DEFAULT_DEVICE_COUNT,
  DEVICE_STORAGE_PREFIX,
  isDeviceCount,
  type DeviceCount,
} from "@/lib/device-mode";
import type { CreatedGame } from "@/lib/game-types";

const HOST_STORAGE_PREFIX = "shared-scoreboard:host:";

const DEVICE_OPTIONS: Array<{
  count: DeviceCount;
  title: string;
  description: string;
}> = [
  { count: 1, title: "Shared", description: "Score together here" },
  { count: 2, title: "Players", description: "One screen per side" },
  { count: 3, title: "Full setup", description: "Display + two sides" },
];

function rememberGame(created: CreatedGame, deviceCount: DeviceCount) {
  window.localStorage.setItem(
    `${HOST_STORAGE_PREFIX}${created.game.code}`,
    JSON.stringify(created.secrets),
  );
  window.localStorage.setItem(
    `${DEVICE_STORAGE_PREFIX}${created.game.code}`,
    String(deviceCount),
  );
}

export function CreateScoreboard() {
  const router = useRouter();
  const [sideOneName, setSideOneName] = useState("");
  const [sideTwoName, setSideTwoName] = useState("");
  const [deviceCount, setDeviceCount] =
    useState<DeviceCount>(DEFAULT_DEVICE_COUNT);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const newGameFormRef = useRef<HTMLFormElement>(null);

  function scrollToNewGame() {
    newGameFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function createWithNames(
    firstName: string,
    secondName: string,
    selectedDeviceCount: DeviceCount = deviceCount,
  ) {
    setCreating(true);
    setError(null);

    try {
      const created = await apiRequest<CreatedGame>("/api/games", {
        method: "POST",
        body: JSON.stringify({ sideOneName: firstName, sideTwoName: secondName }),
      });

      rememberGame(created, selectedDeviceCount);
      router.push(`/game/${created.game.code}`);
      return created;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The scoreboard could not be created.",
      );
      setCreating(false);
      throw requestError;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createWithNames(sideOneName, sideTwoName);
    } catch {
      // The visible form error is set by createWithNames.
    }
  }

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    void Promise.resolve(
      context.registerTool(
        {
          name: "create_scoreboard",
          title: "Create scoreboard",
          description: "Create a live two-side scoreboard using the provided player or team names, then open it.",
          inputSchema: {
            type: "object",
            properties: {
              sideOneName: { type: "string", minLength: 1, maxLength: 80 },
              sideTwoName: { type: "string", minLength: 1, maxLength: 80 },
              deviceCount: {
                type: "integer",
                enum: [1, 2, 3],
                description: "Number of physical devices to use.",
              },
            },
            required: ["sideOneName", "sideTwoName"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          async execute(input) {
            const value = input as {
              sideOneName?: unknown;
              sideTwoName?: unknown;
              deviceCount?: unknown;
            };
            if (typeof value?.sideOneName !== "string" || typeof value?.sideTwoName !== "string") {
              throw new Error("Both side names are required.");
            }
            const requestedDeviceCount =
              value.deviceCount === undefined
                ? DEFAULT_DEVICE_COUNT
                : value.deviceCount;
            if (!isDeviceCount(requestedDeviceCount)) {
              throw new Error("Device count must be 1, 2, or 3.");
            }
            setCreating(true);
            setError(null);
            try {
              const created = await apiRequest<CreatedGame>("/api/games", {
                method: "POST",
                body: JSON.stringify({
                  sideOneName: value.sideOneName.trim(),
                  sideTwoName: value.sideTwoName.trim(),
                }),
              });
              rememberGame(created, requestedDeviceCount);
              router.push(`/game/${created.game.code}`);
              return { code: created.game.code, path: `/game/${created.game.code}` };
            } catch (toolError) {
              setError(toolError instanceof Error ? toolError.message : "The scoreboard could not be created.");
              setCreating(false);
              throw toolError;
            }
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch((registrationError) => console.warn("Could not register create_scoreboard", registrationError));

    return () => lifecycle.abort();
  }, [router]);

  return (
    <main className="setup-page">
      <header className="setup-header">
        <BrandMark />
        <span className="setup-header-note">
          <Radio size={15} aria-hidden="true" /> Live on every screen
        </span>
      </header>

      <section className="setup-workspace">
        <div className="setup-intro">
          <p className="eyebrow">One game · one to three screens</p>
          <h1>Set the sides.<br />Start the game.</h1>
          <p className="setup-lede">
            Share one screen, give each side a phone, or add a dedicated
            scoreboard. Every setup stays in sync.
          </p>

          <div className="setup-steps" aria-label="How it works">
            <div className="setup-step">
              <span>01</span>
              <div><strong>Name both sides</strong><small>Teams, players, or pairs</small></div>
            </div>
            <div className="setup-step">
              <span>02</span>
              <div><strong>Choose your setup</strong><small>Use 1, 2, or 3 devices</small></div>
            </div>
            <div className="setup-step">
              <span>03</span>
              <div><strong>Play and score</strong><small>Every screen stays in sync</small></div>
            </div>
          </div>

          <button type="button" className="jump-to-form-button" onClick={scrollToNewGame}>
            New game <ArrowDown size={18} />
          </button>
        </div>

        <form className="setup-card" ref={newGameFormRef} onSubmit={handleSubmit}>
          <div className="setup-card-heading">
            <span className="setup-card-icon"><UsersRound size={22} /></span>
            <div>
              <p className="eyebrow">New game</p>
              <h2>Who is playing?</h2>
            </div>
          </div>

          <label className="field-label" htmlFor="side-one-name">
            <span><i className="side-dot side-dot-one" /> Side one</span>
            <input
              id="side-one-name"
              name="sideOneName"
              value={sideOneName}
              onChange={(event) => setSideOneName(event.target.value)}
              placeholder="e.g. Maya & Jordan"
              autoComplete="off"
              maxLength={80}
              required
              autoFocus
            />
          </label>

          <div className="versus-divider"><span>VS</span></div>

          <label className="field-label" htmlFor="side-two-name">
            <span><i className="side-dot side-dot-two" /> Side two</span>
            <input
              id="side-two-name"
              name="sideTwoName"
              value={sideTwoName}
              onChange={(event) => setSideTwoName(event.target.value)}
              placeholder="e.g. The Blue Team"
              autoComplete="off"
              maxLength={80}
              required
            />
          </label>

          <fieldset className="device-picker">
            <legend>How many devices?</legend>
            <div className="device-options">
              {DEVICE_OPTIONS.map((option) => (
                <button
                  key={option.count}
                  className={`device-option ${deviceCount === option.count ? "is-selected" : ""}`}
                  type="button"
                  aria-pressed={deviceCount === option.count}
                  onClick={() => setDeviceCount(option.count)}
                >
                  <span>{option.count}</span>
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
          </fieldset>

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          <button className="primary-button create-button" type="submit" disabled={creating}>
            {creating ? (
              <><LoaderCircle className="spin" size={21} /> Creating scoreboard</>
            ) : (
              <>Create scoreboard <ArrowRight size={21} /></>
            )}
          </button>
          <p className="setup-fine-print">No accounts. The scoreboard expires after 24 hours of inactivity.</p>
        </form>
      </section>
    </main>
  );
}
