# JobEscrow

Minimal native-MON escrow for Zeno annotation jobs on **Monad
testnet** (chain id `10143`). It holds the money and enforces four rules; the
platform database remains the source of truth for annotation/task state.

Rules enforced on-chain:

1. only allow-listed **relayers** (the backend signer) may settle;
2. a task can be settled **at most once**;
3. cumulative payouts for a job never exceed its **funded budget**;
4. every settlement emits `TaskSettled(jobId, taskId, payee, amount, annotationHash)`,
   which the backend decodes and verifies before recording `is_mock = false`.

## Layout

```
src/JobEscrow.sol        the contract
test/JobEscrow.t.sol     34 unit + fuzz tests (money rules)
script/Deploy.s.sol      deploy + add relayer
script/FundJob.s.sol     fund a platform job
```

## Build & test

```bash
cd contracts
forge build
forge test -vv
```

`forge test` needs no network beyond downloading the pinned `solc`.

## Keys (never committed)

Create a `contracts/.env` (git-ignored) or export in your shell:

```bash
export DEPLOYER_PRIVATE_KEY=0x...   # funded Monad-testnet key -> becomes the owner
export SETTLEMENT_RELAYER=0x...     # backend signer; MUST differ from the deployer
```

## Deploy to Monad testnet

```bash
forge script script/Deploy.s.sol:DeployJobEscrow \
  --rpc-url monad_testnet \
  --broadcast
```

Then set on the backend: `JOB_ESCROW_ADDRESS`, `MONAD_RPC_URL`,
`SETTLEMENT_PRIVATE_KEY` (the relayer key) and `SETTLEMENT_FORBIDDEN_ADDRESS`
(comma-separated known-compromised addresses). Settlement only runs for real when
all of them are present **and** the fail-closed preflight passes
(`cd backend && npm run settlement:preflight`); otherwise receipts stay
`is_mock = true`.

## Fund a job

```bash
export JOB_ESCROW_ADDRESS=0x...
export JOB_ID_HASH=$(cast keccak "$JOB_UUID")
export JOB_FUND_WEI=100000000000000000   # 0.1 MON
forge script script/FundJob.s.sol:FundJob --rpc-url monad_testnet --broadcast
```

## Key derivation the backend must match

`jobId` and `taskId` are `keccak256(utf8(<uuid>))`; the per-task settlement key
is `keccak256(abi.encodePacked(jobId, taskId))` (see `taskKey`).
