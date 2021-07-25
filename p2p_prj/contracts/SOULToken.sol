// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SOULToken is ERC20{
    
    event votersFunded();
    
    constructor(uint256 initialSupply) ERC20("Soul", "SOUL"){
        _mint(msg.sender, initialSupply);
    }
    
    function fundVoters(address[] memory voters) public{
        uint fundedAmount = balanceOf(msg.sender) / voters.length;
        for(uint i=0; i < voters.length; i++){
            transfer(voters[i], fundedAmount);    
        }
        emit votersFunded();
    }
}
