const LZ_ENDPOINTS = require("../constants/layerzeroEndpoints.json")
const OFT_CONFIG = require("../constants/oftConfig.json")
const { ethers } = require("hardhat")

module.exports = async function ({ deployments, getNamedAccounts }) {
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    console.log(`>>> your address: ${deployer}`)

    // get the Endpoint address
    const endpointAddr = LZ_ENDPOINTS[hre.network.name]
    console.log(`[${hre.network.name}] LayerZero Endpoint address: ${endpointAddr}`)

    await deploy("ExampleOFT20", {
        from: deployer,
        args: [endpointAddr],
        log: true,
        waitConfirmations: 1,
    })
}

module.exports.tags = ["ExampleOFT20"]
