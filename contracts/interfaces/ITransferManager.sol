pragma solidity ^0.5.0;

/**
 * @title Interface to be implemented by all Transfer Manager modules
 */
interface ITransferManager {
    //  If verifyTransfer returns:
    //  FORCE_VALID, the transaction will always be valid, regardless of other TM results
    //  INVALID, then the transfer should not be allowed regardless of other TM results
    //  VALID, then the transfer is valid for this TM
    //  NA, then the result from this TM is ignored
    enum Result {INVALID, NA, VALID, FORCE_VALID}

    /**
     * @notice Determines if the transfer between these two accounts can happen
     */
    function executeTransfer(address _from, address _to, uint256 _amount, bytes calldata _data) external returns(Result);

    function verifyTransfer(address _from, address _to, uint256 _amount, bytes calldata _data) external view returns(Result, bytes32);

    /**
     * @notice return the amount of tokens for a given user as per the partition
     * @param _partition Identifier
     * @param _tokenHolder Whom token amount need to query
     */
    function getTokensByPartition(bytes32 _partition, address _tokenHolder) external view returns(uint256);

    /**
     * @notice return the list of partitions for a tokenHolder
     * @param _tokenHolder Whom token amount need to query
     */
    function getPartitions(address _tokenHolder) external view returns(bytes32[] memory);

}
