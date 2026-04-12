// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

interface IHSKPassport {
    function verifyCredential(
        uint256 groupId,
        ISemaphore.SemaphoreProof calldata proof
    ) external view returns (bool);
}

/// @title KYCGatedLending — Accredited-investor-only lending pool
/// @notice Anyone can deposit, but borrowing above threshold requires ACCREDITED_INVESTOR proof.
/// @dev Demonstrates per-group credential separation in HSK Passport.
contract KYCGatedLending {
    IHSKPassport public immutable passport;
    uint256 public immutable accreditedGroupId;

    uint256 public totalDeposits;
    uint256 public totalBorrowed;
    uint256 public constant RETAIL_LIMIT = 10 ether;

    mapping(address => uint256) public deposits;
    mapping(address => uint256) public borrows;

    /// @dev nullifier => borrow round claim (prevents reuse of same proof for multiple borrows)
    mapping(uint256 => bool) public usedBorrowNullifiers;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event BorrowedRetail(address indexed user, uint256 amount);
    event BorrowedAccredited(address indexed user, uint256 amount, uint256 nullifier);
    event Repaid(address indexed user, uint256 amount);

    error InvalidProof();
    error NullifierAlreadyUsed();
    error ProofNotBoundToCaller();
    error InsufficientLiquidity();
    error ExceedsRetailLimit();
    error NothingToRepay();
    error CannotWithdrawBorrowed();

    constructor(address _passport, uint256 _accreditedGroupId) {
        passport = IHSKPassport(_passport);
        accreditedGroupId = _accreditedGroupId;
    }

    // ============================================================
    // Deposits (no KYC required)
    // ============================================================

    function deposit() external payable {
        deposits[msg.sender] += msg.value;
        totalDeposits += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        if (amount > deposits[msg.sender]) revert CannotWithdrawBorrowed();
        deposits[msg.sender] -= amount;
        totalDeposits -= amount;
        payable(msg.sender).transfer(amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ============================================================
    // Borrowing (retail = no KYC, capped; accredited = requires proof, uncapped)
    // ============================================================

    /// @notice Retail borrow — no KYC, but capped at RETAIL_LIMIT
    function borrowRetail(uint256 amount) external {
        if (amount > RETAIL_LIMIT) revert ExceedsRetailLimit();
        if (amount > address(this).balance) revert InsufficientLiquidity();
        borrows[msg.sender] += amount;
        totalBorrowed += amount;
        payable(msg.sender).transfer(amount);
        emit BorrowedRetail(msg.sender, amount);
    }

    /// @notice Accredited borrow — requires ACCREDITED_INVESTOR credential proof.
    /// @param amount Loan amount
    /// @param proof Semaphore proof with message = caller address, scope = loan id
    function borrowAccredited(
        uint256 amount,
        ISemaphore.SemaphoreProof calldata proof
    ) external {
        if (proof.message != uint256(uint160(msg.sender))) revert ProofNotBoundToCaller();
        if (usedBorrowNullifiers[proof.nullifier]) revert NullifierAlreadyUsed();
        if (amount > address(this).balance) revert InsufficientLiquidity();
        if (!passport.verifyCredential(accreditedGroupId, proof)) revert InvalidProof();

        usedBorrowNullifiers[proof.nullifier] = true;
        borrows[msg.sender] += amount;
        totalBorrowed += amount;
        payable(msg.sender).transfer(amount);
        emit BorrowedAccredited(msg.sender, amount, proof.nullifier);
    }

    function repay() external payable {
        uint256 debt = borrows[msg.sender];
        if (debt == 0) revert NothingToRepay();
        uint256 toRepay = msg.value > debt ? debt : msg.value;
        borrows[msg.sender] -= toRepay;
        totalBorrowed -= toRepay;
        if (msg.value > toRepay) {
            payable(msg.sender).transfer(msg.value - toRepay);
        }
        emit Repaid(msg.sender, toRepay);
    }

    function availableLiquidity() external view returns (uint256) {
        return address(this).balance;
    }
}
