// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Collateralized Loan Contract
contract CollateralizedLoan {
    // Define the structure of a loan
    struct Loan {
        address borrower;
        // Hint: Add a field for the lender's address
        address lender;
        
        uint collateralAmount;
        // Hint: Add fields for loan amount, interest rate, due date, isFunded, isRepaid
        uint loanAmount;
        uint interestRate;
        uint dueDate;
        bool isFunded;
        bool isRepaid;
        
        // since we have isRepaid, we add this to track if collateral is claimed
        bool collateralClaimed;
    }

    // Create a mapping to manage the loans
    mapping(uint => Loan) public loans;
    
    uint public nextLoanId;

    // Hint: Define events for loan requested, funded, repaid, and collateral claimed
    event LoanRequested(uint indexed loanId, address indexed borrower, uint collateralAmount, uint loanAmount, uint interestRate, uint dueDate);
    event LoanFunded(uint indexed loanId, address indexed lender);
    event LoanRepaid(uint indexed loanId);
    event CollateralClaimed(uint indexed loanId);

    // Custom Modifiers
    // Hint: Write a modifier to check if a loan exists
    modifier loanExists(uint _id) {
        require(_id < nextLoanId, "Loan does not exist");
        _;
    }
    // Hint: Write a modifier to ensure a loan is not already funded
    modifier notFunded(uint _id) {
        require(!loans[_id].isFunded, "Loan already funded");
        _;
    }
    
    modifier isFunded(uint _id) {
        require(loans[_id].isFunded, "Loan not funded");
        _;
    }

    modifier isNotRepaid(uint _id) {
        require(!loans[_id].isRepaid, "Loan already repaid");
        _;
    }

    // Function to deposit collateral and request a loan
    function depositCollateralAndRequestLoan(uint _interestRate, uint _duration) external payable {
        require(_duration > 0, "Duration must be > 0");
        require(_interestRate > 0 && _interestRate <= 10000, "Rate must be > 0 and <= 10000 (basis points)");

        // Hint: Check if the collateral is more than 0
        require(msg.value > 0, "Collateral must be > 0");

        // Hint: Calculate the loan amount based on the collateralized amount
        uint loanAmount = msg.value * 100 / 150; // 150% collateralization ratio in this case (could be other ratios)

        // Hint: Increment nextLoanId and create a new loan in the loans mapping
        uint loanId = nextLoanId++;
        loans[loanId] = Loan({
            borrower: msg.sender,
            lender: address(0), // actual lender address to be set when funded
            collateralAmount: msg.value,
            loanAmount: loanAmount,
            interestRate: _interestRate,
            dueDate: block.timestamp + _duration,
            isFunded: false,
            isRepaid: false,
            collateralClaimed: false
        });
        // Hint: Emit an event for loan request
        emit LoanRequested(loanId, msg.sender, msg.value, loanAmount, _interestRate, block.timestamp + _duration);
    }

    // Function to fund a loan
    // Hint: Write the fundLoan function with necessary checks and logic
    function fundLoan(uint _id) external payable loanExists(_id) notFunded(_id) {
        Loan storage loan = loans[_id];
        require(msg.sender != loan.borrower, "Borrower cannot fund");
        require(msg.value == loan.loanAmount, "Incorrect amount");

        loan.lender = msg.sender;
        loan.isFunded = true;

        // .call is better than .transfer or .send for sending ether
        // because it forwards all available gas and reverts on failure
        (bool sent, ) = loan.borrower.call{value: msg.value}("");
        require(sent, "Transfer failed");

        emit LoanFunded(_id, msg.sender);
    }

    // Function to repay a loan
    // Hint: Write the repayLoan function with necessary checks and logic
    function repayLoan(uint _id) external payable loanExists(_id) isFunded(_id) isNotRepaid(_id) {
        Loan storage loan = loans[_id];
        require(msg.sender == loan.borrower, "Not borrower");

        uint interest = loan.loanAmount * loan.interestRate / 10000;
        uint totalDue = loan.loanAmount + interest;
        require(msg.value == totalDue, "Incorrect repay amount");

        loan.isRepaid = true;

        (bool sent, ) = loan.lender.call{value: msg.value}("");
        require(sent, "Payment failed");

        (sent, ) = loan.borrower.call{value: loan.collateralAmount}("");
        require(sent, "Collateral return failed");

        emit LoanRepaid(_id);
    }

    // Function to claim collateral on default
    // Hint: Write the claimCollateral function with necessary checks and logic
    function claimCollateral(uint _id) external loanExists(_id) isFunded(_id)  isNotRepaid(_id) {
        Loan storage loan = loans[_id];
        require(msg.sender == loan.lender, "Not lender");

        require(!loan.collateralClaimed, "Collateral already claimed");
        require(block.timestamp > loan.dueDate, "Loan not defaulted");

        loan.collateralClaimed = true;

        (bool sent, ) = loan.lender.call{value: loan.collateralAmount}("");
        require(sent, "Collateral transfer failed");

        emit CollateralClaimed(_id);
    }
}
