import { describe, it, expect } from "vitest";
import { contracts, accounts, simnet } from "@hirosystems/clarinet-sdk/vitest-helpers";

const CONTRACT_NAME = "tokenized-real-estate";

// Helper to call public functions
const vault = () => contracts[CONTRACT_NAME];

describe("Tokenized Real Estate Liquidity Vault", () => {
  it("only owner can set property metadata", () => {
    const deployer = accounts.deployer;
    const investor = accounts.wallet_1;

    // Owner can set metadata
    const okTx = simnet.callPublicFn(
      CONTRACT_NAME,
      "set-property-metadata",
      [
        '"Beach Villa"',
        '"Luxury beachfront property for fractional ownership"',
        "u100000000" // 100 STX target in uSTX
      ],
      deployer
    );

    expect(okTx.result).toBeOk();

    // Non-owner should fail
    const errTx = simnet.callPublicFn(
      CONTRACT_NAME,
      "set-property-metadata",
      [
        '"Wrong"',
        '"Should not be allowed"',
        "u1"
      ],
      investor
    );

    expect(errTx.result).toBeErr();
    // Error code u100 is ERR-NOT-OWNER
    expect(errTx.result).toHaveErrorCode(100n);
  });

  it("deposits liquidity and mints shares 1:1 with uSTX", () => {
    const investor = accounts.wallet_1;

    const depositAmount = 100_000_000n; // 100 STX in uSTX

    const tx = simnet.callPublicFn(
      CONTRACT_NAME,
      "deposit-liquidity",
      [
        `u${depositAmount.toString()}`,
      ],
      investor
    );

    expect(tx.result).toBeOk();

    // Check investor shares
    const balance = simnet.callReadOnlyFn(
      CONTRACT_NAME,
      "get-investor-shares",
      [investor.principal],
      investor
    );

    expect(balance.result).toBeUint(depositAmount);

    // Check totals
    const totalLiquidity = simnet.callReadOnlyFn(
      CONTRACT_NAME,
      "get-total-liquidity",
      [],
      investor
    );
    expect(totalLiquidity.result).toBeUint(depositAmount);

    const totalShares = simnet.callReadOnlyFn(
      CONTRACT_NAME,
      "get-total-shares",
      [],
      investor
    );
    expect(totalShares.result).toBeUint(depositAmount);
  });

  it("rejects zero-amount deposits", () => {
    const investor = accounts.wallet_1;

    const tx = simnet.callPublicFn(
      CONTRACT_NAME,
      "deposit-liquidity",
      ["u0"],
      investor
    );

    expect(tx.result).toBeErr();
    // ERR-ZERO-AMOUNT = u101
    expect(tx.result).toHaveErrorCode(101n);
  });

  it("redeems liquidity and updates balances", () => {
    const investor = accounts.wallet_2;
    const depositAmount = 50_000_000n; // 50 STX

    // First deposit
    const depositTx = simnet.callPublicFn(
      CONTRACT_NAME,
      "deposit-liquidity",
      [`u${depositAmount.toString()}`],
      investor
    );
    expect(depositTx.result).toBeOk();

    // Then redeem half
    const redeemAmount = 25_000_000n;
    const redeemTx = simnet.callPublicFn(
      CONTRACT_NAME,
      "redeem-liquidity",
      [`u${redeemAmount.toString()}`],
      investor
    );
    expect(redeemTx.result).toBeOk();

    // Updated investor shares
    const balance = simnet.callReadOnlyFn(
      CONTRACT_NAME,
      "get-investor-shares",
      [investor.principal],
      investor
    );
    expect(balance.result).toBeUint(depositAmount - redeemAmount);

    // Total shares and liquidity should also be reduced
    const totalLiquidity = simnet.callReadOnlyFn(
      CONTRACT_NAME,
      "get-total-liquidity",
      [],
      investor
    );
    expect(totalLiquidity.result).toHaveClarityType("uint");

    const totalShares = simnet.callReadOnlyFn(
      CONTRACT_NAME,
      "get-total-shares",
      [],
      investor
    );
    expect(totalShares.result).toHaveClarityType("uint");
  });

  it("prevents redeeming more shares than owned", () => {
    const investor = accounts.wallet_3;

    const depositAmount = 10_000_000n; // 10 STX
    const depositTx = simnet.callPublicFn(
      CONTRACT_NAME,
      "deposit-liquidity",
      [`u${depositAmount.toString()}`],
      investor
    );
    expect(depositTx.result).toBeOk();

    const redeemTooMuch = 20_000_000n; // try to redeem 20 STX
    const redeemTx = simnet.callPublicFn(
      CONTRACT_NAME,
      "redeem-liquidity",
      [`u${redeemTooMuch.toString()}`],
      investor
    );

    expect(redeemTx.result).toBeErr();
    // ERR-INSUFFICIENT-SHARES = u102
    expect(redeemTx.result).toHaveErrorCode(102n);
  });
});
