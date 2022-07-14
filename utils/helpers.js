const { BigNumber } = require("ethers")
const { ethers, network } = require("hardhat")

deployNew = async (contractName, params = []) => {
    const C = await ethers.getContractFactory(contractName)
    return C.deploy(...params)
}

deployNewFromAbi = async(abi, bytecode, signer, params) => {
    const C = new ethers.ContractFactory(abi, bytecode, signer)
    if (params) {
        return C.deploy(...params)
    } else {
        return C.deploy()
    }
}

module.exports = {
    deployNew,
    deployNewFromAbi
}