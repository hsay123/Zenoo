# JobEscrow

Minimal **USDC (ERC-20) escrow** for Zeno annotation jobs on **Base Sepolia**
(chain id `84532`); Base mainnet (`8453`) is blocked until the audit items in
`docs/AUDIT-2026-10.md` are closed and keys are rotated. It holds the money and
enforces the payout rules; the platform database remains the source of truth for
annotation/task state.

The token is fixed at deploy time. Every amount is in USDC base units
(6 decimals: `1 USDC = 1_000_000`). No function is payable — native ETH is
rejected.

Rules enforced on-chain:

1. only allow-listed **relayers** (the backend signer) may settle;
2. a task can be settled **at most once**;
3. cumulative payouts for a job never exceed its **funded budget**;
4. the first funder of a job is its **buyer**, and only the buyer may top it up;
5. the owner can withdraw unspent budget only after **closing** the job;
6. owner and relayer are **different** addresses (constructor-enforced);
7. token calls must succeed (a `false` return reverts) and a deposit is
   credited only if exactly the requested amount arrived;
8. every settlement emits `TaskSettled(jobId, taskId, payee, amount, annotationHash)`,
   which the backend decodes and verifies before recording `is_mock = false`.

`SETTLEMENT_ABI_VERSION` is `3` (ERC-20). The backend preflight refuses any
other value, including the v2 native-MON escrow from the prior Monad build.

## Layout

```
src/JobEscrow.sol          the contract
test/JobEscrow.t.sol       50 unit + fuzz tests (money rules, token failure modes)
test/mocks/MockUSDC.sol    6-decimal test token + misbehaving/re-entrant variants
script/Deploy.s.sol        deploy (Base Sepolia or anvil only)
script/FundJob.s.sol       approve + fund a platform job
```

## Build & test

```bash
cd contracts
forge build
forge test -vv
```

`forge test` needs no network beyond downloading the pinned `solc`.

## Keys (never committed)

Create a `contracts/.env` (git-ignored) or export in your shell. Use **fresh**
keys: the key from earlier development is compromised and must never be reused.

```bash
export DEPLOYER_PRIVATE_KEY=0x...   # Base Sepolia key with test ETH -> becomes the owner
export SETTLEMENT_RELAYER=0x...     # backend signer; MUST differ from the deployer
export USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e   # Circle test USDC on Base Sepolia
```

## Deploy to Base Sepolia

```bash
forge script script/Deploy.s.sol:DeployJobEscrow \
  --rpc-url base_sepolia \
  --broadcast
# optional verification (Etherscan v2 key): add --verify
```

The script refuses any chain other than Base Sepolia (84532) or anvil (31337)
and checks the token reports 6 decimals.

Then set on the backend: `CHAIN_ID=84532`, `RPC_URL`, `USDC_ADDRESS`,
`JOB_ESCROW_ADDRESS`, `SETTLEMENT_PRIVATE_KEY` (the relayer key) and
`SETTLEMENT_FORBIDDEN_ADDRESS` (comma-separated known-compromised addresses).
Settlement only runs for real when all of them are present **and** the
fail-closed preflight passes (`cd backend && npm run settlement:preflight`);
otherwise receipts stay `is_mock = true`.

## Fund a job

The funding key needs test USDC (Circle faucet) and a little test ETH for gas.

```bash
export JOB_ESCROW_ADDRESS=0x...
export JOB_ID_HASH=$(cast keccak "$JOB_UUID")
export JOB_FUND_UNITS=1000000   # 1 USDC
forge script script/FundJob.s.sol:FundJob --rpc-url base_sepolia --broadcast
```

## Key derivation the backend must match

`jobId` and `taskId` are `keccak256(utf8(<uuid>))`; the per-task settlement key
is `keccak256(abi.encodePacked(jobId, taskId))` (see `taskKey`).

## Prior work

Before HHG 2026 this contract was a native-MON escrow (ABI v2) on Monad testnet
(chain 10143); that deployment is described in `docs/STAGING.md` §4.2 as a
historical record. It is not compatible with the current backend.
