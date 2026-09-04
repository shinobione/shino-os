# Third-party runtime notice

SHINO-OS uses **Jarvis OS** as an optional/local runtime dependency.

- Project: `Grominet95/jarvis-OS`
- Upstream: https://github.com/Grominet95/jarvis-OS
- License: GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)
- SHINO-OS does not currently vendor the Jarvis OS source tree; `shino.ps1` clones the upstream repository into the git-ignored local `.runtime/` directory.

Jarvis OS remains Copyright © its respective authors and contributors and remains subject to its upstream license.

SHINO-OS may also interoperate with the separate **Jarvis Skills** catalogue:

- Project: `Grominet95/jarvis-skills`
- Upstream: https://github.com/Grominet95/jarvis-skills
- License: MIT

No third-party API keys, secrets, bundle files, model weights or runtime `.env` files should be committed to this repository.
