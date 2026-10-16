// Opt-in real Draw.io desktop checks: npm run test:skill:export.
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const repo = fileURLToPath(new URL("../", import.meta.url));
const skill = path.join(repo, "skills/mermaid-drawio");
const helper = path.join(skill, "scripts/diagram.mjs");
const input = path.join(skill, "examples/workflow.mmd");

test(
  "real desktop export, rerendering and relocation",
  { timeout: 240000 },
  async (t) => {
    const temp = await mkdtemp(
      path.join(os.tmpdir(), "mermaid drawio export "),
    );
    const cli = (script, args) =>
      exec(process.execPath, [script, ...args], {
        cwd: temp,
        timeout: 120000,
        windowsHide: true,
      });
    const convert = async (script, stem, extra = []) => {
      const { stdout } = await cli(script, [
        "--input",
        input,
        "--out",
        stem,
        "--work-dir",
        stem + " build",
        ...extra,
      ]);
      const report = JSON.parse(stdout);
      assert.ok(report.semanticsVerified);
      assert.ok(report.width > 100 && report.height > 100);
      const png = await readFile(stem + ".png");
      assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      assert.ok(png.length > 1000);
      const xml = await readFile(stem + ".drawio", "utf8");
      assert.match(xml, /<mxGraphModel/);
      assert.equal(
        await readFile(stem + ".mmd", "utf8"),
        await readFile(input, "utf8"),
      );
      return { report, xml, png };
    };
    try {
      await t.test(
        "default faithful mode writes exact converter output and protects outputs",
        async () => {
          const stem = path.join(temp, "faithful");
          const { report, xml, png } = await convert(helper, stem);
          assert.equal(report.mode, "faithful");
          assert.equal(
            xml,
            await readFile(path.join(report.work, "raw.drawio"), "utf8"),
          );
          await assert.rejects(
            cli(helper, ["--input", input, "--out", stem]),
            /Output exists/,
          );
          assert.deepEqual(await readFile(stem + ".png"), png);
          assert.equal(await readFile(stem + ".drawio", "utf8"), xml);
        },
      );
      await t.test(
        "beautify exports styled XML and rerenders a manual edit",
        async () => {
          const stem = path.join(temp, "beautified");
          const { report, xml, png } = await convert(helper, stem, [
            "--mode",
            "beautify",
            "--title",
            "Assessment workflow",
            "--style-map",
            path.join(skill, "examples/styles.json"),
          ]);
          assert.equal(report.mode, "beautify");
          assert.match(xml, /beautify-title/);
          assert.notEqual(
            xml,
            await readFile(path.join(report.work, "raw.drawio"), "utf8"),
          );
          const edited = xml.replace(
            "Submit request",
            "Manually edited request",
          );
          assert.notEqual(xml, edited);
          await writeFile(stem + ".drawio", edited);
          await cli(helper, [
            "--render-only",
            stem + ".drawio",
            "--png",
            stem + ".png",
            "--overwrite",
          ]);
          assert.equal(await readFile(stem + ".drawio", "utf8"), edited);
          assert.notDeepEqual(await readFile(stem + ".png"), png);
        },
      );
      await t.test(
        "relocated source archive and linked skill use the containing checkout",
        async () => {
          const relocated = path.join(temp, "source checkout with spaces");
          await mkdir(relocated);
          for (const name of [
            "src",
            "package.json",
            "package-lock.json",
            "skills",
          ]) {
            await cp(path.join(repo, name), path.join(relocated, name), {
              recursive: true,
            });
          }
          // Reuse dependencies for this relocation check; setup.py separately tests npm ci.
          await symlink(
            path.join(repo, "node_modules"),
            path.join(relocated, "node_modules"),
            process.platform === "win32" ? "junction" : "dir",
          );
          const relocatedSkill = path.join(relocated, "skills/mermaid-drawio");
          const link = path.join(temp, "linked skill");
          await symlink(
            relocatedSkill,
            link,
            process.platform === "win32" ? "junction" : "dir",
          );
          assert.equal(
            (
              await cli(path.join(link, "scripts/diagram.mjs"), [
                "--print-repo",
              ])
            ).stdout.trim(),
            relocated,
          );
          const { report } = await convert(
            path.join(relocatedSkill, "scripts/diagram.mjs"),
            path.join(temp, "relocated"),
          );
          assert.equal(report.repo, relocated);
        },
      );
      await t.test(
        "separately copied skill honors relative local configuration",
        async () => {
          const copy = path.join(temp, "copied skill");
          await cp(skill, copy, { recursive: true });
          await writeFile(
            path.join(copy, "config.local.json"),
            JSON.stringify({ repo: "../source checkout with spaces" }),
          );
          const { report } = await convert(
            path.join(copy, "scripts/diagram.mjs"),
            path.join(temp, "copied"),
          );
          assert.equal(
            report.repo,
            path.join(temp, "source checkout with spaces"),
          );
        },
      );
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  },
);
