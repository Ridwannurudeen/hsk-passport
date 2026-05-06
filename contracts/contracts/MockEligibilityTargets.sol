// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

contract MockEligibilityPassport {
    mapping(uint256 => bool) public groupAccepted;

    function setGroupAccepted(uint256 groupId, bool accepted) external {
        groupAccepted[groupId] = accepted;
    }

    function verifyCredential(
        uint256 groupId,
        ISemaphore.SemaphoreProof calldata proof
    ) external view returns (bool) {
        return groupAccepted[groupId] && proof.merkleTreeRoot == groupId;
    }
}

contract MockEligibilityFreshness {
    bool public accepted = true;

    function setAccepted(bool next) external {
        accepted = next;
    }

    function previewVerifyFresh(
        uint256 groupId,
        uint256 merkleRoot,
        uint256,
        uint256,
        uint256,
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata
    ) external view returns (bool) {
        return accepted && groupId != 0 && merkleRoot != 0;
    }
}
