// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

interface IHSKPassport {
    function verifyCredential(
        uint256 groupId,
        ISemaphore.SemaphoreProof calldata proof
    ) external view returns (bool);
}

/// @title KYCGatedAirdrop — Per-address airdrop gated by ZK KYC credential
/// @notice One claim per round per identity via action-scoped nullifiers.
/// @dev Demonstrates sybil-resistant airdrop via Semaphore scopes.
contract KYCGatedAirdrop {
    IHSKPassport public immutable passport;
    uint256 public immutable requiredGroupId;

    uint256 public currentRound;
    uint256 public claimAmount;
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    /// @dev round => nullifier => claimed
    mapping(uint256 => mapping(uint256 => bool)) public claimed;

    event Claimed(uint256 indexed round, address indexed to, uint256 amount, uint256 nullifier);
    event RoundStarted(uint256 indexed round, uint256 amount);

    error InvalidProof();
    error AlreadyClaimed();
    error ProofNotBoundToCaller();
    error WrongScope();

    constructor(
        address _passport,
        uint256 _requiredGroupId,
        uint256 _claimAmount,
        string memory _name,
        string memory _symbol
    ) {
        passport = IHSKPassport(_passport);
        requiredGroupId = _requiredGroupId;
        claimAmount = _claimAmount;
        name = _name;
        symbol = _symbol;
        currentRound = 1;
        emit RoundStarted(1, _claimAmount);
    }

    /// @notice Claim airdrop with ZK proof. One claim per round per identity.
    /// @param proof Semaphore proof. Must have scope = currentRound and message = caller address.
    function claim(ISemaphore.SemaphoreProof calldata proof) external {
        if (proof.message != uint256(uint160(msg.sender))) revert ProofNotBoundToCaller();
        if (proof.scope != currentRound) revert WrongScope();
        if (claimed[currentRound][proof.nullifier]) revert AlreadyClaimed();
        if (!passport.verifyCredential(requiredGroupId, proof)) revert InvalidProof();

        claimed[currentRound][proof.nullifier] = true;
        balanceOf[msg.sender] += claimAmount;
        totalSupply += claimAmount;

        emit Claimed(currentRound, msg.sender, claimAmount, proof.nullifier);
    }

    /// @notice Start a new airdrop round — resets nullifier tracking (different scope).
    function startNewRound(uint256 newAmount) external {
        // For demo: anyone can start a new round
        currentRound++;
        claimAmount = newAmount;
        emit RoundStarted(currentRound, newAmount);
    }

    function hasClaimedInRound(uint256 round, uint256 nullifier) external view returns (bool) {
        return claimed[round][nullifier];
    }
}
