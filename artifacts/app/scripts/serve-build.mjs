/**
 * @fileOverview Web support role: configures or validates the Serve Build part of the Vite/React application.
 * System connection: participates in browser development, build, quality checks, or deployment.
 */
/**
 * Serve `dist/public` to the browser audits, and stay up.
 *
 * Five audits each carried their own copy of this: the same MIME table, the
 * same single-page fallback to index.html, the same `fs.readFileSync` with
 * nothing around it. One copy is now here, which matters less for the
 * duplication than for what the duplication was hiding.
 *
 * `readFileSync` inside a request handler throws, and an exception thrown in a
 * `http.createServer` callback is an uncaught exception, which kills the
 * process. So anything that removes a file while an audit is running -- a
 * `vite build` in another terminal wipes `dist/` before it writes it again --
 * ends the run with a stack trace from node:fs that mentions neither the
 * audit, nor the page, nor the build that caused it. That happened twice while
 * this file was being written.
 *
 * A dropped file is now a status code, which the audit reports as a page it
 * could not load, naming the page. Replacing the build underneath a run is
 * still a mistake -- do not do it -- but it reads as one.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const MIME = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".json": "application/json",
  ".map": "application/json",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
  ".wasm": "application/wasm",
};

/**
 * @param {string} root the built site, usually dist/public
 * @param {number} port 0 for an ephemeral one; await `ready` for the real one
 * @returns {import("node:http").Server & { ready: Promise<number> }} the
 *   server, plus a promise of the port it actually got
 */
export function serveBuild(root, port) {
  const server = http
    .createServer((req, res) => {
      try {
        const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
        // Anything the router owns gets the app shell, which is how a
        // client-side route like /classes/31 loads at all -- and so does
        // anything that resolves outside the build, since `..` in a request
        // path would otherwise read whatever it liked off this machine. Only
        // one of the five copies of this checked that.
        let file = path.join(root, url);
        if (
          !path.resolve(file).startsWith(path.resolve(root)) ||
          !fs.existsSync(file) ||
          fs.statSync(file).isDirectory()
        ) {
          file = path.join(root, "index.html");
        }
        const body = fs.readFileSync(file);
        res.writeHead(200, {
          "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream",
        });
        res.end(body);
      } catch (error) {
        // Never throw out of here: this callback runs on the server's own
        // stack, so an exception is uncaught and takes the whole audit with
        // it, reported as an fs error with no idea which page asked.
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end(
          `the build under ${root} could not be read: ${error.message}\n` +
            `If a build is running, wait for it to finish and run the audit again.`,
        );
      }
    })
    .listen(port, "127.0.0.1");

  /*
   * The other way this used to die.
   *
   * `listen` reports failure by emitting 'error', and an 'error' event with no
   * listener is thrown -- so starting an audit while another one still holds
   * the port ended the run with an EADDRINUSE stack trace from node:net,
   * naming neither the audit nor the port's owner. Every audit has its own
   * default port and its own override, so the fix is nearly always to wait or
   * to set the variable; the message says so.
   */
  server.on("error", (/** @type {NodeJS.ErrnoException} */ error) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `Port ${port} is already in use, so this audit cannot serve the ` +
          `build. Another audit is probably still running -- wait for it, or ` +
          `give this one a different port with its AUDIT_*_PORT variable.`,
      );
    } else {
      console.error(`Could not serve the build on port ${port}: ${error.message}`);
    }
    process.exit(2);
  });

  /*
   * The port, once it is real.
   *
   * `listen` is asynchronous, so `address()` is null until the server says it
   * is listening -- which matters for the audits that pass 0 and let the OS
   * pick, because those cannot know their own URL until this resolves.
   */
  // Not `listening`: net.Server already has a getter by that name, and
  // assigning over it throws.
  const ready = new Promise((resolve) =>
    server.once("listening", () => {
      const address = server.address();
      // A string address is a unix socket, which nothing here uses; the
      // requested port is the honest answer if one ever appears.
      resolve(address && typeof address !== "string" ? address.port : port);
    }),
  );
  return Object.assign(server, { ready });
}
