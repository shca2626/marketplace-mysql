#!/usr/bin/env python3
"""
Daemonized one-shot runner for the vitest suite (survives Bash-tool shell
recycling via double-fork). Writes results to /tmp/vitest.log.

Usage: python3 scripts/daemon-vitest.py
"""
import os
import sys

PROJECT = "/home/z/my-project"
LOG = "/tmp/vitest.log"


def read_env_url() -> str:
    with open(os.path.join(PROJECT, ".env")) as f:
        for line in f:
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().replace("/defaultdb", "/vendora_test")
    raise SystemExit("DATABASE_URL not found in .env")


def daemonize():
    if os.fork() > 0:
        sys.exit(0)
    os.setsid()
    if os.fork() > 0:
        sys.exit(0)
    os.umask(0o022)
    os.chdir(PROJECT)


def main():
    with open("/tmp/vitest-runner.pid", "w") as f:
        f.write(str(os.getpid()))
    env = dict(os.environ)
    env["TEST_DATABASE_URL"] = read_env_url()
    env.pop("DATABASE_URL", None)
    log = open(LOG, "wb")
    import subprocess
    proc = subprocess.Popen(
        ["node_modules/.bin/vitest", "run"],
        stdout=log,
        stderr=subprocess.STDOUT,
        cwd=PROJECT,
        env=env,
        start_new_session=True,
    )
    rc = proc.wait()
    with open(LOG, "ab") as f:
        f.write(f"\n__EXIT_CODE__={rc}\n".encode())
    os.remove("/tmp/vitest-runner.pid")


if __name__ == "__main__":
    daemonize()
    main()
