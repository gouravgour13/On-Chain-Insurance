import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  checkConnection,
  getBalance,
  getConfig,
  invokeRead,
  retrievePublicKey,
  invokeWrite,
  invokeWriteWithResult,
} from "./lib/soroban";

type PoolStatus = {
  total_policies: string;
  active_policies: string;
  total_claims: string;
  settled_claims: string;
};

type PolicyRecord = {
  policy_id: number;
  coverage_amount: number;
  premium_paid: number;
  start_time: number;
  end_time: number;
  is_active: boolean;
  is_claimed: boolean;
};

type ClaimRecord = {
  claim_id: number;
  policy_id: number;
  claim_amount: number;
  filed_time: number;
  is_settled: boolean;
};

const initialPool: PoolStatus = {
  total_policies: "0",
  active_policies: "0",
  total_claims: "0",
  settled_claims: "0",
};

// Helper to safely serialize objects with BigInt values
function safeJsonStringify(value: unknown, space?: number): string {
  return JSON.stringify(
    value,
    (_, val) => {
      if (typeof val === "bigint") {
        return val.toString();
      }
      return val;
    },
    space,
  );
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object") {
    if ("message" in error && typeof (error as any).message === "string") {
      return (error as any).message;
    }
    try {
      return safeJsonStringify(error);
    } catch {
      return "Unknown error";
    }
  }
  return String(error);
}

function asDisplayString(value: unknown): string {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "0";
  }
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "0";
  }
  return "0";
}

function normalizePoolStatus(raw: unknown): PoolStatus {
  const obj = (raw ?? {}) as Record<string, unknown>;
  return {
    total_policies: asDisplayString(obj.total_policies),
    active_policies: asDisplayString(obj.active_policies),
    total_claims: asDisplayString(obj.total_claims),
    settled_claims: asDisplayString(obj.settled_claims),
  };
}

