# BTC Wine — RWA Vault Infrastructure on Stellar

Technical architecture documentation for the BTC Wine project — a Real-World Asset vault built on Stellar using Soroban smart contracts.

## Quick Start (Docker)

```bash
docker-compose up --build
```

Documentation will be available at [http://localhost:8000](http://localhost:8000).

## Quick Start (Local)

```bash
pip install -r requirements.txt
mkdocs serve
```

## Project Structure

```
BTCWine/
├── ARCHITECTURE.md        # Technical architecture (standalone)
├── Dockerfile
├── docker-compose.yml
├── mkdocs.yml             # MkDocs configuration
├── requirements.txt
├── docs/
│   ├── index.md           # Documentation home page
│   └── architecture.md    # Technical architecture (rendered)
└── README.md
```

## Build Static Site

```bash
mkdocs build
```

Output will be in the `site/` directory.
