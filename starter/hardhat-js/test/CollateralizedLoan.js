// Importing necessary modules and functions from Hardhat and Chai for testing
const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

// Describing a test suite for the CollateralizedLoan contract
describe("CollateralizedLoan", function () {
  // A fixture to deploy the contract before each test. This helps in reducing code repetition.
  async function deployCollateralizedLoanFixture() {
    // Deploying the CollateralizedLoan contract and returning necessary variables
    // TODO: Complete the deployment setup
    const [owner, borrower, lender, other] = await ethers.getSigners();

    const CollateralizedLoan = await ethers.getContractFactory(
      "CollateralizedLoan"
    );
    const loanContract = await CollateralizedLoan.deploy();
    await loanContract.waitForDeployment();

    return { loanContract, owner, borrower, lender, other };
  }

  // Helper constants (all bigint except interestRate, which is OK as a JS number)
  const COLLATERAL_RATIO = 150n; // must match contract
  const collateral = ethers.parseEther("1"); // bigint
  const interestRate = 500;                // 5 % (basis-points)
  const duration = 60 * 60 * 24 * 7;       // one week in seconds
  const expectedLoanAmount = (collateral * 100n) / COLLATERAL_RATIO;

  // Test suite for the loan request functionality
  describe("Loan Request", function () {
      // Loading the fixture
      // TODO: Set up test for depositing collateral and requesting a loan
      // HINT: Use .connect() to simulate actions from different accounts
      it("Should let a borrower deposit collateral and request a loan", async function () {
        const { loanContract, borrower } = await loadFixture(
          deployCollateralizedLoanFixture
        );

        const tx = await loanContract
          .connect(borrower)
          .depositCollateralAndRequestLoan(interestRate, duration, {
            value: collateral,
          });

        // Fetch the block timestamp to calculate the exact due date
        const receipt = await tx.wait();
        const block   = await ethers.provider.getBlock(receipt.blockNumber);
        const expectedDueDate = BigInt(block.timestamp) + BigInt(duration);

        await expect(tx)
          .to.emit(loanContract, "LoanRequested")
          .withArgs(
            0,
            borrower.address,
            collateral,
            expectedLoanAmount,
            interestRate,
            expectedDueDate
          );

        const loan = await loanContract.loans(0);
        expect(loan.borrower).to.equal(borrower.address);
        expect(loan.lender).to.equal(ethers.ZeroAddress);

        expect(loan.collateralAmount).to.equal(collateral);
        expect(loan.loanAmount).to.equal(expectedLoanAmount);
        expect(loan.interestRate).to.equal(BigInt(interestRate));

        expect(loan.dueDate).to.equal(expectedDueDate);

        expect(loan.isFunded).to.equal(false);
        expect(loan.isRepaid).to.equal(false);
        expect(loan.collateralClaimed).to.equal(false);
      });
  });

  // Test suite for funding a loan
  describe("Funding a Loan", function () {
    it("Allows a lender to fund a requested loan", async function () {
      // Loading the fixture
      // TODO: Set up test for a lender funding a loan
      // HINT: You'll need to check for an event emission to verify the action
      const { loanContract, borrower, lender } = await loadFixture(
        deployCollateralizedLoanFixture
      );

      await loanContract
        .connect(borrower)
        .depositCollateralAndRequestLoan(interestRate, duration, {
          value: collateral,
        });

      const tx = await loanContract
        .connect(lender)
        .fundLoan(0, { value: expectedLoanAmount });

      await expect(tx)
        .to.emit(loanContract, "LoanFunded")
        .withArgs(0, lender.address);

      const loan = await loanContract.loans(0);
      expect(loan.lender).to.equal(lender.address);
      expect(loan.isFunded).to.equal(true);
    });
  });

  // Test suite for repaying a loan
  describe("Repaying a Loan", function () {
    it("Enables the borrower to repay the loan fully", async function () {
      const { loanContract, borrower, lender } = await loadFixture(
        deployCollateralizedLoanFixture
      );

      // request + fund
      await loanContract
        .connect(borrower)
        .depositCollateralAndRequestLoan(interestRate, duration, {
          value: collateral,
        });
      await loanContract
        .connect(lender)
        .fundLoan(0, { value: expectedLoanAmount });

      const interest = (expectedLoanAmount * BigInt(interestRate)) / 10000n;
      const totalDue = expectedLoanAmount + interest;

      const tx = await loanContract
        .connect(borrower)
        .repayLoan(0, { value: totalDue });

      await expect(tx).to.emit(loanContract, "LoanRepaid").withArgs(0);

      const loan = await loanContract.loans(0);
      expect(loan.isRepaid).to.equal(true);
    });
  });

  // Test suite for claiming collateral
  describe("Claiming Collateral", function () {
      // Loading the fixture
      // TODO: Set up test for claiming collateral
      // HINT: Simulate the passage of time if necessary
      it("Permits the lender to claim collateral if the loan isn't repaid on time", async function () {
        const { loanContract, borrower, lender } = await loadFixture(
          deployCollateralizedLoanFixture
        );

        // request + fund
        await loanContract
          .connect(borrower)
          .depositCollateralAndRequestLoan(interestRate, duration, {
            value: collateral,
          });
        await loanContract
          .connect(lender)
          .fundLoan(0, { value: expectedLoanAmount });

        // Fast-forward past the due date
        await ethers.provider.send("evm_increaseTime", [duration + 1]);
        //await ethers.provider.send("evm_mine");

        const tx = await loanContract.connect(lender).claimCollateral(0);

        await expect(tx)
          .to.emit(loanContract, "CollateralClaimed")
          .withArgs(0);

        const loan = await loanContract.loans(0);
        expect(loan.collateralClaimed).to.equal(true);
      });
  });
});