export default function App() {
  const [wallet, setWallet] = useState<string>("");
  const [pubKey, setPubKey] = useState<string>("");
  const [balance, setBalance] = useState<string>("0.00");
  const [connected, setConnected] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("Ready");
  const [pool, setPool] = useState<PoolStatus>(initialPool);
  const [policy, setPolicy] = useState<PolicyRecord | null>(null);
  const [claim, setClaim] = useState<ClaimRecord | null>(null);
  const [loadingPool, setLoadingPool] = useState<boolean>(false);
  const [lastPolicyId, setLastPolicyId] = useState<string>("0");
  const [lastClaimId, setLastClaimId] = useState<string>("0");

  const [createForm, setCreateForm] = useState({
    coverage: "1000",
    premium: "100",
    duration: "604800",
  });
  const [claimForm, setClaimForm] = useState({
    policyId: "1",
    claimAmount: "100",
  });
  const [settleForm, setSettleForm] = useState({
    claimId: "1",
  });
  const [viewPolicyId, setViewPolicyId] = useState("1");
  const [viewClaimId, setViewClaimId] = useState("1");

  const cfg = useMemo(() => getConfig(), []);

  const reportError = (action: string, error: unknown) => {
    const message = extractErrorMessage(error);
    setStatus(message);
    console.error(`[${action}]`, error);
  };

  // Auto-refresh pool when wallet connects
  useEffect(() => {
    if (connected && wallet) {
      const loadPool = async () => {
        setLoadingPool(true);
        try {
          const result = await invokeRead<unknown>(
            "view_pool_status",
            [],
            wallet,
          );
          setPool(normalizePoolStatus(result));
        } catch (error) {
          console.warn("Failed to auto-load pool data:", error);
        } finally {
          setLoadingPool(false);
        }
      };
      loadPool();
    }
  }, [connected, wallet]);

  const connectWallet = async (): Promise<void> => {
    try {
      const allowed = await checkConnection();

      if (!allowed) {
        setStatus("Permission denied");
        alert("Permission denied");
        return;
      }

      const key = await retrievePublicKey();
      const bal = await getBalance(key);

      setPubKey(key);
      setBalance(Number(bal).toFixed(2));
      setConnected(true);
      setWallet(key);
      setStatus("Wallet connected");
    } catch (e: unknown) {
      console.error("[Connect Wallet]", e);
      reportError("Connect Freighter", e);
    }
  };

  const getReadAddress = async (): Promise<string> => {
    if (wallet) {
      return wallet;
    }

    const key = await retrievePublicKey();
    setWallet(key);
    setPubKey(key);
    setConnected(true);
    return key;
  };

  const refreshPool = async () => {
    setLoadingPool(true);
    try {
      const readAddress = await getReadAddress();
      const result = await invokeRead<unknown>(
        "view_pool_status",
        [],
        readAddress,
      );
      setPool(normalizePoolStatus(result));
      setStatus("Pool status updated");
    } catch (error) {
      reportError("Refresh Pool", error);
    } finally {
      setLoadingPool(false);
    }
  };

  const onCreatePolicy = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const { hash, result } = await invokeWriteWithResult<number>(
        "create_policy",
        [
          Number(createForm.coverage),
          Number(createForm.premium),
          Number(createForm.duration),
        ],
      );
      const policyId = String(result);
      setLastPolicyId(policyId);
      setClaimForm({ ...claimForm, policyId });
      setViewPolicyId(policyId);
      setStatus(`✓ Policy created with ID: ${policyId}. Tx: ${hash}`);
      await refreshPool();
    } catch (error) {
      reportError("Create Policy", error);
    }
  };

  const onFileClaim = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const { hash, result } = await invokeWriteWithResult<number>(
        "file_claim",
        [Number(claimForm.policyId), Number(claimForm.claimAmount)],
      );
      const claimId = String(result);
      setLastClaimId(claimId);
      setSettleForm({ claimId });
      setViewClaimId(claimId);
      setStatus(`✓ Claim filed with ID: ${claimId}. Tx: ${hash}`);
      await refreshPool();
    } catch (error) {
      reportError("File Claim", error);
    }
  };

  const onSettleClaim = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const hash = await invokeWrite("settle_claim", [
        Number(settleForm.claimId),
      ]);
      setStatus(`✓ Claim settled. Tx: ${hash}`);
      await refreshPool();
    } catch (error) {
      reportError("Settle Claim", error);
    }
  };

  const loadPolicy = async () => {
    try {
      const readAddress = await getReadAddress();
      const result = await invokeRead<PolicyRecord>(
        "view_policy",
        [Number(viewPolicyId)],
        readAddress,
      );
      setPolicy(result);
      setStatus("Policy loaded");
    } catch (error) {
      reportError("View Policy", error);
    }
  };

  const loadClaim = async () => {
    try {
      const readAddress = await getReadAddress();
      const result = await invokeRead<ClaimRecord>(
        "view_claim",
        [Number(viewClaimId)],
        readAddress,
      );
      setClaim(result);
      setStatus("Claim loaded");
    } catch (error) {
      reportError("View Claim", error);
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <p className="kicker">Stellar Soroban DApp</p>
        <h1>On-Chain Insurance Console</h1>
        <p className="subtitle">
          Manage policy creation, claim filing, and settlement directly against
          your deployed insurance contract.
        </p>
        <div className="connection-row">
          <button onClick={connectWallet}>Connect Freighter</button>
          <span>
            {connected
              ? `Wallet: ${pubKey || wallet} | XLM: ${balance}`
              : "Wallet not connected"}
          </span>
        </div>
      </header>

      <section className="meta-grid">
        <article>
          <h2>Network</h2>
          <p>{cfg.networkPassphrase}</p>
        </article>
        <article>
          <h2>RPC URL</h2>
          <p>{cfg.rpcUrl}</p>
        </article>
        <article>
          <h2>Contract ID</h2>
          <p>{cfg.contractId || "Missing in .env"}</p>
        </article>
      </section>

      <section className="panel-grid">
        <article className="panel">
          <h3>Pool Status</h3>
          <button onClick={refreshPool} disabled={loadingPool}>
            {loadingPool ? "Loading..." : "Refresh Pool"}
          </button>
          <dl>
            <dt>Total Policies</dt>
            <dd>{loadingPool ? "..." : pool.total_policies}</dd>
            <dt>Active Policies</dt>
            <dd>{loadingPool ? "..." : pool.active_policies}</dd>
            <dt>Total Claims</dt>
            <dd>{loadingPool ? "..." : pool.total_claims}</dd>
            <dt>Settled Claims</dt>
            <dd>{loadingPool ? "..." : pool.settled_claims}</dd>
          </dl>
        </article>

        <article className="panel">
          <h3>Create Policy</h3>
          <form onSubmit={onCreatePolicy}>
            <label>
              Coverage Amount
              <input
                type="number"
                min="1"
                value={createForm.coverage}
                onChange={(e) =>
                  setCreateForm({ ...createForm, coverage: e.target.value })
                }
              />
            </label>
            <label>
              Premium Paid
              <input
                type="number"
                min="1"
                value={createForm.premium}
                onChange={(e) =>
                  setCreateForm({ ...createForm, premium: e.target.value })
                }
              />
            </label>
            <label>
              Duration Seconds
              <input
                type="number"
                min="1"
                value={createForm.duration}
                onChange={(e) =>
                  setCreateForm({ ...createForm, duration: e.target.value })
                }
              />
            </label>
            <button type="submit">Submit Transaction</button>
          </form>
        </article>

        <article className="panel">
          <h3>File Claim</h3>
          {lastPolicyId !== "0" && (
            <p style={{ color: "green", fontSize: "0.9em" }}>
              Using policy ID: {lastPolicyId} (from last created policy)
            </p>
          )}
          <form onSubmit={onFileClaim}>
            <label>
              Policy ID
              <input
                type="number"
                min="1"
                value={claimForm.policyId}
                onChange={(e) =>
                  setClaimForm({ ...claimForm, policyId: e.target.value })
                }
              />
            </label>
            <label>
              Claim Amount
              <input
                type="number"
                min="1"
                value={claimForm.claimAmount}
                onChange={(e) =>
                  setClaimForm({ ...claimForm, claimAmount: e.target.value })
                }
              />
            </label>
            <button type="submit">Submit Transaction</button>
          </form>
        </article>

        <article className="panel">
          <h3>Settle Claim</h3>
          {lastClaimId !== "0" && (
            <p style={{ color: "green", fontSize: "0.9em" }}>
              Using claim ID: {lastClaimId} (from last filed claim)
            </p>
          )}
          <form onSubmit={onSettleClaim}>
            <label>
              Claim ID
              <input
                type="number"
                min="1"
                value={settleForm.claimId}
                onChange={(e) => setSettleForm({ claimId: e.target.value })}
              />
            </label>
            <button type="submit">Submit Transaction</button>
          </form>
        </article>

        <article className="panel">
          <h3>View Policy</h3>
          <div className="inline-controls">
            <input
              type="number"
              min="1"
              value={viewPolicyId}
              onChange={(e) => setViewPolicyId(e.target.value)}
            />
            <button onClick={loadPolicy}>Fetch</button>
          </div>
          <pre>{safeJsonStringify(policy, 2)}</pre>
        </article>

        <article className="panel">
          <h3>View Claim</h3>
          <div className="inline-controls">
            <input
              type="number"
              min="1"
              value={viewClaimId}
              onChange={(e) => setViewClaimId(e.target.value)}
            />
            <button onClick={loadClaim}>Fetch</button>
          </div>
          <pre>{safeJsonStringify(claim, 2)}</pre>
        </article>
      </section>

      <footer className="status">Status: {status}</footer>
    </div>
  );
}
