#!/usr/bin/env python3
"""
Daemonized dev-server supervisor for the Vendora sandbox.

The Bash tool's persistent shell recycles between commands and kills all its
children (plain `nohup cmd &` dies with it). This script performs the classic
POSIX double-fork daemonization so the supervisor is reparented to PID 1
(tini) — exactly why the agent-browser daemon survives. The supervisor then
keeps `next dev` running, restarting it after kernel OOM kills.

Usage: python3 scripts/daemon-dev.py            (start/restart supervisor)
       python3 scripts/daemon-dev.py --status   (is the server up?)
       python3 scripts/daemon-dev.py --stop      (stop supervisor + server)
"""
import os
import signal
import subprocess
import sys
import time

PROJECT = "/home/z/my-project"
DEV_LOG = os.path.join(PROJECT, "dev.log")
PID_FILE = "/tmp/vendora-dev-supervisor.pid"
NEXT_BIN = os.path.join(PROJECT, "node_modules", ".bin", "next")


def is_server_running() -> bool:
    try:
        out = subprocess.run(
            ["pgrep", "-f", "next dev -p 3000"],
            capture_output=True, text=True,
        )
        return out.returncode == 0 and bool(out.stdout.strip())
    except Exception:
        return False


def supervisor_alive() -> bool:
    try:
        with open(PID_FILE) as f:
            pid = int(f.read().strip())
        os.kill(pid, 0)  # signal 0 = existence check
        return True
    except (OSError, ValueError):
        return False


def daemonize():
    """Classic double-fork: detach from the Bash tool's shell session."""
    if os.fork() > 0:
        sys.exit(0)  # parent exits — shell returns immediately
    os.setsid()      # new session, no controlling tty
    if os.fork() > 0:
        sys.exit(0)  # first child exits — grandchild reparented to init
    os.umask(0o022)
    os.chdir(PROJECT)


def write_pid():
    with open(PID_FILE, "w") as f:
        f.write(str(os.getpid()))


def spawn_server() -> subprocess.Popen:
    log = open(DEV_LOG, "ab")
    env = dict(os.environ)
    env["NODE_OPTIONS"] = "--max-old-space-size=2048"
    proc = subprocess.Popen(
        [NEXT_BIN, "dev", "-p", "3000"],
        stdout=log,
        stderr=subprocess.STDOUT,
        cwd=PROJECT,
        env=env,
        start_new_session=True,
    )
    return proc


def run_supervisor():
    write_pid()
    # stop any previously-managed server instance duplicates
    proc = None
    while True:
        if proc is not None and proc.poll() is not None:
            proc = None
        if not is_server_running():
            with open("/tmp/vendora-dev-supervisor.log", "a") as wl:
                wl.write(f"{time.strftime('%FT%T')} (re)starting next dev\n")
            proc = spawn_server()
        time.sleep(10)


def main():
    if "--status" in sys.argv:
        print(f"supervisor: {'alive' if supervisor_alive() else 'dead'}")
        print(f"server:     {'up' if is_server_running() else 'down'}")
        return
    if "--stop" in sys.argv:
        try:
            with open(PID_FILE) as f:
                os.kill(int(f.read().strip()), signal.SIGTERM)
        except (OSError, ValueError):
            pass
        subprocess.run(["pkill", "-f", "next dev -p 3000"])
        try:
            os.remove(PID_FILE)
        except OSError:
            pass
        print("stopped")
        return
    if supervisor_alive() and is_server_running():
        print("already running")
        return
    if supervisor_alive():
        # stale supervisor without server — let it restart the server itself
        print("supervisor alive; it will restart the server")
        return
    daemonize()
    run_supervisor()


if __name__ == "__main__":
    main()
