# Task: Scaffold Side Projects Monorepo

Please execute the following steps to set up my local monorepo for side projects.

## 1. Initialize the Root Directory
1. Create a root folder named `my-side-projects`.
2. Navigate into `my-side-projects`.
3. Initialize a new empty Git repository (`git init`).

## 2. Create the Category Directories
Inside `my-side-projects`, create the following subdirectories:
- `ai-machine-learning/`
- `cloud-and-aws/`
- `hackathon-mvps/`
- `fintech/`
- `web3-blockchain/`
- `core-software-dev/`

## 3. Create the Global `.gitignore`
Create a `.gitignore` file in the root directory and add the following standard ignores for Node, Python, and Java environments:

```text
# General
.env
.env.local
.DS_Store
node_modules/
dist/
build/

# Python
__pycache__/
*.py[cod]
*$py.class
venv/
env/
.pytest_cache/

# Java
*.class
*.log
.mtj.tmp/
*.jar
*.war
*.nar
*.ear
*.zip
*.tar.gz
*.rar

# IDEs
.vscode/
.idea/

4. Create the Master Menu README.md
Create a README.md file in the root directory with the following content:

# My Side Projects Monorepo

This repository contains all my independent side projects, organized by domain. Each project within these directories is completely self-contained with its own dependencies and configuration.

my-side-projects/
├── .git/                        <- Initialized only once at this root folder
├── .gitignore                   <- Global ignores (e.g., node_modules, venv, .env)
├── README.md                    <- The "Master Menu": lists and links to all your projects
│
├── ai-machine-learning/         <- For model training, NLP, and GenAI wrappers
│   ├── image-generator-bot/     <- (Has its own requirements.txt / app.py)
│   └── data-analysis-script/
│
├── cloud/               <- For cloud architecture and serverless deployments
│   ├── serverless-api-gateway/  
│   └── s3-image-uploader/
│
├── hackathon-mvps/              <- Quick prototypes and pitch-ready startup builds
│   ├── health-companion-app/    <- (Has its own package.json / Next.js setup like your 'rawt' repo)
│   └── event-ticketing-system/
│
├── fintech/                     <- Financial technology and data structures
│   ├── personal-expense-tracker/
│   └── algorithmic-trading-sim/
│
├── web3-blockchain/             <- Smart contracts and decentralized apps
│   ├── token-minting-dapp/
│   └── simple-wallet-ui/
│
└── core-software-dev/           <- General programming (Java, COBOL, Python)
    ├── java-inventory-system/
    └── algorithms-practice/