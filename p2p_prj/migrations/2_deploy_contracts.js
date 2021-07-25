var democraticElection = artifacts.require("./democraticElection.sol");
var soul = artifacts.require("./SOULToken.sol");
var MyContract = artifacts.require("./MyContract.sol");

module.exports = function(deployer, network, accounts) {
	candidates = [accounts[0], accounts[1], accounts[2]];
	var quorum = 3;
	var initialSupply = 10000;
	deployer.deploy(soul, initialSupply);
	if(network == "development") {
		deployer.deploy(democraticElection, candidates, accounts[3], quorum);
		deployer.deploy(MyContract);
	}
};
