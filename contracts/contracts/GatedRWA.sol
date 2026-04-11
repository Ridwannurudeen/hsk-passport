// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

/// @title GatedRWA — Demo ERC-20 token gated by HSK Passport KYC credentials
/// @notice Shows how any dApp on HashKey Chain can require ZK KYC proof before interacting.
/// @dev Minimal ERC-20 with KYC-gated minting via Semaphore proof verification.
contract GatedRWA {
    string public constant name = "HashKey Silver Token";
    string public constant symbol = "hSILVER";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    ISemaphore public immutable semaphore;
    uint256 public immutable requiredGroupId;
    uint256 public mintAmount;
    address public owner;

    /// @dev nullifier => whether it's been used for minting
    mapping(uint256 => bool) public usedNullifiers;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event KYCMint(address indexed to, uint256 amount, uint256 nullifier);

    error InvalidProof();
    error NullifierAlreadyUsed();
    error NotOwner();

    constructor(ISemaphore _semaphore, uint256 _requiredGroupId, uint256 _mintAmount) {
        semaphore = _semaphore;
        requiredGroupId = _requiredGroupId;
        mintAmount = _mintAmount;
        owner = msg.sender;
    }

    /// @notice Mint tokens by proving KYC credential via ZK proof
    /// @param proof Semaphore proof proving membership in the required KYC group
    function kycMint(ISemaphore.SemaphoreProof calldata proof) external {
        if (usedNullifiers[proof.nullifier]) revert NullifierAlreadyUsed();

        bool valid = semaphore.verifyProof(requiredGroupId, proof);
        if (!valid) revert InvalidProof();

        usedNullifiers[proof.nullifier] = true;

        balanceOf[msg.sender] += mintAmount;
        totalSupply += mintAmount;

        emit Transfer(address(0), msg.sender, mintAmount);
        emit KYCMint(msg.sender, mintAmount, proof.nullifier);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        allowance[from][msg.sender] -= value;
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
        return true;
    }
}
